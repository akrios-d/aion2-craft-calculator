import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAMAGE_MODEL,
  DEFAULT_DAMAGE_STATS,
  ampEfficiency,
  ampMultiplier,
  calculateDamage,
  compareStatGains,
  critRateFromStat,
  critStatForRate,
  efficiencyTable,
} from './damage-engine';

const model = DEFAULT_DAMAGE_MODEL;
const stats = { ...DEFAULT_DAMAGE_STATS, damageAmp: 0, targetResistance: 0, critRate: 0, critDamageBonus: 0 };

describe('damage engine', () => {
  it('sums amp sources into one group so any source is worth the same', () => {
    const a = calculateDamage({ ...stats, damageAmp: 10 }, model).normalHit;
    const b = calculateDamage({ ...stats, damageAmp: 10 + 5 }, model).normalHit;
    expect(b / a).toBeCloseTo(1.15 / 1.1);
    expect(ampMultiplier(27, 65.5)).toBeCloseTo(0.615);
  });

  it('reproduces the efficiency table (net amp -> value of +1% amp)', () => {
    expect(ampEfficiency(0)).toBe(1);
    expect(ampEfficiency(-20)).toBeCloseTo(1.25);
    expect(ampEfficiency(-70)).toBeCloseTo(3.33, 2);
    expect(ampEfficiency(35)).toBeCloseTo(0.74, 2);
    expect(efficiencyTable()).toHaveLength(10);
  });

  it('uses the skill coefficient and the flat part from penetration/defense', () => {
    expect(calculateDamage(stats, model).normalHit).toBeCloseTo(2250);
    expect(calculateDamage({ ...stats, penetration: 500 }, model).normalHit).toBeCloseTo(2300);
    expect(calculateDamage({ ...stats, targetDefense: 500 }, model).normalHit).toBeCloseTo(2200);
  });

  it('applies critical damage additively and smite as a doubling', () => {
    const r = calculateDamage({ ...stats, critRate: 100, critDamageBonus: 20 }, model);
    expect(r.critHit / r.normalHit).toBeCloseTo(1.7);
    const s = calculateDamage({ ...stats, smiteChance: 100 }, model);
    expect(s.expectedHit / s.normalHit).toBeCloseTo(2);
  });

  it('adds multi-hit bonus and independent multipliers', () => {
    const plain = calculateDamage(stats, model).normalHit;
    expect(calculateDamage({ ...stats, multiHits: 4 }, model).normalHit / plain).toBeCloseTo(1.2);
    expect(calculateDamage({ ...stats, backAttack: 3.1 }, model).normalHit / plain).toBeCloseTo(1.031);
    expect(calculateDamage({ ...stats, elementalReduction: 30 }, model).normalHit / plain).toBeCloseTo(1.3);
  });

  it('ranks stat upgrades by expected gain', () => {
    const gains = compareStatGains(DEFAULT_DAMAGE_STATS, model, { attack: 500, damageAmp: 5, backAttack: 5, elementalReduction: 5, critRate: 5, critDamageBonus: 10, penetration: 100 });
    expect(gains.every((g) => g.gainPercent > 0)).toBe(true);
    expect(gains.find((g) => g.stat === 'attack')!.gainPercent).toBeGreaterThan(9);
  });

  it('interpolates the crit curve and rejects values outside the measured range', () => {
    expect(critRateFromStat(1179)).toBe(75);
    expect(critRateFromStat(1160)).toBeGreaterThan(70);
    expect(critRateFromStat(900)).toBeNull();
    expect(critStatForRate(60)).toBeCloseTo(1074);
    expect(critStatForRate(99)).toBeNull();
  });
});
