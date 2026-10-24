import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemIcon } from '../core/item-icon';
import { ItemPicker } from '../core/item-picker';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { downloadText } from '../core/download';
import { exportPricesCsv } from '../core/io/backup';
import { PriceEntry } from '../core/models';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-prices',
  imports: [ItemIcon, ItemPicker, TrPipe, FormsModule, DecimalPipe, ImportPanel],
  template: `
    <h2>{{ 'Auction House prices' | tr }}</h2>
    <p class="msg info">
      {{ 'All prices are entered by you (or imported from CSV). They are observed listing prices, not completed sales, and are never fetched automatically.' | tr }}
    </p>

    <h3>{{ 'Add or update a price' | tr }}</h3>
    <form class="grid" (ngSubmit)="save()">
      <label>{{ 'Item' | tr }}
        <app-item-picker [items]="store.items()" [selectedId]="form().item" (selectedIdChange)="patch({ item: $event })" />
      </label>
      <label>{{ 'Current price' | tr }} <input type="number" min="0" step="any" [ngModel]="form().sell" (ngModelChange)="patch({ sell: $event })" name="sell" /></label>
      <label class="check"><input type="checkbox" [ngModel]="form().wantBuy" (ngModelChange)="patch({ wantBuy: $event })" name="wantBuy" /> {{ 'Price I want to pay' | tr }}</label>
      @if (form().wantBuy) {
        <label>{{ 'Price I want to pay' | tr }} <input type="number" min="0" step="any" [ngModel]="form().buy" (ngModelChange)="patch({ buy: $event })" name="buy" /></label>
      }
      <div><button class="primary" type="submit">{{ 'Save price' | tr }}</button></div>
    </form>
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }

    <h3>{{ 'Current prices' | tr }} <small class="muted">({{ rows().length }})</small></h3>
    <div class="row">
      <button (click)="exportCsv()" [disabled]="!rows().length">{{ 'Export CSV' | tr }}</button>
    </div>
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Current price' | tr }}</th><th>{{ 'Price I want to pay' | tr }}</th><th></th></tr></thead>
        <tbody>
          @for (p of rows(); track p.server + p.itemId) {
            <tr>
              <td><app-ico [id]="p.itemId" />{{ store.nameOf(p.itemId) }}</td>
              <td>{{ p.sellListingPrice === undefined ? '–' : (p.sellListingPrice | number: '1.0-2') }}</td>
              <td>{{ p.buyPrice === undefined ? '–' : (p.buyPrice | number: '1.0-2') }}</td>
              <td>
                <button (click)="edit(p)">{{ 'Edit' | tr }}</button>
                <button (click)="store.removePrice(p.server, p.itemId)">{{ 'Delete' | tr }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No prices yet.' | tr }}</p> }

    <h3>{{ 'Import prices from CSV' | tr }}</h3>
    <p class="muted">{{ 'Columns:' | tr }} <code>itemId</code> (or <code>itemName</code>), <code>buyPrice</code>, <code>sellListingPrice</code>, <code>quantityObserved</code>, <code>observedAt</code>, <code>notes</code>. {{ 'At least one price per row.' | tr }}</p>
    <app-import-panel kind="prices" />
  `,
})
export class PricesPage {
  protected readonly store = inject(AppStore);
  readonly error = signal('');
  readonly form = signal(this.blank());

  readonly rows = computed(() =>
    Object.values(this.store.data().prices)
      .filter((p) => p.server === this.store.settings().server)
      .sort((a, b) => this.store.nameOf(a.itemId).localeCompare(this.store.nameOf(b.itemId))),
  );

  private blank() {
    return { item: '', wantBuy: false, buy: null as number | null, sell: null as number | null };
  }

  patch(p: Partial<ReturnType<PricesPage['blank']>>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  edit(p: PriceEntry): void {
    this.form.set({ item: p.itemId, wantBuy: p.buyPrice !== undefined && p.buyPrice !== p.sellListingPrice, buy: p.buyPrice ?? null, sell: p.sellListingPrice ?? null });
    window.scrollTo({ top: 0 });
  }
  save(): void {
    const f = this.form();
    const itemId = f.item;
    const num = (v: number | null | string) => (v === null || v === '' ? undefined : Number(v));
    const buy = f.wantBuy ? num(f.buy) : undefined, sell = num(f.sell);
    const server = this.store.settings().server;
    if (!itemId) return void this.error.set('Choose an item.');
    if (buy === undefined && sell === undefined) return void this.error.set('Enter a current price and/or a price you want to pay.');
    for (const [label, v] of [['Price I want to pay', buy], ['Current price', sell]] as const) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) return void this.error.set(`${label} must be a number of 0 or more.`);
    }
    const entry: PriceEntry = { itemId, server, observedAt: new Date().toISOString() };
    if (buy !== undefined) entry.buyPrice = buy;
    if (sell !== undefined) entry.sellListingPrice = sell;
    this.store.setPrice(entry);
    this.error.set('');
    this.form.set(this.blank());
  }

  exportCsv(): void {
    const subset = Object.fromEntries(this.rows().map((p) => [p.server + '|' + p.itemId, p]));
    downloadText('aion2-prices.csv', exportPricesCsv(subset, this.store.nameOf), 'text/csv');
  }
}
