import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { addToBuild, artworkAttributes, artworkOrigins, ArtworkRow, buildKey, buildTotals, filterArtwork, linkArtwork, PANTHEON_SLOTS, PantheonType } from '../core/pantheon';
import { formatMinutes, minRespawn, spawnsOf } from '../core/pantheon-bosses';
import { Faction, factionsOf } from '../core/pantheon-factions';
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
    .th { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; }
    .th:hover { color: #fff; }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: .5rem; }
    .slot { border: 1px dashed var(--line); border-radius: var(--radius); padding: .4rem .5rem; min-height: 3rem; display: flex; align-items: center; gap: .4rem; font-size: .85rem; }
    .slot.full { border-style: solid; background: #ffffff0a; }
    .slot .ico { width: 28px; height: 28px; margin: 0; }
    .slot .x { margin-left: auto; }
    .tot { display: flex; gap: .4rem; flex-wrap: wrap; margin: .5rem 0; }
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
      <div class="group">
        <span class="label">{{ 'Faction' | tr }}</span>
        @for (f of factionOpts; track f.id) {
          <button type="button" class="tog" [class.on]="faction() === f.id" (click)="faction.set(f.id)">{{ f.label | tr }}</button>
        }
      </div>
      <div class="group tools">
        <span class="label">{{ 'Rarity' | tr }}</span>
        <select name="rarity" [ngModel]="rarity()" (ngModelChange)="rarity.set($event)" [attr.aria-label]="'Rarity' | tr">
          <option value="">{{ 'All rarities' | tr }}</option>
          @for (r of rarities; track r) { <option [value]="r">{{ r }}</option> }
        </select>
        <select name="sort" [ngModel]="sort()" (ngModelChange)="sort.set($event)" [attr.aria-label]="'Sort by' | tr">
          <option value="price">{{ 'Sort: price' | tr }}</option>
          <option value="name">{{ 'Sort: name' | tr }}</option>
          <option value="rarity">{{ 'Sort: rarity' | tr }}</option>
          <option value="effects">{{ 'Sort: total effect' | tr }}</option>
          <option value="respawn">{{ 'Sort: respawn' | tr }}</option>
        </select>
        <button type="button" class="mini" (click)="desc.set(!desc())">{{ desc() ? '↓' : '↑' }}</button>
        <input type="search" name="q" [placeholder]="'Search item...' | tr" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </div>
    </div>

    <h3>{{ 'My Pantheon' | tr }} <button type="button" class="mini" (click)="build.set([])">{{ 'Clear' | tr }}</button></h3>
    @for (g of groups; track g.type) {
      <p class="muted">{{ g.label | tr }} ({{ buildOf(g.type).length }}/{{ slots[g.type] }})</p>
      <div class="slots">
        @for (n of g.range; track n) {
          @let e = buildOf(g.type)[n];
          <div class="slot" [class.full]="e">
            @if (e) {
              @if (iconOf(e); as s) { <img class="ico" [src]="s" alt="" referrerpolicy="no-referrer" /> }
              <span>{{ e.name }}</span>
              <button type="button" class="mini x" (click)="remove(e)">✕</button>
            } @else { <span class="muted">{{ 'Empty' | tr }}</span> }
          </div>
        }
      </div>
    }
    <div class="tot">@for (t of totals(); track t.attribute) { <span class="fx">{{ t.attribute }} +{{ t.value }}</span> }</div>

    <h3>{{ 'Decor' | tr }} <small class="muted">({{ rows().length }})</small></h3>
    @if (rows().length) {
      <table>
        <thead><tr><th><button type="button" class="th" (click)="setSort('name')">{{ 'Item' | tr }}{{ arrow('name') }}</button></th><th><button type="button" class="th" (click)="setSort('rarity')">{{ 'Rarity' | tr }}{{ arrow('rarity') }}</button></th><th><button type="button" class="th" (click)="setSort('effects')">{{ 'Effects' | tr }}{{ arrow('effects') }}</button></th><th>{{ 'Source' | tr }}</th><th>{{ 'Faction' | tr }}</th><th><button type="button" class="th" (click)="setSort('respawn')">{{ 'Respawn' | tr }}{{ arrow('respawn') }}</button></th><th><button type="button" class="th" (click)="setSort('price')">{{ 'Current price' | tr }}{{ arrow('price') }}</button></th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r.type + r.name) {
            <tr>
              <td><span class="name">@if (iconOf(r); as s) { <img class="ico" [src]="s" alt="" width="36" height="36" loading="lazy" referrerpolicy="no-referrer" /> }{{ r.name }}</span></td>
              <td><span class="rar" [class]="'rar r-' + r.rarity">{{ r.rarity }}</span></td>
              <td>@for (e of r.effects; track e.attribute) { <span class="fx">{{ e.attribute }} +{{ e.value }}</span> }</td>
              <td>@for (o of r.origins ?? ['Unknown']; track o) { <span class="src">{{ o | tr }}</span> }</td>
              <td>
                @for (f of factionsOf(r.name); track f) { <span class="fx">{{ f | tr }}</span> }
                @empty { <small class="muted">{{ 'Any' | tr }}</small> }
              </td>
              <td>
                @for (s of spawnsOf(r.name); track s.map) {
                  <span class="src">{{ s.schedule ?? fmt(s.minutes ?? 0) }} · {{ s.map }}</span>
                } @empty { <small class="muted">–</small> }
              </td>
              <td>
                @if (price(r.itemId); as p) { <span class="price">{{ p | number: '1.0-0' }}</span> }
                @else if (r.itemId) { <small class="muted">{{ 'Not listed' | tr }}</small> }
                @else { <small class="muted">–</small> }
              </td>
              <td><button type="button" class="mini" [disabled]="inBuild(r) || full(r)" (click)="add(r)">{{ inBuild(r) ? ('In build' | tr) : ('Add to build' | tr) }}</button></td>
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
  readonly faction = signal<'' | Faction>('');
  readonly factionOpts: { id: '' | Faction; label: string }[] = [
    { id: '', label: 'All' },
    { id: 'Asmodian', label: 'Asmodian' },
    { id: 'Elyos', label: 'Elyos' },
  ];
  readonly factionsOf = factionsOf;
  readonly spawnsOf = spawnsOf;
  readonly fmt = formatMinutes;
  readonly sort = signal<'price' | 'name' | 'rarity' | 'effects' | 'respawn'>('price');
  readonly desc = signal(false);
  readonly slots = PANTHEON_SLOTS;
  readonly groups = [
    { type: 'colossus' as PantheonType, label: 'Colossi', range: [0] },
    { type: 'statue' as PantheonType, label: 'Statues', range: [0, 1, 2, 3] },
    { type: 'artwork' as PantheonType, label: 'Artwork', range: Array.from({ length: 12 }, (_, i) => i) },
  ];
  private static readonly KEY = 'aion2-craft-lab.pantheonBuild';
  readonly build = signal<string[]>(PantheonPage.load());
  private static load(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(PantheonPage.KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  private readonly persist = effect(() => {
    try {
      localStorage.setItem(PantheonPage.KEY, JSON.stringify(this.build()));
    } catch {
      /* storage unavailable */
    }
  });
  readonly rarities = ['Heroic', 'Unique', 'Epic', 'Rare', 'Common'];

  private readonly linked = computed(() => linkArtwork(this.store.artwork(), this.store.items()));
  readonly origins = computed(() => artworkOrigins(this.linked()));
  readonly attributes = computed(() => artworkAttributes(this.linked()));
  readonly rows = computed(() => {
    const price = (id?: string) => (id ? this.store.serverPrices()[id]?.sellListingPrice : undefined);
    const rank = (r: string) => this.rarities.indexOf(r);
    const total = (r: ArtworkRow) => r.effects.reduce((s, e) => s + e.value, 0);
    const dir = this.desc() ? -1 : 1;
    const sort = this.sort();
    return filterArtwork(this.linked(), this.selected(), this.rarity(), this.query(), this.type(), this.mode(), this.origin())
      .filter((r) => {
        const f = this.faction();
        const fs = factionsOf(r.name);
        return !f || !fs.length || fs.includes(f);
      })
      .sort((a, b) => {
      if (sort === 'price' || sort === 'respawn') {
        const pa = sort === 'price' ? price(a.itemId) : minRespawn(a.name);
        const pb = sort === 'price' ? price(b.itemId) : minRespawn(b.name);
        if (pa === undefined || pb === undefined) return (pa === undefined ? 1 : 0) - (pb === undefined ? 1 : 0) || a.name.localeCompare(b.name);
        return (pa - pb) * dir || a.name.localeCompare(b.name);
      }
      const d = sort === 'rarity' ? rank(a.rarity) - rank(b.rarity) : sort === 'effects' ? total(a) - total(b) : a.name.localeCompare(b.name);
      return d * dir || a.name.localeCompare(b.name);
    });
  });

  private readonly buildEntries = computed(() => {
    const keys = new Set(this.build());
    return this.linked().filter((r) => keys.has(buildKey(r)));
  });
  readonly totals = computed(() => buildTotals(this.buildEntries()));
  buildOf(t: PantheonType): ArtworkRow[] {
    return this.buildEntries().filter((r) => r.type === t);
  }
  inBuild(r: ArtworkRow): boolean {
    return this.build().includes(buildKey(r));
  }
  full(r: ArtworkRow): boolean {
    return this.buildOf(r.type).length >= PANTHEON_SLOTS[r.type];
  }
  add(r: ArtworkRow): void {
    this.build.update((b) => addToBuild(b, r));
  }
  remove(r: ArtworkRow): void {
    this.build.update((b) => b.filter((k) => k !== buildKey(r)));
  }

  setSort(k: 'price' | 'name' | 'rarity' | 'effects' | 'respawn'): void {
    if (this.sort() === k) this.desc.update((d) => !d);
    else {
      this.sort.set(k);
      this.desc.set(false);
    }
  }
  arrow(k: string): string {
    return this.sort() === k ? (this.desc() ? ' ↓' : ' ↑') : '';
  }

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
