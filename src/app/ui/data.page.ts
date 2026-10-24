import { Component, inject } from '@angular/core';
import { AppStore } from '../core/app-store';
import { DialogService } from '../core/dialog';
import { TrPipe } from '../core/tr.pipe';
import { translate } from '../core/i18n';
import { APP_VERSION, downloadText } from '../core/download';
import { buildBackup } from '../core/io/backup';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-data',
  imports: [TrPipe, ImportPanel],
  template: `
    <h2>{{ 'Data, backup & coverage' | tr }}</h2>

    <h3>{{ 'Static recipe dataset' | tr }}</h3>
    @if (store.catalogError()) { <p class="msg error">{{ store.catalogError() | tr }}</p> }
    @let m = store.catalog().manifest;
    <table class="kv">
      <tr><td>{{ 'Data version' | tr }}</td><td>{{ m.dataVersion }}</td></tr>
      <tr><td>{{ 'Items / recipes / professions' | tr }}</td><td>{{ store.catalog().items.length }} / {{ store.catalog().recipes.length }} / {{ store.catalog().professions.length }}</td></tr>
      <tr><td>{{ 'Your own items / recipes' | tr }}</td><td>{{ store.data().customItems.length }} / {{ store.data().customRecipes.length }}</td></tr>
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

    <h3>{{ 'Backup (all user data)' | tr }}</h3>
    <p class="muted">{{ 'Includes inventory, prices, price history, settings, plans, buy/craft preferences and your custom items/recipes. Stored only in this browser unless you export it.' | tr }}</p>
    <div class="row"><button class="primary" (click)="exportBackup()">{{ 'Download JSON backup' | tr }}</button></div>
    <h4>{{ 'Restore from JSON backup' | tr }}</h4>
    <app-import-panel kind="backup" />

    <h3>{{ 'Reset' | tr }}</h3>
    <button class="danger" (click)="reset()">{{ 'Delete all my data in this browser' | tr }}</button>
  `,
})
export class DataPage {
  protected readonly store = inject(AppStore);
  private readonly dialog = inject(DialogService);


  exportBackup(): void {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`aion2-craft-lab-backup-${stamp}.json`, JSON.stringify(buildBackup(this.store.data(), APP_VERSION), null, 2), 'application/json');
  }

  async reset(): Promise<void> {
    const msg = translate('Delete ALL inventory, prices, plans and settings stored in this browser? Download a backup first.', this.store.settings().uiLanguage);
    if (await this.dialog.confirm(msg, true)) this.store.startFresh();
  }
}
