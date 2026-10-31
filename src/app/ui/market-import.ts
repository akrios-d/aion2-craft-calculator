import { Component, inject } from '@angular/core';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-market-import',
  imports: [TrPipe],
  template: `
    <p class="muted">{{ 'Loads the current Aion2Market listing prices through a small serverless proxy. They are listing prices, not completed sales.' | tr }}</p>
    <div class="row">
      <button type="button" [disabled]="store.marketStatus() === 'loading'" (click)="store.syncMarket()">{{ 'Fetch market prices' | tr }}</button>
    </div>
    @if (store.marketStatus() === 'error') { <p class="msg error">{{ 'Could not reach the market data. Try again later.' | tr }}</p> }
  `,
})
export class MarketImportPanel {
  protected readonly store = inject(AppStore);
}