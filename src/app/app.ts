import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppStore } from './core/app-store';
import { downloadText } from './core/download';
import { parseBackup } from './core/io/backup';
import { translate } from './core/i18n';
import { TrPipe } from './core/tr.pipe';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TrPipe],
  template: `
    <header>
      <h1>Aion 2 Craft Lab</h1>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{ 'Calculator' | tr }}</a>
        <a routerLink="/prices" routerLinkActive="active">{{ 'Prices' | tr }}</a>
        <a routerLink="/inventory" routerLinkActive="active">{{ 'Inventory' | tr }}</a>
        <a routerLink="/recipes" routerLinkActive="active">{{ 'Recipes' | tr }}</a>
        <a routerLink="/data" routerLinkActive="active">{{ 'Data' | tr }}</a>
        <a routerLink="/settings" routerLinkActive="active">{{ 'Settings' | tr }}</a>
      </nav>
      <span class="server">{{ 'Server: {server}' | tr: { server: store.settings().server } }}</span>
      <span class="langs">
        <label>{{ 'Character' | tr }}
          <select (change)="store.selectCharacter($any($event.target).value)">
            @for (c of store.characters(); track c.id) {
              <option [value]="c.id" [selected]="c.id === store.activeCharacter().id">{{ c.name }}</option>
            }
          </select>
        </label>
        <button type="button" (click)="newCharacter()">{{ 'New' | tr }}</button>
        <button type="button" (click)="renameCharacter()">{{ 'Rename' | tr }}</button>
        <button type="button" [disabled]="store.characters().length < 2" (click)="removeCharacter()">{{ 'Delete' | tr }}</button>
        <label>{{ 'Language' | tr }}
          <select [value]="store.settings().uiLanguage" (change)="store.setSettings({ uiLanguage: $any($event.target).value })">
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </label>
        <label>{{ 'Item names' | tr }}
          <select [value]="store.settings().itemNameLanguage" (change)="store.setSettings({ itemNameLanguage: $any($event.target).value })">
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </label>
      </span>
    </header>

    <main>
      @if (store.persistBlocked()) {
        <section class="msg error">
          <strong>{{ 'Your saved data could not be read.' | tr }}</strong>
          <p>{{ store.health().message | tr }}</p>
          <p>{{ 'The unreadable data has been kept aside and nothing new is being saved until you choose an option:' | tr }}</p>
          <div class="row">
            <label>{{ 'Restore from a JSON backup' | tr }} <input type="file" accept=".json,application/json" (change)="restore($event)" /></label>
            <button (click)="downloadRaw()">{{ 'Download the unreadable data' | tr }}</button>
            <button class="danger" (click)="store.startFresh()">{{ 'Start fresh' | tr }}</button>
          </div>
          @if (restoreError()) { <p class="neg">{{ restoreError() | tr }}</p> }
        </section>
      } @else if (store.health().status === 'unavailable') {
        <section class="msg warn">{{ store.health().message | tr }}</section>
      }
      @if (store.saveError(); as e) { <section class="msg error">{{ '{error} Export a JSON backup from the Data page.' | tr: { error: (e | tr) } }}</section> }
      @if (store.health().status === 'migrated') { <section class="msg info">{{ 'Your saved data was upgraded to the latest format.' | tr }}</section> }
      @if (store.catalogError(); as e) { <section class="msg error">{{ e | tr }}</section> }

      <router-outlet />
    </main>
    <footer>
      {{ 'Fully client-side. Your data stays in this browser (LocalStorage). Prices are entered by you; listing prices are not completed sales.' | tr }}
      {{ 'Not affiliated with NCSOFT or Aion2.gg.' | tr }}
    </footer>
  `,
})
export class App {
  protected readonly store = inject(AppStore);
  readonly restoreError = signal('');

  private t(text: string, params = {}): string {
    return translate(text, this.store.settings().uiLanguage, params);
  }

  newCharacter(): void {
    const name = prompt(this.t('Character name'));
    if (name?.trim()) this.store.createCharacter(name);
  }

  renameCharacter(): void {
    const name = prompt(this.t('Character name'), this.store.activeCharacter().name);
    if (name?.trim()) this.store.renameActiveCharacter(name);
  }

  removeCharacter(): void {
    const c = this.store.activeCharacter();
    if (confirm(this.t('Delete character {name} and its plans?', { name: c.name }))) this.store.deleteActiveCharacter();
  }

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
