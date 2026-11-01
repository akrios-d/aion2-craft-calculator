import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { artworkAttributes, filterArtwork, linkArtwork, PantheonType } from '../core/pantheon';
import { ItemIcon } from '../core/item-icon';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-pantheon',
  imports: [ItemIcon, TrPipe, FormsModule, DecimalPipe],
  template: `
    <h2>{{ 'Pantheon' | tr }}</h2>
    <p class="muted">{{ 'Pantheon decor and the attributes it grants. Source: Game8; prices from the market.' | tr }}</p>

    <div class="row">
      @for (t of types; track t.id) {
        <button type="button" class="chip" [class.primary]="type() === t.id" (click)="type.set(t.id)">{{ t.label | tr }}</button>
      }
    </div>
    <div class="row">
      @for (a of attributes(); track a) {
        <button type="button" class="chip" [class.primary]="selected().includes(a)" (click)="toggle(a)">{{ a }}</button>
      }
      <select name="mode" [ngModel]="mode()" (ngModelChange)="mode.set($event)" [attr.aria-label]="'Match attributes' | tr">
        <option value="and">{{ 'All selected (AND)' | tr }}</option>
        <option value="or">{{ 'Any selected (OR)' | tr }}</option>
      </select>
      <select name="rarity" [ngModel]="rarity()" (ngModelChange)="rarity.set($event)" [attr.aria-label]="'Rarity' | tr">
        <option value="">{{ 'All rarities' | tr }}</option>
        @for (r of rarities; track r) { <option [value]="r">{{ r }}</option> }
      </select>
      <input type="search" name="q" [placeholder]="'Search item...' | tr" [ngModel]="query()" (ngModelChange)="query.set($event)" />
    </div>

    <h3>{{ 'Decor' | tr }} <small class="muted">({{ rows().length }})</small></h3>
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Rarity' | tr }}</th><th>{{ 'Effects' | tr }}</th><th>{{ 'Current price' | tr }}</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.name) {
            <tr>
              <td>@if (r.itemId) { <app-ico [id]="r.itemId" /> }{{ r.name }}</td>
              <td>{{ r.rarity }}</td>
              <td>@for (e of r.effects; track e.attribute) { <span class="chip">{{ e.attribute }} +{{ e.value }}</span> }</td>
              <td>
                @if (price(r.itemId); as p) { <strong>{{ p | number: '1.0-0' }}</strong> }
                @else if (r.itemId) { <small class="muted">{{ 'Not listed' | tr }}</small> }
                @else { <small class="muted">–</small> }
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="muted">{{ 'No artwork matches.' | tr }}</p> }
  `,
})
export class PantheonPage {
  protected readonly store = inject(AppStore);
  readonly selected = signal<string[]>([]);
  readonly rarity = signal('');
  readonly mode = signal<'and' | 'or'>('and');
  readonly type = signal<PantheonType | ''>('');
  readonly types: { id: PantheonType | ''; label: string }[] = [
    { id: '', label: 'All' },
    { id: 'artwork', label: 'Artwork' },
    { id: 'statue', label: 'Statues' },
    { id: 'colossus', label: 'Colossi' },
  ];
  readonly query = signal('');
  readonly rarities = ['Heroic', 'Unique', 'Epic', 'Rare', 'Common'];

  private readonly linked = computed(() => linkArtwork(this.store.artwork(), this.store.items()));
  readonly attributes = computed(() => artworkAttributes(this.linked()));
  readonly rows = computed(() => {
    const price = (id?: string) => (id ? (this.store.serverPrices()[id]?.sellListingPrice ?? Infinity) : Infinity);
    return filterArtwork(this.linked(), this.selected(), this.rarity(), this.query(), this.type(), this.mode()).sort(
      (a, b) => price(a.itemId) - price(b.itemId) || a.name.localeCompare(b.name),
    );
  });

  toggle(a: string): void {
    this.selected.update((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  }

  price(id?: string): number | undefined {
    return id ? this.store.serverPrices()[id]?.sellListingPrice : undefined;
  }
}
