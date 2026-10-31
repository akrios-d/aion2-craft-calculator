import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-market-import',
  imports: [FormsModule, TrPipe],
  template: `
    <p class="muted">{{ 'Loads the current Aion2Market listing prices through a small serverless proxy. They are listing prices, not completed sales.' | tr }}</p>
    <div class="row">
      <select [ngModel]="store.settings().marketServerId ?? 12402" (ngModelChange)="store.selectMarketServer(+$event)" [attr.aria-label]="'Server' | tr">
        @for (s of store.marketServers(); track s.serverId) { <option [value]="s.serverId">{{ s.name }} ({{ s.region }})</option> }
      </select>
      <button type="button" [disabled]="store.marketStatus() === 'loading'" (click)="store.syncMarket()">{{ 'Fetch market prices' | tr }}</button>
    </div>
    @if (store.marketStatus() === 'error') { <p class="msg error">{{ 'Could not reach the market data. Try again later.' | tr }}</p> }
  `,
})
export class MarketImportPanel {
  protected readonly store = inject(AppStore);
}