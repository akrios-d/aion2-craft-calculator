import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, TrPipe],
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
      <label>{{ 'Kinah per 1 real-money unit (Kinah chests)' | tr }} <small class="muted">{{ '(0 = off; used to show costs in real money)' | tr }}</small>
        <input type="number" min="0" step="any" [ngModel]="s.kinahPerMoney ?? 0" (ngModelChange)="setRate($event)" />
      </label>
      <label>{{ 'Currency' | tr }}
        <input type="text" maxlength="8" [ngModel]="s.currency ?? 'EUR'" (ngModelChange)="store.setSettings({ currency: ($event || 'EUR').trim() })" />
      </label>
    </div>
    <p class="muted">{{ 'Settings are saved in your browser.' | tr }}</p>
  `,
})
export class SettingsPage {
  protected readonly store = inject(AppStore);

  setRate(v: number | null): void {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) this.store.setSettings({ kinahPerMoney: n > 0 ? n : undefined });
  }

  setFee(v: number | null): void {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) this.store.setSettings({ defaultFeePercent: n });
  }
}
