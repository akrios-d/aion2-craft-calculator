import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { AppStore } from '../core/app-store';
import { calculateCraft } from '../core/engine/craft-engine';
import { Strategy } from '../core/models';

@Component({
  selector: 'app-calculator',
  imports: [FormsModule, DecimalPipe, NgTemplateOutlet, RouterLink],
  template: `
    <h2>Crafting calculator</h2>
    <p class="muted">
      Server: <strong>{{ store.settings().server }}</strong> · Prices are the ones you entered or imported
      (<a routerLink="/prices">edit</a>). Listing prices are not completed sales.
    </p>

    @if (store.craftableItems().length === 0) {
      <div class="msg warn">
        No recipes are available yet. The bundled dataset is empty (see <a routerLink="/data">Data</a>).
        Add your own items and recipes on the <a routerLink="/recipes">Recipes</a> page or import a recipe pack.
      </div>
    } @else {
      <div class="row">
        <label>Item to craft
          <select [ngModel]="targetId()" (ngModelChange)="targetId.set($event)">
            <option value="">— choose —</option>
            @for (i of store.craftableItems(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }
          </select>
        </label>
        <label>Quantity
          <input type="number" min="1" step="1" [ngModel]="quantity()" (ngModelChange)="quantity.set($event)" />
        </label>
      </div>
    }

    @if (result(); as r) {
      @if (r.issues.length) {
        <ul class="issues">
          @for (i of r.issues; track $index) { <li [class]="i.severity"><strong>{{ i.severity }}</strong> — {{ i.message }}</li> }
        </ul>
      }

      @if (r.tree) {
        <div class="cards">
          <div class="card"><span>Cash cost (to buy)</span><strong>{{ r.cashCost | number: '1.0-2' }}</strong></div>
          <div class="card"><span>Inventory used (value)</span><strong>{{ r.inventoryValue | number: '1.0-2' }}</strong></div>
          <div class="card"><span>Full cost</span><strong>{{ r.fullCost | number: '1.0-2' }}</strong>@if (!r.costComplete) { <small class="warn">incomplete</small> }</div>
          @if (r.directBuyCost !== undefined) {
            <div class="card"><span>Buying the finished item</span><strong>{{ r.directBuyCost | number: '1.0-2' }}</strong></div>
          }
        </div>

        @if (r.profitability; as p) {
          <h3>Profitability <small class="muted">(from your entered <em>listing</em> price, not a completed sale)</small></h3>
          <table class="kv">
            <tr><td>Sell listing price per unit</td><td>{{ p.unitSellListing | number: '1.0-2' }}</td></tr>
            <tr><td>Auction House fee</td><td>{{ p.feePercent }}% → net per unit {{ p.unitNetAfterFee | number: '1.0-2' }}</td></tr>
            <tr><td>Gross / fee / net revenue</td><td>{{ p.grossRevenue | number: '1.0-2' }} / {{ p.feeAmount | number: '1.0-2' }} / {{ p.netRevenue | number: '1.0-2' }}</td></tr>
            <tr><td>Profit (inventory free)</td><td [class]="p.profitCash >= 0 ? 'pos' : 'neg'">{{ p.profitCash | number: '1.0-2' }}</td></tr>
            <tr><td>Profit (inventory at buy price)</td><td [class]="p.profitFull >= 0 ? 'pos' : 'neg'">{{ p.profitFull | number: '1.0-2' }}</td></tr>
            <tr><td>Margin / ROI</td><td>{{ p.marginPercent === null ? '–' : (p.marginPercent | number: '1.0-1') + '%' }} / {{ p.roiPercent === null ? '–' : (p.roiPercent | number: '1.0-1') + '%' }}</td></tr>
          </table>
          @if (!p.complete) { <p class="msg warn">Some costs are missing, so profit is overstated.</p> }
        }

        <h3>Crafting steps</h3>
        @if (r.crafts.length) {
          <table>
            <thead><tr><th>Item</th><th>Batches</th><th>Produced</th></tr></thead>
            <tbody>@for (c of r.crafts; track c.itemId) { <tr><td>{{ c.name }}</td><td>{{ c.batches }}</td><td>{{ c.produced }}</td></tr> }</tbody>
          </table>
        } @else { <p class="muted">Nothing needs crafting (covered by inventory).</p> }

        <h3>Shopping list</h3>
        @if (r.purchases.length) {
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Unit buy price</th><th>Cost</th></tr></thead>
            <tbody>
              @for (p of r.purchases; track p.itemId) {
                <tr><td>{{ p.name }}</td><td>{{ p.quantity }}</td><td>{{ p.unitPrice === undefined ? 'missing' : (p.unitPrice | number: '1.0-2') }}</td><td>{{ p.cost | number: '1.0-2' }}</td></tr>
              }
            </tbody>
          </table>
        } @else { <p class="muted">Nothing to buy.</p> }

        @if (r.inventoryUsed.length) {
          <h3>From your inventory <small class="muted">(not modified automatically)</small></h3>
          <table>
            <thead><tr><th>Item</th><th>Used</th><th>Have</th></tr></thead>
            <tbody>@for (u of r.inventoryUsed; track u.itemId) { <tr><td>{{ u.name }}</td><td>{{ u.used }}</td><td>{{ u.available }}</td></tr> }</tbody>
          </table>
        }
        @if (r.surplus.length) {
          <p class="muted">Leftover from whole batches: @for (s of r.surplus; track s.itemId) { <span class="chip">{{ s.quantity }}× {{ s.name }}</span> }</p>
        }

        <h3>Dependency tree</h3>
        <ul class="tree"><ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: r.tree, depth: 0 }" /></ul>

        <h3>Save this plan</h3>
        <div class="row">
          <input type="text" placeholder="Plan name" [ngModel]="planName()" (ngModelChange)="planName.set($event)" />
          <button (click)="savePlan()" [disabled]="!planName().trim()">Save plan</button>
        </div>
      }
    }

    <ng-template #nodeTpl let-n let-depth="depth">
      <li>
        <span class="node {{ n.action }}">
          <strong>{{ n.required }}× {{ n.name }}</strong>
          @if (n.fromSurplus) { · {{ n.fromSurplus }} from earlier batch surplus }
          @if (n.fromInventory) { · {{ n.fromInventory }} from inventory }
          @if (n.action === 'craft') { · craft {{ n.batches }} batch(es) → {{ n.produced }} }
          @if (n.action === 'buy') { · buy {{ n.toAcquire }} @if (n.unitPrice !== undefined) { @ {{ n.unitPrice | number: '1.0-2' }} = {{ n.cost | number: '1.0-2' }} } @else { <em class="warn">(no price)</em> } }
          @if (n.action === 'circular') { · <em class="neg">circular dependency</em> }
          @if (depth > 0 && craftable().has(n.itemId)) {
            <select class="mini" [ngModel]="strategyFor(n.itemId)" (ngModelChange)="store.setStrategy(n.itemId, $event)" title="Buy or craft this component">
              <option value="auto">auto (cheapest)</option>
              <option value="craft">always craft</option>
              <option value="buy">always buy</option>
            </select>
          }
          @if (recipeOptions(n.itemId).length > 1) {
            <select class="mini" [ngModel]="chosenRecipe(n.itemId)" (ngModelChange)="store.setRecipeChoice(n.itemId, $event)" title="Recipe">
              @for (rid of recipeOptions(n.itemId); track rid) { <option [value]="rid">{{ rid }}</option> }
            </select>
          }
        </span>
        @if (n.children.length) {
          <ul>
            @for (c of n.children; track $index) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: c, depth: depth + 1 }" />
            }
          </ul>
        }
      </li>
    </ng-template>

    @if (store.data().plans.length) {
      <h3>Saved plans</h3>
      <ul class="plain">
        @for (p of store.data().plans; track p.id) {
          <li>
            <strong>{{ p.name }}</strong> — {{ p.quantity }}× {{ store.nameOf(p.targetItemId) }} ({{ p.server }})
            <button (click)="loadPlan(p.id)">Load</button>
            <button (click)="store.deletePlan(p.id)">Delete</button>
          </li>
        }
      </ul>
    }
  `,
})
export class CalculatorPage {
  protected readonly store = inject(AppStore);
  readonly targetId = signal('');
  readonly quantity = signal<number>(1);
  readonly planName = signal('');

  readonly craftable = computed(() => new Set(this.store.recipes().map((r) => r.outputItemId)));

  readonly result = computed(() => {
    const id = this.targetId();
    if (!id) return null;
    const d = this.store.data();
    return calculateCraft({
      targetItemId: id,
      quantity: Number(this.quantity()),
      recipes: this.store.recipes(),
      items: this.store.items(),
      prices: this.store.serverPrices(),
      inventory: this.store.inventoryQuantities(),
      strategies: d.strategies,
      recipeChoices: d.recipeChoices,
      defaultStrategy: d.settings.defaultStrategy,
      defaultFeePercent: d.settings.defaultFeePercent,
    });
  });

  strategyFor(id: string): Strategy {
    return this.store.data().strategies[id] ?? this.store.settings().defaultStrategy;
  }

  recipeOptions(itemId: string): string[] {
    return this.store.recipes().filter((r) => r.outputItemId === itemId).map((r) => r.id).sort();
  }

  chosenRecipe(itemId: string): string {
    return this.store.data().recipeChoices[itemId] ?? this.recipeOptions(itemId)[0];
  }

  savePlan(): void {
    this.store.savePlan({
      id: crypto.randomUUID(),
      name: this.planName().trim(),
      targetItemId: this.targetId(),
      quantity: Number(this.quantity()),
      server: this.store.settings().server,
      createdAt: new Date().toISOString(),
    });
    this.planName.set('');
  }

  loadPlan(id: string): void {
    const p = this.store.data().plans.find((x) => x.id === id);
    if (!p) return;
    this.targetId.set(p.targetItemId);
    this.quantity.set(p.quantity);
    if (p.server !== this.store.settings().server) this.store.setSettings({ server: p.server });
  }
}
