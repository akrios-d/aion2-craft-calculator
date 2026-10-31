import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemIcon } from '../core/item-icon';
import { ItemPicker } from '../core/item-picker';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { groupThousands } from '../core/listings';

@Component({
  selector: 'app-inventory',
  imports: [ItemIcon, ItemPicker, TrPipe, FormsModule],
  template: `
    <h2>{{ 'Inventory' | tr }}</h2>
    <p class="muted">{{ 'Your calculations deduct this inventory but never change it automatically.' | tr }}</p>
    <label class="kinah">{{ 'Kina' | tr }}
      <input type="text" inputmode="numeric" [value]="fmt(store.data().kinah)" (input)="groupKinah($event)" (change)="setKinah($event)" />
    </label>
    <form class="row" (ngSubmit)="add()">
      <app-item-picker [items]="store.items()" [(selectedId)]="itemId" />
      <input type="number" min="0" step="1" [ngModel]="qty()" (ngModelChange)="qty.set($event)" name="qty" required />
      <button class="primary" type="submit" [disabled]="!itemId()">{{ 'Set quantity' | tr }}</button>
    </form>
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }

    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Id' | tr }}</th><th>{{ 'Quantity' | tr }}</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr>
              <td><app-ico [id]="r.id" />{{ store.nameOf(r.id) }}</td><td>{{ r.id }}</td>
              <td><input class="narrow" type="number" min="0" step="1" [value]="r.quantity" (change)="setQty(r.id, $event)" /></td>
              <td><button (click)="store.setInventory(r.id, 0)">{{ 'Remove' | tr }}</button></td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'Inventory is empty.' | tr }}</p> }

  `,
})
export class InventoryPage {
  protected readonly store = inject(AppStore);
  readonly itemId = signal('');
  readonly qty = signal<number>(1);
  readonly error = signal('');

  readonly rows = computed(() =>
    Object.entries(this.store.data().inventory)
      .map(([id, e]) => ({ id, quantity: e.quantity }))
      .sort((a, b) => this.store.nameOf(a.id).localeCompare(this.store.nameOf(b.id))),
  );

  add(): void {
    const q = Number(this.qty());
    if (!this.itemId()) return void this.error.set('Choose an item from the list.');
    if (!Number.isInteger(q) || q < 0) return void this.error.set('Quantity must be a whole number, 0 or more.');
    this.store.setInventory(this.itemId(), q);
    this.error.set('');
    this.itemId.set('');
  }

  fmt(n: number): string {
    return groupThousands(String(n));
  }

  groupKinah(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    el.value = groupThousands(el.value.replace(/[^\d,]/g, ''));
  }

  setKinah(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const n = Number(el.value.replace(/,/g, '') || 0);
    this.store.setKinah(n);
    el.value = this.fmt(this.store.data().kinah);
  }

  setQty(id: string, ev: Event): void {
    const q = Number((ev.target as HTMLInputElement).value);
    if (Number.isInteger(q) && q >= 0) this.store.setInventory(id, q);
  }

}
