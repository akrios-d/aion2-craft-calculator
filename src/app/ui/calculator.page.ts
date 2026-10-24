import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { ItemIcon } from '../core/item-icon';
import { ItemPicker } from '../core/item-picker';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { calculateCraft } from '../core/engine/craft-engine';
import { Strategy } from '../core/models';

@Component({
  selector: 'app-calculator',
  imports: [ItemIcon, ItemPicker, TrPipe, FormsModule, DecimalPipe, NgTemplateOutlet, RouterLink],
  template: `
    <h2>{{ 'Crafting calculator' | tr }}</h2>
    <p class="muted">
      {{ 'Prices are the ones you entered or imported' | tr }}
      (<a routerLink="/prices">{{ 'edit' | tr }}</a>). {{ 'Listing prices are not completed sales.' | tr }}
    </p>

    <div class="subtabs" role="tablist">
      <button type="button" role="tab" [class.active]="tab() === 'plans'" (click)="tab.set('plans')">{{ 'My plans' | tr }} ({{ store.characterPlans().length }})</button>
      <button type="button" role="tab" [class.active]="tab() === 'new'" (click)="tab.set('new')">{{ 'New plan' | tr }}</button>
    </div>

    @if (tab() === 'new') {
    @if (store.craftableItems().length === 0) {
      <div class="msg warn">
        {{ 'No recipes are available yet.' | tr }} <a routerLink="/data">{{ 'Data' | tr }}</a> ? <a routerLink="/recipes">{{ 'Recipes' | tr }}</a>
      </div>
    } @else {
      <div class="row">
        <label>{{ 'Item to craft' | tr }}
          <app-item-picker [items]="store.craftableItems()" [(selectedId)]="targetId" />
        </label>
        <label>{{ 'Quantity' | tr }}
          <input type="number" min="1" step="1" [ngModel]="quantity()" (ngModelChange)="quantity.set($event)" />
        </label>
      </div>
    }

    @if (result(); as r) {
      @if (visibleIssues(r).length) {
        <ul class="issues">
          @for (i of visibleIssues(r); track $index) { <li [class]="i.severity"><strong>{{ i.severity | tr }}</strong> — {{ i.message | tr }}</li> }
        </ul>
      }

      @if (r.tree) {
        <div class="cards">
          <div class="card"><span>{{ 'Cash cost (to buy)' | tr }}</span><strong>{{ r.cashCost | number: '1.0-2' }}</strong></div>
          <div class="card"><span>{{ 'Inventory used (value)' | tr }}</span><strong>{{ r.inventoryValue | number: '1.0-2' }}</strong></div>
          <div class="card"><span>{{ 'Full cost' | tr }}</span><strong>{{ r.fullCost | number: '1.0-2' }}</strong>@if (!r.costComplete) { <small class="warn">{{ 'incomplete' | tr }}</small> }</div>
          @if (r.directBuyCost !== undefined) {
            <div class="card"><span>{{ 'Buying the finished item' | tr }}</span><strong>{{ r.directBuyCost | number: '1.0-2' }}</strong></div>
          }
        </div>

        @if (r.profitability; as p) {
          <h3>{{ 'Profitability' | tr }} <small class="muted">{{ '(from your entered listing price, not a completed sale)' | tr }}</small></h3>
          <table class="kv">
            <tr><td>{{ 'Sell listing price per unit' | tr }}</td><td>{{ p.unitSellListing | number: '1.0-2' }}</td></tr>
            <tr><td>{{ 'Auction House fee' | tr }}</td><td>{{ '{fee}% → net per unit {net}' | tr: { fee: p.feePercent, net: (p.unitNetAfterFee | number: '1.0-2') } }}</td></tr>
            <tr><td>{{ 'Gross / fee / net revenue' | tr }}</td><td>{{ p.grossRevenue | number: '1.0-2' }} / {{ p.feeAmount | number: '1.0-2' }} / {{ p.netRevenue | number: '1.0-2' }}</td></tr>
            <tr><td>{{ 'Profit (inventory free)' | tr }}</td><td [class]="p.profitCash >= 0 ? 'pos' : 'neg'">{{ p.profitCash | number: '1.0-2' }}</td></tr>
            <tr><td>{{ 'Profit (inventory at buy price)' | tr }}</td><td [class]="p.profitFull >= 0 ? 'pos' : 'neg'">{{ p.profitFull | number: '1.0-2' }}</td></tr>
            <tr><td>{{ 'Margin / ROI' | tr }}</td><td>{{ p.marginPercent === null ? '–' : (p.marginPercent | number: '1.0-1') + '%' }} / {{ p.roiPercent === null ? '–' : (p.roiPercent | number: '1.0-1') + '%' }}</td></tr>
          </table>
          @if (!p.complete) { <p class="msg warn">{{ 'Some costs are missing, so profit is overstated.' | tr }}</p> }
        }

        <h3>{{ 'Crafting steps' | tr }}</h3>
        @if (r.crafts.length) {
          <table>
            <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Batches' | tr }}</th><th>{{ 'Produced' | tr }}</th></tr></thead>
            <tbody>@for (c of r.crafts; track c.itemId) { <tr><td><app-ico [id]="c.itemId" />{{ c.name }}</td><td>{{ c.batches }}</td><td>{{ c.produced }}</td></tr> }</tbody>
          </table>
        } @else { <p class="muted">{{ 'Nothing needs crafting (covered by inventory).' | tr }}</p> }

        <h3>{{ 'Shopping list' | tr }}</h3>
        @if (r.purchases.length) {
          <table>
            <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Qty' | tr }}</th><th>{{ 'Unit buy price' | tr }}</th><th>{{ 'Cost' | tr }}</th><th></th></tr></thead>
            <tbody>
              @for (p of r.purchases; track p.itemId) {
                <tr><td><app-ico [id]="p.itemId" />{{ p.name }}</td><td>{{ p.quantity }}</td><td>{{ p.unitPrice === undefined ? ('missing' | tr) : (p.unitPrice | number: '1.0-2') }}</td><td>{{ p.cost | number: '1.0-2' }}</td><td><button type="button" [title]="'Adds the quantity to your inventory' | tr" (click)="markBought(p.itemId, p.quantity)">{{ 'Bought: add to inventory' | tr }}</button></td></tr>
              }
            </tbody>
          </table>
        } @else { <p class="muted">{{ 'Nothing to buy.' | tr }}</p> }

        @if (r.inventoryUsed.length) {
          <h3>{{ 'From your inventory' | tr }} <small class="muted">{{ '(not modified automatically)' | tr }}</small></h3>
          <table>
            <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Used' | tr }}</th><th>{{ 'Have' | tr }}</th></tr></thead>
            <tbody>@for (u of r.inventoryUsed; track u.itemId) { <tr><td><app-ico [id]="u.itemId" />{{ u.name }}</td><td>{{ u.used }}</td><td><input type="number" class="narrow" min="0" step="1" [value]="u.available" (change)="setHave(u.itemId, $any($event.target).value)" [attr.aria-label]="'Have' | tr" /></td></tr> }</tbody>
          </table>
        }
        @if (r.surplus.length) {
          <p class="muted">{{ 'Leftover from whole batches:' | tr }} @for (s of r.surplus; track s.itemId) { <span class="chip"><app-ico [id]="s.itemId" />{{ s.quantity }}× {{ s.name }}</span> }</p>
        }

        <h3>{{ 'Dependency tree' | tr }}</h3>
        <ul class="tree"><ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: r.tree, depth: 0 }" /></ul>

        <h3>{{ 'Save this plan' | tr }}</h3>
        <div class="row">
          <input type="text" [placeholder]="'Plan name' | tr" [ngModel]="planName()" (ngModelChange)="planName.set($event)" />
          <button (click)="savePlan()" [disabled]="!planName().trim()">{{ 'Save plan' | tr }}</button>
        </div>
      }
    }

    }

    <ng-template #nodeTpl let-n let-depth="depth">
      <li>
        <span class="node {{ n.action }}">
          <app-ico [id]="n.itemId" /><strong>{{ n.required }}× {{ n.name }}</strong>
          @if (n.fromSurplus) { · {{ '{n} from earlier batch surplus' | tr: { n: n.fromSurplus } }} }
          @if (n.fromInventory) { · {{ '{n} from inventory' | tr: { n: n.fromInventory } }} }
          @if (n.action === 'craft') { · {{ 'craft {batches} batch(es) → {produced}' | tr: { batches: n.batches, produced: n.produced } }} }
          @if (n.action === 'buy') { · {{ 'buy' | tr }} {{ n.toAcquire }} @if (n.unitPrice !== undefined) { @ {{ n.unitPrice | number: '1.0-2' }} = {{ n.cost | number: '1.0-2' }} } @else { <em class="warn">{{ '(no price)' | tr }}</em> } }
          @if (n.action === 'circular') { · <em class="neg">{{ 'circular dependency' | tr }}</em> }
          @if (depth > 0 && craftable().has(n.itemId)) {
            <select class="mini" [ngModel]="strategyFor(n.itemId)" (ngModelChange)="store.setStrategy(n.itemId, $event)" [title]="'Buy or craft this component' | tr">
              <option value="auto">{{ 'auto (cheapest)' | tr }}</option>
              <option value="craft">{{ 'always craft' | tr }}</option>
              <option value="buy">{{ 'always buy' | tr }}</option>
            </select>
          }
          @if (recipeOptions(n.itemId).length > 1) {
            <select class="mini" [ngModel]="chosenRecipe(n.itemId)" (ngModelChange)="store.setRecipeChoice(n.itemId, $event)" [title]="'Recipe' | tr">
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

    @if (tab() === 'plans') {
      @if (store.characterPlans().length) {
        <table>
          <thead><tr><th>{{ 'Plan name' | tr }}</th><th>{{ 'Item' | tr }}</th><th>{{ 'Quantity' | tr }}</th><th></th></tr></thead>
          <tbody>
            @for (p of store.characterPlans(); track p.id) {
              <tr>
                <td><strong>{{ p.name }}</strong></td>
                <td><app-ico [id]="p.targetItemId" />{{ store.nameOf(p.targetItemId) }}</td>
                <td>{{ p.quantity }}</td>
                <td>
                  <button class="primary" (click)="loadPlan(p.id)">{{ 'Load' | tr }}</button>
                  <button (click)="store.deletePlan(p.id)">{{ 'Delete' | tr }}</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="muted">{{ 'No saved plans yet.' | tr }} <a href="javascript:void(0)" (click)="tab.set('new')">{{ 'New plan' | tr }}</a></p>
      }
    }
  `,
})
export class CalculatorPage {
  protected readonly store = inject(AppStore);
  readonly targetId = signal('');
  readonly quantity = signal<number>(1);
  readonly planName = signal('');
  readonly tab = signal<'plans' | 'new'>('new');

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

  // Bundled recipes are assumed correct, so the per-recipe "unverified" notice is not shown.
  visibleIssues(r: { issues: { type: string; severity: string }[] }): any[] {
    return r.issues.filter((i) => !['unverified-recipe', 'missing-price', 'missing-sell-price'].includes(i.type) && i.severity !== 'info');
  }

  markBought(itemId: string, qty: number): void {
    this.store.setInventory(itemId, (this.store.inventoryQuantities()[itemId] ?? 0) + qty);
  }

  setHave(itemId: string, raw: string): void {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) this.store.setInventory(itemId, n);
  }

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
    const p = this.store.characterPlans().find((x) => x.id === id);
    if (!p) return;
    this.targetId.set(p.targetItemId);
    this.quantity.set(p.quantity);
    this.tab.set('new');
    if (p.server !== this.store.settings().server) this.store.setSettings({ server: p.server });
  }
}
