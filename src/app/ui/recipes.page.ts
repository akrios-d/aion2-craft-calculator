import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemIcon } from '../core/item-icon';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-recipes',
  imports: [ItemIcon, TrPipe, FormsModule],
  template: `
    <h2>{{ 'Recipes & items' | tr }}</h2>
    <p class="muted">
      {{ 'Bundled dataset: {recipes} recipes / {items} items.' | tr: { recipes: store.catalog().recipes.length, items: store.catalog().items.length } }}
    </p>

    <h3>{{ 'All recipes' | tr }} <small class="muted">({{ rows().length }})</small></h3>
    <input [placeholder]="'Filter…' | tr" [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Output' | tr }}</th><th>{{ 'Ingredients' | tr }}</th></tr></thead>
        <tbody>
          @for (r of rows().slice(0, 300); track r.id) {
            <tr>
              <td><app-ico [id]="r.outputItemId" />{{ r.outputQuantity }}× {{ store.nameOf(r.outputItemId) }}</td>
              <td>@for (g of r.ingredients; track $index) { <span class="chip"><app-ico [id]="g.itemId" />{{ g.quantity }}× {{ store.nameOf(g.itemId) }}</span> }</td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No recipes.' | tr }}</p> }
  `,
})
export class RecipesPage {
  protected readonly store = inject(AppStore);
  readonly filter = signal('');

  readonly rows = computed(() => {
    const f = this.filter().trim().toLowerCase();
    return this.store
      .recipes()
      .filter((r) => !f || this.store.nameOf(r.outputItemId).toLowerCase().includes(f) || r.id.toLowerCase().includes(f));
  });
}
