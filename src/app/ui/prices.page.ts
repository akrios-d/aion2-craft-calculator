import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemIcon } from '../core/item-icon';
import { ItemPicker } from '../core/item-picker';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { downloadText } from '../core/download';
import { exportPricesCsv } from '../core/io/backup';
import { listingsOf, parsePriceList } from '../core/listings';
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
    <label class="picker">{{ 'Item' | tr }}
      <app-item-picker [items]="store.items()" [selectedId]="itemId()" (selectedIdChange)="select($event)" />
    </label>

    @if (itemId()) {
      <section class="price-editor">
        <div class="head">
          <strong><app-ico [id]="itemId()" />{{ store.nameOf(itemId()) }}</strong>
          <span class="avg">{{ 'Average price' | tr }}:
            <strong>{{ current()?.sellListingPrice === undefined ? '–' : (current()!.sellListingPrice | number: '1.0-2') }}</strong>
            @if (currentListings().length > 1) { <small class="muted">({{ currentListings().length }})</small> }
          </span>
        </div>

        <div class="chips">
          @for (v of currentListings(); track $index) {
            <span class="chip">{{ v | number: '1.0-2' }}
              <button type="button" class="mini" [attr.aria-label]="'Delete' | tr" (click)="store.removeListing(itemId(), $index)">✕</button>
            </span>
          } @empty { <span class="muted">{{ 'No prices yet.' | tr }}</span> }
        </div>

        <form class="add-row" (ngSubmit)="add()">
          <input type="text" inputmode="decimal" name="draft" [placeholder]="'Type a price and press Enter (several: 100, 120, 95)' | tr" [ngModel]="draft()" (ngModelChange)="draft.set($event)" />
          <button class="primary" type="submit" [disabled]="!draft().trim()">{{ 'Add price' | tr }}</button>
        </form>

        <label class="check"><input type="checkbox" name="wantBuy" [ngModel]="buyShown()" (ngModelChange)="toggleBuy($event)" /> {{ 'Price I want to pay' | tr }}</label>
        @if (buyShown()) {
          <input type="number" class="narrow" min="0" step="any" name="buy" [ngModel]="current()?.buyPrice ?? null" (change)="setBuy($any($event.target).value)" />
        }
      </section>
    }
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }
    <h3>{{ 'Current prices' | tr }} <small class="muted">({{ rows().length }})</small></h3>
    <div class="row">
      <button (click)="exportCsv()" [disabled]="!rows().length">{{ 'Export CSV' | tr }}</button>
    </div>
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Prices' | tr }}</th><th>{{ 'Average price' | tr }}</th><th>{{ 'Price I want to pay' | tr }}</th><th></th></tr></thead>
        <tbody>
          @for (p of rows(); track p.server + p.itemId) {
            <tr>
              <td><app-ico [id]="p.itemId" />{{ store.nameOf(p.itemId) }}</td>
              <td>@for (v of listings(p); track $index) { <span class="chip">{{ v | number: '1.0-2' }} <button type="button" class="mini" [attr.aria-label]="'Delete' | tr" (click)="store.removeListing(p.itemId, $index)">✕</button></span> } @empty { – }</td>
              <td><strong>{{ p.sellListingPrice === undefined ? '–' : (p.sellListingPrice | number: '1.0-2') }}</strong></td>
              <td>{{ p.buyPrice === undefined ? '–' : (p.buyPrice | number: '1.0-2') }}</td>
              <td>
                <button type="button" (click)="select(p.itemId)">{{ 'Edit' | tr }}</button>
                <button (click)="store.removePrice(p.server, p.itemId)">{{ 'Delete' | tr }}</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No prices yet.' | tr }}</p> }

    <h3>{{ 'Import prices from CSV' | tr }}</h3>
    <p class="muted">{{ 'Columns:' | tr }} <code>itemId</code> (or <code>itemName</code>), <code>price</code> ({{ 'current price' | tr }}), <code>buyPrice</code> ({{ 'optional' | tr }}). {{ 'Repeat an item on several rows to add several prices; the average is used.' | tr }}</p>
    <app-import-panel kind="prices" />
  `,
})
export class PricesPage {
  protected readonly store = inject(AppStore);
  readonly error = signal('');
  readonly itemId = signal('');
  readonly draft = signal('');
  readonly buyOpen = signal(false);

  readonly rows = computed(() =>
    Object.values(this.store.data().prices)
      .filter((p) => p.server === this.store.settings().server)
      .sort((a, b) => this.store.nameOf(a.itemId).localeCompare(this.store.nameOf(b.itemId))),
  );
  readonly current = computed(() => this.rows().find((p) => p.itemId === this.itemId()));
  readonly currentListings = computed(() => { const c = this.current(); return c ? listingsOf(c) : []; });
  readonly buyShown = computed(() => this.buyOpen() || this.current()?.buyPrice !== undefined);
  readonly listings = listingsOf;

  select(id: string): void {
    this.itemId.set(id);
    this.buyOpen.set(false);
    this.draft.set('');
    this.error.set('');
    if (id) window.scrollTo({ top: 0 });
  }

  add(): void {
    const parsed = parsePriceList(this.draft());
    if (!parsed.values.length || parsed.invalid.length) {
      return void this.error.set(parsed.invalid.length ? `Invalid price: ${parsed.invalid.join(', ')}` : 'Enter a current price.');
    }
    this.store.addListings(this.itemId(), parsed.values);
    this.error.set('');
    this.draft.set('');
  }

  toggleBuy(on: boolean): void {
    this.buyOpen.set(on);
    if (!on) this.store.setBuyPrice(this.itemId(), undefined);
  }

  setBuy(raw: string): void {
    const n = raw.trim() === '' ? undefined : Number(raw);
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) return void this.error.set('Price I want to pay must be a number of 0 or more.');
    this.error.set('');
    this.store.setBuyPrice(this.itemId(), n);
  }
  exportCsv(): void {
    const subset = Object.fromEntries(this.rows().map((p) => [p.server + '|' + p.itemId, p]));
    downloadText('aion2-prices.csv', exportPricesCsv(subset, this.store.nameOf), 'text/csv');
  }
}
