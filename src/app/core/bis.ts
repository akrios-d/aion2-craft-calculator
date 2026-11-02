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
}

export interface BisList {
  /** Lower-case class name; one list per class. */
  className: string;
  entries: BisEntry[];
  updatedAt: string;
}

export type BisStatus = 'match' | 'mismatch' | 'missing';

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

export function normalizeBisEntry(raw: unknown): BisEntry | null {
  if (!isObj(raw)) return null;
  const slot = txt(raw['slot']);
  const itemName = txt(raw['itemName'] ?? raw['name'] ?? raw['item']);
  if (!slot || !itemName) return null;
  const id = Number(raw['armoryId'] ?? raw['id']);
  const entry: BisEntry = { slot, itemName };
  if (Number.isFinite(id) && id > 0) entry.armoryId = id;
  if (txt(raw['itemId'])) entry.itemId = txt(raw['itemId']);
  if (txt(raw['notes'])) entry.notes = txt(raw['notes']);
  return entry;
}

export function normalizeBisList(raw: unknown): BisList | null {
  if (!isObj(raw)) return null;
  const className = norm(txt(raw['className'] ?? raw['class']));
  if (!className || !Array.isArray(raw['entries'])) return null;
  const bySlot = new Map<string, BisEntry>();
  for (const e of raw['entries']) {
    const n = normalizeBisEntry(e);
    if (n) bySlot.set(norm(n.slot), n);
  }
  const t = txt(raw['updatedAt']);
  return { className, entries: [...bySlot.values()], updatedAt: t && !isNaN(Date.parse(t)) ? new Date(t).toISOString() : new Date(0).toISOString() };
}

export function normalizeBisLists(raw: unknown): BisList[] {
  const map = new Map<string, BisList>();
  for (const r of Array.isArray(raw) ? raw : []) {
    const l = normalizeBisList(r);
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
    const same = equipped.find((e) => norm(e.slotName) === norm(entry.slot));
    if (same && itemMatches(entry, same)) return { entry, status: 'match', equipped: same };
    const group = slotGroup(entry.slot);
    const other = equipped.find((e) => slotGroup(e.slotName) === group && itemMatches(entry, e));
    if (other) return { entry, status: 'match', equipped: other };
    return { entry, status: same ? 'mismatch' : 'missing', equipped: same };
  });
  const missing = rows.filter((r) => r.status !== 'match');
  return { rows, matched: rows.length - missing.length, total: rows.length, missing };
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

/** CSV columns: class, slot, item, id (optional), notes (optional). */
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
  if (ci < 0 || si < 0 || ni < 0) {
    out.errors.push('Header must contain class, slot and item columns.');
    return out;
  }
  const lists = new Map<string, Map<string, BisEntry>>();
  rows.slice(1).forEach((r, k) => {
    const line = lines[k + 1] ?? k + 2;
    const cls = norm(r[ci] ?? '');
    const entry = normalizeBisEntry({ slot: r[si], itemName: r[ni], armoryId: ii >= 0 ? r[ii] : undefined, notes: oi >= 0 ? r[oi] : undefined });
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
