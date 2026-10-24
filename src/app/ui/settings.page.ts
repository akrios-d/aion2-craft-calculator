import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <h2>Settings</h2>
    @let s = store.settings();
    <div class="grid">
      <label>Target server
        <input [ngModel]="s.server" (ngModelChange)="setServer($event)" />
      </label>
      <label>Default Auction House fee % <small class="muted">(placeholder default, verify in game)</small>
        <input type="number" min="0" max="100" step="any" [ngModel]="s.defaultFeePercent" (ngModelChange)="setFee($event)" />
      </label>
      <label>Default buy-or-craft strategy
        <select [ngModel]="s.defaultStrategy" (ngModelChange)="store.setSettings({ defaultStrategy: $any($event) })">
          <option value="auto">Auto (cheapest known)</option>
          <option value="craft">Always craft</option>
          <option value="buy">Always buy</option>
        </select>
      </label>
      <label>Currency label
        <input [ngModel]="s.currencyLabel" (ngModelChange)="store.setSettings({ currencyLabel: $event })" />
      </label>
    </div>
    <p class="muted">Settings are saved in your browser. Prices are stored per server, so switching servers shows that server's prices.</p>
  `,
})
export class SettingsPage {
  protected readonly store = inject(AppStore);

  setServer(v: string): void {
    if (v.trim()) this.store.setSettings({ server: v.trim() });
  }

  setFee(v: number | null): void {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) this.store.setSettings({ defaultFeePercent: n });
  }
}
