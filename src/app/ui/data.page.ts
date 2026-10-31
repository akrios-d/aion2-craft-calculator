import { Component, inject } from '@angular/core';
import { AppStore } from '../core/app-store';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-data',
  imports: [TrPipe],
  template: `
    <h2>{{ 'Data, backup & coverage' | tr }}</h2>

    <h3>{{ 'Static recipe dataset' | tr }}</h3>
    @if (store.catalogError()) { <p class="msg error">{{ store.catalogError() | tr }}</p> }
    @let m = store.catalog().manifest;
    <table class="kv">
      <tr><td>{{ 'Data version' | tr }}</td><td>{{ m.dataVersion }}</td></tr>
      <tr><td>{{ 'Items / recipes / professions' | tr }}</td><td>{{ store.catalog().items.length }} / {{ store.catalog().recipes.length }} / {{ store.catalog().professions.length }}</td></tr>
      <tr><td>{{ 'Your own items / recipes' | tr }}</td><td>{{ store.data().customItems.length }} / {{ store.data().customRecipes.length }}</td></tr>
    </table>

    @if (store.reconcileReport(); as rep) {
      @if (rep.remapped.length || rep.unresolved.length) {
        <h3>{{ 'Dataset update report' | tr }}</h3>
        @if (rep.remapped.length) {
          <p>{{ '{n} record(s) moved to new item ids:' | tr: { n: rep.remapped.length } }}</p>
          <ul>@for (r of rep.remapped; track $index) { <li>{{ r.kind }}: {{ r.fromId }} → {{ r.toId }}</li> }</ul>
        }
        @if (rep.unresolved.length) {
          <p class="msg warn">{{ '{n} record(s) could not be matched to a known item. They were kept untouched:' | tr: { n: rep.unresolved.length } }}</p>
          <ul>@for (u of rep.unresolved.slice(0, 100); track $index) { <li>{{ u.kind }}: <code>{{ u.itemId }}</code> — {{ u.reason | tr }}</li> }</ul>
        }
      }
    }

  `,
})
export class DataPage {
  protected readonly store = inject(AppStore);


}
