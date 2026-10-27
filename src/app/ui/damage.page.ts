import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { AppStore } from '../core/app-store';
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
