import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { applyBackup, applyRecipePack, parseBackup, parseRecipePack } from '../core/io/backup';
import {
  ApplyResult,
  ChangeRow,
  ImportIssue,
  ImportMode,
  applyInventoryImport,
  applyPriceImport,
  parseInventoryCsv,
  parsePriceCsv,
  summarizeChanges,
} from '../core/io/imports';
import { UserData } from '../core/models';

export type ImportKind = 'prices' | 'inventory' | 'backup' | 'recipes';

interface Analysis {
  fatal?: string;
  issues: ImportIssue[];
  changes: ChangeRow[];
  validCount: number;
  rowCount: number;
  next?: UserData;
}

const MAX_FILE_BYTES = 5_000_000;

@Component({
  selector: 'app-import-panel',
  imports: [FormsModule],
  template: `
    <div class="import-panel">
      <div class="row">
        <input type="file" [accept]="accept()" (change)="onFile($event)" />
        @if (fileName()) { <span class="muted">{{ fileName() }}</span> }
      </div>
      <textarea rows="4" [ngModel]="text()" (ngModelChange)="text.set($event)" [placeholder]="'…or paste ' + placeholder() + ' here'"></textarea>

      @if (text().trim()) {
        @let a = analysis();
        @if (a.fatal) {
          <p class="msg error">{{ a.fatal }}</p>
        }
        @if (kind() !== 'recipes') {
          <div class="row">
            <label><input type="radio" name="mode-{{ kind() }}" value="merge" [ngModel]="mode()" (ngModelChange)="setMode('merge')" /> Merge (keep what is not in the file)</label>
            <label><input type="radio" name="mode-{{ kind() }}" value="replace" [ngModel]="mode()" (ngModelChange)="setMode('replace')" /> Replace (remove what is not in the file)</label>
          </div>
        }
        <p class="muted">
          {{ a.rowCount }} row(s) read · {{ a.validCount }} valid · {{ errorCount(a) }} error(s) · {{ warningCount(a) }} warning(s).
          Rows with errors are skipped.
        </p>
        @if (a.issues.length) {
          <details open>
            <summary>Validation report</summary>
            <ul class="issues">
              @for (i of a.issues.slice(0, 200); track $index) {
                <li [class]="i.severity">Line {{ i.line }}: {{ i.message }}</li>
              }
            </ul>
          </details>
        }
        @if (a.changes.length) {
          <details open>
            <summary>
              Preview (nothing is applied yet):
              @for (k of summaryKeys(a); track k[0]) { <span class="chip {{ k[0] }}">{{ k[1] }} {{ k[0] }}</span> }
            </summary>
            <table>
              <thead><tr><th>Change</th><th>Record</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                @for (c of a.changes.slice(0, 300); track $index) {
                  <tr>
                    <td><span class="chip {{ c.kind }}">{{ c.kind }}</span></td>
                    <td>{{ c.label }}</td>
                    <td>{{ c.before }}</td>
                    <td>{{ c.after }} @if (c.note) { <small class="muted">{{ c.note }}</small> }</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (a.changes.length > 300) { <p class="muted">Showing first 300 of {{ a.changes.length }} changes.</p> }
          </details>
        }
        @if (mode() === 'replace' && kind() !== 'recipes') {
          <label class="warn"><input type="checkbox" [ngModel]="confirmed()" (ngModelChange)="confirmed.set($event)" /> I understand replace removes existing records that are not in the file.</label>
        }
        <div class="row">
          <button class="primary" [disabled]="!canApply(a)" (click)="apply(a)">Apply import</button>
          <button (click)="reset()">Clear</button>
        </div>
      }
      @if (done()) { <p class="msg ok">{{ done() }}</p> }
    </div>
  `,
})
export class ImportPanel {
  readonly kind = input.required<ImportKind>();
  private readonly store = inject(AppStore);

  readonly text = signal('');
  readonly fileName = signal('');
  readonly mode = signal<ImportMode>('merge');
  readonly confirmed = signal(false);
  readonly done = signal('');

  accept = computed(() => (this.kind() === 'prices' || this.kind() === 'inventory' ? '.csv,text/csv' : '.json,application/json'));
  placeholder = computed(() => (this.kind() === 'prices' || this.kind() === 'inventory' ? 'CSV text' : 'JSON'));

  analysis = computed<Analysis>(() => {
    const text = this.text();
    const mode = this.mode();
    const data = this.store.data();
    const items = this.store.items();
    const nameOf = this.store.nameOf;
    const ctx = { items, defaultServer: data.settings.server };
    const fromParsed = (p: { records: any[]; issues: ImportIssue[]; rowCount: number; fatal?: string }, res?: ApplyResult): Analysis => ({
      fatal: p.fatal,
      issues: p.issues,
      changes: res?.changes ?? [],
      validCount: p.records.length,
      rowCount: p.rowCount,
      next: res?.data,
    });
    switch (this.kind()) {
      case 'prices': {
        const p = parsePriceCsv(text, ctx);
        return fromParsed(p, p.fatal ? undefined : applyPriceImport(data, p.records, mode, nameOf));
      }
      case 'inventory': {
        const p = parseInventoryCsv(text, ctx);
        return fromParsed(p, p.fatal ? undefined : applyInventoryImport(data, p.records, mode, nameOf));
      }
      case 'backup': {
        const p = parseBackup(text);
        if (p.error || !p.data) return { fatal: p.error, issues: [], changes: [], validCount: 0, rowCount: 0 };
        const res = applyBackup(data, p.data, mode);
        return {
          issues: p.warnings.map((w) => ({ line: 0, severity: 'warning' as const, message: w })),
          changes: res.changes,
          validCount: 1,
          rowCount: 1,
          next: res.data,
        };
      }
      case 'recipes': {
        const p = parseRecipePack(text, new Set(items.map((i) => i.id)), new Set(this.store.recipes().map((r) => r.id)));
        const changes: ChangeRow[] = [
          ...p.pack.items.map((i) => ({ kind: 'added' as const, label: `Item ${i.name}`, after: i.id })),
          ...p.pack.recipes.map((r) => ({ kind: 'added' as const, label: `Recipe ${r.id}`, after: `${r.outputQuantity}× ${r.outputItemId}` })),
        ];
        return {
          fatal: p.fatal,
          issues: p.issues,
          changes,
          validCount: p.pack.items.length + p.pack.recipes.length,
          rowCount: p.pack.items.length + p.pack.recipes.length + p.issues.filter((i) => i.severity === 'error').length,
          next: p.fatal ? undefined : applyRecipePack(data, p.pack),
        };
      }
    }
  });

  errorCount = (a: Analysis) => a.issues.filter((i) => i.severity === 'error').length;
  warningCount = (a: Analysis) => a.issues.filter((i) => i.severity === 'warning').length;
  summaryKeys = (a: Analysis) => Object.entries(summarizeChanges(a.changes)).filter(([, n]) => n > 0);

  canApply(a: Analysis): boolean {
    if (a.fatal || !a.next || a.validCount === 0) return false;
    return this.mode() === 'merge' || this.kind() === 'recipes' || this.confirmed();
  }

  setMode(m: ImportMode): void {
    this.mode.set(m);
    this.confirmed.set(false);
  }

  async onFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.done.set('');
    if (file.size > MAX_FILE_BYTES) {
      this.text.set('');
      this.done.set('File is too large (limit 5 MB).');
      return;
    }
    this.fileName.set(file.name);
    this.text.set(await file.text());
  }

  apply(a: Analysis): void {
    if (!a.next) return;
    const next = a.next;
    const summary = Object.entries(summarizeChanges(a.changes)).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
    if (this.kind() === 'backup' && this.mode() === 'replace') this.store.replaceAll(next);
    else this.store.update(() => next);
    this.reset();
    this.done.set(`Import applied${summary ? `: ${summary}` : ''}.`);
  }

  reset(): void {
    this.text.set('');
    this.fileName.set('');
    this.confirmed.set(false);
    this.done.set('');
  }
}
