import { DecimalPipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_DAMAGE_MODEL,
  DEFAULT_DAMAGE_STATS,
  DamageModel,
  DamageStats,
  StatKey,
  calculateDamage,
  calibrateDefenseConstant,
  compareStatGains,
} from '../core/engine/damage-engine';
import { TrPipe } from '../core/tr.pipe';

@Component({
  selector: 'app-damage',
  imports: [FormsModule, TrPipe, DecimalPipe],
  template: `
    <h2>{{ 'Damage' | tr }}</h2>
    <p class="muted">
      {{ 'Unverified model: the formulas below are generic placeholders, not confirmed game mechanics. Adjust the constants and calibrate with hits you observe in game.' | tr }}
      <a href="https://github.com/sunkwolf/aion2-damage-research" target="_blank" rel="noopener">{{ 'Community research (reference only)' | tr }}</a>
    </p>

    <h3>{{ 'Your stats' | tr }}</h3>
    <div class="grid">
      @for (f of fields; track f.key) {
        <label>{{ f.label | tr }}
          <input type="number" step="any" [ngModel]="stats()[f.key]" (ngModelChange)="setStat(f.key, $event)" />
        </label>
      }
    </div>

    <h3>{{ 'Model constants' | tr }}</h3>
    <div class="grid">
      <label>{{ 'Defense constant (K)' | tr }}
        <input type="number" min="0" step="any" [ngModel]="model().defenseConstant" (ngModelChange)="setModel('defenseConstant', $event)" />
      </label>
      <label>{{ 'Crit rate cap (%)' | tr }}
        <input type="number" min="0" max="100" step="any" [ngModel]="model().critRateCap" (ngModelChange)="setModel('critRateCap', $event)" />
      </label>
    </div>
    <div class="row"><button type="button" (click)="reset()">{{ 'Reset to defaults' | tr }}</button></div>

    <h3>{{ 'Result' | tr }}</h3>
    @let r = result();
    <div class="cards">
      <div class="card"><span>{{ 'Defense mitigation' | tr }}</span><strong>{{ r.mitigation * 100 | number: '1.0-1' }}%</strong></div>
      <div class="card"><span>{{ 'Normal hit' | tr }}</span><strong>{{ r.normalHit | number: '1.0-0' }}</strong></div>
      <div class="card"><span>{{ 'Critical hit' | tr }}</span><strong>{{ r.critHit | number: '1.0-0' }}</strong></div>
      <div class="card"><span>{{ 'Expected hit' | tr }}</span><strong>{{ r.expectedHit | number: '1.0-0' }}</strong></div>
    </div>

    <h3>{{ 'Which upgrade is worth more?' | tr }}</h3>
    <p class="muted">{{ 'Expected-damage gain from adding the amount shown to each stat.' | tr }}</p>
    <table>
      <thead><tr><th>{{ 'Stat' | tr }}</th><th>{{ 'Add' | tr }}</th><th>{{ 'Expected hit' | tr }}</th><th>{{ 'Gain' | tr }}</th></tr></thead>
      <tbody>
        @for (g of gains(); track g.stat) {
          <tr [class.best]="g === bestGain()">
            <td>{{ labelOf(g.stat) | tr }}</td>
            <td><input type="number" step="any" [ngModel]="amounts()[g.stat]" (ngModelChange)="setAmount(g.stat, $event)" /></td>
            <td>{{ g.expectedHit | number: '1.0-0' }}</td>
            <td [class]="g === bestGain() ? 'pos' : ''">{{ g.gainPercent | number: '1.0-2' }}%@if (g === bestGain()) { ★ }</td>
          </tr>
        }
      </tbody>
    </table>

    <h3>{{ 'Calibrate from an observed hit' | tr }}</h3>
    <p class="muted">{{ 'Enter the damage of one non-critical hit with the stats above; the model solves the defense constant that matches it.' | tr }}</p>
    <div class="grid">
      <label>{{ 'Observed damage' | tr }}
        <input type="number" min="0" step="any" [ngModel]="observed()" (ngModelChange)="observed.set($event ?? 0)" />
      </label>
    </div>
    <div class="row">
      <button type="button" (click)="calibrate()">{{ 'Calibrate defense constant' | tr }}</button>
      @if (calibrationFailed()) { <span class="neg">{{ 'This hit cannot be explained by the current stats.' | tr }}</span> }
    </div>
  `,
})
export class DamagePage {
  readonly fields: { key: keyof DamageStats; label: string }[] = [
    { key: 'attack', label: 'Attack' },
    { key: 'skillMultiplier', label: 'Skill multiplier' },
    { key: 'flatDamage', label: 'Flat damage' },
    { key: 'damageBonus', label: 'Damage bonus (%)' },
    { key: 'critRate', label: 'Crit rate (%)' },
    { key: 'critDamage', label: 'Crit damage (%)' },
    { key: 'targetDefense', label: 'Target defense' },
    { key: 'penetration', label: 'Defense penetration (%)' },
  ];

  readonly stats = signal<DamageStats>({ ...DEFAULT_DAMAGE_STATS });
  readonly model = signal<DamageModel>({ ...DEFAULT_DAMAGE_MODEL });
  readonly amounts = signal<Record<StatKey, number>>({ attack: 100, damageBonus: 5, critRate: 5, critDamage: 10, penetration: 5 });
  readonly observed = signal(0);
  readonly calibrationFailed = signal(false);

  readonly result = computed(() => calculateDamage(this.stats(), this.model()));
  readonly gains = computed(() => compareStatGains(this.stats(), this.model(), this.amounts()));
  readonly bestGain = computed(() => this.gains().reduce((a, b) => (b.gainPercent > a.gainPercent ? b : a)));

  labelOf(stat: StatKey): string {
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
    this.calibrationFailed.set(false);
  }

  calibrate(): void {
    const k = calibrateDefenseConstant(this.stats(), this.observed());
    this.calibrationFailed.set(k === null);
    if (k !== null) this.setModel('defenseConstant', Math.round(k * 100) / 100);
  }
}
