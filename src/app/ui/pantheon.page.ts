import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { artworkAttributes, artworkOrigins, ArtworkRow, filterArtwork, linkArtwork, PantheonType } from '../core/pantheon';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-pantheon',
  imports: [TrPipe, FormsModule, DecimalPipe],
  styles: `
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: .75rem 1rem; display: grid; gap: .6rem; margin: .75rem 0 1rem; }
    .group { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .group > .label { min-width: 5.5rem; color: var(--muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
    .tog { padding: .2rem .75rem; border-radius: 999px; background: transparent; border: 1px solid var(--line); color: var(--fg); font-size: .85rem; cursor: pointer; }
    .tog:hover { border-color: var(--gold); }
    .tog.on { background: linear-gradient(180deg, #ebb719, #ac770c); color: var(--gold-ink); border-color: var(--gold); font-weight: 700; }
    .tools { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    .ico { width: 36px; height: 36px; border-radius: 4px; vertical-align: middle; margin-right: .6rem; background: #0006; }
    .name { display: flex; align-items: center; font-weight: 600; }
    .rar { display: inline-block; padding: 0 .5rem; border-radius: 3px; font-size: .78rem; border: 1px solid currentColor; }
    .r-Heroic { color: #ff9d3c; } .r-Unique { color: #ffc94d; } .r-Epic { color: #b784ff; } .r-Rare { color: #5cb3ff; } .r-Common { color: #aebac8; }
    .fx { display: inline-block; margin: .1rem .25rem .1rem 0; padding: .05rem .5rem; border-radius: 999px; background: #ffffff12; font-size: .8rem; white-space: nowrap; }
    .src { display: block; font-size: .78rem; color: var(--muted); }
    .price { font-weight: 700; white-space: nowrap; }
    td { vertical-align: middle; }
  `,
  template: `
    <h2>{{ 'Pantheon' | tr }}</h2>
    <p class="muted">{{ 'Pantheon decor and the attributes it grants. Source: Game8; prices from the market.' | tr }}</p>

    <div class="panel">
      <div class="group">
        <span class="label">{{ 'Type' | tr }}</span>
        @for (t of types; track t.id) {
          <button type="button" class="tog" [class.on]="type() === t.id" (click)="type.set(t.id)">{{ t.label | tr }}</button>
        }
      </div>
      <div class="group">
        <span class="label">{{ 'Attributes' | tr }}</span>
        @for (a of attributes(); track a) {
          <button type="button" class="tog" [class.on]="selected().includes(a)" (click)="toggle(a)">{{ a }}</button>
        }
        <select name="mode" [ngModel]="mode()" (ngModelChange)="mode.set($event)" [attr.aria-label]="'Match attributes' | tr">
          <option value="and">{{ 'All selected (AND)' | tr }}</option>
          <option value="or">{{ 'Any selected (OR)' | tr }}</option>
        </select>
        @if (selected().length) { <button type="button" class="mini" (click)="selected.set([])">{{ 'Clear' | tr }}</button> }
      </div>
      <div class="group">
        <span class="label">{{ 'Source' | tr }}</span>
        <button type="button" class="tog" [class.on]="origin() === ''" (click)="origin.set('')">{{ 'All' | tr }}</button>
        @for (o of origins(); track o) {
          <button type="button" class="tog" [class.on]="origin() === o" (click)="origin.set(o)">{{ o | tr }}</button>
        }
      </div>
      <div class="group tools">
        <span class="label">{{ 'Rarity' | tr }}</span>
        <select name="rarity" [ngModel]="rarity()" (ngModelChange)="rarity.set($event)" [attr.aria-label]="'Rarity' | tr">
          <option value="">{{ 'All rarities' | tr }}</option>
          @for (r of rarities; track r) { <option [value]="r">{{ r }}</option> }
        </select>
        <input type="search" name="q" [placeholder]="'Search item...' | tr" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </div>
    </div>

    <h3>{{ 'Decor' | tr }} <small class="muted">({{ rows().length }})</small></h3>
    @if (rows().length) {
      <table>
        <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Rarity' | tr }}</th><th>{{ 'Effects' | tr }}</th><th>{{ 'Source' | tr }}</th><th>{{ 'Current price' | tr }}</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.type + r.name) {
            <tr>
              <td><span class="name">@if (iconOf(r); as s) { <img class="ico" [src]="s" alt="" width="36" height="36" loading="lazy" referrerpolicy="no-referrer" /> }{{ r.name }}</span></td>
              <td><span class="rar" [class]="'rar r-' + r.rarity">{{ r.rarity }}</span></td>
              <td>@for (e of r.effects; track e.attribute) { <span class="fx">{{ e.attribute }} +{{ e.value }}</span> }</td>
              <td>@for (o of r.origins ?? ['Unknown']; track o) { <span class="src">{{ o | tr }}</span> }</td>
              <td>
                @if (price(r.itemId); as p) { <span class="price">{{ p | number: '1.0-0' }}</span> }
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
  readonly origin = signal('');
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
  readonly origins = computed(() => artworkOrigins(this.linked()));
  readonly attributes = computed(() => artworkAttributes(this.linked()));
  readonly rows = computed(() => {
    const price = (id?: string) => (id ? (this.store.serverPrices()[id]?.sellListingPrice ?? Infinity) : Infinity);
    return filterArtwork(this.linked(), this.selected(), this.rarity(), this.query(), this.type(), this.mode(), this.origin()).sort(
      (a, b) => price(a.itemId) - price(b.itemId) || a.name.localeCompare(b.name),
    );
  });

  toggle(a: string): void {
    this.selected.update((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  }

  price(id?: string): number | undefined {
    return id ? this.store.serverPrices()[id]?.sellListingPrice : undefined;
  }

  /** Market icon when the item is known there, otherwise the icon from the imported Game8 data. */
  iconOf(r: ArtworkRow): string | undefined {
    return (r.itemId ? this.store.iconOf(r.itemId) : undefined) ?? r.icon;
  }
}
