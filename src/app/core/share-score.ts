/**
 * Share-based gear score following the method publicly described at https://kisk.app/scoring.
 * The app ships NO share data: tables are imported by the user (JSON/CSV), per class and slot.
 *
 *   line value  = share x (roll / largest roll)          (roll capped at the largest roll)
 *   piece score = sum(line values) / sum(share of every table line)   -> 0..100 %
 *
 * Lines that are not in the table count as 0. Nothing is projected for not fully bound lines.
 */
import { ArmoryItem } from './armory';

export const SHARE_SLOTS = ['weapon', 'guard', 'torso', 'pants', 'helmet', 'shoulders', 'gloves', 'boots', 'cape', 'necklace', 'earrings', 'rings', 'bracelet', 'arcana'] as const;
export type ShareSlot = (typeof SHARE_SLOTS)[number];

export const CLASSES = ['gladiator', 'templar', 'assassin', 'ranger', 'sorcerer', 'spiritmaster', 'cleric', 'chanter', 'fighter'];

export interface ShareLine {
  stat: string;
  /** 0-100: % of top players carrying this line on this slot. */
  share: number;
  /** Largest roll of this line on this slot; when missing the observed maximum is used and the score is approximate. */
  maxRoll?: number;
}

export interface BandDef {
  letter: string;
  /** Lower bound in percent (inclusive). */
  min: number;
}

export interface ShareTable {
  className: string;
  slots: Partial<Record<ShareSlot, ShareLine[]>>;
  /** Optional override of the letter bands. */
  bands?: BandDef[];
  updatedAt: string;
}

export const DEFAULT_BANDS: BandDef[] = [
  { letter: 'D', min: 0 },
  { letter: 'C', min: 5 },
  { letter: 'B', min: 12 },
  { letter: 'A', min: 22 },
  { letter: 'S', min: 35 },
  { letter: 'S+', min: 55 },
  { letter: 'BiS', min: 90 },
];

const SLOT_ALIASES: Record<string, ShareSlot> = {
  weapon: 'weapon', mainhand: 'weapon', guard: 'guard', offhand: 'guard', subhand: 'guard', torso: 'torso', chest: 'torso', pants: 'pants', legs: 'pants',
  helmet: 'helmet', helm: 'helmet', head: 'helmet', shoulders: 'shoulders', shoulder: 'shoulders', gloves: 'gloves', boots: 'boots', cape: 'cape', cloak: 'cape',
  necklace: 'necklace', earrings: 'earrings', earring: 'earrings', rings: 'rings', ring: 'rings', bracelet: 'bracelet', bracelets: 'bracelet', arcana: 'arcana',
};

/** Maps a slot name (armory `Ring1`, table `rings`, ...) to a score slot; null for unscored slots (belt, amulet, runes). */
export function shareSlotOf(name: string): ShareSlot | null {
  const k = name.trim().toLowerCase().replace(/\d+$/, '').replace(/[\s_-]/g, '');
  return SLOT_ALIASES[k] ?? null;
}

const norm = (s: string) => s.trim().toLowerCase();
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeBands(raw: unknown): BandDef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const b = raw.flatMap((x) => (isObj(x) && typeof x['letter'] === 'string' && x['letter'].trim() && Number.isFinite(Number(x['min'])) ? [{ letter: x['letter'].trim(), min: Number(x['min']) }] : []));
  const sorted = b.sort((a, c) => a.min - c.min);
  return sorted.length && sorted[0].min <= 0 ? sorted : undefined;
}

export function letterFor(percent: number, bands: BandDef[] = DEFAULT_BANDS): string {
  let letter = bands[0].letter;
  for (const b of bands) if (percent >= b.min) letter = b.letter;
  return letter;
}

function normalizeLines(raw: unknown): ShareLine[] {
  const seen = new Set<string>();
  const out: ShareLine[] = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    const stat = isObj(l) && typeof l['stat'] === 'string' ? l['stat'].trim() : '';
    const share = isObj(l) ? Number(l['share']) : NaN;
    if (!stat || !Number.isFinite(share) || share < 0 || share > 100 || seen.has(norm(stat))) continue;
    seen.add(norm(stat));
    const max = isObj(l) && l['maxRoll'] !== undefined && l['maxRoll'] !== '' ? Number(l['maxRoll']) : NaN;
    out.push(Number.isFinite(max) && max > 0 ? { stat, share, maxRoll: max } : { stat, share });
  }
  return out;
}

export function normalizeShareTable(raw: unknown): ShareTable | null {
  if (!isObj(raw) || typeof raw['className'] !== 'string' || !isObj(raw['slots'])) return null;
  const className = norm(raw['className']);
  if (!className) return null;
  const slots: ShareTable['slots'] = {};
  for (const [k, v] of Object.entries(raw['slots'])) {
    const slot = shareSlotOf(k);
    const lines = normalizeLines(v);
    if (slot && lines.length) slots[slot] = lines;
  }
  if (!Object.keys(slots).length) return null;
  const t = typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : '';
  const table: ShareTable = { className, slots, updatedAt: t && !isNaN(Date.parse(t)) ? new Date(t).toISOString() : new Date(0).toISOString() };
  const bands = normalizeBands(raw['bands']);
  if (bands) table.bands = bands;
  return table;
}

export function normalizeShareTables(raw: unknown): ShareTable[] {
  const m = new Map<string, ShareTable>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const t = normalizeShareTable(r);
    if (t) m.set(t.className, t);
  }
  return [...m.values()];
}

export interface ShareImportResult {
  tables: ShareTable[];
  errors: string[];
  warnings: string[];
}

export function parseShareJson(text: string): ShareImportResult {
  const out: ShareImportResult = { tables: [], errors: [], warnings: [] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    out.errors.push('The text is not valid JSON.');
    return out;
  }
  const raws = Array.isArray(json) ? json : isObj(json) && Array.isArray(json['tables']) ? json['tables'] : [json];
  const seen = new Set<string>();
  raws.forEach((r, i) => {
    const t = normalizeShareTable(r);
    if (!t) return void out.errors.push(`Table ${i + 1}: needs "className" and "slots" with at least one valid line (stat + share 0-100).`);
    if (seen.has(t.className)) return void out.errors.push(`Table ${i + 1}: duplicate class "${t.className}".`);
    seen.add(t.className);
    const rawLines = isObj(r) && isObj(r['slots']) ? Object.values(r['slots']).reduce((a: number, l) => a + (Array.isArray(l) ? l.length : 0), 0) : 0;
    const kept = Object.values(t.slots).reduce((a, l) => a + (l?.length ?? 0), 0);
    if (kept < rawLines) out.warnings.push(`${t.className}: ${rawLines - kept} lines skipped (invalid share, missing stat, duplicate or unknown slot).`);
    if (!CLASSES.includes(t.className)) out.warnings.push(`${t.className}: not one of the known classes.`);
    out.tables.push(t);
  });
  return out;
}

/** CSV columns: class, slot, stat, share, maxRoll (optional). */
export function parseShareCsv(text: string, parse: (t: string) => { rows: string[][]; lines: number[]; error?: string }): ShareImportResult {
  const out: ShareImportResult = { tables: [], errors: [], warnings: [] };
  const { rows, lines, error } = parse(text);
  if (error) return { ...out, errors: [error] };
  if (!rows.length) return { ...out, errors: ['The CSV is empty.'] };
  const head = rows[0].map(norm);
  const ci = head.indexOf('class');
  const si = head.indexOf('slot');
  const ti = head.indexOf('stat');
  const hi = head.indexOf('share');
  const mi = head.findIndex((h) => h === 'maxroll' || h === 'max');
  if (ci < 0 || si < 0 || ti < 0 || hi < 0) return { ...out, errors: ['Header must contain class, slot, stat and share columns.'] };
  const tables = new Map<string, Record<string, unknown[]>>();
  const keys = new Set<string>();
  rows.slice(1).forEach((r, k) => {
    const line = lines[k + 1] ?? k + 2;
    const cls = norm(r[ci] ?? '');
    const slot = shareSlotOf(r[si] ?? '');
    const stat = (r[ti] ?? '').trim();
    const share = Number((r[hi] ?? '').replace(',', '.'));
    if (!cls || !slot || !stat || !Number.isFinite(share) || share < 0 || share > 100) return void out.errors.push(`Line ${line}: needs a class, a known slot, a stat and a share between 0 and 100.`);
    const key = `${cls}|${slot}|${norm(stat)}`;
    if (keys.has(key)) return void out.errors.push(`Line ${line}: duplicate ${cls} ${slot} line "${stat}".`);
    keys.add(key);
    const t = tables.get(cls) ?? {};
    (t[slot] ??= []).push({ stat, share, maxRoll: mi >= 0 && r[mi] ? Number(r[mi].replace(',', '.')) : undefined });
    tables.set(cls, t);
  });
  const now = new Date().toISOString();
  for (const [className, slots] of tables) {
    const t = normalizeShareTable({ className, slots, updatedAt: now });
    if (t) out.tables.push(t);
  }
  return out;
}

export function applyShareImport(existing: ShareTable[], imported: ShareTable[], mode: 'merge' | 'replace'): ShareTable[] {
  const map = new Map(existing.map((t) => [t.className, t]));
  for (const t of imported) {
    const cur = map.get(t.className);
    map.set(t.className, mode === 'merge' && cur ? { ...t, slots: { ...cur.slots, ...t.slots }, bands: t.bands ?? cur.bands } : t);
  }
  return [...map.values()];
}

export const EMPTY_TEMPLATE = (className: string): ShareTable => ({ className: className.toLowerCase(), slots: {}, updatedAt: new Date(0).toISOString() });

/** Documented example with obviously fake numbers (never real data). */
export const EXAMPLE_JSON = JSON.stringify(
  [{ className: 'cleric', slots: { weapon: [{ stat: 'EXAMPLE stat A', share: 50, maxRoll: 100 }, { stat: 'EXAMPLE stat B', share: 25, maxRoll: 10 }], arcana: [{ stat: 'EXAMPLE skill', share: 40, maxRoll: 4 }] } }],
  null,
  2,
);

export interface LineScore {
  stat: string;
  share: number;
  roll?: number;
  maxRoll?: number;
  /** True if the equipped piece carries this line. */
  have: boolean;
  value: number;
}

export interface PieceScore {
  slot: ShareSlot;
  /** 0-100. */
  percent: number;
  letter: string;
  lines: LineScore[];
  /** True when at least one largest roll was missing from the table and the observed maximum was used. */
  approximate: boolean;
}

/** Largest rolls observed per `slot|stat` across the given items, used when the table does not state them. */
export function observedMaxRolls(items: ArmoryItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const slot = shareSlotOf(it.slotName);
    if (!slot) continue;
    for (const s of it.stats ?? []) {
      const k = `${slot}|${norm(s.name)}`;
      m.set(k, Math.max(m.get(k) ?? 0, s.value));
    }
  }
  return m;
}

export function scorePiece(item: ArmoryItem, table: ShareTable, observed: Map<string, number> = new Map()): PieceScore | null {
  const slot = shareSlotOf(item.slotName);
  const lines = slot ? table.slots[slot] : undefined;
  if (!slot || !lines?.length) return null;
  let approximate = false;
  let total = 0;
  let best = 0;
  const out: LineScore[] = lines.map((l) => {
    const stat = item.stats?.find((s) => norm(s.name) === norm(l.stat));
    let max = l.maxRoll;
    if (!max) {
      max = Math.max(observed.get(`${slot}|${norm(l.stat)}`) ?? 0, stat?.value ?? 0) || undefined;
      approximate = true;
    }
    const roll = stat?.value;
    const value = roll !== undefined && max ? l.share * Math.min(roll / max, 1) : 0;
    total += value;
    best += l.share;
    return { stat: l.stat, share: l.share, roll, maxRoll: max, have: roll !== undefined, value };
  });
  const percent = best > 0 ? (100 * total) / best : 0;
  return { slot, percent, letter: letterFor(percent, table.bands), lines: out, approximate };
}

/** Overall grade: mean percent of the scored pieces that have a table. */
export function overallScore(pieces: (PieceScore | null)[], bands?: BandDef[]): { percent: number; letter: string; pieces: number } | null {
  const p = pieces.filter((x): x is PieceScore => !!x);
  if (!p.length) return null;
  const percent = p.reduce((a, b) => a + b.percent, 0) / p.length;
  return { percent, letter: letterFor(percent, bands), pieces: p.length };
}
