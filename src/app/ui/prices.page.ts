import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { downloadText } from '../core/download';
import { exportPricesCsv } from '../core/io/backup';
import { PriceEntry } from '../core/models';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-prices',
  imports: [FormsModule, DecimalPipe, DatePipe, ImportPanel],
  template: `
    <h2>Auction House prices</h2>
    <p class="msg info">
      All prices are entered by you (or imported from CSV). They are observed <strong>listing</strong> prices,
      not completed sales, and are never fetched automatically.
    </p>

    <h3>Add or update a price</h3>
    <form class="grid" (ngSubmit)="save()">
      <label>Item (name or id)
        <input list="all-items" [ngModel]="form().item" (ngModelChange)="patch({ item: $event })" name="item" required />
        <datalist id="all-items">@for (i of store.items(); track i.id) { <option [value]="i.name">{{ i.id }}</option> }</datalist>
      </label>
      <label>Server <input [ngModel]="form().server" (ngModelChange)="patch({ server: $event })" name="server" required /></label>
      <label>Buy price (lowest listing you would pay) <input type="number" min="0" step="any" [ngModel]="form().buy" (ngModelChange)="patch({ buy: $event })" name="buy" /></label>
      <label>Sell listing price <input type="number" min="0" step="any" [ngModel]="form().sell" (ngModelChange)="patch({ sell: $event })" name="sell" /></label>
      <label>Quantity observed <input type="number" min="0" step="1" [ngModel]="form().qty" (ngModelChange)="patch({ qty: $event })" name="qty" /></label>
      <label>AH fee % (blank = default {{ store.settings().defaultFeePercent }}%) <input type="number" min="0" max="100" step="any" [ngModel]="form().fee" (ngModelChange)="patch({ fee: $event })" name="fee" /></label>
      <label>Observed at <input type="datetime-local" [ngModel]="form().at" (ngModelChange)="patch({ at: $event })" name="at" /></label>
      <label>Notes <input [ngModel]="form().notes" (ngModelChange)="patch({ notes: $event })" name="notes" /></label>
      <div><button class="primary" type="submit">Save price</button></div>
    </form>
    @if (error()) { <p class="msg error">{{ error() }}</p> }

    <h3>Current prices <small class="muted">({{ rows().length }})</small></h3>
    <div class="row">
      <label><input type="checkbox" [ngModel]="allServers()" (ngModelChange)="allServers.set($event)" /> Show all servers</label>
      <button (click)="exportCsv()" [disabled]="!rows().length">Export CSV</button>
    </div>
    @if (rows().length) {
      <table>
        <thead><tr><th>Item</th><th>Server</th><th>Buy</th><th>Sell listing</th><th>Qty seen</th><th>Fee %</th><th>Observed</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          @for (p of rows(); track p.server + p.itemId) {
            <tr>
              <td>{{ store.nameOf(p.itemId) }}</td><td>{{ p.server }}</td>
              <td>{{ p.buyPrice === undefined ? '–' : (p.buyPrice | number: '1.0-2') }}</td>
              <td>{{ p.sellListingPrice === undefined ? '–' : (p.sellListingPrice | number: '1.0-2') }}</td>
              <td>{{ p.quantityObserved ?? '–' }}</td><td>{{ p.feePercent ?? 'default' }}</td>
              <td>{{ p.observedAt | date: 'yyyy-MM-dd HH:mm' }}</td><td>{{ p.notes }}</td>
              <td>
                <button (click)="edit(p)">Edit</button>
                <button (click)="store.removePrice(p.server, p.itemId)">Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">No prices yet.</p> }

    <h3>Price history <small class="muted">({{ store.data().priceHistory.length }} observations)</small></h3>
    <details>
      <summary>Show latest 100</summary>
      <table>
        <thead><tr><th>Item</th><th>Server</th><th>Buy</th><th>Sell listing</th><th>Observed</th></tr></thead>
        <tbody>
          @for (h of history(); track $index) {
            <tr><td>{{ store.nameOf(h.itemId) }}</td><td>{{ h.server }}</td><td>{{ h.buyPrice ?? '–' }}</td><td>{{ h.sellListingPrice ?? '–' }}</td><td>{{ h.observedAt | date: 'yyyy-MM-dd HH:mm' }}</td></tr>
          }
        </tbody>
      </table>
    </details>

    <h3>Import prices from CSV</h3>
    <p class="muted">Columns: <code>itemId</code> (or <code>itemName</code>), <code>buyPrice</code>, <code>sellListingPrice</code>, <code>quantityObserved</code>, <code>feePercent</code>, <code>observedAt</code>, <code>server</code>, <code>notes</code>. At least one price per row.</p>
    <app-import-panel kind="prices" />
  `,
})
export class PricesPage {
  protected readonly store = inject(AppStore);
  readonly allServers = signal(false);
  readonly error = signal('');
  readonly form = signal(this.blank());

  readonly rows = computed(() =>
    Object.values(this.store.data().prices)
      .filter((p) => this.allServers() || p.server === this.store.settings().server)
      .sort((a, b) => this.store.nameOf(a.itemId).localeCompare(this.store.nameOf(b.itemId))),
  );
  readonly history = computed(() => this.store.data().priceHistory.slice(-100).reverse());

  private blank() {
    return { item: '', server: this.store.settings().server, buy: null as number | null, sell: null as number | null, qty: null as number | null, fee: null as number | null, at: this.localNow(), notes: '' };
  }

  private localNow(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  patch(p: Partial<ReturnType<PricesPage['blank']>>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  edit(p: PriceEntry): void {
    const d = new Date(p.observedAt);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    this.form.set({
      item: this.store.nameOf(p.itemId), server: p.server, buy: p.buyPrice ?? null, sell: p.sellListingPrice ?? null,
      qty: p.quantityObserved ?? null, fee: p.feePercent ?? null, at: d.toISOString().slice(0, 16), notes: p.notes ?? '',
    });
    window.scrollTo({ top: 0 });
  }

  save(): void {
    const f = this.form();
    const raw = f.item.trim();
    const match = this.store.items().find((i) => i.name.toLowerCase() === raw.toLowerCase()) ?? this.store.items().find((i) => i.id === raw);
    const itemId = match?.id ?? raw;
    const num = (v: number | null | string) => (v === null || v === '' ? undefined : Number(v));
    const buy = num(f.buy), sell = num(f.sell), qty = num(f.qty), fee = num(f.fee);
    const server = f.server.trim() || this.store.settings().server;
    if (!itemId) return void this.error.set('Choose an item.');
    if (buy === undefined && sell === undefined) return void this.error.set('Enter a buy price and/or a sell listing price.');
    for (const [label, v] of [['Buy price', buy], ['Sell listing price', sell], ['Quantity', qty], ['Fee', fee]] as const) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0)) return void this.error.set(`${label} must be a number of 0 or more.`);
    }
    if (fee !== undefined && fee > 100) return void this.error.set('Fee cannot exceed 100%.');
    const at = Date.parse(f.at);
    const entry: PriceEntry = { itemId, server, observedAt: new Date(isNaN(at) ? Date.now() : at).toISOString() };
    if (buy !== undefined) entry.buyPrice = buy;
    if (sell !== undefined) entry.sellListingPrice = sell;
    if (qty !== undefined) entry.quantityObserved = qty;
    if (fee !== undefined) entry.feePercent = fee;
    if (f.notes.trim()) entry.notes = f.notes.trim();
    this.store.setPrice(entry);
    this.error.set('');
    this.form.set({ ...this.blank(), server: f.server });
  }

  exportCsv(): void {
    const subset = Object.fromEntries(this.rows().map((p) => [p.server + '|' + p.itemId, p]));
    downloadText('aion2-prices.csv', exportPricesCsv(subset, this.store.nameOf), 'text/csv');
  }
}
