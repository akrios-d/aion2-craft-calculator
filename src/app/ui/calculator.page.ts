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
      <button type="button" role="tab" [class.active]="tab() === 'plans'" (click)="setTab('plans')">{{ 'My plans' | tr }} ({{ store.characterPlans().length }})</button>
      <button type="button" role="tab" [class.active]="tab() === 'new'" (click)="setTab('new')">{{ 'New plan' | tr }}</button>
      @for (p of openPlans(); track p.id) {
        <button type="button" role="tab" [class.active]="tab() === 'plan:' + p.id" (click)="setTab('plan:' + p.id)">{{ p.name }} <span class="x" role="button" [attr.aria-label]="'Close' | tr" (click)="closePlan(p.id); $event.stopPropagation()">×</span></button>
      }
      <button type="button" role="tab" [class.active]="tab() === 'total'" (click)="setTab('total')">{{ 'Total' | tr }}</button>
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

      <ng-container *ngTemplateOutlet="resultTpl; context: { $implicit: result(), save: true }" />
    }

    @if (openPlan(); as op) {
      <h3>{{ op.name }} <small class="muted">{{ op.quantity }}× {{ store.nameOf(op.targetItemId) }}</small></h3>
      <ng-container *ngTemplateOutlet="resultTpl; context: { $implicit: openPlanResult(), save: false }" />
    }

    @if (tab() === 'total') {
      @if (store.characterPlans().length) {
        <p class="muted">{{ 'All saved plans combined; your inventory is deducted once across them.' | tr }}</p>
        <ul class="chips">@for (p of store.characterPlans(); track p.id) { <li class="chip"><app-ico [id]="p.targetItemId" />{{ p.quantity }}× {{ store.nameOf(p.targetItemId) }}</li> }</ul>
        <ng-container *ngTemplateOutlet="resultTpl; context: { $implicit: totalResult(), save: false }" />
      } @else { <p class="muted">{{ 'No saved plans yet.' | tr }}</p> }
    }

    <ng-template #resultTpl let-r let-save="save">
    @if (r) {
      @if (visibleIssues(r).length) {
        <ul class="issues">
          @for (i of visibleIssues(r); track $index) { <li [class]="i.severity"><strong>{{ i.severity | tr }}</strong> — {{ i.message | tr }}</li> }
        </ul>
      }

      @if (r.tree || r.isTotal) {
        <div class="cards">
          <div class="card"><span>{{ 'Cash cost (to buy)' | tr }}</span><strong>{{ r.cashCost | number: '1.0-2' }}</strong>@if (money(r.cashCost); as m) { <small class="muted">≈ {{ m }}</small> }</div>
          <div class="card"><span>{{ 'Inventory used (value)' | tr }}</span><strong>{{ r.inventoryValue | number: '1.0-2' }}</strong></div>
          <div class="card"><span>{{ 'Full cost' | tr }}</span><strong>{{ r.fullCost | number: '1.0-2' }}</strong>@if (money(r.fullCost); as m) { <small class="muted">≈ {{ m }}</small> }@if (!r.costComplete) { <small class="warn">{{ 'incomplete' | tr }}</small> }</div>
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

        @if (r.tree) {
        <h3>{{ 'Dependency tree' | tr }}</h3>
        <div class="row">
          <button type="button" (click)="expandAll()">{{ 'Expand all' | tr }}</button>
          <button type="button" (click)="collapseAll(r.tree)">{{ 'Collapse all' | tr }}</button>
          <button type="button" class="primary" [disabled]="!checked().size" (click)="addChecked(r.tree)">{{ 'Add checked to inventory' | tr }} ({{ checked().size }})</button>
        </div>
        <ul class="tree"><ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: r.tree, depth: 0, path: '0' }" /></ul>

        }
        @if (save) {
        <h3>{{ 'Save this plan' | tr }}</h3>
        <div class="row">
          <input type="text" [placeholder]="'Plan name' | tr" [ngModel]="planName()" (ngModelChange)="planName.set($event)" />
          <button (click)="savePlan()" [disabled]="!planName().trim()">{{ 'Save plan' | tr }}</button>
        </div>
        }
      }
    }
    </ng-template>

    <ng-template #nodeTpl let-n let-depth="depth" let-path="path">
      <li>
        <span class="node {{ n.action }}">
          <span class="slot">@if (n.children.length) {
            <button type="button" class="mini" (click)="toggle(path)" [attr.aria-expanded]="!collapsed().has(path)">{{ collapsed().has(path) ? '+' : '−' }}</button>
          }</span>
          <span class="slot">@if (acquired(n) > 0) {
            <input type="checkbox" [checked]="checked().has(path)" (change)="check(path)" [title]="'Add to inventory' | tr" />
          }</span>
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
        @if (n.children.length && !collapsed().has(path)) {
          <ul>
            @for (c of n.children; track $index) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: c, depth: depth + 1, path: path + '.' + $index }" />
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
        <p class="muted">{{ 'No saved plans yet.' | tr }} <a href="javascript:void(0)" (click)="setTab('new')">{{ 'New plan' | tr }}</a></p>
      }
    }
  `,
})
export class CalculatorPage {
  protected readonly store = inject(AppStore);
  readonly targetId = signal('');
  readonly quantity = signal<number>(1);
  readonly planName = signal('');
  readonly tab = signal<string>(this.store.characterPlans().length ? 'plans' : 'new');

  readonly openIds = signal<string[]>([]);
  readonly openPlans = computed(() => this.openIds().map((id) => this.store.characterPlans().find((p) => p.id === id)).filter((p) => !!p));
  readonly openPlan = computed(() => {
    const m = /^plan:(.+)$/.exec(this.tab());
    return m ? this.store.characterPlans().find((p) => p.id === m[1]) : undefined;
  });
  readonly openPlanResult = computed(() => {
    const p = this.openPlan();
    return p ? this.compute(p.targetItemId, p.quantity, this.store.inventoryQuantities()) : null;
  });

  readonly totalResult = computed(() => {
    const inv = { ...this.store.inventoryQuantities() };
    const crafts = new Map<string, any>();
    const buys = new Map<string, any>();
    const used = new Map<string, any>();
    let cashCost = 0, inventoryValue = 0, fullCost = 0, costComplete = true;
    const issues: any[] = [];
    for (const p of this.store.characterPlans()) {
      const r = this.compute(p.targetItemId, p.quantity, inv);
      cashCost += r.cashCost; inventoryValue += r.inventoryValue; fullCost += r.fullCost;
      costComplete = costComplete && r.costComplete;
      issues.push(...r.issues);
      for (const c of r.crafts) {
        const e = crafts.get(c.itemId);
        crafts.set(c.itemId, e ? { ...e, batches: e.batches + c.batches, produced: e.produced + c.produced } : { ...c });
      }
      for (const b of r.purchases) {
        const e = buys.get(b.itemId);
        buys.set(b.itemId, e ? { ...e, quantity: e.quantity + b.quantity, cost: e.cost + b.cost } : { ...b });
      }
      for (const u of r.inventoryUsed) {
        const e = used.get(u.itemId);
        used.set(u.itemId, e ? { ...e, used: e.used + u.used } : { ...u });
        inv[u.itemId] = Math.max(0, (inv[u.itemId] ?? 0) - u.used);
      }
    }
    const seen = new Set<string>();
    return {
      isTotal: true, tree: null, profitability: undefined, directBuyCost: undefined, surplus: [],
      issues: issues.filter((i) => !seen.has(i.message) && !!seen.add(i.message)),
      cashCost, inventoryValue, fullCost, costComplete,
      crafts: [...crafts.values()], purchases: [...buys.values()], inventoryUsed: [...used.values()],
    } as any;
  });

  private compute(itemId: string, quantity: number, inventory: Record<string, number>) {
    const d = this.store.data();
    return calculateCraft({
      targetItemId: itemId,
      quantity: Number(quantity),
      recipes: this.store.recipes(),
      items: this.store.items(),
      prices: this.store.serverPrices(),
      inventory,
      strategies: d.strategies,
      recipeChoices: d.recipeChoices,
      defaultStrategy: d.settings.defaultStrategy,
      defaultFeePercent: d.settings.defaultFeePercent,
    });
  }

  /** Exchange-currency equivalent of a Kinah amount at the best chest rate, or '' when no chests are set. */
  money(kinah: number): string {
    const rate = Math.max(0, ...(this.store.settings().kinahChests ?? []).map((c) => c.kinah / c.price));
    if (!rate || !Number.isFinite(kinah)) return '';
    return Math.ceil(kinah / rate).toLocaleString() + ' ' + (this.store.settings().currency ?? 'Quna');
  }

  setTab(t: string): void {
    this.tab.set(t);
    this.collapsed.set(new Set());
    this.checked.set(new Set());
  }

  closePlan(id: string): void {
    this.openIds.update((l) => l.filter((x) => x !== id));
    if (this.tab() === 'plan:' + id) this.setTab('plans');
  }

  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  readonly checked = signal<ReadonlySet<string>>(new Set());

  /** Units that planning this node adds to your stock: bought or crafted, not already owned. */
  acquired(n: any): number {
    return n.action === 'buy' ? n.toAcquire : n.action === 'craft' ? n.produced : 0;
  }

  toggle(path: string): void {
    const s = new Set(this.collapsed());
    if (!s.delete(path)) s.add(path);
    this.collapsed.set(s);
  }

  expandAll(): void {
    this.collapsed.set(new Set());
  }

  collapseAll(root: any): void {
    const s = new Set<string>();
    const walk = (n: any, p: string): void => {
      if (n.children.length) s.add(p);
      n.children.forEach((c: any, i: number) => walk(c, p + '.' + i));
    };
    walk(root, '0');
    this.collapsed.set(s);
  }

  check(path: string): void {
    const s = new Set(this.checked());
    if (!s.delete(path)) s.add(path);
    this.checked.set(s);
  }

  addChecked(root: any): void {
    const totals = new Map<string, number>();
    const walk = (n: any, p: string): void => {
      if (this.checked().has(p)) totals.set(n.itemId, (totals.get(n.itemId) ?? 0) + this.acquired(n));
      n.children.forEach((c: any, i: number) => walk(c, p + '.' + i));
    };
    walk(root, '0');
    const inv = this.store.inventoryQuantities();
    totals.forEach((q, id) => this.store.setInventory(id, (inv[id] ?? 0) + q));
    this.checked.set(new Set());
  }

  readonly craftable = computed(() => new Set(this.store.recipes().map((r) => r.outputItemId)));

  readonly result = computed(() => (this.targetId() ? this.compute(this.targetId(), this.quantity(), this.store.inventoryQuantities()) : null));

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
    this.openIds.update((l) => (l.includes(id) ? l : [...l, id]));
    this.setTab('plan:' + id);
    if (p.server !== this.store.settings().server) this.store.setSettings({ server: p.server });
  }
}
