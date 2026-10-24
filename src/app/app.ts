import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppStore } from './core/app-store';
import { AutofocusDirective, DialogService } from './core/dialog';
import { downloadText } from './core/download';
import { parseBackup } from './core/io/backup';
import { translate } from './core/i18n';
import { TrPipe } from './core/tr.pipe';

@Component({
  selector: 'app-root',
  host: { '(document:keydown)': 'onKey($event)' },
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TrPipe, AutofocusDirective],
  template: `
    <header>
      <div class="bar">
        <h1><span class="crest">◆</span> Aion 2 <em>Craft Lab</em></h1>
        <div class="tools">
          <div class="chars" role="group" [attr.aria-label]="'Character' | tr">
            <select [attr.aria-label]="'Character' | tr" (change)="store.selectCharacter($any($event.target).value)">
              @for (c of store.characters(); track c.id) {
                <option [value]="c.id" [selected]="c.id === store.activeCharacter().id">{{ c.name }}</option>
              }
            </select>
            <button type="button" class="icon" [title]="'New' | tr" [attr.aria-label]="'New' | tr" (click)="newCharacter()">+</button>
            <button type="button" class="icon" [title]="'Rename' | tr" [attr.aria-label]="'Rename' | tr" (click)="renameCharacter()">✎</button>
            <button type="button" class="icon" [title]="'Delete' | tr" [attr.aria-label]="'Delete' | tr" [disabled]="store.characters().length < 2" (click)="removeCharacter()">✕</button>
          </div>
          <div class="chars" role="group">
            <button type="button" class="icon" [title]="'Undo' | tr" [attr.aria-label]="'Undo' | tr" [disabled]="!store.canUndo()" (click)="store.undo()">↶</button>
            <button type="button" class="icon" [title]="'Redo' | tr" [attr.aria-label]="'Redo' | tr" [disabled]="!store.canRedo()" (click)="store.redo()">↷</button>
          </div>
          <label class="inline" [title]="'Faction' | tr">⚔
            <select [attr.aria-label]="'Faction' | tr" [value]="store.settings().faction" (change)="store.setSettings({ faction: $any($event.target).value })">
              <option value="all">{{ 'All factions' | tr }}</option><option value="Elyos">Elyos</option><option value="Asmodians">{{ 'Asmodians' | tr }}</option>
            </select>
          </label>
          <label class="inline" [title]="'Language' | tr">🌐
            <select [attr.aria-label]="'Language' | tr" [value]="store.settings().uiLanguage" (change)="store.setSettings({ uiLanguage: $any($event.target).value })">
              <option value="en">EN</option>
              <option value="pt">PT</option>
            </select>
          </label>
          <label class="inline" [title]="'Item names' | tr">Aa
            <select [attr.aria-label]="'Item names' | tr" [value]="store.settings().itemNameLanguage" (change)="store.setSettings({ itemNameLanguage: $any($event.target).value })">
              <option value="en">EN</option>
              <option value="pt">PT</option>
            </select>
          </label>
        </div>
      </div>
      <nav class="tabs" role="tablist">
        <div class="tabs-in">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{ 'Calculator' | tr }}</a>
          <a routerLink="/prices" routerLinkActive="active">{{ 'Prices' | tr }}</a>
          <a routerLink="/inventory" routerLinkActive="active">{{ 'Inventory' | tr }}</a>
          <a routerLink="/recipes" routerLinkActive="active">{{ 'Recipes' | tr }}</a>
          <a routerLink="/data" routerLinkActive="active">{{ 'Data' | tr }}</a>
          <a routerLink="/settings" routerLinkActive="active">{{ 'Settings' | tr }}</a>
        </div>
      </nav>
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
    @if (dialog.state(); as d) {
      <div class="modal-backdrop" (click)="dialog.cancel()" (keydown.escape)="dialog.cancel()">
        <div class="modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <p>{{ d.message }}</p>
          @if (d.kind === 'prompt') {
            <input appAutofocus [value]="d.value" (input)="dialog.setValue($any($event.target).value)" (keydown.enter)="dialog.accept()" (keydown.escape)="dialog.cancel()" />
          }
          <div class="row end">
            <button type="button" (click)="dialog.cancel()">{{ 'Cancel' | tr }}</button>
            <button type="button" [class]="d.danger ? 'danger' : 'primary'" (click)="dialog.accept()">{{ (d.kind === 'prompt' ? 'OK' : d.danger ? 'Delete' : 'OK') | tr }}</button>
          </div>
        </div>
      </div>
    }
    <footer>
      {{ 'Fully client-side. Your data stays in this browser (LocalStorage). Prices are entered by you; listing prices are not completed sales.' | tr }}
      {{ 'Not affiliated with NCSOFT or Aion2.gg.' | tr }}
    </footer>
  `,
})
export class App {
  protected readonly store = inject(AppStore);
  protected readonly dialog = inject(DialogService);
  readonly restoreError = signal('');

  private t(text: string, params = {}): string {
    return translate(text, this.store.settings().uiLanguage, params);
  }

  onKey(ev: KeyboardEvent): void {
    const el = ev.target as HTMLElement | null;
    if (!(ev.ctrlKey || ev.metaKey) || el?.closest('input, textarea, select, [contenteditable]')) return;
    const k = ev.key.toLowerCase();
    if (k === 'z' && !ev.shiftKey) this.store.undo();
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) this.store.redo();
    else return;
    ev.preventDefault();
  }

  async newCharacter(): Promise<void> {
    const name = await this.dialog.prompt(this.t('Character name'));
    if (name?.trim()) this.store.createCharacter(name);
  }

  async renameCharacter(): Promise<void> {
    const name = await this.dialog.prompt(this.t('Character name'), this.store.activeCharacter().name);
    if (name?.trim()) this.store.renameActiveCharacter(name);
  }

  async removeCharacter(): Promise<void> {
    const c = this.store.activeCharacter();
    if (await this.dialog.confirm(this.t('Delete character {name} and its plans?', { name: c.name }), true)) this.store.deleteActiveCharacter();
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
