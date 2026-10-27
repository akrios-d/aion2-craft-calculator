/**
 * Damage model built from community-reported findings (training-dummy tests discussed on DCInside and
 * summarised at github.com/sunkwolf/aion2-damage-research). The mechanics are NOT verified by us and
 * may be outdated; the constants are editable and nothing is copied from that project's text or code.
 */
export interface DamageModel {
  /** Share of Attack Power used by a skill (community: 45%). */
  skillCoefficient: number;
  /** Penetration/defense contribute (value / divisor) flat damage per hit (community: 10). */
  flatDivisor: number;
  /** Base critical damage in % (community: 150). */
  baseCritDamage: number;
  /** Damage added by each extra multi-hit proc, in % of the hit (community: 5). */
  multiHitBonusPerHit: number;
  /** Damage multiplier when Smite triggers (community: 2). */
  smiteMultiplier: number;
}

export interface DamageStats {
  attack: number;
  /** Fixed bonus from skill level, added to the skill damage. */
  skillLevelBonus: number;
  /** Damage Amp, PVE Amp, Boss Amp and Racial Amp share one additive group (%). */
  damageAmp: number;
  /** Target damage resistance (%), subtracted from the amp group. */
  targetResistance: number;
  /** Independent multiplicative bonuses (%). */
  backAttack: number;
  /** Reduction of the target's elemental resistance (%) = extra elemental damage. */
  elementalReduction: number;
  critRate: number;
  /** Extra critical damage in % on top of the base. */
  critDamageBonus: number;
  smiteChance: number;
  /** Expected extra multi-hit procs per hit (0 to 4). */
  multiHits: number;
  penetration: number;
  targetDefense: number;
}

export const DEFAULT_DAMAGE_MODEL: DamageModel = {
  skillCoefficient: 45,
  flatDivisor: 10,
  baseCritDamage: 150,
  multiHitBonusPerHit: 5,
  smiteMultiplier: 2,
};

export const DEFAULT_DAMAGE_STATS: DamageStats = {
  attack: 5000,
  skillLevelBonus: 0,
  damageAmp: 30,
  targetResistance: 30,
  backAttack: 0,
  elementalReduction: 0,
  critRate: 50,
  critDamageBonus: 20,
  smiteChance: 0,
  multiHits: 0,
  penetration: 0,
  targetDefense: 0,
};

export interface DamageResult {
  base: number;
  ampMultiplier: number;
  allMultipliers: number;
  flatPart: number;
  normalHit: number;
  critHit: number;
  expectedHit: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/** Multiplier of the shared amp group: 1 + (total amp - target resistance). */
export function ampMultiplier(damageAmp: number, targetResistance: number): number {
  return Math.max(0, 1 + (damageAmp - targetResistance) / 100);
}

/**
 * How much a new +1% amp is worth relative to its face value, given the current net amp
 * (total amp - resistance): 1 / (1 + net). Above 1 means the stat is worth more than it says.
 */
export function ampEfficiency(netAmpPercent: number): number {
  const m = 1 + netAmpPercent / 100;
  return m > 0 ? 1 / m : 0;
}

export function calculateDamage(stats: DamageStats, model: DamageModel): DamageResult {
  const base = nonNeg(stats.attack) * (nonNeg(model.skillCoefficient) / 100) + nonNeg(stats.skillLevelBonus);
  const amp = ampMultiplier(stats.damageAmp, stats.targetResistance);
  const allMultipliers =
    amp * (1 + nonNeg(stats.backAttack) / 100) * (1 + nonNeg(stats.elementalReduction) / 100) * (1 + (clamp(stats.multiHits, 0, 4) * nonNeg(model.multiHitBonusPerHit)) / 100);
  const divisor = nonNeg(model.flatDivisor) || 1;
  const flatPart = (nonNeg(stats.penetration) - nonNeg(stats.targetDefense)) / divisor;
  const normalHit = Math.max(0, base + flatPart) * allMultipliers;
  const critHit = normalHit * ((nonNeg(model.baseCritDamage) + nonNeg(stats.critDamageBonus)) / 100);
  const p = clamp(stats.critRate, 0, 100) / 100;
  const smite = clamp(stats.smiteChance, 0, 100) / 100;
  const smiteFactor = 1 + smite * (nonNeg(model.smiteMultiplier) - 1);
  return { base, ampMultiplier: amp, allMultipliers, flatPart, normalHit, critHit, expectedHit: (normalHit * (1 - p) + critHit * p) * smiteFactor };
}

export type StatKey = 'attack' | 'damageAmp' | 'backAttack' | 'elementalReduction' | 'critRate' | 'critDamageBonus' | 'penetration';

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

/** Community-measured crit stat to real crit rate points (training dummy; boss crit resistance may shift them). */
export const CRIT_CURVE: { stat: number; rate: number }[] = [
  { stat: 1010, rate: 50 },
  { stat: 1048, rate: 56 },
  { stat: 1074, rate: 60 },
  { stat: 1142, rate: 70 },
  { stat: 1179, rate: 75 },
  { stat: 1221, rate: 80 },
  { stat: 1326, rate: 90 },
];

/** Linear interpolation over the measured points; null outside the measured range. */
export function critRateFromStat(stat: number): number | null {
  if (!Number.isFinite(stat) || stat < CRIT_CURVE[0].stat || stat > CRIT_CURVE[CRIT_CURVE.length - 1].stat) return null;
  for (let i = 1; i < CRIT_CURVE.length; i++) {
    const a = CRIT_CURVE[i - 1];
    const b = CRIT_CURVE[i];
    if (stat <= b.stat) return a.rate + ((stat - a.stat) / (b.stat - a.stat)) * (b.rate - a.rate);
  }
  return null;
}

/** Crit stat needed for a target rate; null outside the measured range. */
export function critStatForRate(rate: number): number | null {
  if (!Number.isFinite(rate) || rate < CRIT_CURVE[0].rate || rate > CRIT_CURVE[CRIT_CURVE.length - 1].rate) return null;
  for (let i = 1; i < CRIT_CURVE.length; i++) {
    const a = CRIT_CURVE[i - 1];
    const b = CRIT_CURVE[i];
    if (rate <= b.rate) return a.stat + ((rate - a.rate) / (b.rate - a.rate)) * (b.stat - a.stat);
  }
  return null;
}

/** Rows for the efficiency indicator: value of +1% amp at several net-amp levels. */
export function efficiencyTable(netLevels: number[] = [-70, -40, -30, -20, -10, 0, 10, 20, 35, 50]): { net: number; efficiency: number }[] {
  return netLevels.map((net) => ({ net, efficiency: ampEfficiency(net) }));
}
