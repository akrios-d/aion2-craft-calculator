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
      <label>{{ 'Default Auction House fee %' | tr }} <small class="muted">{{ '(placeholder default, verify in game)' | tr }}</small>
        <input type="number" min="0" max="100" step="any" [ngModel]="s.defaultFeePercent" (ngModelChange)="setFee($event)" />
      </label>
      <label>{{ 'Default buy-or-craft strategy' | tr }}
        <select [ngModel]="s.defaultStrategy" (ngModelChange)="store.setSettings({ defaultStrategy: $any($event) })">
          <option value="auto">{{ 'Auto (cheapest known)' | tr }}</option>
          <option value="craft">{{ 'Always craft' | tr }}</option>
          <option value="buy">{{ 'Always buy' | tr }}</option>
        </select>
      </label>
    </div>
    <p class="muted">{{ "Settings are saved in your browser. Prices are stored per server, so switching servers shows that server's prices." | tr }}</p>
  `,
})
export class SettingsPage {
  protected readonly store = inject(AppStore);

  setFee(v: number | null): void {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) this.store.setSettings({ defaultFeePercent: n });
  }
}
