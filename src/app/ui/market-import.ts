import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-market-import',
  imports: [TrPipe, DatePipe],
  template: `
    <p class="muted">{{ 'Loads the current Aion2Market listing prices through a small serverless proxy. They are listing prices, not completed sales.' | tr }}</p>
    <div class="row">
      <button type="button" [disabled]="store.marketStatus() === 'loading'" (click)="store.syncMarket(true)">{{ 'Force refresh' | tr }}</button>
    </div>
    <p class="muted">
      {{ 'Last refresh' | tr }}: <strong>{{ store.lastSync() ? (store.lastSync()! | date: 'medium') : '–' }}</strong>
      · {{ 'Newest market data' | tr }}: <strong>{{ store.dataTime() ? (store.dataTime()! | date: 'medium') : '–' }}</strong>
    </p>
    @if (store.marketStatus() === 'error') { <p class="msg error">{{ 'Could not reach the market data. Try again later.' | tr }}</p> }
  `,
})
export class MarketImportPanel {
  protected readonly store = inject(AppStore);
}