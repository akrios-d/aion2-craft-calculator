import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemIcon } from '../core/item-icon';
import { ItemPicker } from '../core/item-picker';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { groupThousands } from '../core/listings';
import { MarketImportPanel } from './market-import';

@Component({
  selector: 'app-prices',
  imports: [ItemIcon, ItemPicker, TrPipe, FormsModule, DecimalPipe, MarketImportPanel],
  styles: [`
    .wide { width: min(100%, 28rem); margin: 0.5rem 0; }
    .alert-input { width: 12rem; margin-right: 0.4rem; }
    .add-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; }
    .add-row .picker { min-width: 22rem; }
    .add-row .picker ::ng-deep input { width: 100%; min-width: 22rem; }
    .add-row .narrow { width: 14rem; }
  `],
  template: `
    <h2>{{ 'Auction House prices' | tr }}</h2>
    <p class="msg info">
      {{ 'Market prices are loaded automatically from Aion2Market and are listing prices, not completed sales. Create alerts for the prices you want to pay.' | tr }} ({{ store.marketStatus() }})
    </p>

    <h3>{{ 'Refresh market prices' | tr }}</h3>
    <app-market-import />

    <h3>{{ 'Create alert' | tr }}</h3>
    <label class="check"><input type="checkbox" [checked]="store.settings().priceAlerts === true" (change)="store.setAlerts($any($event.target).checked)" /> {{ 'Notify me when a market price reaches an alert price (checks every 5 minutes; works only while this tab is open)' | tr }}</label>
    @if (store.settings().priceAlerts) {
      <p class="msg warn">{{ 'Keep this tab open: alerts are only checked while the app is open in your browser.' | tr }}</p>
    }
    <form class="add-row" (ngSubmit)="create()">
      <label class="picker">{{ 'Item' | tr }}
        <app-item-picker [items]="store.items()" [selectedId]="itemId()" (selectedIdChange)="itemId.set($event)" />
      </label>
      <label>{{ 'Alert price' | tr }}
        <input type="text" inputmode="decimal" class="narrow" name="alert" [ngModel]="draft()" (ngModelChange)="draft.set(group($event))" />
      </label>
      <button class="primary" type="submit" [disabled]="!itemId() || !draft().trim()">{{ 'Create alert' | tr }}</button>
    </form>
    @if (itemId() && marketOf(itemId()) !== undefined) {
      <p class="muted">{{ 'Current price' | tr }}: <strong>{{ marketOf(itemId()) | number: '1.0-0' }}</strong></p>
    }
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }

    <h3>{{ 'My alerts' | tr }} <small class="muted">({{ alertRows().length }})</small></h3>
    @if (alertRows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Current price' | tr }}</th><th>{{ 'Alert price' | tr }}</th><th></th></tr></thead>
        <tbody>
          @for (p of alertRows(); track p.itemId) {
            <tr>
              <td><app-ico [id]="p.itemId" />{{ store.nameOf(p.itemId) }}</td>
              <td>{{ p.sellListingPrice === undefined ? '–' : (p.sellListingPrice | number: '1.0-0') }}</td>
              <td><strong>{{ p.buyPrice | number: '1.0-0' }}</strong>@if (reached(p)) { <small class="warn"> ✓ {{ 'reached' | tr }}</small> }</td>
              <td><button type="button" class="mini" [attr.aria-label]="'Delete' | tr" (click)="store.setBuyPrice(p.itemId, undefined)">✕</button></td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No alerts yet.' | tr }}</p> }

    <h3>{{ 'Current prices' | tr }} <small class="muted">({{ filteredRows().length }})</small></h3>
    <input type="search" class="wide" name="q" [placeholder]="'Search item...' | tr" [ngModel]="query()" (ngModelChange)="query.set($event)" />
    @if (filteredRows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Current price' | tr }}</th><th>{{ 'Alert price' | tr }}</th></tr></thead>
        <tbody>
          @for (p of filteredRows(); track p.server + p.itemId) {
            <tr>
              <td><app-ico [id]="p.itemId" />{{ store.nameOf(p.itemId) }}</td>
              <td><strong>{{ p.sellListingPrice === undefined ? '–' : (p.sellListingPrice | number: '1.0-0') }}</strong></td>
              <td>
                @if (p.buyPrice !== undefined) {
                  {{ p.buyPrice | number: '1.0-0' }}@if (reached(p)) { <small class="warn"> ✓</small> }
                } @else {
                  <input type="text" inputmode="decimal" class="alert-input" [placeholder]="'Alert price' | tr" [ngModel]="rowDraft()[p.itemId] ?? ''" (ngModelChange)="setRowDraft(p.itemId, $event)" [name]="'r' + p.itemId" />
                  <button type="button" (click)="addRow(p.itemId)" [disabled]="!(rowDraft()[p.itemId] ?? '').trim()">{{ 'Add alert' | tr }}</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No prices yet.' | tr }}</p> }
  `,
})
export class PricesPage {
  protected readonly store = inject(AppStore);
  readonly error = signal('');
  readonly itemId = signal('');
  readonly draft = signal('');
  readonly group = groupThousands;

  private readonly serverRows = computed(() =>
    Object.values(this.store.data().prices)
      .filter((p) => p.server === this.store.settings().server)
      .sort((a, b) => this.store.nameOf(a.itemId).localeCompare(this.store.nameOf(b.itemId))),
  );
  readonly rows = computed(() => this.serverRows().filter((p) => p.sellListingPrice !== undefined));
  readonly query = signal('');
  readonly rowDraft = signal<Record<string, string>>({});
  readonly filteredRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.rows().filter((p) => this.store.nameOf(p.itemId).toLowerCase().includes(q)) : this.rows();
  });
  readonly alertRows = computed(() => this.serverRows().filter((p) => p.buyPrice !== undefined));

  marketOf(id: string): number | undefined {
    return this.serverRows().find((p) => p.itemId === id)?.sellListingPrice;
  }

  reached(p: { sellListingPrice?: number; buyPrice?: number }): boolean {
    return p.sellListingPrice !== undefined && p.buyPrice !== undefined && p.sellListingPrice <= p.buyPrice;
  }

  setRowDraft(id: string, v: string): void {
    this.rowDraft.update((d) => ({ ...d, [id]: groupThousands(v) }));
  }

  addRow(id: string): void {
    const n = Number((this.rowDraft()[id] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return void this.error.set('Alert price must be a number greater than 0.');
    this.store.setBuyPrice(id, n);
    this.error.set('');
    this.rowDraft.update((d) => ({ ...d, [id]: '' }));
  }

  create(): void {
    const n = Number(this.draft().replace(/,/g, ''));
    if (!this.itemId() || !Number.isFinite(n) || n <= 0) return void this.error.set('Alert price must be a number greater than 0.');
    this.store.setBuyPrice(this.itemId(), n);
    this.error.set('');
    this.draft.set('');
    this.itemId.set('');
  }
}
