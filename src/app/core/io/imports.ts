import { listingsOf, withListings } from '../listings';
import { InventoryEntry, Item, PriceEntry, UserData, priceKey } from '../models';
import { MAX_PRICE_HISTORY } from '../storage/schema';
import { parseCsv } from './csv';

export type ImportMode = 'merge' | 'replace';

export interface ImportIssue {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface ParsedImport<T> {
  records: T[];
  /** Source line for each record, parallel to `records`. */
  lines: number[];
  issues: ImportIssue[];
  rowCount: number;
  fatal?: string;
}

export interface ChangeRow {
  kind: 'added' | 'updated' | 'kept' | 'removed' | 'unchanged';
  label: string;
  before?: string;
  after?: string;
  note?: string;
}

export interface ApplyResult {
  data: UserData;
  changes: ChangeRow[];
}

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_ALIASES: Record<string, string> = {
  itemid: 'itemId',
  id: 'itemId',
  item: 'itemName',
  name: 'itemName',
  itemname: 'itemName',
  buyprice: 'buyPrice',
  buy: 'buyPrice',
  sellprice: 'sellListingPrice',
  sell: 'sellListingPrice',
  selllistingprice: 'sellListingPrice',
  listingprice: 'sellListingPrice',
  price: 'sellListingPrice',
  currentprice: 'sellListingPrice',
  quantityobserved: 'quantityObserved',
  observedquantity: 'quantityObserved',
  feepercent: 'feePercent',
  fee: 'feePercent',
  ahfee: 'feePercent',
  observedat: 'observedAt',
  timestamp: 'observedAt',
  date: 'observedAt',
  server: 'server',
  notes: 'notes',
  note: 'notes',
  quantity: 'quantity',
  qty: 'quantity',
  amount: 'quantity',
};

export interface ResolveContext {
  items: Item[];
  defaultServer: string;
  defaultFeePercent?: number;
  now?: Date;
}

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/[\s_]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

interface Table {
  header: Record<string, number>;
  rows: string[][];
  lines: number[];
}

function readTable(text: string, issues: ImportIssue[]): Table | string {
  if (!text.trim()) return 'The file is empty.';
  const parsed = parseCsv(text);
  if (parsed.error) return parsed.error;
  if (parsed.rows.length === 0) return 'No rows found.';
  const header: Record<string, number> = {};
  parsed.rows[0].forEach((h, idx) => {
    const key = HEADER_ALIASES[normHeader(h)];
    if (!key) {
      issues.push({ line: parsed.lines[0], severity: 'warning', message: `Unknown column "${h}" ignored.` });
    } else if (key in header) {
      issues.push({ line: parsed.lines[0], severity: 'warning', message: `Column "${h}" duplicates an earlier column and was ignored.` });
    } else header[key] = idx;
  });
  return { header, rows: parsed.rows.slice(1), lines: parsed.lines.slice(1) };
}

function resolveItemId(
  cells: { itemId?: string; itemName?: string },
  ctx: ResolveContext,
  line: number,
  issues: ImportIssue[],
): string | null {
  const id = cells.itemId?.trim();
  const name = cells.itemName?.trim();
  if (id) {
    if (!ctx.items.some((i) => i.id === id)) {
      issues.push({ line, severity: 'error', message: `Item id "${id}" is not a known game item; row skipped.` });
      return null;
    }
    return id;
  }
  if (name) {
    const matches = ctx.items.filter((i) => i.name.toLowerCase() === name.toLowerCase());
    if (matches.length === 1) return matches[0].id;
    issues.push({
      line,
      severity: 'error',
      message: matches.length > 1 ? `Item name "${name}" is ambiguous (${matches.length} matches); use the item id.` : `Item name "${name}" not found; use the item id.`,
    });
    return null;
  }
  issues.push({ line, severity: 'error', message: 'Row has neither an item id nor an item name.' });
  return null;
}

export function parsePriceCsv(text: string, ctx: ResolveContext): ParsedImport<PriceEntry> {
  const issues: ImportIssue[] = [];
  const table = readTable(text, issues);
  if (typeof table === 'string') return { records: [], lines: [], issues, rowCount: 0, fatal: table };
  if (!('itemId' in table.header) && !('itemName' in table.header)) {
    return { records: [], lines: [], issues, rowCount: table.rows.length, fatal: 'Missing required column: itemId (or itemName).' };
  }
  if (!('buyPrice' in table.header) && !('sellListingPrice' in table.header)) {
    return { records: [], lines: [], issues, rowCount: table.rows.length, fatal: 'Missing price column: buyPrice and/or sellListingPrice.' };
  }
  const now = (ctx.now ?? new Date()).toISOString();
  const records: PriceEntry[] = [];
  const lines: number[] = [];
  const seen = new Map<string, number>();
  const cell = (row: string[], key: string) => (key in table.header ? (row[table.header[key]] ?? '').trim() : '');

  table.rows.forEach((row, idx) => {
    const line = table.lines[idx];
    const itemId = resolveItemId({ itemId: cell(row, 'itemId'), itemName: cell(row, 'itemName') }, ctx, line, issues);
    const entry: Partial<PriceEntry> = {};
    let bad = itemId === null;
    for (const [col, label] of [['buyPrice', 'buy price'], ['sellListingPrice', 'sell listing price'], ['quantityObserved', 'quantity observed'], ['feePercent', 'fee percent']] as const) {
      const raw = cell(row, col);
      if (raw === '') continue;
      const n = parseNumber(raw);
      if (n === null || (col === 'feePercent' && n > 100)) {
        issues.push({ line, severity: 'error', message: `Invalid ${label}: "${raw}".` });
        bad = true;
      } else entry[col] = n;
    }
    if (entry.buyPrice === undefined && entry.sellListingPrice === undefined && !bad) {
      issues.push({ line, severity: 'error', message: 'Row has no buy price or sell listing price.' });
      bad = true;
    }
    const dateRaw = cell(row, 'observedAt');
    let observedAt = now;
    if (dateRaw) {
      const t = Date.parse(dateRaw);
      if (isNaN(t)) {
        issues.push({ line, severity: 'error', message: `Invalid timestamp: "${dateRaw}".` });
        bad = true;
      } else observedAt = new Date(t).toISOString();
    }
    const server = cell(row, 'server') || ctx.defaultServer;
    if (bad || itemId === null) return;
    const key = priceKey(server, itemId);
    if (seen.has(key)) {
      const at = records.findIndex((r) => priceKey(r.server, r.itemId) === key);
      const prev = records[at];
      if (entry.sellListingPrice === undefined || prev.sellListingPrice === undefined) {
        issues.push({ line, severity: 'error', message: `Duplicate of line ${seen.get(key)} (same item and server); row skipped.` });
        return;
      }
      const merged = withListings(prev, [...listingsOf(prev), entry.sellListingPrice]);
      if (entry.buyPrice !== undefined) merged.buyPrice = entry.buyPrice;
      records[at] = merged;
      return;
    }
    seen.set(key, line);
    const notes = cell(row, 'notes');
    records.push({ ...entry, itemId, server, observedAt, ...(notes ? { notes } : {}) } as PriceEntry);
    lines.push(line);
  });
  return { records, lines, issues, rowCount: table.rows.length };
}

export interface InventoryImportRecord {
  itemId: string;
  quantity: number;
}

export function parseInventoryCsv(text: string, ctx: ResolveContext): ParsedImport<InventoryImportRecord> {
  const issues: ImportIssue[] = [];
  const table = readTable(text, issues);
  if (typeof table === 'string') return { records: [], lines: [], issues, rowCount: 0, fatal: table };
  if (!('itemId' in table.header) && !('itemName' in table.header)) {
    return { records: [], lines: [], issues, rowCount: table.rows.length, fatal: 'Missing required column: itemId (or itemName).' };
  }
  if (!('quantity' in table.header)) {
    return { records: [], lines: [], issues, rowCount: table.rows.length, fatal: 'Missing required column: quantity.' };
  }
  const records: InventoryImportRecord[] = [];
  const lines: number[] = [];
  const seen = new Map<string, number>();
  const cell = (row: string[], key: string) => (key in table.header ? (row[table.header[key]] ?? '').trim() : '');
  table.rows.forEach((row, idx) => {
    const line = table.lines[idx];
    const itemId = resolveItemId({ itemId: cell(row, 'itemId'), itemName: cell(row, 'itemName') }, ctx, line, issues);
    const raw = cell(row, 'quantity');
    const q = parseNumber(raw);
    if (q === null || !Number.isInteger(q)) {
      issues.push({ line, severity: 'error', message: `Invalid quantity: "${raw}" (must be a whole number, 0 or more).` });
      return;
    }
    if (itemId === null) return;
    if (seen.has(itemId)) {
      issues.push({ line, severity: 'error', message: `Duplicate of line ${seen.get(itemId)} (same item); row skipped.` });
      return;
    }
    seen.set(itemId, line);
    records.push({ itemId, quantity: q });
    lines.push(line);
  });
  return { records, lines, issues, rowCount: table.rows.length };
}

const fmtPrice = (p?: PriceEntry) => {
  if (!p) return '';
  const l = listingsOf(p);
  const prices = l.length > 1 ? `${l.length} prices, avg ${Math.round((p.sellListingPrice ?? 0) * 100) / 100}` : `${p.sellListingPrice ?? '–'}`;
  return `buy ${p.buyPrice ?? '–'} / price ${prices} @ ${p.observedAt.slice(0, 10)}`;
};

export function appendHistory(history: PriceEntry[], entry: PriceEntry): PriceEntry[] {
  const dup = history.some(
    (h) => h.itemId === entry.itemId && h.server === entry.server && h.observedAt === entry.observedAt && h.buyPrice === entry.buyPrice && h.sellListingPrice === entry.sellListingPrice,
  );
  if (dup) return history;
  return [...history, entry].slice(-MAX_PRICE_HISTORY);
}

export function applyPriceImport(data: UserData, records: PriceEntry[], mode: ImportMode, nameOf: (id: string) => string = (id) => id): ApplyResult {
  const changes: ChangeRow[] = [];
  let history = data.priceHistory;
  const prices: Record<string, PriceEntry> = mode === 'replace' ? {} : { ...data.prices };
  if (mode === 'replace') {
    const incoming = new Set(records.map((r) => priceKey(r.server, r.itemId)));
    for (const [k, p] of Object.entries(data.prices)) {
      if (!incoming.has(k)) changes.push({ kind: 'removed', label: `${nameOf(p.itemId)} (${p.server})`, before: fmtPrice(p) });
    }
  }
  for (const rec of records) {
    const key = priceKey(rec.server, rec.itemId);
    const label = `${nameOf(rec.itemId)} (${rec.server})`;
    const existing = data.prices[key];
    if (mode === 'merge' && existing && existing.observedAt > rec.observedAt) {
      history = appendHistory(history, rec);
      changes.push({ kind: 'kept', label, before: fmtPrice(existing), after: fmtPrice(rec), note: 'Existing price is newer; imported observation added to history only.' });
      continue;
    }
    prices[key] = rec;
    history = appendHistory(history, rec);
    if (!existing) changes.push({ kind: 'added', label, after: fmtPrice(rec) });
    else if (fmtPrice(existing) === fmtPrice(rec) && existing.notes === rec.notes) changes.push({ kind: 'unchanged', label, before: fmtPrice(existing) });
    else changes.push({ kind: 'updated', label, before: fmtPrice(existing), after: fmtPrice(rec) });
  }
  return { data: { ...data, prices, priceHistory: history }, changes };
}

export function applyInventoryImport(data: UserData, records: InventoryImportRecord[], mode: ImportMode, nameOf: (id: string) => string = (id) => id, now = new Date()): ApplyResult {
  const changes: ChangeRow[] = [];
  const inventory: Record<string, InventoryEntry> = mode === 'replace' ? {} : { ...data.inventory };
  const incoming = new Set(records.map((r) => r.itemId));
  if (mode === 'replace') {
    for (const [id, e] of Object.entries(data.inventory)) {
      if (!incoming.has(id)) changes.push({ kind: 'removed', label: nameOf(id), before: String(e.quantity) });
    }
  }
  for (const rec of records) {
    const existing = data.inventory[rec.itemId];
    const label = nameOf(rec.itemId);
    if (rec.quantity === 0) delete inventory[rec.itemId];
    else inventory[rec.itemId] = { quantity: rec.quantity, updatedAt: now.toISOString() };
    if (!existing) changes.push({ kind: rec.quantity === 0 ? 'unchanged' : 'added', label, after: String(rec.quantity) });
    else if (existing.quantity === rec.quantity) changes.push({ kind: 'unchanged', label, before: String(existing.quantity) });
    else changes.push({ kind: rec.quantity === 0 ? 'removed' : 'updated', label, before: String(existing.quantity), after: String(rec.quantity) });
  }
  return { data: { ...data, inventory }, changes };
}

export function summarizeChanges(changes: ChangeRow[]): Record<ChangeRow['kind'], number> {
  const out = { added: 0, updated: 0, kept: 0, removed: 0, unchanged: 0 };
  for (const c of changes) out[c.kind]++;
  return out;
}
