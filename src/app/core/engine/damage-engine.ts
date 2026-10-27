/**
 * Generic, editable damage model. The formulas are NOT verified against the game:
 * every constant is user-adjustable and the defaults are placeholders.
 */
export interface DamageModel {
  /** Defense constant K in mitigation = def / (def + K). */
  defenseConstant: number;
  /** Maximum critical rate (%) the model allows. */
  critRateCap: number;
}

export interface DamageStats {
  attack: number;
  skillMultiplier: number;
  flatDamage: number;
  /** Extra damage multiplier in %, e.g. 20 = +20%. */
  damageBonus: number;
  critRate: number;
  /** Critical damage in %, e.g. 150 = crits deal 150% of normal damage. */
  critDamage: number;
  targetDefense: number;
  /** Defense penetration in %. */
  penetration: number;
}

export const DEFAULT_DAMAGE_MODEL: DamageModel = { defenseConstant: 1000, critRateCap: 100 };

export const DEFAULT_DAMAGE_STATS: DamageStats = {
  attack: 1000,
  skillMultiplier: 1,
  flatDamage: 0,
  damageBonus: 0,
  critRate: 20,
  critDamage: 150,
  targetDefense: 1000,
  penetration: 0,
};

export interface DamageResult {
  mitigation: number;
  unmitigated: number;
  normalHit: number;
  critHit: number;
  expectedHit: number;
  effectiveCritRate: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function mitigation(defense: number, penetration: number, model: DamageModel): number {
  const def = nonNeg(defense) * (1 - clamp(penetration, 0, 100) / 100);
  const k = nonNeg(model.defenseConstant);
  return def + k > 0 ? def / (def + k) : 0;
}

export function calculateDamage(stats: DamageStats, model: DamageModel): DamageResult {
  const m = mitigation(stats.targetDefense, stats.penetration, model);
  const unmitigated = (nonNeg(stats.attack) * nonNeg(stats.skillMultiplier) + nonNeg(stats.flatDamage)) * (1 + Math.max(-100, stats.damageBonus) / 100);
  const normalHit = unmitigated * (1 - m);
  const critHit = normalHit * (nonNeg(stats.critDamage) / 100);
  const effectiveCritRate = clamp(stats.critRate, 0, clamp(model.critRateCap, 0, 100));
  const p = effectiveCritRate / 100;
  return { mitigation: m, unmitigated, normalHit, critHit, expectedHit: normalHit * (1 - p) + critHit * p, effectiveCritRate };
}

export type StatKey = 'attack' | 'damageBonus' | 'critRate' | 'critDamage' | 'penetration';

export interface StatGain {
  stat: StatKey;
  amount: number;
  expectedHit: number;
  gainPercent: number;
}

/** Expected-damage gain from adding `amount` to each stat, to compare upgrades. */
export function compareStatGains(stats: DamageStats, model: DamageModel, amounts: Record<StatKey, number>): StatGain[] {
  const base = calculateDamage(stats, model).expectedHit;
  return (Object.keys(amounts) as StatKey[]).map((stat) => {
    const expectedHit = calculateDamage({ ...stats, [stat]: stats[stat] + amounts[stat] }, model).expectedHit;
    return { stat, amount: amounts[stat], expectedHit, gainPercent: base > 0 ? (expectedHit / base - 1) * 100 : 0 };
  });
}

/**
 * Calibrates the defense constant K from one observed non-critical hit:
 * the ratio observed / unmitigated gives the mitigation, then K = def * (1 - m) / m.
 * Returns null when the observation cannot be explained by the model.
 */
export function calibrateDefenseConstant(stats: DamageStats, observedHit: number): number | null {
  const unmitigated = (nonNeg(stats.attack) * nonNeg(stats.skillMultiplier) + nonNeg(stats.flatDamage)) * (1 + Math.max(-100, stats.damageBonus) / 100);
  const def = nonNeg(stats.targetDefense) * (1 - clamp(stats.penetration, 0, 100) / 100);
  if (!(unmitigated > 0) || !(observedHit > 0) || !(def > 0) || observedHit >= unmitigated) return null;
  const m = 1 - observedHit / unmitigated;
  return (def * (1 - m)) / m;
}
