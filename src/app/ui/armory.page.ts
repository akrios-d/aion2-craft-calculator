import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from '../core/app-store';
import { applyInventoryImport } from '../core/io/imports';
import { planEquipmentInventory } from '../core/armory';
import { parseCsv } from '../core/io/csv';
import { kiskBisSummaries, KISK_REGIONS, KiskCard, KiskLine, KiskSnapshot, parseKiskGear } from '../core/kisk';
import { CLASSES, DEFAULT_BANDS, EMPTY_TEMPLATE, EXAMPLE_JSON, SHARE_SLOTS, ShareImportResult, ShareTable, parseShareCsv, parseShareJson } from '../core/share-score';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-armory',
  imports: [TrPipe, FormsModule, DatePipe],
  styles: `
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: .75rem 1rem; display: grid; gap: .6rem; margin: .75rem 0 1rem; }
    .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    textarea { width: 100%; min-height: 6rem; font-family: monospace; font-size: .8rem; }
    .gh { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; padding: .9rem 1rem; border-radius: 12px; background: linear-gradient(135deg, var(--win), var(--panel)); border: 1px solid var(--line); }
    .chips { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .3rem; }
    .gchip { padding: .1rem .6rem; border-radius: 999px; background: #ffffff14; border: 1px solid #ffffff2e; font-size: .8rem; }
    .gname { margin: 0; font-size: 1.8rem; line-height: 1.2; }
    .cp { font-size: .8rem; vertical-align: middle; padding: .1rem .5rem; border-radius: 6px; background: #ebb71922; color: #ffd966; border: 1px solid #ebb71977; }
    .otile { display: grid; justify-items: center; padding: .4rem .9rem; border-radius: 10px; border: 2px solid currentColor; background: var(--bg); min-width: 6rem; }
    .otile b { font-size: 2rem; line-height: 1; }
    .linkbtn { background: none; border: 0; padding: 0; color: var(--gold); text-decoration: underline; cursor: pointer; font: inherit; }
    .hint { margin: .3rem 0; }
    .tabs { display: flex; gap: .4rem; margin: .5rem 0; flex-wrap: wrap; }
    .tab { padding: .35rem .8rem; border-radius: 6px; border: 1px solid var(--gold); background: var(--panel); color: var(--fg); cursor: pointer; }
    .tab.on { background: var(--gold); color: var(--bg); font-weight: 600; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
    @media (max-width: 960px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .cards { grid-template-columns: 1fr; } .gh { flex-direction: column; } }
    .card { display: flex; flex-direction: column; gap: .5rem; padding: .7rem .8rem; border-radius: 12px; background: linear-gradient(160deg, var(--win), var(--panel)); border: 1px solid #ffffff26; min-height: 11rem; color: var(--fg); }
    .rar-Legend { border-color: #ff9d3c88; } .rar-Unique { border-color: #ffc94d88; } .rar-Epic { border-color: #c79a4a88; } .rar-Rare { border-color: #8aa0b588; }
    .lb-A { border-color: #dfe3ee; } .lb-B { border-color: #6d7b8c; } .lb-C, .lb-D { border-color: #ffffff26; }
    .lb-S, .lb-Sp { border-color: #ffc94d; box-shadow: 0 0 .9rem #ffc94d55; }
    .lb-BIS, .card.bis { border-color: #ffd966; box-shadow: 0 0 1rem #ffd96688, 0 0 1.6rem #ebb71955; }
    .ch { display: flex; gap: .6rem; align-items: flex-start; }
    .ct { display: grid; gap: .15rem; min-width: 0; flex: 1; }
    .ct small { color: var(--muted); }
    .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cico { position: relative; flex: none; width: 44px; height: 44px; border-radius: 8px; background: #0008; display: grid; place-items: center; border: 1px solid #ffffff22; }
    .cico img { width: 100%; height: 100%; border-radius: 8px; }
    .cico.star { color: #ffd966; font-size: 1.6rem; }
    .plus { position: absolute; right: -6px; bottom: -6px; font-style: normal; font-size: .7rem; font-weight: 700; background: #ebb719; color: #1a1300; border-radius: 6px; padding: 0 .25rem; }
    .sc { width: fit-content; font-size: .75rem; padding: 0 .45rem; border-radius: 999px; background: #ffffff14; border: 1px solid #ffffff2e; color: var(--fg); }
    .lt { flex: none; font-weight: 800; font-size: 1.1rem; padding: .1rem .55rem; border-radius: 8px; border: 2px solid currentColor; background: var(--bg); }
    .lc-Sp, .lc-S { color: #ffd966; } .lc-A { color: #eceff7; } .lc-B { color: #9fb3c8; } .lc-C { color: #e0a43a; } .lc-D { color: #ff8a8a; } .lc-BIS { color: #ffd966; }
    .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: .45rem; flex: 1; }
    .rows li { display: grid; grid-template-columns: auto 1fr auto; column-gap: .45rem; align-items: center; }
    .rows li > .lb { grid-column: 1 / 3; } .rows li > .ck + .lb { grid-column: 2; } .rows li > .pc { grid-column: 3; }
    .rows li > .pb { grid-column: 1 / -1; }
    .lb small { color: var(--muted); } .pc { font-size: .85rem; font-variant-numeric: tabular-nums; }
    .pb { height: 5px; border-radius: 3px; background: #ffffff1c; overflow: hidden; margin-top: .2rem; }
    .pb > i { display: block; height: 100%; background: #7d8796; }
    .pb > i.hi { background: linear-gradient(90deg, var(--gold), #ffd966); }
    .ck { width: 1.1rem; height: 1.1rem; border-radius: 50%; border: 2px solid var(--muted); display: grid; place-items: center; font-size: .7rem; color: #1a1300; }
    .ck.on { background: #ffd966; border-color: #ffd966; font-weight: 800; }
    li.miss { opacity: .7; }
    .cf { display: flex; justify-content: space-between; align-items: center; gap: .5rem; border-top: 1px solid #ffffff1c; padding-top: .45rem; min-height: 1.8rem; }
    .cf small { color: var(--muted); }
    .flipbtn { padding: .15rem .7rem; border-radius: 999px; background: #ffffff10; border: 1px solid #ffffff44; color: #fff; cursor: pointer; }
    .flipbtn:hover, .flipbtn:focus-visible, .flipbtn[aria-pressed='true'] { background: #ffd96633; border-color: #ffd966; }
    .st-match { color: var(--ok); } .st-mismatch { color: var(--warn); } .st-missing { color: var(--err); }
    .ok { color: var(--ok); } .err { color: var(--err); } .warn { color: var(--warn); }
    .bar { height: .5rem; background: #ffffff18; border-radius: 4px; overflow: hidden; } .bar > i { display: block; height: 100%; background: var(--ok); }
    .tog { padding: .2rem .75rem; border-radius: 999px; background: transparent; border: 1px solid var(--line); color: var(--fg); cursor: pointer; }
    .tog.on { background: linear-gradient(180deg, #ebb719, #ac770c); color: var(--gold-ink); border-color: var(--gold); font-weight: 700; }
    td { vertical-align: middle; }
  `,
  template: `
    <h2>{{ 'Character gear and BiS (kisk.app)' | tr }}</h2>
    <p class="muted"><small>{{ 'UX inspired by kisk.app.' | tr }} <a href="https://kisk.app" target="_blank" rel="noopener noreferrer">kisk.app</a></small></p>

    <section class="panel">
      <h3>{{ 'kisk.app lookup' | tr }}</h3>
      <div class="row">
        <select [ngModel]="kRegion()" (ngModelChange)="kRegion.set($event)" [attr.aria-label]="'Region' | tr">
          @for (r of kiskRegions; track r) { <option [value]="r">{{ r.toUpperCase() }}</option> }
        </select>
        <input [ngModel]="kServer()" (ngModelChange)="kServer.set($event)" [placeholder]="'Server' | tr" size="12" />
        <input [ngModel]="kName()" (ngModelChange)="kName.set($event)" (keydown.enter)="kiskLookup()" [placeholder]="'Character name' | tr" />
        <button (click)="kiskLookup()" [disabled]="kBusy() || kName().trim().length < 2">{{ kBusy() ? ('Looking up…' | tr) : ('Look up on kisk.app' | tr) }}</button>
      </div>
      <p class="muted"><small>{{ 'One click fetches one kisk.app page through a small serverless function (no polling). kisk.app data is third-party and may be inaccurate; we are not affiliated with kisk.app or NCSOFT. Shares come from cielui.com via kisk.app.' | tr }}</small></p>
      @if (kError()) { <p class="err">{{ kError() | tr }}</p> }
    </section>

    @if (store.kiskCache().length) {
      <section class="row">
        @for (s of store.kiskCache(); track s.url) {
          <span class="row">
            <button class="tog" [class.on]="s.url === kSnap()?.url" (click)="kSel.set(s.url)">{{ s.report.name }} ({{ s.report.server }})</button>
            <button class="mini" (click)="store.removeKisk(s.url)" [attr.aria-label]="'Remove' | tr">✕</button>
          </span>
        }
      </section>
    }

    @if (kSnap(); as k) {
      <section class="panel">
        <header class="gh">
          <div class="gh-main">
            <div class="chips">
              @if (k.report.faction) { <span class="gchip">{{ k.report.faction }}</span> }
              <span class="gchip">Lv {{ k.report.level }} {{ k.report.className }}</span>
              <span class="gchip">{{ k.report.server }}</span>
              @if (k.report.legion) { <span class="gchip">{{ k.report.legion }}</span> }
            </div>
            <h3 class="gname">{{ k.report.name }} @if (k.report.cp) { <span class="cp">{{ k.report.cp }} CP</span> }</h3>
            <small class="muted">{{ 'Source: kisk.app' | tr }} · <a [href]="k.url" target="_blank" rel="noopener noreferrer">{{ 'Open on kisk.app' | tr }}</a> · {{ 'Fetched on' | tr }} {{ k.fetchedAt | date: 'short' }}</small>
          </div>
          @if (k.report.overallLetter) {
            <div class="otile lc-{{ lc(k.report.overallLetter) }}" [attr.aria-label]="('Overall gear grade' | tr) + ': ' + k.report.overallLetter">
              <b>{{ k.report.overallLetter }}</b><small>{{ 'Gear' | tr }}</small>
            </div>
          }
        </header>
        <p class="muted"><small>{{ 'Scores, grades, shares and Ideal cards below are kisk.app data (cielui.com, Korea PvE, may be outdated or inaccurate), not our own calculation. The Ideal lists also act as the BiS for this class unless you import your own table.' | tr }}</small></p>
        <div class="tabs" role="tablist" [attr.aria-label]="'Character sections' | tr" (keydown)="kTabKey($event)">
          @for (t of kTabs(); track t.key) {
            <button type="button" role="tab" class="tab" [id]="'ktab-' + t.key" [class.on]="kTab() === t.key" [attr.aria-selected]="kTab() === t.key" [attr.aria-controls]="'kpanel'" [attr.tabindex]="kTab() === t.key ? 0 : -1" (click)="setKTab(t.key)">{{ t.label | tr }} ({{ t.count }})</button>
          }
        </div>
        <div id="kpanel" role="tabpanel" [attr.aria-labelledby]="'ktab-' + kTab()">
        @for (g of kGroups(); track g.title) {
          @if (g.cards.length && g.key === kTab()) {
            <div class="cards">
              @for (c of g.cards; track c.slot) {
                @let flip = kFlipped(c);
                <article class="card {{ kClass(c) }}">
                  <div class="ch">
                    <span class="cico" [class.star]="flip">
                      @if (flip) { <span aria-hidden="true">★</span> } @else {
                        @if (c.icon) { <img [src]="c.icon" alt="" loading="lazy" referrerpolicy="no-referrer" /> }
                        @if (c.enchant) { <i class="plus">{{ c.enchant }}</i> }
                      }
                    </span>
                    <div class="ct">
                      <b class="nm" [title]="flip ? c.ideal!.title : c.name">{{ flip ? c.ideal!.title : c.name }}</b>
                      <small>{{ flip ? c.ideal!.subtitle : c.subtitle }}</small>
                      @if ((flip ? c.ideal!.score : c.score) !== null) { <span class="sc">{{ 'Score' | tr }} {{ flip ? c.ideal!.score : c.score }}</span> }
                    </div>
                    @if (flip ? c.ideal!.letter : c.letter) { <span class="lt lc-{{ lc(flip ? c.ideal!.letter : c.letter) }}">{{ flip ? c.ideal!.letter : c.letter }}</span> }
                  </div>
                  <ul class="rows">
                    @for (l of (flip ? c.ideal!.lines : c.lines); track $index) {
                      <li [class.miss]="flip && !l.have">
                        @if (flip) {
                          <span class="ck" [class.on]="l.have" role="img" [attr.aria-label]="(l.have ? 'Equipped item has this line' : 'Equipped item lacks this line') | tr">{{ l.have ? '✓' : '' }}</span>
                        }
                        <span class="lb">{{ l.stat }} <small>{{ flip ? l.value : kLine(l) }}</small></span>
                        <span class="pc">{{ l.share }}%</span>
                        <div class="pb"><i [class.hi]="l.share >= 70" [style.width.%]="l.share"></i></div>
                      </li>
                    }
                  </ul>
                  @if (c.ideal) {
                    <div class="cf">
                      <small>{{ flip ? ('Yours has {a} of these {b}' | tr: { a: kHave(c), b: c.ideal.lines.length }) : ('{a} of {b} ideal lines' | tr: { a: kHave(c), b: c.ideal.lines.length }) }}</small>
                      <button type="button" class="flipbtn" [attr.aria-pressed]="flip" (click)="kToggle(c)">{{ flip ? ('Yours' | tr) : ('Ideal' | tr) }} ⟳</button>
                    </div>
                  }
                </article>
              }
            </div>
          }
        }
        @if (kTab() === 'unscored' && k.report.unscored.length) {
          <div class="cards">
            @for (u of k.report.unscored; track $index) {
              <article class="card">
                <div class="ch">
                  <span class="cico">
                    @if (u.icon) { <img [src]="u.icon" alt="" loading="lazy" referrerpolicy="no-referrer" /> }
                    @if (u.enchant) { <i class="plus">{{ u.enchant }}</i> }
                  </span>
                  <div class="ct"><b class="nm" [title]="u.name">{{ u.name }}</b><small>{{ u.subtitle }}</small></div>
                </div>
              </article>
            }
          </div>
        }
        </div>
      </section>
    }

    @if (kSnap()) {
      <section class="panel">
        <h4>{{ 'Add equipped items to inventory' | tr }}</h4>
        <p class="muted"><small>{{ 'Only the equipped gear is added (quantity 1 per piece), matched by exact name to the recipe catalogue; unmatched pieces are listed below, never dropped. Materials and warehouse contents are not available.' | tr }}</small></p>
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
      @for (b of bisSummaries(); track b.className) {
        <p class="row">
          <span><b>{{ b.className }}</b>: {{ 'BiS source: kisk.app, last refreshed' | tr }} {{ b.fetchedAt | date: 'short' }}, {{ b.gearSlots }} {{ 'gear slots' | tr }} + {{ b.arcanaSlots }} Arcana ({{ b.lines }} {{ 'lines' | tr }})</span>
          <button (click)="refreshBis(b.source)" [disabled]="kBusy()">{{ 'Refresh from kisk.app' | tr }}</button>
        </p>
      } @empty {
        <p class="muted">{{ 'No BiS loaded yet: look up a character on kisk.app above; its Ideal cards become that class BiS automatically.' | tr }}</p>
      }
      <p class="muted"><small>{{ 'The Ideal cards of each kisk.app lookup are stored per class and refreshed on every lookup of that class. Shares baseline: kisk.app/scoring (cielui.com).' | tr }}</small></p>
    </section>

    <details class="panel">
      <summary>{{ 'Advanced: custom overrides' | tr }}</summary>

    <section class="panel">
      <h3>{{ 'Custom score tables' | tr }}</h3>
      <p class="muted">{{ 'Import, per class, the share of top players carrying each stat line on each slot (JSON, or CSV: class, slot, stat, share, maxRoll). Slots: weapon, guard, torso, pants, helmet, shoulders, gloves, boots, cape, necklace, earrings, rings, bracelet, arcana. The app already loads a baseline (kisk.app / cielui.com snapshot); tables you import override it per class and slot. The empty template and the example below use fake numbers. Without maxRoll the observed maximum is used and the score is marked approximate (≈). Optional "bands" override the letter thresholds.' | tr }}</p>
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
    </details>
  `,
})
export class ArmoryPage {
  readonly store = inject(AppStore);
  readonly example = EXAMPLE_JSON;
  readonly kiskRegions = KISK_REGIONS;
  readonly kRegion = signal('la');
  readonly kServer = signal('zikel');
  readonly kName = signal('Akrios');
  readonly kBusy = signal(false);
  readonly kError = signal('');
  readonly kSel = signal('');
  readonly kSnap = computed(() => { const c = this.store.kiskCache(); return c.find((s) => s.url === this.kSel()) ?? c[0] ?? null; });
  readonly kTabs = computed(() => { const r = this.kSnap()?.report; return [{ key: 'gear', label: 'Gear', count: r?.gear.length ?? 0 }, { key: 'unscored', label: 'Unscored', count: r?.unscored.length ?? 0 }, { key: 'arcana', label: 'Arcana', count: r?.arcana.length ?? 0 }]; });
  readonly kTab = signal<string>(((): string => { try { const v = localStorage.getItem('aion2-craft-lab.armory-tab'); return v === 'unscored' || v === 'arcana' ? v : 'gear'; } catch { return 'gear'; } })());
  setKTab(k: string): void { this.kTab.set(k); try { localStorage.setItem('aion2-craft-lab.armory-tab', k); } catch { /* ignore */ } }
  kTabKey(e: KeyboardEvent): void {
    const keys = this.kTabs().map((t) => t.key); let i = keys.indexOf(this.kTab());
    if (e.key === 'ArrowRight') i = (i + 1) % keys.length; else if (e.key === 'ArrowLeft') i = (i + keys.length - 1) % keys.length; else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = keys.length - 1; else return;
    e.preventDefault(); this.setKTab(keys[i]);
    setTimeout(() => document.getElementById('ktab-' + keys[i])?.focus());
  }
  readonly bisSummaries = computed(() => kiskBisSummaries(this.store.kiskCache()));
  refreshBis(s: KiskSnapshot): void { this.kRegion.set(s.region); this.kServer.set(s.server); this.kName.set(s.report.name); void this.kiskLookup(); }
  readonly kFlip = signal<ReadonlySet<string>>(new Set());
  readonly kGroups = computed(() => { const r = this.kSnap()?.report; return r ? [{ key: 'gear', title: 'Gear', cards: r.gear }, { key: 'arcana', title: 'Arcana', cards: r.arcana }] : []; });
  kFlipped(c: KiskCard): boolean { return !!c.ideal && this.kFlip().has(c.slot); }
  kToggle(c: KiskCard): void { const n = new Set(this.kFlip()); if (!n.delete(c.slot)) n.add(c.slot); this.kFlip.set(n); }
  kHave(c: KiskCard): number { return c.ideal?.lines.filter((l) => l.have).length ?? 0; }
  kClass(c: KiskCard): string { return this.kFlipped(c) ? 'bis' : 'lb-' + this.lc(c.letter); }
  kLine(l: KiskLine): string { return l.max !== undefined && l.max !== l.value ? `${l.value} / ${l.max}` : l.value; }

  async kiskLookup(): Promise<void> {
    const name = this.kName().trim();
    this.kError.set('');
    this.kBusy.set(true);
    try {
      const q = new URLSearchParams({ region: this.kRegion(), server: this.kServer().trim(), name });
      const res = await fetch(`/api/kisk?${q}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? 'Too many lookups, wait a minute.' : (body as { error?: string }).error ?? 'kisk.app lookup failed.');
      const snap: KiskSnapshot = { url: body.url, fetchedAt: body.fetchedAt, region: this.kRegion(), server: this.kServer().trim().toLowerCase(), report: parseKiskGear(body.html) };
      this.store.saveKisk(snap);
      if (snap.report.name) this.store.selectOrCreateCharacter(snap.report.name);
      this.kSel.set(snap.url);
      this.kFlip.set(new Set());
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      this.kError.set(e instanceof SyntaxError || m.includes('kisk') || m.includes('Too many') || m.includes('invalid') || m.includes('not found') || m.includes('unavailable') || m.includes('large') ? m : 'Could not read the kisk.app page (its layout may have changed): ' + m);
    } finally {
      this.kBusy.set(false);
    }
  }

  lc(letter: string): string {
    return letter === 'S+' ? 'Sp' : letter === 'BiS' ? 'BIS' : letter.charAt(0);
  }
  readonly invMode = signal<'merge' | 'replace' | null>(null);
  readonly invPreview = computed(() => {
    const mode = this.invMode();
    const s = this.kSnap();
    if (!mode || !s) return null;
    const d = this.store.data();
    const gear = s.report.gear.map((g) => ({ slot: 0, slotName: g.slot, id: 0, name: g.name, grade: '', enchant: 0, exceed: 0 }));
    const plan = planEquipmentInventory(gear, this.store.items(), d.inventory, mode);
    return { plan, res: applyInventoryImport(d, plan.records, mode, this.store.nameOf) };
  });
  readonly shareText = signal('');
  readonly sharePreview = signal<ShareImportResult | null>(null);
  applyInv(): void {
    const ip = this.invPreview();
    if (!ip) return;
    this.store.update(() => ip.res.data);
    this.invMode.set(null);
  }
  template() {
    return JSON.stringify(CLASSES.map((c) => EMPTY_TEMPLATE(c)).map(({ className }) => ({ className, bands: DEFAULT_BANDS, slots: Object.fromEntries(SHARE_SLOTS.map((s) => [s, []])) })), null, 2);
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
}
