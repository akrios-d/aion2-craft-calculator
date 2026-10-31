import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-market-import',
  imports: [TrPipe, DatePipe],
  styles: [`.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.9rem; margin: 0.5rem 0 1rem; } .spin { display: inline-block; } .spin.on { animation: s 0.9s linear infinite; } @keyframes s { to { transform: rotate(360deg); } }`],
  template: `
    <div class="toolbar">
      <button type="button" class="primary" [disabled]="store.marketStatus() === 'loading'" (click)="store.syncMarket()">
        <span class="spin" [class.on]="store.marketStatus() === 'loading'">↻</span> {{ 'Fetch market prices' | tr }}
      </button>
      <span class="muted">
        {{ 'Last refresh' | tr }}: <strong>{{ store.lastSync() ? (store.lastSync()! | date: 'medium') : '–' }}</strong>
        · {{ 'Newest market data' | tr }}: <strong>{{ store.dataTime() ? (store.dataTime()! | date: 'medium') : '–' }}</strong>
      </span>
    </div>
    @if (store.marketStatus() === 'error') { <p class="msg error">{{ 'Could not reach the market data. Try again later.' | tr }}</p> }
  `,
})
export class MarketImportPanel {
  protected readonly store = inject(AppStore);
}