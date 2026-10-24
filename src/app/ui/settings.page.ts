import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, TrPipe, DecimalPipe],
  template: `
    <h2>{{ 'Settings' | tr }}</h2>
    @let s = store.settings();
    <div class="grid">
      <label>{{ 'Interface language' | tr }}
        <select [ngModel]="s.uiLanguage" (ngModelChange)="store.setSettings({ uiLanguage: $any($event) })">
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </label>
      <label>{{ 'Item name language' | tr }}
        <select [ngModel]="s.itemNameLanguage" (ngModelChange)="store.setSettings({ itemNameLanguage: $any($event) })">
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </label>
      <label>{{ 'Faction' | tr }}
        <select [ngModel]="s.faction" (ngModelChange)="store.setSettings({ faction: $any($event) })">
          <option value="all">{{ 'All factions' | tr }}</option><option value="Elyos">Elyos</option><option value="Asmodians">{{ 'Asmodians' | tr }}</option>
        </select>
      </label>
      <label>{{ 'Default Auction House fee %' | tr }} <small class="muted">{{ '(placeholder default, verify in game)' | tr }}</small>
        <input type="number" min="0" max="100" step="any" [ngModel]="s.defaultFeePercent" (ngModelChange)="setFee($event)" />
      </label>
      <label>{{ 'Exchange currency' | tr }} <small class="muted">{{ '(what Kina chests are bought with)' | tr }}</small>
        <input type="text" maxlength="12" [ngModel]="s.currency ?? 'Gems'" (ngModelChange)="store.setSettings({ currency: ($event || 'Gems').trim() })" />
      </label>
    </div>
    <h3>{{ 'Kina chests on the Exchange' | tr }}</h3>
    <p class="muted">{{ 'Enter the current lowest price of each chest; costs are converted using the best rate.' | tr }}</p>
    <table>
      <thead><tr><th>{{ 'Kina in chest' | tr }}</th><th>{{ 'Price' | tr }}</th><th>{{ 'Kina per 1 currency' | tr }}</th><th>{{ 'Cost per 1M Kina' | tr }}</th><th>{{ 'Comparison' | tr }}</th><th></th></tr></thead>
      <tbody>
        @for (c of s.kinahChests ?? []; track $index) {
          <tr>
            <td><input type="number" min="1" step="any" [ngModel]="c.kinah" (ngModelChange)="setChest($index, 'kinah', $event)" /></td>
            <td><input type="number" min="1" step="any" [ngModel]="c.price" (ngModelChange)="setChest($index, 'price', $event)" /></td>
            <td>{{ c.kinah / c.price | number: '1.0-0' }}</td>
            <td>{{ c.price / c.kinah * 1000000 | number: '1.0-1' }}</td>
            <td [class]="isBest(c) ? 'pos' : 'muted'">@if (isBest(c)) { ★ {{ 'Best value' | tr }} } @else { +{{ extraPercent(c) | number: '1.0-1' }}% {{ 'more expensive' | tr }} }</td>
            <td><button type="button" (click)="removeChest($index)">{{ 'Remove' | tr }}</button></td>
          </tr>
        }
      </tbody>
    </table>
    <button type="button" (click)="addChest()">{{ 'Add chest' | tr }}</button>
    <p class="muted">{{ 'Settings are saved in your browser.' | tr }}</p>
  `,
})
export class SettingsPage {
  protected readonly store = inject(AppStore);

  private bestRate(): number {
    return Math.max(0, ...(this.store.settings().kinahChests ?? []).map((c) => c.kinah / c.price));
  }

  isBest(c: { kinah: number; price: number }): boolean {
    return c.kinah / c.price >= this.bestRate();
  }

  extraPercent(c: { kinah: number; price: number }): number {
    return (this.bestRate() / (c.kinah / c.price) - 1) * 100;
  }

  setChest(i: number, key: 'kinah' | 'price', v: number | null): void {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    this.store.setSettings({ kinahChests: (this.store.settings().kinahChests ?? []).map((c, j) => (j === i ? { ...c, [key]: n } : c)) });
  }

  addChest(): void {
    this.store.setSettings({ kinahChests: [...(this.store.settings().kinahChests ?? []), { kinah: 1_000_000, price: 300 }] });
  }

  removeChest(i: number): void {
    this.store.setSettings({ kinahChests: (this.store.settings().kinahChests ?? []).filter((_, j) => j !== i) });
  }

  setFee(v: number | null): void {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) this.store.setSettings({ defaultFeePercent: n });
  }
}
