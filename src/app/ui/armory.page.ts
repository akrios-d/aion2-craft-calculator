import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { ArmoryItem, ArmoryParseResult, ArmoryProfile, ArmorySnapshot, SearchCandidate, armoryLinks, buildSnapshot, parseArmoryJson, searchLink } from '../core/armory';
import { BisEntry, BisList, BisImportResult, StatCheck, compareBis, isScoredSlot, overallGrade, scoreItem, slotGroup, parseBisCsv, parseBisJson } from '../core/bis';
import { TrPipe } from '../core/tr.pipe';

const SLOTS = ['MainHand', 'SubHand', 'Helmet', 'Shoulder', 'Torso', 'Pants', 'Gloves', 'Boots', 'Necklace', 'Earring1', 'Earring2', 'Ring1', 'Ring2', 'Bracelet1', 'Bracelet2', 'Belt', 'Cape', 'Amulet', 'Rune1', 'Rune2', 'Arcana1', 'Arcana2', 'Arcana3', 'Arcana4', 'Arcana5'];

@Component({
  selector: 'app-armory',
  imports: [TrPipe, FormsModule, DatePipe, NgTemplateOutlet],
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
    .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-bottom: .4rem; }
    .ideal { border-left-color: var(--gold); }
    .lt { font-weight: 800; padding: 0 .4rem; border-radius: 4px; border: 1px solid currentColor; width: fit-content; }
    .lt-S { color: #ffc94d; } .lt-A { color: #5cd68a; } .lt-B { color: #5cb3ff; } .lt-C { color: #e0a43a; } .lt-D { color: #e05c5c; }
    .ovl { font-size: 1.1rem; }
  `,
  template: `
    <h2>{{ 'Armory and BiS' | tr }}</h2>

    <section class="panel">
      <h3>{{ 'Character lookup' | tr }}</h3>
      <p class="muted">
        {{ 'The NCSOFT armory does not allow browser requests from other sites (CORS), and this app has no proxy. So nothing is fetched automatically: open the links in your own browser, copy the JSON and paste it below.' | tr }}
        {{ 'Use is on demand only; NCSOFT terms forbid automated access outside published interfaces.' | tr }}
      </p>
      <div class="row">
        <select [ngModel]="region()" (ngModelChange)="region.set($event)">
          <option value="eu">EU</option><option value="na">NA</option><option value="asia">ASIA</option>
        </select>
        <input [ngModel]="keyword()" (ngModelChange)="keyword.set($event)" [placeholder]="'Character name' | tr" />
        <a class="chip" [href]="search()" target="_blank" rel="noopener noreferrer">{{ '1. Open name search' | tr }}</a>
      </div>
      <textarea [ngModel]="pasted()" (ngModelChange)="pasted.set($event)" [placeholder]="'Paste the JSON of the search, /api/character/info or /api/character/equipment' | tr"></textarea>
      <div class="row">
        <button (click)="parse()" [disabled]="!pasted().trim()">{{ 'Validate and preview' | tr }}</button>
        <button (click)="clearPending()" [disabled]="!pasted() && !pendingItems()">{{ 'Clear' | tr }}</button>
      </div>
      @if (parseError()) { <p class="err">{{ parseError() | tr }}</p> }
      @for (w of warnings(); track $index) { <p class="warn">{{ w }}</p> }
      @if (candidates().length) {
        <table>
          <thead><tr><th>{{ 'Name' | tr }}</th><th>{{ 'Server' | tr }}</th><th>{{ 'Level' | tr }}</th><th>{{ '2. Open and copy the JSON' | tr }}</th></tr></thead>
          <tbody>
            @for (c of candidates(); track c.characterId) {
              <tr>
                <td>{{ c.name }}</td><td>{{ c.serverName }}</td><td>{{ c.level }}</td>
                <td>
                  <a class="chip" [href]="links(c).info" target="_blank" rel="noopener noreferrer">info</a>
                  <a class="chip" [href]="links(c).equipment" target="_blank" rel="noopener noreferrer">equipment</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (pendingProfile() || pendingItems()) {
        <div class="panel">
          <b>{{ 'Preview' | tr }}: {{ pendingProfile()?.name ?? ('Unknown character' | tr) }}
            @if (pendingProfile()?.className) { · {{ pendingProfile()?.className }} }
            @if (pendingProfile()?.level) { · Lv {{ pendingProfile()?.level }} }
            @if (pendingProfile()?.serverName) { · {{ pendingProfile()?.serverName }} }
          </b>
          <span>{{ 'Items' | tr }}: {{ pendingItems()?.length ?? 0 }}</span>
          @if (!pendingProfile()) { <span class="warn">{{ 'Paste the /api/character/info response too, to get name and class.' | tr }}</span> }
          @if (!pendingItems()) { <span class="warn">{{ 'Paste the /api/character/equipment response too, to get gear and arcana.' | tr }}</span> }
          <div class="row"><button (click)="savePending()" [disabled]="!pendingItems()">{{ 'Save character' | tr }}</button></div>
        </div>
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
        <small class="muted">{{ 'Pasted on' | tr }} {{ s.fetchedAt | date: 'short' }}</small>
        <h4>{{ 'Equipment' | tr }}</h4>
        <div class="grid">
          @for (g of s.gear; track g.slot) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: g }" /> }
        </div>
        <h4>{{ 'Arcana' | tr }}</h4>
        @if (s.arcana.length) {
          <div class="grid">
            @for (g of s.arcana; track g.slot) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: g }" /> }
          </div>
        } @else { <p class="muted">{{ 'No arcana returned by the armory.' | tr }}</p> }
      </section>
    }

    <ng-template #card let-g>
      <div class="gear g-{{ g.grade }}">
        @if (isUrl(g.icon)) { <img class="ico" [src]="g.icon" referrerpolicy="no-referrer" alt="" loading="lazy" /> }
        <small>{{ g.slotName }}</small>
        <b>{{ g.name }}</b>
        <small>{{ g.grade }}@if (g.enchant) { · +{{ g.enchant }} }@if (g.exceed) { · ★{{ g.exceed }} }</small>
      </div>
    </ng-template>

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
        @if (overall(); as o) { <p class="ovl">{{ 'Overall gear grade' | tr }}: <b class="lt lt-{{ o.letter.charAt(0) }}">{{ o.letter }}</b> <small class="muted">({{ o.score }}/100)</small></p> }
        <p class="muted"><small>{{ 'Score is our own heuristic (grade, enchant, exceed, ideal stats, BiS match), not kisk or NCSOFT. See the README.' | tr }}</small></p>
        @for (grp of groups(); track grp.title) {
          <h4>{{ grp.title | tr }}</h4>
          @for (r of grp.rows; track r.entry.slot) {
            <div class="cmp">
              <div class="gear" [class.empty]="!r.equipped">
                <small>{{ r.entry.slot }} · {{ 'Equipped' | tr }}</small>
                @if (r.equipped; as q) {
                  <b>{{ q.name }}</b>
                  <small>{{ q.grade }}@if (q.enchant) { · +{{ q.enchant }} }@if (q.exceed) { · ★{{ q.exceed }} }</small>
                  @for (st of q.stats ?? []; track st.name) { <small>{{ st.name }} {{ st.value }}@if (st.max) { / {{ st.max }} }</small> }
                  @if (r.sc; as sc) { <span class="lt lt-{{ sc.letter.charAt(0) }}">{{ sc.letter }} <small>{{ sc.score }}</small></span> }
                } @else { <b>—</b> }
                <small class="st-{{ r.status }}">{{ statusLabel(r.status) | tr }}</small>
              </div>
              <div class="gear ideal">
                <small>{{ 'Ideal' | tr }} {{ cls() }} {{ r.entry.slot }} · <b>{{ 'Best in slot' | tr }}</b> <button class="mini" (click)="removeEntry(r.entry)">✕</button></small>
                <b>{{ r.entry.itemName }}</b>
                @for (sc of checks(r); track sc.name) {
                  <small>@if (r.equipped?.stats) { <span [class]="sc.have ? 'ok' : 'err'">{{ sc.have ? '✓' : '✗' }}</span> } {{ sc.name }}@if (sc.max) { +{{ sc.max }} }</small>
                }
                @if (r.entry.notes) { <small class="muted">{{ r.entry.notes }}</small> }
              </div>
            </div>
          }
        }
        @if (craftable().length) {
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
        <p class="muted">{{ 'Paste a character above to compare with this list.' | tr }}</p>
      } @else { <p class="muted">{{ 'No BiS list for this class yet.' | tr }}</p> }

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
  `,
})
export class ArmoryPage {
  readonly store = inject(AppStore);
  readonly slots = SLOTS;
  readonly region = signal('eu');
  readonly keyword = signal('');
  readonly pasted = signal('');
  readonly parseError = signal('');
  readonly warnings = signal<string[]>([]);
  readonly candidates = signal<SearchCandidate[]>([]);
  readonly pendingProfile = signal<ArmoryProfile | undefined>(undefined);
  readonly pendingItems = signal<ArmoryItem[] | undefined>(undefined);
  readonly selectedKey = signal('');
  readonly className = signal('');
  readonly slot = signal(SLOTS[0]);
  readonly itemName = signal('');
  readonly itemId = signal('');
  readonly notes = signal('');
  readonly bisText = signal('');
  readonly bisPreview = signal<BisImportResult | null>(null);

  readonly search = computed(() => searchLink(this.region(), this.keyword().trim() || 'name'));
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

  readonly cls = computed(() => this.list()?.className ?? '');
  readonly scored = computed(() => (this.comparison()?.rows ?? []).map((r) => ({ ...r, sc: r.equipped ? scoreItem(r.equipped, r.entry) : undefined })));
  readonly overall = computed(() => overallGrade(this.scored().map((r) => ({ item: r.equipped, score: r.sc }))));
  readonly groups = computed(() => {
    const rows = this.scored();
    const arc = (r: { entry: BisEntry }) => slotGroup(r.entry.slot) === 'arcana';
    const uns = (r: { entry: BisEntry }) => !arc(r) && !isScoredSlot(r.entry.slot);
    return [
      { title: 'Scored slots', rows: rows.filter((r) => !arc(r) && !uns(r)) },
      { title: 'Unscored', rows: rows.filter(uns) },
      { title: 'Arcana', rows: rows.filter(arc) },
    ].filter((g) => g.rows.length);
  });

  checks(r: { entry: BisEntry; sc?: { statChecks: StatCheck[] } }): StatCheck[] {
    return r.sc?.statChecks ?? (r.entry.stats ?? []).map((s) => ({ ...s, have: false }));
  }

  links(c: SearchCandidate) {
    return armoryLinks(this.region(), c);
  }
  isUrl(s?: string) {
    return !!s && /^https:\/\//i.test(s);
  }
  statusLabel(s: string) {
    return s === 'match' ? 'Equipped' : s === 'mismatch' ? 'Different item' : 'Empty slot';
  }

  parse(): void {
    const r: ArmoryParseResult = parseArmoryJson(this.pasted());
    this.parseError.set(r.error ?? '');
    this.warnings.set(r.warnings);
    if (r.error) return;
    if (r.candidates) this.candidates.set(r.candidates);
    if (r.profile) this.pendingProfile.set(r.profile);
    if (r.items) this.pendingItems.set(r.items);
    this.pasted.set('');
  }
  clearPending(): void {
    this.pasted.set('');
    this.parseError.set('');
    this.warnings.set([]);
    this.candidates.set([]);
    this.pendingProfile.set(undefined);
    this.pendingItems.set(undefined);
  }
  savePending(): void {
    const snap = buildSnapshot(this.pendingProfile(), this.pendingItems() ?? []);
    this.store.saveSnapshot(snap);
    this.selectedKey.set(snap.key);
    this.clearPending();
  }

  canAdd(): boolean {
    return !!this.itemName().trim() && !!(this.className().trim() || this.snap()?.profile.className);
  }
  private currentClass(): string {
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
