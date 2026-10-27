import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { AppStore } from '../core/app-store';
import { CharacterCard, CharacterHit, LOOKUP_REGIONS, lookupCharacterInfo, lookupCharacters } from '../core/character-lookup';
import { FormsModule } from '@angular/forms';
import {
  CRIT_CURVE,
  DEFAULT_DAMAGE_MODEL,
  DEFAULT_DAMAGE_STATS,
  DamageModel,
  DamageStats,
  StatKey,
  StatImport,
  ampEfficiency,
  calculateDamage,
  compareStatGains,
  critRateFromStat,
  critStatForRate,
  efficiencyTable,
  parseCharacterStats,
} from '../core/engine/damage-engine';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-damage',
  imports: [FormsModule, TrPipe, DecimalPipe],
  template: `
    <h2>{{ 'Damage research' | tr }}</h2>
    <p class="muted">
      {{ 'Community-reported mechanics from training-dummy tests, not verified by us and possibly outdated. Every constant is editable.' | tr }}
      <a href="https://github.com/sunkwolf/aion2-damage-research" target="_blank" rel="noopener">{{ 'Source summary' | tr }}</a>
    </p>

    <details>
      <summary>{{ 'Search character by name' | tr }}</summary>
      <p class="muted">{{ 'Reads the official NCSOFT site through a small serverless proxy. It only exposes profile and base attributes (no total attack, crit or amp), so stats still need to be pasted.' | tr }}</p>
      <div class="row">
        <select [ngModel]="lookupRegion()" (ngModelChange)="lookupRegion.set($event)">
          @for (r of regions; track r.id) { <option [value]="r.id">{{ r.label }}</option> }
        </select>
        <input type="text" [ngModel]="lookupName()" (ngModelChange)="lookupName.set($event)" (keyup.enter)="search()" [placeholder]="'Character name' | tr" />
        <button type="button" [disabled]="lookupBusy() || !lookupName().trim()" (click)="search()">{{ 'Search' | tr }}</button>
      </div>
      @if (lookupError()) { <p class="error">{{ lookupError() | tr }}</p> }
      @for (h of lookupHits(); track h.characterId) {
        <button type="button" class="link" (click)="pick(h)">{{ h.name }} · Lv {{ h.level }} · {{ h.serverName }}</button>
      }
      @if (card(); as c) {
        <div class="card">
          <strong>{{ c.name }}</strong> — {{ c.className }}, Lv {{ c.level }}, {{ c.serverName }} ({{ c.raceName }})<br />
          {{ 'Combat power' | tr }}: {{ c.combatPower | number }}
          @if (c.itemLevel !== null) { · {{ 'Item level' | tr }}: {{ c.itemLevel }} }
          <ul>
            @for (a of c.attributes; track a.name) { <li>{{ a.name }}: {{ a.value }} <span class="muted">{{ a.effects.join(', ') }}</span></li> }
          </ul>
        </div>
      }
    </details>

    <h3>{{ 'Your stats' | tr }}</h3>
    <div class="grid">
      @for (f of fields; track f.key) {
        <label>{{ f.label | tr }}
          <input type="number" step="any" [ngModel]="stats()[f.key]" (ngModelChange)="setStat(f.key, $event)" />
        </label>
      }
    </div>

    <details>
      <summary>{{ 'Import character stats' | tr }}</summary>
      <p class="muted">{{ 'Paste your stats as lines like Attack: 5200 or as JSON. Nothing is applied until you confirm; unknown names are reported.' | tr }}</p>
      <textarea rows="6" [ngModel]="importText()" (ngModelChange)="importText.set($event)" placeholder="Attack: 5200&#10;Crit rate: 42.5&#10;Back attack: 3"></textarea>
      @let imp = importPreview();
      @if (imp.rows.length || imp.errors.length) {
        <table>
          <thead><tr><th>{{ 'Name' | tr }}</th><th>{{ 'Stat' | tr }}</th><th>{{ 'Value' | tr }}</th><th></th></tr></thead>
          <tbody>
            @for (r of imp.rows; track r.line) {
              <tr><td>{{ r.label }}</td><td>{{ r.stat ? (labelOf(r.stat) | tr) : '—' }}</td><td>{{ r.value ?? '—' }}</td><td [class]="r.error ? 'neg' : 'pos'">{{ r.error ? (r.error | tr) : 'OK' }}</td></tr>
            }
          </tbody>
        </table>
        @for (e of imp.errors; track e) { <p class="neg">{{ e }}</p> }
      }
      <div class="row">
        <button type="button" [disabled]="!hasImportValues()" (click)="applyImport()">{{ 'Apply imported stats' | tr }}</button>
        <button type="button" (click)="exportStats()">{{ 'Export current stats as JSON' | tr }}</button>
      </div>
    </details>

    <details>
      <summary>{{ 'Model constants' | tr }}</summary>
      <div class="grid">
        @for (f of modelFields; track f.key) {
          <label>{{ f.label | tr }}
            <input type="number" min="0" step="any" [ngModel]="model()[f.key]" (ngModelChange)="setModel(f.key, $event)" />
          </label>
        }
      </div>
    </details>
    <div class="row"><button type="button" (click)="reset()">{{ 'Reset to defaults' | tr }}</button></div>

    <h3>{{ 'Result' | tr }}</h3>
    @let r = result();
    <div class="cards">
      <div class="card"><span>{{ 'Skill base damage' | tr }}</span><strong>{{ r.base | number: '1.0-0' }}</strong></div>
      <div class="card"><span>{{ 'Total multiplier' | tr }}</span><strong>×{{ r.allMultipliers | number: '1.2-3' }}</strong></div>
      <div class="card"><span>{{ 'Normal hit' | tr }}</span><strong>{{ r.normalHit | number: '1.0-0' }}</strong></div>
      <div class="card"><span>{{ 'Critical hit' | tr }}</span><strong>{{ r.critHit | number: '1.0-0' }}</strong></div>
      <div class="card"><span>{{ 'Expected hit' | tr }}</span><strong>{{ r.expectedHit | number: '1.0-0' }}</strong></div>
      <div class="card"><span>{{ 'Value of +1% amp' | tr }}</span><strong>×{{ efficiency() | number: '1.2-2' }}</strong></div>
    </div>

    <h3>{{ 'Which upgrade is worth more?' | tr }}</h3>
    <p class="muted">{{ 'Expected-damage gain from adding the amount shown to each stat.' | tr }}</p>
    <table>
      <thead><tr><th>{{ 'Stat' | tr }}</th><th>{{ 'Add' | tr }}</th><th>{{ 'Expected hit' | tr }}</th><th>{{ 'Gain' | tr }}</th></tr></thead>
      <tbody>
        @for (g of gains(); track g.stat) {
          <tr>
            <td>{{ labelOf(g.stat) | tr }}</td>
            <td><input type="number" step="any" [ngModel]="amounts()[g.stat]" (ngModelChange)="setAmount(g.stat, $event)" /></td>
            <td>{{ g.expectedHit | number: '1.0-0' }}</td>
            <td [class]="g === bestGain() ? 'pos' : ''">{{ g.gainPercent | number: '1.0-2' }}%@if (g === bestGain()) { ★ }</td>
          </tr>
        }
      </tbody>
    </table>

    <h3>{{ 'Amp efficiency' | tr }}</h3>
    <p class="muted">{{ 'How much +1% Damage/PVE/Boss Amp is worth, by net amp (total amp minus target resistance). They all share one group, so any of them gives the same result.' | tr }}</p>
    <table>
      <thead><tr><th>{{ 'Net amp' | tr }}</th><th>{{ 'Value of +1% amp' | tr }}</th></tr></thead>
      <tbody>
        @for (e of effTable; track e.net) {
          <tr><td>{{ e.net > 0 ? '+' : '' }}{{ e.net }}%</td><td>×{{ e.efficiency | number: '1.2-2' }}</td></tr>
        }
      </tbody>
    </table>

    @let ac = ampChart();
    <svg class="chart" style="max-width:420px;width:100%" viewBox="0 0 320 180" role="img" [attr.aria-label]="'Amp efficiency' | tr">
      <line x1="40" y1="150" x2="310" y2="150" stroke="currentColor" opacity=".4" />
      <line x1="40" y1="10" x2="40" y2="150" stroke="currentColor" opacity=".4" />
      <path [attr.d]="ac.path" fill="none" stroke="#4ea1ff" stroke-width="2" />
      <circle [attr.cx]="ac.x" [attr.cy]="ac.y" r="5" fill="#ff9f43" />
      <text x="40" y="168" font-size="10" fill="currentColor">{{ ac.xMin }}%</text>
      <text x="280" y="168" font-size="10" fill="currentColor">{{ ac.xMax }}%</text>
      <text x="2" y="14" font-size="10" fill="currentColor">×{{ ac.yMax | number: '1.1-1' }}</text>
      <text x="2" y="150" font-size="10" fill="currentColor">×0</text>
    </svg>
    <p class="muted">{{ 'Blue: value of +1% amp by net amp (diminishing returns). Orange: your current net amp.' | tr }} ({{ ac.net | number: '1.0-1' }}% → ×{{ ac.eff | number: '1.2-2' }})</p>

    <h3>{{ 'Crit stat and crit rate' | tr }}</h3>
    <p class="muted">{{ 'Measured on a training dummy; boss crit resistance may change it. Values outside the measured range are not estimated.' | tr }}</p>
    <div class="grid">
      <label>{{ 'Crit stat' | tr }}
        <input type="number" step="any" [ngModel]="critStat()" (ngModelChange)="critStat.set($event ?? 0)" />
      </label>
      <label>{{ 'Target crit rate (%)' | tr }}
        <input type="number" step="any" [ngModel]="critTarget()" (ngModelChange)="critTarget.set($event ?? 0)" />
      </label>
    </div>
    @let cc = critChart();
    <svg class="chart" style="max-width:420px;width:100%" viewBox="0 0 320 180" role="img" [attr.aria-label]="'Crit stat and crit rate' | tr">
      <line x1="40" y1="150" x2="310" y2="150" stroke="currentColor" opacity=".4" />
      <line x1="40" y1="10" x2="40" y2="150" stroke="currentColor" opacity=".4" />
      <path [attr.d]="cc.path" fill="none" stroke="#4ea1ff" stroke-width="2" />
      @for (p of cc.dots; track p.x) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" fill="#4ea1ff" /> }
      @if (cc.mark; as m) { <circle [attr.cx]="m.x" [attr.cy]="m.y" r="5" fill="#ff9f43" /> }
      <text x="40" y="168" font-size="10" fill="currentColor">{{ cc.xMin }}</text>
      <text x="280" y="168" font-size="10" fill="currentColor">{{ cc.xMax }}</text>
      <text x="2" y="14" font-size="10" fill="currentColor">{{ cc.yMax }}%</text>
      <text x="2" y="150" font-size="10" fill="currentColor">{{ cc.yMin }}%</text>
    </svg>
    <table class="kv">
      <tr><td>{{ 'Crit stat' | tr }} → {{ 'Crit rate (%)' | tr }}</td><td>@if (rateFromStat() !== null) { {{ rateFromStat() | number: '1.0-1' }}% <button type="button" (click)="setStat('critRate', rateFromStat())">{{ 'Use as crit rate' | tr }}</button> } @else { {{ 'Out of measured range' | tr }} }</td></tr>
      <tr><td>{{ 'Target crit rate (%)' | tr }} → {{ 'Crit stat' | tr }}</td><td>@if (statForRate() !== null) { {{ statForRate() | number: '1.0-0' }} } @else { {{ 'Out of measured range' | tr }} }</td></tr>
    </table>
    <table>
      <thead><tr><th>{{ 'Crit stat' | tr }}</th><th>{{ 'Crit rate (%)' | tr }}</th></tr></thead>
      <tbody>
        @for (p of curve; track p.stat) { <tr><td>{{ p.stat }}</td><td>{{ p.rate }}%</td></tr> }
      </tbody>
    </table>

    <h3>{{ 'Community notes' | tr }}</h3>
    <ul class="muted">
      <li>{{ 'Damage over time ignores defense and penetration and cannot crit, smite or multi-hit.' | tr }}</li>
      <li>{{ 'Penetration and defense are flat per hit (value ÷ 10): better for many small hits, weak on one big hit.' | tr }}</li>
      <li>{{ 'Back attack is a separate multiplier, so it is not diluted by the amp group.' | tr }}</li>
      <li>{{ 'Perfect Hit adds only about 2-3% and is mainly useful for damage tests.' | tr }}</li>
    </ul>
  `,
})
export class DamagePage {
  readonly fields: { key: keyof DamageStats; label: string }[] = [
    { key: 'attack', label: 'Attack' },
    { key: 'skillLevelBonus', label: 'Skill level bonus' },
    { key: 'damageAmp', label: 'Damage / PVE / Boss Amp (%)' },
    { key: 'targetResistance', label: 'Target damage resistance (%)' },
    { key: 'backAttack', label: 'Back attack (%)' },
    { key: 'elementalReduction', label: 'Elemental resist reduction (%)' },
    { key: 'critRate', label: 'Crit rate (%)' },
    { key: 'critDamageBonus', label: 'Extra crit damage (%)' },
    { key: 'smiteChance', label: 'Smite chance (%)' },
    { key: 'multiHits', label: 'Extra multi-hits (0-4)' },
    { key: 'penetration', label: 'Penetration' },
    { key: 'targetDefense', label: 'Target defense' },
  ];
  readonly modelFields: { key: keyof DamageModel; label: string }[] = [
    { key: 'skillCoefficient', label: 'Skill coefficient (%)' },
    { key: 'flatDivisor', label: 'Penetration/defense divisor' },
    { key: 'baseCritDamage', label: 'Base crit damage (%)' },
    { key: 'multiHitBonusPerHit', label: 'Bonus per extra multi-hit (%)' },
    { key: 'smiteMultiplier', label: 'Smite multiplier' },
  ];
  readonly curve = CRIT_CURVE;
  readonly effTable = efficiencyTable();

  protected readonly store = inject(AppStore);
  readonly stats = signal<DamageStats>({ ...DEFAULT_DAMAGE_STATS });
  readonly model = signal<DamageModel>({ ...DEFAULT_DAMAGE_MODEL });
  readonly regions = LOOKUP_REGIONS;
  readonly ampChart = computed(() => {
    const xMin = -70, xMax = 100, yMax = 3.4;
    const sx = (v: number) => 40 + ((v - xMin) / (xMax - xMin)) * 270;
    const sy = (v: number) => 150 - (Math.min(v, yMax) / yMax) * 140;
    let path = '';
    for (let n = xMin; n <= xMax; n += 2) path += `${path ? 'L' : 'M'}${sx(n).toFixed(1)},${sy(ampEfficiency(n)).toFixed(1)}`;
    const s = this.stats();
    const net = Math.min(xMax, Math.max(xMin, s.damageAmp - s.targetResistance));
    return { path, xMin, xMax, yMax, net, eff: ampEfficiency(net), x: sx(net), y: sy(ampEfficiency(net)) };
  });
  readonly critChart = computed(() => {
    const pts = CRIT_CURVE;
    const xMin = pts[0].stat, xMax = pts[pts.length - 1].stat, yMin = 40, yMax = 100;
    const sx = (v: number) => 40 + ((v - xMin) / (xMax - xMin)) * 270;
    const sy = (v: number) => 150 - ((v - yMin) / (yMax - yMin)) * 140;
    const dots = pts.map((p) => ({ x: sx(p.stat), y: sy(p.rate) }));
    const path = dots.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
    const r = critRateFromStat(this.critStat());
    return { path, dots, xMin, xMax, yMin, yMax, mark: r === null ? null : { x: sx(this.critStat()), y: sy(r) } };
  });
  readonly lookupRegion = signal('la');
  readonly lookupName = signal('');
  readonly lookupHits = signal<CharacterHit[]>([]);
  readonly card = signal<CharacterCard | null>(null);
  readonly lookupBusy = signal(false);
  readonly lookupError = signal('');
  readonly importText = signal('');
  readonly importPreview = computed<StatImport>(() => (this.importText().trim() ? parseCharacterStats(this.importText()) : { rows: [], values: {}, errors: [] }));
  readonly hasImportValues = computed(() => Object.keys(this.importPreview().values).length > 0);
  private loadedFor = '';

  constructor() {
    effect(() => {
      const id = this.store.activeCharacter()?.id ?? 'default';
      if (id === this.loadedFor) return;
      this.loadedFor = id;
      const saved = this.read(id);
      this.stats.set({ ...DEFAULT_DAMAGE_STATS, ...saved?.stats });
      this.model.set({ ...DEFAULT_DAMAGE_MODEL, ...saved?.model });
    });
    effect(() => {
      const snapshot = { stats: this.stats(), model: this.model() };
      if (!this.loadedFor) return;
      try {
        localStorage.setItem(this.key(this.loadedFor), JSON.stringify(snapshot));
      } catch {
        // storage unavailable: the page still works for this session
      }
    });
  }

  private key(id: string): string {
    return 'aion2-craft-lab.damage.' + id;
  }

  private read(id: string): { stats?: Partial<DamageStats>; model?: Partial<DamageModel> } | null {
    try {
      const raw = localStorage.getItem(this.key(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async search(): Promise<void> {
    this.lookupBusy.set(true);
    this.lookupError.set('');
    this.card.set(null);
    try {
      const hits = await lookupCharacters(this.lookupRegion(), this.lookupName().trim());
      this.lookupHits.set(hits);
      if (!hits.length) this.lookupError.set('No characters found.');
    } catch {
      this.lookupHits.set([]);
      this.lookupError.set('Lookup unavailable (the proxy only works on the deployed site, not ng serve).');
    } finally {
      this.lookupBusy.set(false);
    }
  }

  async pick(hit: CharacterHit): Promise<void> {
    this.lookupBusy.set(true);
    try {
      this.card.set(await lookupCharacterInfo(this.lookupRegion(), hit));
    } catch {
      this.lookupError.set('Lookup unavailable (the proxy only works on the deployed site, not ng serve).');
    } finally {
      this.lookupBusy.set(false);
    }
  }

  applyImport(): void {
    this.stats.update((s) => ({ ...s, ...this.importPreview().values }));
    this.importText.set('');
  }

  exportStats(): void {
    this.importText.set(JSON.stringify(this.stats(), null, 2));
  }
  readonly amounts = signal<Record<StatKey, number>>({ attack: 500, damageAmp: 5, backAttack: 5, elementalReduction: 5, critRate: 5, critDamageBonus: 10, penetration: 500 });
  readonly critStat = signal(1100);
  readonly critTarget = signal(70);

  readonly result = computed(() => calculateDamage(this.stats(), this.model()));
  readonly gains = computed(() => compareStatGains(this.stats(), this.model(), this.amounts()));
  readonly bestGain = computed(() => this.gains().reduce((a, b) => (b.gainPercent > a.gainPercent ? b : a)));
  readonly efficiency = computed(() => ampEfficiency(this.stats().damageAmp - this.stats().targetResistance));
  readonly rateFromStat = computed(() => critRateFromStat(this.critStat()));
  readonly statForRate = computed(() => critStatForRate(this.critTarget()));

  labelOf(stat: keyof DamageStats): string {
    return this.fields.find((f) => f.key === stat)?.label ?? stat;
  }

  setStat(key: keyof DamageStats, v: number | null): void {
    this.stats.update((s) => ({ ...s, [key]: v ?? 0 }));
  }

  setModel(key: keyof DamageModel, v: number | null): void {
    this.model.update((m) => ({ ...m, [key]: v ?? 0 }));
  }

  setAmount(key: StatKey, v: number | null): void {
    this.amounts.update((a) => ({ ...a, [key]: v ?? 0 }));
  }

  reset(): void {
    this.stats.set({ ...DEFAULT_DAMAGE_STATS });
    this.model.set({ ...DEFAULT_DAMAGE_MODEL });
  }
}
