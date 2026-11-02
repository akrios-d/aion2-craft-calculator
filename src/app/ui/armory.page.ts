import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { applyInventoryImport } from '../core/io/imports';
import { ArmorySnapshot, planEquipmentInventory, SearchCandidate, armoryLinks, buildSnapshot, parseArmoryJson, pickCandidate } from '../core/armory';
import { BisEntry, BisList, BisImportResult, BIS_SLOTS, compareBis, starterBisList, parseBisCsv, parseBisJson } from '../core/bis';
import { parseCsv } from '../core/io/csv';
import { CLASSES, DEFAULT_BANDS, EMPTY_TEMPLATE, EXAMPLE_JSON, PieceScore, SHARE_SLOTS, ShareImportResult, ShareTable, observedMaxRolls, overallScore, parseShareCsv, parseShareJson, scorePiece, shareSlotOf } from '../core/share-score';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-armory',
  imports: [TrPipe, FormsModule, DatePipe, DecimalPipe],
  styles: `
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: .75rem 1rem; display: grid; gap: .6rem; margin: .75rem 0 1rem; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    textarea { width: 100%; min-height: 6rem; font-family: monospace; font-size: .8rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: .5rem; }
    .gear { border: 1px solid var(--line); border-radius: var(--radius); padding: .45rem .6rem; background: #ffffff08; display: grid; gap: .1rem; border-left-width: 4px; }
    .gear.empty { border-style: dashed; opacity: .6; }
    .gear small { color: var(--muted); }
    .gear b { font-size: .9rem; }
    .g-Legend { border-left-color: #ff9d3c; } .g-Unique { border-left-color: #ffc94d; } .g-Epic { border-left-color: #b784ff; } .g-Rare { border-left-color: #5cb3ff; } .g-Common { border-left-color: #aebac8; }
    .ico { width: 32px; height: 32px; border-radius: 4px; background: #0006; float: right; }
    .st-match { color: var(--ok); } .st-mismatch { color: var(--warn); } .st-missing { color: var(--err); }
    .ok { color: var(--ok); } .err { color: var(--err); } .warn { color: var(--warn); }
    .bar { height: .5rem; background: #ffffff18; border-radius: 4px; overflow: hidden; } .bar > i { display: block; height: 100%; background: var(--ok); }
    .tog { padding: .2rem .75rem; border-radius: 999px; background: transparent; border: 1px solid var(--line); color: var(--fg); cursor: pointer; }
    .tog.on { background: linear-gradient(180deg, #ebb719, #ac770c); color: var(--gold-ink); border-color: var(--gold); font-weight: 700; }
    td { vertical-align: middle; }
    .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: .4rem; } .cmp.one { grid-template-columns: 1fr; }
    .ideal { border-left-color: var(--gold); }
    .lt { font-weight: 800; padding: 0 .4rem; border-radius: 4px; border: 1px solid currentColor; width: fit-content; }
    .lt-S { color: #ffc94d; } .lt-A { color: #5cd68a; } .lt-B { color: #5cb3ff; } .lt-C { color: #e0a43a; } .lt-D { color: #e05c5c; }
    .ovl { font-size: 1.1rem; }
  `,
  template: `
    <h2>{{ 'Armory and BiS' | tr }}</h2>
    <p class="muted"><small>{{ 'UX inspired by kisk.app (no kisk data used).' | tr }} <a href="https://kisk.app" target="_blank" rel="noopener noreferrer">kisk.app</a></small></p>

    <section class="panel">
      <h3>{{ 'Character lookup' | tr }}</h3>
      <div class="row">
        <select [ngModel]="region()" (ngModelChange)="region.set($event)">
          <option value="la">LA</option><option value="eu">EU</option><option value="na">NA</option><option value="asia">ASIA</option>
        </select>
        <input [ngModel]="server()" (ngModelChange)="server.set($event)" [placeholder]="'Server' | tr" size="12" />
        <input [ngModel]="keyword()" (ngModelChange)="keyword.set($event)" (keydown.enter)="lookup()" [placeholder]="'Character name' | tr" />
        <button (click)="lookup()" [disabled]="loading() || keyword().trim().length < 2">{{ loading() ? ('Looking up…' | tr) : ('Look up' | tr) }}</button>
      </div>
      @if (lookupError()) { <p class="err">{{ lookupError() | tr }}</p> }
      @if (candidates().length) {
        <table>
          <thead><tr><th>{{ 'Name' | tr }}</th><th>{{ 'Server' | tr }}</th><th>{{ 'Level' | tr }}</th><th></th></tr></thead>
          <tbody>
            @for (c of candidates(); track c.characterId) {
              <tr>
                <td>{{ c.name }}</td><td>{{ c.serverName }}</td><td>{{ c.level }}</td>
                <td>
                  <button (click)="load(c)" [disabled]="loading()">{{ 'Load' | tr }}</button>
                  <a class="chip" [href]="links(c).info" target="_blank" rel="noopener noreferrer">info</a>
                  <a class="chip" [href]="links(c).equipment" target="_blank" rel="noopener noreferrer">equipment</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    @if (store.data().armoryCache.length) {
      <section class="row">
        @for (s of store.data().armoryCache; track s.key) {
          <span class="row">
            <button class="tog" [class.on]="s.key === selectedKey()" (click)="selectedKey.set(s.key)">{{ s.profile.name }}@if (s.profile.serverName) { ({{ s.profile.serverName }}) }</button>
            <button class="mini" (click)="store.removeSnapshot(s.key)" [attr.aria-label]="'Remove' | tr">✕</button>
          </span>
        }
      </section>
    }

    @if (snap(); as s) {
      <section class="panel">
        <h3>{{ s.profile.name }}
          <small class="muted">{{ s.profile.className }} @if (s.profile.level) { · Lv {{ s.profile.level }} } @if (s.profile.combatPower) { · CP {{ s.profile.combatPower }} } @if (s.profile.serverName) { · {{ s.profile.serverName }} } @if (s.profile.raceName) { · {{ s.profile.raceName }} }</small>
        </h3>
        <small class="muted">{{ 'Fetched on' | tr }} {{ s.fetchedAt | date: 'short' }}</small>
        @if (table(); as tb) {
          @if (overall(); as o) { <p class="ovl">{{ 'Overall gear grade' | tr }}: <b class="lt lt-{{ o.letter.charAt(0) }}">{{ o.letter }}</b> <small class="muted">({{ o.percent | number: '1.0-1' }}%, {{ o.pieces }} {{ 'Items' | tr }})</small></p> }
          <p class="muted"><small>{{ 'Share-based score following the method publicly described at kisk.app/scoring, computed from the table you imported. The app ships no share data.' | tr }}</small></p>
        } @else {
          <p class="warn">{{ 'No share table imported for this class: items are shown unscored. Import one below (Score tables).' | tr }}</p>
        }
        @for (grp of groups(); track grp.title) {
          <h4>{{ grp.title | tr }}</h4>
          @if (!grp.views.length && grp.title === 'Arcana') { <p class="muted">{{ 'No arcana returned by the armory.' | tr }}</p> }
          @for (v of grp.views; track v.item.slot) {
            <div class="cmp" [class.one]="!v.ideal.length">
              <div class="gear g-{{ v.item.grade }}">
                @if (isUrl(v.item.icon)) { <img class="ico" [src]="v.item.icon" referrerpolicy="no-referrer" alt="" loading="lazy" /> }
                <small>{{ v.item.slotName }} · {{ 'Equipped' | tr }}</small>
                <b>{{ v.item.name }}</b>
                <small>{{ v.item.grade }}@if (v.item.enchant) { · +{{ v.item.enchant }} }@if (v.item.exceed) { · ★{{ v.item.exceed }} }</small>
                @for (st of v.item.stats ?? []; track st.name) { <small>{{ st.name }} {{ st.value }}@if (shareOf(v, st.name) !== null) { · {{ shareOf(v, st.name) }}% }</small> }
                @if (v.ps; as ps) { <span class="lt lt-{{ ps.letter.charAt(0) }}">{{ ps.letter }} <small>{{ ps.percent | number: '1.0-1' }}%@if (ps.approximate) { ≈ }</small></span> }
              </div>
              @if (v.ideal.length) {
                <div class="gear ideal">
                  <small>{{ 'Ideal' | tr }} {{ cls() }} {{ v.item.slotName }} · <b>{{ 'Best in slot' | tr }}</b></small>
                  @for (l of v.ideal; track l.stat) {
                    <small>@if (v.item.stats) { <span [class]="have(v, l.stat) ? 'ok' : 'err'">{{ have(v, l.stat) ? '✓' : '✗' }}</span> } {{ l.stat }} · {{ l.share }}%@if (l.maxRoll) { · max {{ l.maxRoll }} }</small>
                  }
                </div>
              }
            </div>
          }
        }
        @if (table() && !anyStats()) { <p class="muted"><small>{{ 'The armory data has no per-line stats, so lines count as 0 until the armory provides them.' | tr }}</small></p> }
        <h4>{{ 'Add equipped items to inventory' | tr }}</h4>
        <p class="muted"><small>{{ 'Only the equipped gear is added (quantity 1 per piece), matched by exact name to the recipe catalogue; unmatched pieces are listed below, never dropped. The armory does not expose materials or warehouse contents, so those are not imported.' | tr }}</small></p>
        <div class="row">
          <button (click)="invMode.set('merge')">{{ 'Preview merge' | tr }}</button>
          <button (click)="invMode.set('replace')">{{ 'Preview replace' | tr }}</button>
        </div>
        @if (invPreview(); as ip) {
          <table>
            <thead><tr><th>{{ 'Item' | tr }}</th><th>{{ 'Before' | tr }}</th><th>{{ 'After' | tr }}</th><th></th></tr></thead>
            <tbody>@for (c of ip.res.changes; track $index) { <tr><td>{{ c.label }}</td><td>{{ c.before ?? '' }}</td><td>{{ c.after ?? '' }}</td><td>{{ c.kind }}</td></tr> }</tbody>
          </table>
          @for (u of ip.plan.unresolved; track $index) { <p class="warn">{{ u.slotName }}: {{ u.name }} - {{ u.reason | tr }}</p> }
          @if (invMode() === 'replace') { <p class="warn">{{ 'Replace removes every inventory item not equipped by this character.' | tr }}</p> }
          <div class="row"><button (click)="applyInv()" [disabled]="!ip.plan.records.length">{{ 'Apply to inventory' | tr }}</button><button (click)="invMode.set(null)">{{ 'Cancel' | tr }}</button></div>
        }
      </section>
    }

    <section class="panel">
      <h3>{{ 'Best in Slot (BiS)' | tr }}</h3>
      <p class="muted">{{ 'No BiS data is shipped: there is no verified source. Define lists yourself or import JSON/CSV (columns: class, slot, item, id, notes).' | tr }}</p>
      <div class="row">
        <label>{{ 'Class' | tr }}
          <input list="classes" [ngModel]="className()" (ngModelChange)="className.set($event)" />
          <datalist id="classes">@for (l of store.data().bisLists; track l.className) { <option [value]="l.className"></option> }</datalist>
        </label>
        @if (list()) { <button class="mini" (click)="store.removeBisList(list()!.className)">{{ 'Delete list' | tr }}</button> }
        <button (click)="exportBis()" [disabled]="!store.data().bisLists.length">{{ 'Export BiS JSON' | tr }}</button>
      </div>

      <div class="row">
        <select [ngModel]="slot()" (ngModelChange)="slot.set($event)">@for (x of slots; track x) { <option [value]="x">{{ x }}</option> }</select>
        <input [ngModel]="itemName()" (ngModelChange)="itemName.set($event)" [placeholder]="'Item name' | tr" />
        <input [ngModel]="itemId()" (ngModelChange)="itemId.set($event)" [placeholder]="'Armory id (optional)' | tr" size="12" />
        <input [ngModel]="notes()" (ngModelChange)="notes.set($event)" [placeholder]="'Notes' | tr" />
        <button (click)="addEntry()" [disabled]="!canAdd()">{{ 'Add' | tr }}</button>
      </div>

      @if (comparison(); as c) {
        <div class="bar"><i [style.width.%]="c.total ? (100 * c.matched) / c.total : 0"></i></div>
        <b>{{ c.matched }} / {{ c.total }} {{ 'BiS pieces equipped' | tr }}</b>
        <table>
          <thead><tr><th>{{ 'Slot' | tr }}</th><th>BiS</th><th>{{ 'Equipped' | tr }}</th><th>{{ 'Status' | tr }}</th><th></th></tr></thead>
          <tbody>
            @for (r of c.rows; track r.entry.slot) {
              <tr>
                <td>{{ r.entry.slot }}</td>
                <td>@if (r.entry.itemName) { {{ r.entry.itemName }}@if (r.entry.notes) { <small class="muted"> · {{ r.entry.notes }}</small> } } @else { <input [placeholder]="'Item name' | tr" (change)="setItem(r.entry, $any($event.target).value)" /> }</td>
                <td>{{ r.equipped?.name ?? '—' }}</td>
                <td class="st-{{ r.status }}">{{ statusLabel(r.status) | tr }}</td>
                <td><button class="mini" (click)="removeEntry(r.entry)">✕</button></td>
              </tr>
            }
          </tbody>
        </table>        @if (craftable().length) {
          <div class="row">
            <span>{{ 'Missing pieces with a known recipe' | tr }}: {{ craftable().length }}</span>
            <button (click)="addToPlans()">{{ 'Add to crafting plans' | tr }}</button>
          </div>
        }
      } @else if (list()) {
        <table>
          <thead><tr><th>{{ 'Slot' | tr }}</th><th>BiS</th><th></th></tr></thead>
          <tbody>
            @for (e of list()!.entries; track e.slot) {
              <tr><td>{{ e.slot }}</td><td>{{ e.itemName }}</td><td><button class="mini" (click)="removeEntry(e)">✕</button></td></tr>
            }
          </tbody>
        </table>
        <p class="muted">{{ 'Look up a character above to compare with this list.' | tr }}</p>
      } @else {
        <p class="muted">{{ 'No BiS list for this class yet.' | tr }}</p>
        <button (click)="createStarter()" [disabled]="!currentClass()">{{ 'Create starter list (all slots)' | tr }}</button>
      }

      <h4>{{ 'Import BiS' | tr }}</h4>
      <textarea [ngModel]="bisText()" (ngModelChange)="bisText.set($event)" placeholder='[{"className":"gladiator","entries":[{"slot":"MainHand","name":"..."}]}]'></textarea>
      <div class="row"><button (click)="previewBis()" [disabled]="!bisText().trim()">{{ 'Validate and preview' | tr }}</button></div>
      @if (bisPreview(); as p) {
        @for (e of p.errors; track $index) { <p class="err">{{ e }}</p> }
        @for (w of p.warnings; track $index) { <p class="warn">{{ w }}</p> }
        @for (l of p.lists; track l.className) { <p class="ok">{{ l.className }}: {{ l.entries.length }} {{ 'Items' | tr }}</p> }
        @if (p.lists.length) {
          <div class="row">
            <button (click)="applyBis('merge')">{{ 'Merge' | tr }}</button>
            <button (click)="applyBis('replace')">{{ 'Replace' | tr }}</button>
          </div>
        }
      }
    </section>

    <section class="panel">
      <h3>{{ 'Score tables' | tr }}</h3>
      <p class="muted">{{ 'Import, per class, the share of top players carrying each stat line on each slot (JSON, or CSV: class, slot, stat, share, maxRoll). Slots: weapon, guard, torso, pants, helmet, shoulders, gloves, boots, cape, necklace, earrings, rings, bracelet, arcana. The app ships no data: the empty template and the example below use fake numbers. Without maxRoll the observed maximum is used and the score is marked approximate (≈). Optional "bands" override the letter thresholds.' | tr }}</p>
      <div class="row">
        @for (t of store.data().shareTables; track t.className) {
          <span class="chip">{{ t.className }} <button class="mini" (click)="store.removeShareTable(t.className)" [attr.aria-label]="'Remove' | tr">✕</button></span>
        }
        <button (click)="shareText.set(example)">{{ 'Load fake example' | tr }}</button>
        <button (click)="shareText.set(template())">{{ 'Load empty template' | tr }}</button>
      </div>
      <textarea [ngModel]="shareText()" (ngModelChange)="shareText.set($event)"></textarea>
      <div class="row"><button (click)="previewShare()" [disabled]="!shareText().trim()">{{ 'Validate and preview' | tr }}</button></div>
      @if (sharePreview(); as p) {
        @for (e of p.errors; track $index) { <p class="err">{{ e }}</p> }
        @for (w of p.warnings; track $index) { <p class="warn">{{ w }}</p> }
        @for (x of p.tables; track x.className) { <p class="ok">{{ x.className }}: {{ lineCount(x) }} {{ 'Items' | tr }}</p> }
        @if (p.tables.length) {
          <div class="row"><button (click)="applyShare('merge')">{{ 'Merge' | tr }}</button><button (click)="applyShare('replace')">{{ 'Replace' | tr }}</button></div>
        }
      }
    </section>
  `,
})
export class ArmoryPage {
  readonly store = inject(AppStore);
  readonly slots = BIS_SLOTS;
  readonly region = signal('la');
  readonly server = signal('Zikel');
  readonly loading = signal(false);
  readonly lookupError = signal('');
  readonly keyword = signal('');
  readonly candidates = signal<SearchCandidate[]>([]);
  readonly selectedKey = signal('');
  readonly className = signal('');
  readonly slot = signal(BIS_SLOTS[0]);
  readonly itemName = signal('');
  readonly itemId = signal('');
  readonly notes = signal('');
  readonly bisText = signal('');
  readonly bisPreview = signal<BisImportResult | null>(null);

  readonly snap = computed<ArmorySnapshot | undefined>(() => {
    const cache = this.store.data().armoryCache;
    return cache.find((s) => s.key === this.selectedKey()) ?? cache[0];
  });
  readonly list = computed<BisList | undefined>(() => {
    const cls = (this.className().trim() || this.snap()?.profile.className || '').toLowerCase();
    return this.store.data().bisLists.find((l) => l.className === cls);
  });
  readonly comparison = computed(() => {
    const l = this.list();
    const s = this.snap();
    return l && s ? compareBis(l, s) : null;
  });
  readonly craftable = computed(() => {
    const c = this.comparison();
    if (!c) return [];
    const byName = new Map(this.store.craftableItems().map((i) => [i.name.toLowerCase(), i.id]));
    const byId = new Set(byName.values());
    const ids = c.missing.map((r) => (r.entry.itemId && byId.has(r.entry.itemId) ? r.entry.itemId : byName.get(r.entry.itemName.toLowerCase()))).filter((x): x is string => !!x);
    return [...new Set(ids)];
  });

  readonly example = EXAMPLE_JSON;
  readonly invMode = signal<'merge' | 'replace' | null>(null);
  readonly invPreview = computed(() => {
    const mode = this.invMode();
    const s = this.snap();
    if (!mode || !s) return null;
    const d = this.store.data();
    const plan = planEquipmentInventory(s.gear, this.store.items(), d.inventory, mode);
    return { plan, res: applyInventoryImport(d, plan.records, mode, this.store.nameOf) };
  });
  readonly shareText = signal('');
  readonly sharePreview = signal<ShareImportResult | null>(null);
  readonly cls = computed(() => (this.snap()?.profile.className ?? '').toLowerCase());
  readonly table = computed(() => this.store.data().shareTables.find((t) => t.className === this.cls()));
  private readonly observed = computed(() => observedMaxRolls(this.store.data().armoryCache.flatMap((s) => [...s.gear, ...s.arcana])));
  readonly views = computed(() => {
    const s = this.snap();
    const tb = this.table();
    return [...(s?.gear ?? []), ...(s?.arcana ?? [])].map((item) => {
      const slot = shareSlotOf(item.slotName);
      return { item, slot, ps: tb ? scorePiece(item, tb, this.observed()) : null, ideal: (slot && tb?.slots[slot]) || [] };
    });
  });
  readonly overall = computed(() => overallScore(this.views().map((v) => v.ps), this.table()?.bands));
  readonly anyStats = computed(() => this.views().some((v) => v.item.stats?.length));
  readonly groups = computed(() => {
    const v = this.views();
    return [
      { title: 'Scored slots', views: v.filter((x) => x.slot && x.slot !== 'arcana') },
      { title: 'Unscored', views: v.filter((x) => !x.slot) },
      { title: 'Arcana', views: v.filter((x) => x.slot === 'arcana') },
    ].filter((g) => g.views.length || (g.title === 'Arcana' && !!this.snap()));
  });
  applyInv(): void {
    const ip = this.invPreview();
    if (!ip) return;
    this.store.update(() => ip.res.data);
    this.invMode.set(null);
  }
  template() {
    return JSON.stringify(CLASSES.map((c) => EMPTY_TEMPLATE(c)).map(({ className }) => ({ className, bands: DEFAULT_BANDS, slots: Object.fromEntries(SHARE_SLOTS.map((s) => [s, []])) })), null, 2);
  }
  shareOf(v: { ps: PieceScore | null }, stat: string): number | null {
    return v.ps?.lines.find((l) => l.stat.toLowerCase() === stat.toLowerCase())?.share ?? null;
  }
  have(v: { ps: PieceScore | null }, stat: string): boolean {
    return !!v.ps?.lines.find((l) => l.stat === stat)?.have;
  }
  lineCount(t: ShareTable): number {
    return Object.values(t.slots).reduce((a, l) => a + (l?.length ?? 0), 0);
  }
  previewShare(): void {
    const t = this.shareText().trim();
    this.sharePreview.set(t.startsWith('[') || t.startsWith('{') ? parseShareJson(t) : parseShareCsv(t, parseCsv));
  }
  applyShare(mode: 'merge' | 'replace'): void {
    const p = this.sharePreview();
    if (!p?.tables.length) return;
    this.store.importShareTables(p.tables, mode);
    this.sharePreview.set(null);
    this.shareText.set('');
  }
  readonly craftableDummy = 0;
  links(c: SearchCandidate) {
    return armoryLinks(this.region(), c);
  }
  isUrl(s?: string) {
    return !!s && /^https:\/\//i.test(s);
  }
  statusLabel(s: string) {
    return s === 'match' ? 'Equipped' : s === 'mismatch' ? 'Different item' : s === 'unset' ? 'Not set' : 'Empty slot';
  }

  async lookup(): Promise<void> {
    const name = this.keyword().trim();
    this.lookupError.set('');
    this.candidates.set([]);
    this.loading.set(true);
    try {
      const res = await fetch(`/api/armory?region=${this.region()}&keyword=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many lookups, wait a minute.' : 'Armory lookup failed. Try again later.');
      const r = parseArmoryJson(await res.text());
      const list = r.candidates ?? [];
      const hit = pickCandidate(list, name, this.server());
      if (hit) await this.load(hit);
      else if (list.length) this.candidates.set(list);
      else this.lookupError.set('No character found. Check the region, server and name.');
    } catch (e) {
      this.lookupError.set(e instanceof Error && !(e instanceof TypeError) ? e.message : 'Armory lookup unavailable (the serverless function does not run under plain ng serve).');
    } finally {
      this.loading.set(false);
    }
  }
  async load(c: SearchCandidate): Promise<void> {
    this.loading.set(true);
    this.lookupError.set('');
    try {
      const res = await fetch(`/api/armory?region=${this.region()}&characterId=${encodeURIComponent(c.characterId)}&serverId=${c.serverId}`);
      if (!res.ok) throw new Error('Armory lookup failed. Try again later.');
      const r = parseArmoryJson(await res.text());
      if (r.error || !r.items) throw new Error(r.error ?? 'The armory returned no equipment.');
      const snap = buildSnapshot(r.profile, r.items);
      this.store.saveSnapshot(snap);
      this.store.selectOrCreateCharacter(snap.profile.name);
      this.selectedKey.set(snap.key);
      this.candidates.set([]);
    } catch (e) {
      this.lookupError.set(e instanceof Error && !(e instanceof TypeError) ? e.message : 'Armory lookup unavailable.');
    } finally {
      this.loading.set(false);
    }
  }
  createStarter(): void {
    const cls = this.currentClass();
    if (!cls) return;
    this.store.saveBisList(starterBisList(cls));
    this.className.set(cls);
  }
  setItem(e: BisEntry, name: string): void {
    const l = this.list();
    if (!l) return;
    this.store.saveBisList({ ...l, entries: l.entries.map((x) => (x.slot === e.slot ? { ...x, itemName: name.trim() } : x)), updatedAt: new Date().toISOString() });
  }

  canAdd(): boolean {
    return !!this.itemName().trim() && !!(this.className().trim() || this.snap()?.profile.className);
  }
  currentClass(): string {
    return (this.className().trim() || this.snap()?.profile.className || '').toLowerCase();
  }
  addEntry(): void {
    const cls = this.currentClass();
    const cur = this.store.data().bisLists.find((l) => l.className === cls);
    const id = Number(this.itemId());
    const entry: BisEntry = { slot: this.slot(), itemName: this.itemName().trim() };
    if (Number.isFinite(id) && id > 0) entry.armoryId = id;
    if (this.notes().trim()) entry.notes = this.notes().trim();
    const entries = [...(cur?.entries ?? []).filter((e) => e.slot.toLowerCase() !== entry.slot.toLowerCase()), entry];
    this.store.saveBisList({ className: cls, entries, updatedAt: new Date().toISOString() });
    this.className.set(cls);
    this.itemName.set('');
    this.itemId.set('');
    this.notes.set('');
  }
  removeEntry(e: BisEntry): void {
    const l = this.list();
    if (!l) return;
    const entries = l.entries.filter((x) => x.slot !== e.slot);
    if (entries.length) this.store.saveBisList({ ...l, entries, updatedAt: new Date().toISOString() });
    else this.store.removeBisList(l.className);
  }
  previewBis(): void {
    const t = this.bisText().trim();
    this.bisPreview.set(t.startsWith('[') || t.startsWith('{') ? parseBisJson(t) : parseBisCsv(t));
  }
  applyBis(mode: 'merge' | 'replace'): void {
    const p = this.bisPreview();
    if (!p?.lists.length) return;
    this.store.importBis(p.lists, mode);
    this.bisPreview.set(null);
    this.bisText.set('');
  }
  exportBis(): void {
    const blob = new Blob([JSON.stringify(this.store.data().bisLists, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aion2-bis-lists.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  addToPlans(): void {
    const existing = new Set(this.store.characterPlans().map((p) => p.targetItemId));
    for (const id of this.craftable()) {
      if (existing.has(id)) continue;
      this.store.savePlan({ id: crypto.randomUUID(), name: `BiS: ${this.store.nameOf(id)}`, targetItemId: id, quantity: 1, server: this.store.settings().server, createdAt: new Date().toISOString() });
    }
  }
}
