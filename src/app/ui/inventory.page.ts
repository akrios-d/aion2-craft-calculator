import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { downloadText } from '../core/download';
import { exportInventoryCsv } from '../core/io/backup';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-inventory',
  imports: [TrPipe, FormsModule, ImportPanel],
  template: `
    <h2>{{ 'Inventory' | tr }}</h2>
    <p class="muted">{{ 'Your calculations deduct this inventory but never change it automatically.' | tr }}</p>
    <form class="row" (ngSubmit)="add()">
      <input list="inv-items" [placeholder]="'Item name or id' | tr" [ngModel]="item()" (ngModelChange)="item.set($event)" name="item" required />
      <datalist id="inv-items">@for (i of store.items(); track i.id) { <option [value]="i.name">{{ i.id }}</option> }</datalist>
      <input type="number" min="0" step="1" [ngModel]="qty()" (ngModelChange)="qty.set($event)" name="qty" required />
      <button class="primary" type="submit">{{ 'Set quantity' | tr }}</button>
    </form>
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }

    <div class="row"><button (click)="exportCsv()" [disabled]="!rows().length">{{ 'Export CSV' | tr }}</button></div>
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Id' | tr }}</th><th>{{ 'Quantity' | tr }}</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr>
              <td>{{ store.nameOf(r.id) }}</td><td>{{ r.id }}</td>
              <td><input class="narrow" type="number" min="0" step="1" [value]="r.quantity" (change)="setQty(r.id, $event)" /></td>
              <td><button (click)="store.setInventory(r.id, 0)">{{ 'Remove' | tr }}</button></td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'Inventory is empty.' | tr }}</p> }

    <h3>{{ 'Import inventory from CSV' | tr }}</h3>
    <p class="muted">{{ 'Columns:' | tr }} <code>itemId</code> (or <code>itemName</code>) {{ 'and' | tr }} <code>quantity</code>.</p>
    <app-import-panel kind="inventory" />
  `,
})
export class InventoryPage {
  protected readonly store = inject(AppStore);
  readonly item = signal('');
  readonly qty = signal<number>(1);
  readonly error = signal('');

  readonly rows = computed(() =>
    Object.entries(this.store.data().inventory)
      .map(([id, e]) => ({ id, quantity: e.quantity }))
      .sort((a, b) => this.store.nameOf(a.id).localeCompare(this.store.nameOf(b.id))),
  );

  add(): void {
    const raw = this.item().trim();
    const q = Number(this.qty());
    if (!raw) return void this.error.set('Choose an item.');
    if (!Number.isInteger(q) || q < 0) return void this.error.set('Quantity must be a whole number, 0 or more.');
    const match = this.store.items().find((i) => i.name.toLowerCase() === raw.toLowerCase()) ?? this.store.items().find((i) => i.id === raw);
    this.store.setInventory(match?.id ?? raw, q);
    this.error.set('');
    this.item.set('');
  }

  setQty(id: string, ev: Event): void {
    const q = Number((ev.target as HTMLInputElement).value);
    if (Number.isInteger(q) && q >= 0) this.store.setInventory(id, q);
  }

  exportCsv(): void {
    downloadText('aion2-inventory.csv', exportInventoryCsv(this.store.data().inventory, this.store.nameOf), 'text/csv');
  }
}
