import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { groupThousands } from '../core/listings';
import { DEFAULT_KINA_CHESTS, DEFAULT_QUNA_PACKS } from '../core/storage/schema';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-kina',
  imports: [FormsModule, TrPipe, DecimalPipe],
  template: `
    <h2>{{ 'Kina chests' | tr }}</h2>
    @let s = store.settings();
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

    <h2>{{ 'Quna shop (real money)' | tr }}</h2>
    <div class="grid">
      <label>{{ 'Real-money currency' | tr }}
        <input type="text" maxlength="6" [ngModel]="s.realCurrency ?? 'R$'" (ngModelChange)="store.setSettings({ realCurrency: ($event || 'R$').trim() })" />
      </label>
    </div>
    <p class="muted">{{ 'Enter the packs from the Quna shop and what each costs; the best rate converts Quna to real money.' | tr }}</p>
    <table>
      <thead><tr><th>Quna</th><th>{{ 'Price' | tr }} ({{ s.realCurrency ?? 'R$' }})</th><th>{{ 'Cost per 1,000 Quna' | tr }}</th><th>{{ 'Comparison' | tr }}</th><th></th></tr></thead>
      <tbody>
        @for (p of s.qunaPacks ?? []; track $index) {
          <tr>
            <td><input type="text" inputmode="numeric" [value]="fmt(p.quna)" (input)="group($event)" (change)="setPack($index, 'quna', $event)" /></td>
            <td><input type="text" inputmode="decimal" [value]="p.price" (change)="setPack($index, 'price', $event)" /></td>
            <td>{{ p.price / p.quna * 1000 | number: '1.2-2' }}</td>
            <td [class]="packBest(p) ? 'pos' : 'muted'">@if (packBest(p)) { ★ {{ 'Best value' | tr }} } @else { +{{ packExtra(p) | number: '1.0-1' }}% {{ 'more expensive' | tr }} }</td>
            <td><button type="button" (click)="removePack($index)">{{ 'Remove' | tr }}</button></td>
          </tr>
        }
      </tbody>
    </table>
    <div class="row">
      <button type="button" (click)="addPack()">{{ 'Add pack' | tr }}</button>
      <button type="button" (click)="restorePacks()">{{ 'Restore default packs' | tr }}</button>
    </div>

    <h3>{{ 'Converter' | tr }}</h3>
    <div class="grid">
      <label>Quna <input type="text" inputmode="numeric" [value]="fmt(convQuna())" (input)="group($event)" (change)="convQuna.set(num($event))" /></label>
      <label>{{ 'Kina' | tr }} <input type="text" inputmode="numeric" [value]="fmt(convKina())" (input)="group($event)" (change)="convKina.set(num($event))" /></label>
    </div>
    <table class="kv">
      <tr><td>Quna → {{ s.realCurrency ?? 'R$' }}</td><td>{{ convQuna() * packRate() | number: '1.2-2' }}</td></tr>
      <tr><td>{{ 'Kina' | tr }} → Quna → {{ s.realCurrency ?? 'R$' }}</td><td>{{ kinaToQuna(convKina()) | number: '1.0-0' }} Quna → {{ kinaToQuna(convKina()) * packRate() | number: '1.2-2' }}</td></tr>
    </table>
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

  readonly convQuna = signal(1000);
  readonly convKina = signal(10_000_000);

  num(ev: Event): number {
    const n = Number((ev.target as HTMLInputElement).value.replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  /** Cheapest real-money cost of 1 Quna across the packs. */
  packRate(): number {
    const r = (this.store.settings().qunaPacks ?? []).map((p) => p.price / p.quna);
    return r.length ? Math.min(...r) : 0;
  }

  kinaToQuna(kina: number): number {
    const rate = this.bestRate();
    return rate ? Math.ceil(kina / rate) : 0;
  }

  packBest(p: { quna: number; price: number }): boolean {
    return p.price / p.quna <= this.packRate();
  }

  packExtra(p: { quna: number; price: number }): number {
    return ((p.price / p.quna) / this.packRate() - 1) * 100;
  }

  setPack(i: number, key: 'quna' | 'price', ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const n = Number(el.value.replace(/,/g, '.').replace(/[^\d.]/g, ''));
    const packs = this.store.settings().qunaPacks ?? [];
    if (Number.isFinite(n) && n > 0) this.store.setSettings({ qunaPacks: packs.map((p, j) => (j === i ? { ...p, [key]: n } : p)) });
    const cur = this.store.settings().qunaPacks?.[i]?.[key] ?? n;
    el.value = key === 'quna' ? this.fmt(cur) : String(cur);
  }

  addPack(): void {
    this.store.setSettings({ qunaPacks: [...(this.store.settings().qunaPacks ?? []), { quna: 1000, price: 80 }] });
  }

  removePack(i: number): void {
    this.store.setSettings({ qunaPacks: (this.store.settings().qunaPacks ?? []).filter((_, j) => j !== i) });
  }

  restorePacks(): void {
    this.store.setSettings({ qunaPacks: DEFAULT_QUNA_PACKS.map((p) => ({ ...p })) });
  }

  restoreDefaults(): void {
    this.store.setSettings({ kinahChests: DEFAULT_KINA_CHESTS.map((c) => ({ ...c })) });
  }
}
