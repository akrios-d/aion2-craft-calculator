import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { DialogService } from '../core/dialog';
import { translate } from '../core/i18n';
import { APP_VERSION, downloadText } from '../core/download';
import { buildBackup, exportInventoryCsv, exportPricesCsv } from '../core/io/backup';
import { playAlertSound } from '../core/alert-sound';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, TrPipe, ImportPanel],
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
      <label>{{ 'Server' | tr }}
        <select [ngModel]="s.marketServerId ?? 12402" (ngModelChange)="store.selectMarketServer(+$event)">
          @for (m of store.marketServers(); track m.serverId) { <option [value]="m.serverId">{{ m.name }} ({{ m.region }})</option> }
        </select>
      </label>
      <label>{{ 'Alert sound' | tr }}
        <span class="row">
          <select [ngModel]="s.alertSound ?? 'chime'" (ngModelChange)="store.setSettings({ alertSound: $any($event) })">
            <option value="chime">{{ 'Chime' | tr }}</option><option value="bell">{{ 'Bell' | tr }}</option><option value="beep">{{ 'Beep' | tr }}</option><option value="off">{{ 'Off' | tr }}</option>
          </select>
          <button type="button" (click)="preview()">{{ 'Test' | tr }}</button>
        </span>
        <small class="muted">{{ 'The sound plays together with the notification, only while this tab is open. Browsers may keep it silent until you have clicked on the page once; use Test to check.' | tr }}</small>
      </label>
      <label>{{ 'Faction' | tr }}
        <select [ngModel]="s.faction" (ngModelChange)="store.setSettings({ faction: $any($event) })">
          <option value="all">{{ 'All factions' | tr }}</option><option value="Elyos">Elyos</option><option value="Asmodians">{{ 'Asmodians' | tr }}</option>
        </select>
      </label>
      <label>{{ 'Default Auction House fee %' | tr }} <small class="muted">{{ '(placeholder default, verify in game)' | tr }}</small>
        <input type="number" min="0" max="100" step="any" [ngModel]="s.defaultFeePercent" (ngModelChange)="setFee($event)" />
      </label>
      <label>{{ 'Real-money currency' | tr }}
        <input type="text" maxlength="6" [ngModel]="s.realCurrency ?? 'R$'" (ngModelChange)="store.setSettings({ realCurrency: ($event || 'R$').trim() })" />
      </label>
    </div>
    <p class="muted">{{ 'Settings are saved in your browser.' | tr }}</p>

    <h3>{{ 'Backup (all user data)' | tr }}</h3>
    <p class="muted">{{ 'Includes inventory, prices, price history, settings, plans, buy/craft preferences. Stored only in this browser unless you export it.' | tr }}</p>
    <div class="row"><button class="primary" (click)="exportBackup()">{{ 'Download JSON backup' | tr }}</button></div>
    <h4>{{ 'Restore from JSON backup' | tr }}</h4>
    <app-import-panel kind="backup" />

    <h3>{{ 'Inventory' | tr }}</h3>
    <div class="row"><button (click)="exportInventory()">{{ 'Export CSV' | tr }}</button></div>
    <h4>{{ 'Import inventory from CSV' | tr }}</h4>
    <p class="muted">{{ 'Columns:' | tr }} <code>itemId</code> (or <code>itemName</code>) {{ 'and' | tr }} <code>quantity</code>.</p>
    <app-import-panel kind="inventory" />

    <h3>{{ 'Auction House prices' | tr }}</h3>
    <div class="row"><button (click)="exportPrices()">{{ 'Export CSV' | tr }}</button></div>

    <h3>{{ 'Static recipe dataset' | tr }}</h3>
    @if (store.catalogError()) { <p class="msg error">{{ store.catalogError() | tr }}</p> }
    @let m = store.catalog().manifest;
    <table class="kv">
      <tr><td>{{ 'Data version' | tr }}</td><td>{{ m.dataVersion }}</td></tr>
      <tr><td>{{ 'Items / recipes / professions' | tr }}</td><td>{{ store.catalog().items.length }} / {{ store.catalog().recipes.length }} / {{ store.catalog().professions.length }}</td></tr>
    </table>

    @if (store.reconcileReport(); as rep) {
      @if (rep.remapped.length || rep.unresolved.length) {
        <h3>{{ 'Dataset update report' | tr }}</h3>
        @if (rep.remapped.length) {
          <p>{{ '{n} record(s) moved to new item ids:' | tr: { n: rep.remapped.length } }}</p>
          <ul>@for (r of rep.remapped; track $index) { <li>{{ r.kind }}: {{ r.fromId }} → {{ r.toId }}</li> }</ul>
        }
        @if (rep.unresolved.length) {
          <p class="msg warn">{{ '{n} record(s) could not be matched to a known item. They were kept untouched:' | tr: { n: rep.unresolved.length } }}</p>
          <ul>@for (u of rep.unresolved.slice(0, 100); track $index) { <li>{{ u.kind }}: <code>{{ u.itemId }}</code> — {{ u.reason | tr }}</li> }</ul>
        }
      }
    }

    <h3>{{ 'Reset' | tr }}</h3>
    <button class="danger" (click)="reset()">{{ 'Delete all my data in this browser' | tr }}</button>
  `,
})
export class SettingsPage {
  protected preview(): void { playAlertSound(this.store.settings().alertSound ?? 'chime'); }
  protected readonly store = inject(AppStore);
  private readonly dialog = inject(DialogService);

  exportBackup(): void {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`aion2-craft-lab-backup-${stamp}.json`, JSON.stringify(buildBackup(this.store.data(), APP_VERSION), null, 2), 'application/json');
  }

  exportInventory(): void {
    downloadText('aion2-inventory.csv', exportInventoryCsv(this.store.data().inventory, this.store.nameOf), 'text/csv');
  }

  exportPrices(): void {
    const server = this.store.settings().server;
    const subset = Object.fromEntries(Object.entries(this.store.data().prices).filter(([, p]) => p.server === server));
    downloadText('aion2-prices.csv', exportPricesCsv(subset, this.store.nameOf), 'text/csv');
  }

  async reset(): Promise<void> {
    const msg = translate('Delete ALL inventory, prices, plans and settings stored in this browser? Download a backup first.', this.store.settings().uiLanguage);
    if (await this.dialog.confirm(msg, true)) this.store.startFresh();
  }

  setFee(v: number | null): void {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) this.store.setSettings({ defaultFeePercent: n });
  }
}
