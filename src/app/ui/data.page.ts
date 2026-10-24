import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AppStore } from '../core/app-store';
import { APP_VERSION, downloadText } from '../core/download';
import { buildBackup } from '../core/io/backup';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-data',
  imports: [ImportPanel, DatePipe],
  template: `
    <h2>Data, backup &amp; coverage</h2>

    <h3>Static recipe dataset</h3>
    @if (store.catalogError()) { <p class="msg error">{{ store.catalogError() }}</p> }
    @let m = store.catalog().manifest;
    <table class="kv">
      <tr><td>Data version</td><td>{{ m.dataVersion }}</td></tr>
      <tr><td>Source</td><td>{{ m.sourceUrl }}</td></tr>
      <tr><td>Import date</td><td>{{ m.importDate ? (m.importDate | date: 'yyyy-MM-dd') : 'never imported' }}</td></tr>
      <tr><td>Items / recipes / professions</td><td>{{ store.catalog().items.length }} / {{ store.catalog().recipes.length }} / {{ store.catalog().professions.length }}</td></tr>
      <tr><td>Verified recipes</td><td>{{ verified() }} of {{ store.catalog().recipes.length }}</td></tr>
      <tr><td>Verification status</td><td>{{ m.verificationStatus }}</td></tr>
      <tr><td>Your own items / recipes</td><td>{{ store.data().customItems.length }} / {{ store.data().customRecipes.length }}</td></tr>
    </table>
    <h4>Known limitations</h4>
    <ul>@for (l of m.knownLimitations; track $index) { <li>{{ l }}</li> }</ul>

    @if (store.reconcileReport(); as rep) {
      @if (rep.remapped.length || rep.unresolved.length) {
        <h3>Dataset update report</h3>
        @if (rep.remapped.length) {
          <p>{{ rep.remapped.length }} record(s) moved to new item ids:</p>
          <ul>@for (r of rep.remapped; track $index) { <li>{{ r.kind }}: {{ r.fromId }} → {{ r.toId }}</li> }</ul>
        }
        @if (rep.unresolved.length) {
          <p class="msg warn">{{ rep.unresolved.length }} record(s) could not be matched to a known item. They were kept untouched:</p>
          <ul>@for (u of rep.unresolved.slice(0, 100); track $index) { <li>{{ u.kind }}: <code>{{ u.itemId }}</code> — {{ u.reason }}</li> }</ul>
        }
      }
    }

    <h3>Backup (all user data)</h3>
    <p class="muted">Includes inventory, prices, price history, settings, plans, buy/craft preferences and your custom items/recipes. Stored only in this browser unless you export it.</p>
    <div class="row"><button class="primary" (click)="exportBackup()">Download JSON backup</button></div>
    <h4>Restore from JSON backup</h4>
    <app-import-panel kind="backup" />

    <h3>Reset</h3>
    <button class="danger" (click)="reset()">Delete all my data in this browser</button>
  `,
})
export class DataPage {
  protected readonly store = inject(AppStore);

  verified = () => this.store.catalog().recipes.filter((r) => r.verification === 'verified').length;

  exportBackup(): void {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`aion2-craft-lab-backup-${stamp}.json`, JSON.stringify(buildBackup(this.store.data(), APP_VERSION), null, 2), 'application/json');
  }

  reset(): void {
    if (confirm('Delete ALL inventory, prices, plans and settings stored in this browser? Download a backup first.')) this.store.startFresh();
  }
}
