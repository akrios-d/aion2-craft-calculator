import { describe, expect, it } from 'vitest';
import { DEFAULT_DAMAGE_MODEL, DEFAULT_DAMAGE_STATS, calculateDamage, calibrateDefenseConstant, compareStatGains, mitigation } from './damage-engine';

const model = { defenseConstant: 1000, critRateCap: 100 };

describe('damage engine', () => {
  it('computes mitigation and penetration', () => {
    expect(mitigation(1000, 0, model)).toBeCloseTo(0.5);
    expect(mitigation(1000, 50, model)).toBeCloseTo(500 / 1500);
    expect(mitigation(0, 0, model)).toBe(0);
  });

  it('computes normal, crit and expected hits', () => {
    const r = calculateDamage({ ...DEFAULT_DAMAGE_STATS, critRate: 50, critDamage: 200 }, model);
    expect(r.normalHit).toBeCloseTo(500);
    expect(r.critHit).toBeCloseTo(1000);
    expect(r.expectedHit).toBeCloseTo(750);
  });

  it('caps crit rate and ignores negative inputs', () => {
    const r = calculateDamage({ ...DEFAULT_DAMAGE_STATS, critRate: 150 }, { ...model, critRateCap: 60 });
    expect(r.effectiveCritRate).toBe(60);
    expect(calculateDamage({ ...DEFAULT_DAMAGE_STATS, attack: -5 }, model).normalHit).toBe(0);
  });

  it('ranks stat upgrades by expected gain', () => {
    const gains = compareStatGains(DEFAULT_DAMAGE_STATS, DEFAULT_DAMAGE_MODEL, { attack: 100, damageBonus: 10, critRate: 10, critDamage: 10, penetration: 10 });
    expect(gains.find((g) => g.stat === 'attack')!.gainPercent).toBeCloseTo(10);
    expect(gains.find((g) => g.stat === 'damageBonus')!.gainPercent).toBeCloseTo(10);
    expect(gains.every((g) => g.gainPercent > 0)).toBe(true);
  });

  it('calibrates the defense constant from an observed hit', () => {
    const k = calibrateDefenseConstant({ ...DEFAULT_DAMAGE_STATS, targetDefense: 2000 }, 250);
    expect(k).not.toBeNull();
    const r = calculateDamage({ ...DEFAULT_DAMAGE_STATS, targetDefense: 2000 }, { defenseConstant: k!, critRateCap: 100 });
    expect(r.normalHit).toBeCloseTo(250);
  });

  it('rejects impossible calibration observations', () => {
    expect(calibrateDefenseConstant(DEFAULT_DAMAGE_STATS, 5000)).toBeNull();
    expect(calibrateDefenseConstant(DEFAULT_DAMAGE_STATS, 0)).toBeNull();
  });
});
