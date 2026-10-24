import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { groupThousands } from '../core/listings';
import { DEFAULT_KINA_CHESTS } from '../core/storage/schema';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-kina',
  imports: [FormsModule, TrPipe, DecimalPipe],
  template: `
    <h2>{{ 'Kina chests' | tr }}</h2>
    @let s = store.settings();
    <div class="grid">
      <label>{{ 'Exchange currency' | tr }} <small class="muted">{{ '(what Kina chests are bought with)' | tr }}</small>
        <input type="text" maxlength="12" [ngModel]="s.currency ?? 'Gems'" (ngModelChange)="store.setSettings({ currency: ($event || 'Gems').trim() })" />
      </label>
    </div>
    <p class="muted">{{ 'Enter the current lowest price of each chest; costs are converted using the best rate.' | tr }}</p>
    <table>
      <thead><tr><th>{{ 'Kina in chest' | tr }}</th><th>{{ 'Price' | tr }}</th><th>{{ 'Kina per 1 currency' | tr }}</th><th>{{ 'Cost per 1M Kina' | tr }}</th><th>{{ 'Comparison' | tr }}</th><th></th></tr></thead>
      <tbody>
        @for (c of s.kinahChests ?? []; track $index) {
          <tr>
            <td><input type="text" inputmode="numeric" [value]="fmt(c.kinah)" (input)="group($event)" (change)="setChest($index, 'kinah', $event)" /></td>
            <td><input type="text" inputmode="numeric" [value]="fmt(c.price)" (input)="group($event)" (change)="setChest($index, 'price', $event)" /></td>
            <td>{{ c.kinah / c.price | number: '1.0-0' }}</td>
            <td>{{ c.price / c.kinah * 1000000 | number: '1.0-1' }}</td>
            <td [class]="isBest(c) ? 'pos' : 'muted'">@if (isBest(c)) { ★ {{ 'Best value' | tr }} } @else { +{{ extraPercent(c) | number: '1.0-1' }}% {{ 'more expensive' | tr }} }</td>
            <td><button type="button" (click)="removeChest($index)">{{ 'Remove' | tr }}</button></td>
          </tr>
        }
      </tbody>
    </table>
    <div class="row">
      <button type="button" (click)="addChest()">{{ 'Add chest' | tr }}</button>
      <button type="button" (click)="restoreDefaults()">{{ 'Restore default chests' | tr }}</button>
    </div>
  `,
})
export class KinaPage {
  protected readonly store = inject(AppStore);

  fmt(n: number): string {
    return groupThousands(String(n));
  }

  group(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    el.value = groupThousands(el.value.replace(/[^\d,]/g, ''));
  }

  private bestRate(): number {
    return Math.max(0, ...(this.store.settings().kinahChests ?? []).map((c) => c.kinah / c.price));
  }

  isBest(c: { kinah: number; price: number }): boolean {
    return c.kinah / c.price >= this.bestRate();
  }

  extraPercent(c: { kinah: number; price: number }): number {
    return (this.bestRate() / (c.kinah / c.price) - 1) * 100;
  }

  setChest(i: number, key: 'kinah' | 'price', ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const n = Number(el.value.replace(/,/g, ''));
    const chests = this.store.settings().kinahChests ?? [];
    if (Number.isFinite(n) && n > 0) {
      this.store.setSettings({ kinahChests: chests.map((c, j) => (j === i ? { ...c, [key]: n } : c)) });
    }
    el.value = this.fmt(this.store.settings().kinahChests?.[i]?.[key] ?? n);
  }

  addChest(): void {
    this.store.setSettings({ kinahChests: [...(this.store.settings().kinahChests ?? []), { kinah: 1_000_000, price: 300 }] });
  }

  removeChest(i: number): void {
    this.store.setSettings({ kinahChests: (this.store.settings().kinahChests ?? []).filter((_, j) => j !== i) });
  }

  restoreDefaults(): void {
    this.store.setSettings({ kinahChests: DEFAULT_KINA_CHESTS.map((c) => ({ ...c })) });
  }
}
