/** User-defined BiS lists and their comparison with an armory snapshot. No BiS data is shipped with the app. */
import { ArmoryItem, ArmorySnapshot } from './armory';
import { parseCsv } from './io/csv';

export interface BisEntry {
  /** Armory slot name, e.g. `MainHand`, `Ring1`, `Arcana3`. */
  slot: string;
  itemName: string;
  /** Armory item id, when known; preferred over the name when matching. */
  armoryId?: number;
  /** Catalogue item id, to feed the craft calculator. */
  itemId?: string;
  notes?: string;
  /** Desired stats for this slot (names as shown by the armory); max is the ideal value. */
  stats?: { name: string; max?: number }[];
}

export interface BisList {
  /** Lower-case class name; one list per class. */
  className: string;
  entries: BisEntry[];
  updatedAt: string;
}

export type BisStatus = 'match' | 'mismatch' | 'missing' | 'unset';

export interface BisRow {
  entry: BisEntry;
  status: BisStatus;
  equipped?: ArmoryItem;
}

export interface BisComparison {
  rows: BisRow[];
  matched: number;
  total: number;
  /** Rows that are not matched (mismatch or empty slot). */
  missing: BisRow[];
}

export interface BisImportResult {
  lists: BisList[];
  errors: string[];
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const txt = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const norm = (s: string) => s.trim().toLowerCase();
export const slotGroup = (slot: string) => norm(slot).replace(/\d+$/, '');

export const BIS_SLOTS = ['MainHand', 'SubHand', 'Helmet', 'Shoulder', 'Torso', 'Pants', 'Gloves', 'Boots', 'Cape', 'Necklace', 'Earring1', 'Earring2', 'Ring1', 'Ring2', 'Bracelet1', 'Bracelet2', 'Belt', 'Amulet', 'Rune1', 'Rune2', 'Arcana1', 'Arcana2', 'Arcana3', 'Arcana4', 'Arcana5'];

/** A starter list: every slot pre-listed with an empty item for the user to fill in. */
export function starterBisList(className: string, now = new Date()): BisList {
  return { className: norm(className), entries: BIS_SLOTS.map((slot) => ({ slot, itemName: '' })), updatedAt: now.toISOString() };
}

export function normalizeBisEntry(raw: unknown, allowEmpty = false): BisEntry | null {
  if (!isObj(raw)) return null;
  const slot = txt(raw['slot']);
  const itemName = txt(raw['itemName'] ?? raw['name'] ?? raw['item']);
  if (!slot || (!itemName && !allowEmpty)) return null;
  const id = Number(raw['armoryId'] ?? raw['id']);
  const entry: BisEntry = { slot, itemName };
  if (Number.isFinite(id) && id > 0) entry.armoryId = id;
  if (txt(raw['itemId'])) entry.itemId = txt(raw['itemId']);
  if (txt(raw['notes'])) entry.notes = txt(raw['notes']);
  const stats = (Array.isArray(raw['stats']) ? raw['stats'] : []).flatMap((s: unknown) => {
    const o = isObj(s) ? s : { name: s };
    const name = txt(o['name']);
    const max = Number(o['max']);
    return name ? [Number.isFinite(max) && o['max'] !== undefined && o['max'] !== '' ? { name, max } : { name }] : [];
  });
  if (stats.length) entry.stats = stats;
  return entry;
}

export function normalizeBisList(raw: unknown, allowEmpty = false): BisList | null {
  if (!isObj(raw)) return null;
  const className = norm(txt(raw['className'] ?? raw['class']));
  if (!className || !Array.isArray(raw['entries'])) return null;
  const bySlot = new Map<string, BisEntry>();
  for (const e of raw['entries']) {
    const n = normalizeBisEntry(e, allowEmpty);
    if (n) bySlot.set(norm(n.slot), n);
  }
  const t = txt(raw['updatedAt']);
  return { className, entries: [...bySlot.values()], updatedAt: t && !isNaN(Date.parse(t)) ? new Date(t).toISOString() : new Date(0).toISOString() };
}

export function normalizeBisLists(raw: unknown): BisList[] {
  const map = new Map<string, BisList>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const l = normalizeBisList(r, true);
    if (l) map.set(l.className, l);
  }
  return [...map.values()];
}

function itemMatches(entry: BisEntry, eq: ArmoryItem): boolean {
  if (entry.armoryId && eq.id) return entry.armoryId === eq.id;
  return norm(entry.itemName) === norm(eq.name);
}

/** Compares equipped gear + arcana against one BiS list. Paired slots (rings, arcana…) match in any slot of the group. */
export function compareBis(list: BisList, snap: ArmorySnapshot): BisComparison {
  const equipped = [...snap.gear, ...snap.arcana];
  const rows: BisRow[] = list.entries.map((entry) => {
    if (!entry.itemName) return { entry, status: 'unset', equipped: equipped.find((e) => norm(e.slotName) === norm(entry.slot)) };
    const same = equipped.find((e) => norm(e.slotName) === norm(entry.slot));
    if (same && itemMatches(entry, same)) return { entry, status: 'match', equipped: same };
    const group = slotGroup(entry.slot);
    const other = equipped.find((e) => slotGroup(e.slotName) === group && itemMatches(entry, e));
    if (other) return { entry, status: 'match', equipped: other };
    return { entry, status: same ? 'mismatch' : 'missing', equipped: same };
  });
  const set = rows.filter((r) => r.status !== 'unset');
  const missing = set.filter((r) => r.status !== 'match');
  return { rows, matched: set.length - missing.length, total: set.length, missing };
}

export function parseBisJson(text: string): BisImportResult {
  const out: BisImportResult = { lists: [], errors: [], warnings: [] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    out.errors.push('The text is not valid JSON.');
    return out;
  }
  const raws = Array.isArray(json) ? json : isObj(json) && Array.isArray(json['lists']) ? json['lists'] : [json];
  const seen = new Set<string>();
  raws.forEach((r, i) => {
    const l = normalizeBisList(r);
    if (!l) return void out.errors.push(`List ${i + 1}: needs "className" and an "entries" array.`);
    if (seen.has(l.className)) return void out.errors.push(`List ${i + 1}: duplicate class "${l.className}".`);
    seen.add(l.className);
    const rawCount = isObj(r) && Array.isArray(r['entries']) ? r['entries'].length : 0;
    if (l.entries.length < rawCount) out.warnings.push(`${l.className}: ${rawCount - l.entries.length} entries skipped (missing slot/item, or duplicate slot).`);
    if (!l.entries.length) out.errors.push(`${l.className}: no valid entries.`);
    else out.lists.push(l);
  });
  return out;
}

/** Stats cell: Name:max;Name2 (max optional). */
export function parseStatCell(cell?: string): { name: string; max?: number }[] {
  return (cell ?? '').split(';').flatMap((p) => {
    const [n, m] = p.split(':');
    return n?.trim() ? [{ name: n.trim(), max: m?.trim() ? Number(m) : undefined }] : [];
  });
}

/** CSV columns: class, slot, item, id, notes, stats (the last three optional). */
export function parseBisCsv(text: string): BisImportResult {
  const out: BisImportResult = { lists: [], errors: [], warnings: [] };
  const { rows, lines, error } = parseCsv(text);
  if (error) {
    out.errors.push(error);
    return out;
  }
  if (!rows.length) {
    out.errors.push('The CSV is empty.');
    return out;
  }
  const head = rows[0].map((h) => norm(h));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ci = col('class', 'classname');
  const si = col('slot');
  const ni = col('item', 'itemname', 'name');
  const ii = col('id', 'armoryid');
  const oi = col('notes', 'note');
  const ti = col('stats');
  if (ci < 0 || si < 0 || ni < 0) {
    out.errors.push('Header must contain class, slot and item columns.');
    return out;
  }
  const lists = new Map<string, Map<string, BisEntry>>();
  rows.slice(1).forEach((r, k) => {
    const line = lines[k + 1] ?? k + 2;
    const cls = norm(r[ci] ?? '');
    const entry = normalizeBisEntry({ slot: r[si], itemName: r[ni], armoryId: ii >= 0 ? r[ii] : undefined, notes: oi >= 0 ? r[oi] : undefined, stats: ti >= 0 ? parseStatCell(r[ti]) : undefined });
    if (!cls || !entry) return void out.errors.push(`Line ${line}: class, slot and item are required.`);
    const m = lists.get(cls) ?? new Map<string, BisEntry>();
    if (m.has(norm(entry.slot))) return void out.errors.push(`Line ${line}: duplicate slot "${entry.slot}" for ${cls}.`);
    m.set(norm(entry.slot), entry);
    lists.set(cls, m);
  });
  const now = new Date().toISOString();
  for (const [className, m] of lists) out.lists.push({ className, entries: [...m.values()], updatedAt: now });
  return out;
}

/** Merge keeps existing slots not present in the import; replace swaps whole lists for the imported classes. */
export function applyBisImport(existing: BisList[], imported: BisList[], mode: 'merge' | 'replace'): BisList[] {
  const map = new Map(existing.map((l) => [l.className, l]));
  for (const l of imported) {
    const cur = map.get(l.className);
    if (mode === 'merge' && cur) {
      const bySlot = new Map(cur.entries.map((e) => [norm(e.slot), e]));
      for (const e of l.entries) bySlot.set(norm(e.slot), e);
      map.set(l.className, { className: l.className, entries: [...bySlot.values()], updatedAt: l.updatedAt });
    } else map.set(l.className, l);
  }
  return [...map.values()];
}

// ---- Scoring: our own heuristic, not kisk's or NCSOFT's. ----
export const GRADE_RANK: Record<string, number> = { common: 1, rare: 2, unique: 3, legend: 4, epic: 4, heroic: 5 };
export const MAX_GRADE_RANK = 4;
export const ENCHANT_CAP = 15;
export const EXCEED_CAP = 5;
export const WEIGHTS = { grade: 0.3, enchant: 0.25, exceed: 0.15, stats: 0.3, bis: 0.3 };
export const UNSCORED_SLOTS = ['belt', 'amulet', 'rune'];
export type Letter = 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';

export function letterGrade(score: number): Letter {
  return score >= 95 ? 'S+' : score >= 88 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
}

export const isScoredSlot = (slotName: string) => !UNSCORED_SLOTS.includes(slotGroup(slotName));

export interface StatCheck {
  name: string;
  max?: number;
  have: boolean;
  current?: number;
}

export interface ItemScore {
  score: number;
  letter: Letter;
  statChecks: StatCheck[];
}

/** Weighted mean (0-100) of the components that can be evaluated for this item. */
export function scoreItem(item: ArmoryItem, entry?: BisEntry): ItemScore {
  const parts: [number, number][] = [];
  const rank = GRADE_RANK[norm(item.grade)];
  if (rank) parts.push([Math.min(rank / MAX_GRADE_RANK, 1), WEIGHTS.grade]);
  parts.push([Math.min(item.enchant / ENCHANT_CAP, 1), WEIGHTS.enchant]);
  parts.push([Math.min(item.exceed / EXCEED_CAP, 1), WEIGHTS.exceed]);
  const statChecks: StatCheck[] = (entry?.stats ?? []).map((s) => {
    const cur = item.stats?.find((x) => norm(x.name) === norm(s.name));
    return { name: s.name, max: s.max, have: !!cur, current: cur?.value };
  });
  if (item.stats && statChecks.length) {
    const f = statChecks.reduce((a, c) => a + (c.have ? (c.max && c.current !== undefined ? Math.min(c.current / c.max, 1) : 1) : 0), 0) / statChecks.length;
    parts.push([f, WEIGHTS.stats]);
  }
  if (entry) parts.push([itemMatches(entry, item) ? 1 : 0, WEIGHTS.bis]);
  const w = parts.reduce((a, p) => a + p[1], 0);
  const score = Math.round((100 * parts.reduce((a, p) => a + p[0] * p[1], 0)) / w);
  return { score, letter: letterGrade(score), statChecks };
}

/** Overall grade: mean score of equipped, scored slots (belt, amulet and runes are shown but not scored). */
export function overallGrade(rows: { item?: ArmoryItem; score?: ItemScore }[]): { score: number; letter: Letter } | null {
  const s = rows.filter((r) => r.item && r.score && isScoredSlot(r.item.slotName)).map((r) => r.score!.score);
  if (!s.length) return null;
  const score = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  return { score, letter: letterGrade(score) };
}
