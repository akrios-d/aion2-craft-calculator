import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { MarketImport, MarketServer, parseMarketItems, parseServers } from '../core/io/market';
import { applyPriceImport, summarizeChanges } from '../core/io/imports';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-market-import',
  imports: [FormsModule, TrPipe],
  template: `
    <p class="muted">{{ 'Loads the current Aion2Market listing prices through a small serverless proxy. They are listing prices, not completed sales, and are only applied after you confirm.' | tr }}</p>
    <div class="row">
      <select [ngModel]="serverId()" (ngModelChange)="serverId.set(+$event)">
        @for (s of servers(); track s.serverId) { <option [value]="s.serverId">{{ s.name }} ({{ s.region }})</option> }
      </select>
      <button type="button" [disabled]="busy()" (click)="load()">{{ 'Fetch market prices' | tr }}</button>
    </div>
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }
    @if (result(); as r) {
      <p>
        {{ r.total }} {{ 'listed items' | tr }} · {{ r.records.length }} {{ 'matched' | tr }} · {{ r.unmatched.length }} {{ 'not in the recipe catalogue' | tr }}
        @for (k of summary(); track k[0]) { · {{ k[1] }} {{ k[0] }} }
      </p>
      <button class="primary" [disabled]="!r.records.length" (click)="apply(r)">{{ 'Apply import' | tr }}</button>
      @if (done()) { <p class="msg info">{{ 'Imported.' | tr }}</p> }
    }
  `,
})
export class MarketImportPanel {
  private readonly store = inject(AppStore);
  readonly servers = signal<MarketServer[]>([{ serverId: 12402, name: 'Zikel', region: 'LA' }]);
  readonly serverId = signal(12402);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly result = signal<MarketImport | null>(null);
  readonly summary = computed(() => {
    const r = this.result();
    if (!r) return [];
    return Object.entries(summarizeChanges(applyPriceImport(this.store.data(), r.records, 'merge').changes)).filter(([, n]) => n > 0);
  });

  constructor() {
    void this.loadServers();
  }

  private async loadServers(): Promise<void> {
    try {
      const res = await fetch('/api/market?servers');
      if (res.ok) {
        const list = parseServers(await res.json());
        if (list.length) this.servers.set(list);
      }
    } catch {
      /* keep the default list */
    }
  }

  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    this.result.set(null);
    try {
      const res = await fetch(`/api/market?server=${this.serverId()}`);
      if (!res.ok) throw new Error(String(res.status));
      const r = parseMarketItems(await res.json(), this.store.items(), this.store.settings().server);
      if (!r.total) this.error.set('No market data returned.');
      this.result.set(r);
    } catch {
      this.error.set('Could not reach the market data. Try again later.');
    } finally {
      this.busy.set(false);
    }
  }

  apply(r: MarketImport): void {
    this.store.update((d) => applyPriceImport(d, r.records, 'merge', (id) => this.store.nameOf(id)).data);
    this.done.set(true);
  }
}
