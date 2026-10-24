import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemIcon } from '../core/item-icon';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';
import { validateRecipe } from '../core/engine/craft-engine';
import { Recipe } from '../core/models';
import { ImportPanel } from './import-panel';

@Component({
  selector: 'app-recipes',
  imports: [ItemIcon, TrPipe, FormsModule, ImportPanel],
  template: `
    <h2>{{ 'Recipes & items' | tr }}</h2>
    <p class="muted">
      {{ 'Bundled dataset: {recipes} recipes / {items} items.' | tr: { recipes: store.catalog().recipes.length, items: store.catalog().items.length } }}
      {{ 'Your own entries below are stored in this browser only and marked' | tr }} <em>{{ 'user-entered' | tr }}</em>.
    </p>

    <div class="row">
      <button type="button" [class.primary]="tab() === 'all'" (click)="tab.set('all')">{{ 'All' | tr }}</button>
      <button type="button" [class.primary]="tab() === 'custom'" (click)="tab.set('custom')">{{ 'Custom' | tr }} ({{ customCount() }})</button>
    </div>

    @if (tab() === 'custom') {
    <h3>{{ 'Add an item' | tr }}</h3>
    <form class="row" (ngSubmit)="addItem()">
      <input [placeholder]="'Item id (e.g. iron-ingot)' | tr" [ngModel]="itemId()" (ngModelChange)="itemId.set($event)" name="iid" required />
      <input [placeholder]="'Item name' | tr" [ngModel]="itemName()" (ngModelChange)="itemName.set($event)" name="iname" required />
      <button type="submit">{{ 'Add item' | tr }}</button>
    </form>

    <h3>{{ 'Add a recipe' | tr }}</h3>
    <form class="grid" (ngSubmit)="addRecipe()">
      <label>{{ 'Recipe id' | tr }} <input [ngModel]="rid()" (ngModelChange)="rid.set($event)" name="rid" required /></label>
      <label>{{ 'Output item (name or id)' | tr }} <input list="r-items" [ngModel]="out()" (ngModelChange)="out.set($event)" name="out" required /></label>
      <label>{{ 'Output quantity per batch' | tr }} <input type="number" min="1" step="1" [ngModel]="outQty()" (ngModelChange)="outQty.set($event)" name="oq" required /></label>
      <label class="wide">{{ 'Ingredients, one per line as' | tr }} <code>{{ 'item name or id, quantity' | tr }}</code>
        <textarea rows="4" [ngModel]="ingText()" (ngModelChange)="ingText.set($event)" name="ing"></textarea>
      </label>
      <datalist id="r-items">@for (i of store.items(); track i.id) { <option [value]="i.name">{{ i.id }}</option> }</datalist>
      <div><button class="primary" type="submit">{{ 'Add recipe' | tr }}</button></div>
    </form>
    @if (error()) { <p class="msg error">{{ error() | tr }}</p> }

    <h3>{{ 'Import a recipe pack (JSON)' | tr }}</h3>
    <p class="muted">{{ 'Format:' | tr }} <code>{{ '{' }} "items": [{{ '{' }}"id","name"{{ '}' }}], "recipes": [{{ '{' }}"id","outputItemId","outputQuantity","ingredients":[{{ '{' }}"itemId","quantity"{{ '}' }}]{{ '}' }}] {{ '}' }}</code>. {{ 'Only import data you are allowed to use.' | tr }}</p>
    <app-import-panel kind="recipes" />
    }

    <h3>{{ (tab() === 'custom' ? 'Custom recipes' : 'All recipes') | tr }} <small class="muted">({{ rows().length }})</small></h3>
    <input [placeholder]="'Filter…' | tr" [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Output' | tr }}</th><th>{{ 'Ingredients' | tr }}</th><th>{{ 'Status' | tr }}</th><th>{{ 'Source' | tr }}</th><th></th></tr></thead>
        <tbody>
          @for (r of rows().slice(0, 300); track r.id) {
            <tr>
              <td><app-ico [id]="r.outputItemId" />{{ r.outputQuantity }}× {{ store.nameOf(r.outputItemId) }}</td>
              <td>@for (g of r.ingredients; track $index) { <span class="chip"><app-ico [id]="g.itemId" />{{ g.quantity }}× {{ store.nameOf(g.itemId) }}</span> }</td>
              <td>{{ r.verification | tr }}</td><td>{{ r.source }}</td>
              <td>@if (r.verification === 'user-entered') { <button (click)="store.deleteCustomRecipe(r.id)">{{ 'Delete' | tr }}</button> }</td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No recipes.' | tr }}</p> }
  `,
})
export class RecipesPage {
  protected readonly store = inject(AppStore);
  readonly itemId = signal('');
  readonly itemName = signal('');
  readonly rid = signal('');
  readonly out = signal('');
  readonly outQty = signal<number>(1);
  readonly ingText = signal('');
  readonly error = signal('');
  readonly filter = signal('');
  readonly tab = signal<'all' | 'custom'>('all');
  readonly customCount = computed(() => this.store.recipes().filter((r) => r.verification === 'user-entered').length);

  readonly rows = computed(() => {
    const f = this.filter().trim().toLowerCase();
    const custom = this.tab() === 'custom';
    return this.store
      .recipes()
      .filter((r) => !custom || r.verification === 'user-entered')
      .filter((r) => !f || this.store.nameOf(r.outputItemId).toLowerCase().includes(f) || r.id.toLowerCase().includes(f));
  });

  private resolve(raw: string): string {
    const t = raw.trim();
    const m = this.store.items().find((i) => i.name.toLowerCase() === t.toLowerCase()) ?? this.store.items().find((i) => i.id === t);
    return m?.id ?? t;
  }

  addItem(): void {
    const id = this.itemId().trim();
    const name = this.itemName().trim();
    if (!id || !name) return void this.error.set('Item id and name are required.');
    if (this.store.catalog().items.some((i) => i.id === id)) return void this.error.set(`"${id}" already exists in the bundled catalogue.`);
    this.store.addCustomItem({ id, name, source: 'user', verification: 'user-entered' });
    this.itemId.set('');
    this.itemName.set('');
    this.error.set('');
  }

  addRecipe(): void {
    const ingredients = [];
    for (const [n, line] of this.ingText().split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const idx = line.lastIndexOf(',');
      if (idx < 0) return void this.error.set(`Ingredient line ${n + 1} must be "item, quantity".`);
      ingredients.push({ itemId: this.resolve(line.slice(0, idx)), quantity: Number(line.slice(idx + 1).trim()) });
    }
    const recipe: Recipe = {
      id: this.rid().trim(),
      outputItemId: this.resolve(this.out()),
      outputQuantity: Number(this.outQty()),
      ingredients,
      source: 'user',
      verification: 'user-entered',
    };
    const err = !recipe.id ? 'Recipe id is required' : validateRecipe(recipe);
    if (err) return void this.error.set(`Cannot add recipe: ${err}.`);
    if (this.store.catalog().recipes.some((r) => r.id === recipe.id)) return void this.error.set(`Recipe id "${recipe.id}" already exists in the bundled catalogue.`);
    if (!this.store.items().some((i) => i.id === recipe.outputItemId)) return void this.error.set('Add the output item first (above) so it can be selected in the calculator.');
    this.store.addCustomRecipe(recipe);
    this.error.set('');
    this.rid.set('');
    this.ingText.set('');
  }
}
