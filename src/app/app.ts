import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppStore } from './core/app-store';
import { downloadText } from './core/download';
import { parseBackup } from './core/io/backup';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <h1>Aion 2 Craft Lab</h1>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Calculator</a>
        <a routerLink="/prices" routerLinkActive="active">Prices</a>
        <a routerLink="/inventory" routerLinkActive="active">Inventory</a>
        <a routerLink="/recipes" routerLinkActive="active">Recipes</a>
        <a routerLink="/data" routerLinkActive="active">Data</a>
        <a routerLink="/settings" routerLinkActive="active">Settings</a>
      </nav>
      <span class="server">Server: {{ store.settings().server }}</span>
    </header>

    <main>
      @if (store.persistBlocked()) {
        <section class="msg error">
          <strong>Your saved data could not be read.</strong>
          <p>{{ store.health().message }}</p>
          <p>The unreadable data has been kept aside and nothing new is being saved until you choose an option:</p>
          <div class="row">
            <label>Restore from a JSON backup <input type="file" accept=".json,application/json" (change)="restore($event)" /></label>
            <button (click)="downloadRaw()">Download the unreadable data</button>
            <button class="danger" (click)="store.startFresh()">Start fresh</button>
          </div>
          @if (restoreError()) { <p class="neg">{{ restoreError() }}</p> }
        </section>
      } @else if (store.health().status === 'unavailable') {
        <section class="msg warn">{{ store.health().message }}</section>
      }
      @if (store.saveError(); as e) { <section class="msg error">{{ e }} Export a JSON backup from the Data page.</section> }
      @if (store.health().status === 'migrated') { <section class="msg info">Your saved data was upgraded to the latest format.</section> }
      @if (store.catalogError(); as e) { <section class="msg error">{{ e }}</section> }

      <router-outlet />
    </main>
    <footer>
      Fully client-side. Your data stays in this browser (LocalStorage). Prices are entered by you; listing prices are not completed sales.
      Not affiliated with NCSOFT or Aion2.gg.
    </footer>
  `,
})
export class App {
  protected readonly store = inject(AppStore);
  readonly restoreError = signal('');

  async restore(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (parsed.error || !parsed.data) {
      this.restoreError.set(parsed.error ?? 'Backup could not be read.');
      return;
    }
    this.restoreError.set('');
    this.store.replaceAll(parsed.data);
  }

  downloadRaw(): void {
    downloadText('aion2-craft-lab-unreadable-data.txt', this.store.health().rawText ?? '');
  }
}
