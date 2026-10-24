import { listingsOf } from '../listings';
import { Item, PriceEntry, Recipe, UserData } from '../models';
import { MAX_PRICE_HISTORY, SchemaError, migrateUserData } from '../storage/schema';
import { validateRecipe } from '../engine/craft-engine';
import { toCsv } from './csv';
import { ApplyResult, ChangeRow, ImportIssue, ImportMode, appendHistory } from './imports';

export const BACKUP_FORMAT = 'aion2-craft-lab-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  data: UserData;
}

export function buildBackup(data: UserData, appVersion: string, now = new Date()): BackupFile {
  return { format: BACKUP_FORMAT, exportedAt: now.toISOString(), appVersion, schemaVersion: data.schemaVersion, data };
}

export interface ParsedBackup {
  data?: UserData;
  warnings: string[];
  fromVersion?: number;
  error?: string;
}

export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { warnings: [], error: 'The file is not valid JSON.' };
  }
  if (!json || typeof json !== 'object' || (json as any).format !== BACKUP_FORMAT || typeof (json as any).data !== 'object') {
    return { warnings: [], error: `Not a backup produced by this app (missing format "${BACKUP_FORMAT}").` };
  }
  const file = json as Partial<BackupFile>;
  try {
    const embedded = { ...(file.data as object) } as Record<string, unknown>;
    if (embedded['schemaVersion'] === undefined && file.schemaVersion !== undefined) embedded['schemaVersion'] = file.schemaVersion;
    const { data, fromVersion, warnings } = migrateUserData(embedded);
    return { data, fromVersion, warnings };
  } catch (e) {
    return { warnings: [], error: e instanceof SchemaError ? e.message : 'The backup could not be read.' };
  }
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map(a.map((x) => [x.id, x]));
  for (const x of b) map.set(x.id, x);
  return [...map.values()];
}

export function applyBackup(current: UserData, incoming: UserData, mode: ImportMode): ApplyResult {
  const changes: ChangeRow[] = [];
  const count = (label: string, before: number, after: number) =>
    changes.push({ kind: before === after ? 'unchanged' : after > before ? 'added' : 'removed', label, before: String(before), after: String(after) });

  let next: UserData;
  if (mode === 'replace') {
    next = { ...incoming };
  } else {
    const prices: Record<string, PriceEntry> = { ...current.prices };
    for (const [k, p] of Object.entries(incoming.prices)) {
      const ex = prices[k];
      if (!ex || ex.observedAt <= p.observedAt) prices[k] = p;
    }
    let history = current.priceHistory;
    for (const h of incoming.priceHistory) history = appendHistory(history, h);
    history = history.slice(-MAX_PRICE_HISTORY);
    next = {
      ...current,
      inventory: { ...current.inventory, ...incoming.inventory },
      prices,
      priceHistory: history,
      plans: mergeById(current.plans, incoming.plans),
      strategies: { ...current.strategies, ...incoming.strategies },
      recipeChoices: { ...current.recipeChoices, ...incoming.recipeChoices },
      customItems: mergeById(current.customItems, incoming.customItems),
      customRecipes: mergeById(current.customRecipes, incoming.customRecipes),
    };
  }
  next.schemaVersion = current.schemaVersion;
  count('Inventory entries', Object.keys(current.inventory).length, Object.keys(next.inventory).length);
  count('Current prices', Object.keys(current.prices).length, Object.keys(next.prices).length);
  count('Price history rows', current.priceHistory.length, next.priceHistory.length);
  count('Saved plans', current.plans.length, next.plans.length);
  count('Custom items', current.customItems.length, next.customItems.length);
  count('Custom recipes', current.customRecipes.length, next.customRecipes.length);
  if (mode === 'replace') changes.push({ kind: 'updated', label: 'Settings', note: 'Settings are replaced by the backup settings.' });
  return { data: next, changes };
}

export function exportPricesCsv(prices: Record<string, PriceEntry>, nameOf: (id: string) => string): string {
  const rows: (string | number | undefined)[][] = [];
  for (const p of Object.values(prices).sort((a, b) => a.server.localeCompare(b.server) || a.itemId.localeCompare(b.itemId))) {
    const listings = listingsOf(p);
    if (!listings.length) rows.push([p.itemId, nameOf(p.itemId), undefined, p.buyPrice, p.server]);
    listings.forEach((price, i) => rows.push([p.itemId, nameOf(p.itemId), price, i === 0 ? p.buyPrice : undefined, p.server]));
  }
  return toCsv(['itemId', 'itemName', 'price', 'buyPrice', 'server'], rows, [1, 4]);
}
export function exportInventoryCsv(inventory: UserData['inventory'], nameOf: (id: string) => string): string {
  const rows = Object.entries(inventory)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, e]) => [id, nameOf(id), e.quantity]);
  return toCsv(['itemId', 'itemName', 'quantity'], rows, [1]);
}

/* ---------- Recipe packs (user-supplied JSON in the same schema as the static data) ---------- */

export interface RecipePack {
  items: Item[];
  recipes: Recipe[];
}

export function parseRecipePack(text: string, knownItemIds: Set<string>, knownRecipeIds: Set<string>): { pack: RecipePack; issues: ImportIssue[]; fatal?: string } {
  const issues: ImportIssue[] = [];
  const pack: RecipePack = { items: [], recipes: [] };
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { pack, issues, fatal: 'The file is not valid JSON.' };
  }
  if (!json || typeof json !== 'object' || (!Array.isArray(json.items) && !Array.isArray(json.recipes))) {
    return { pack, issues, fatal: 'Expected an object with "items" and/or "recipes" arrays.' };
  }
  const seenItems = new Set<string>();
  (json.items ?? []).forEach((i: any, idx: number) => {
    const where = `items[${idx}]`;
    if (!i || typeof i.id !== 'string' || !i.id || typeof i.name !== 'string' || !i.name) {
      issues.push({ line: idx + 1, severity: 'error', message: `${where}: id and name are required.` });
    } else if (seenItems.has(i.id)) {
      issues.push({ line: idx + 1, severity: 'error', message: `${where}: duplicate item id "${i.id}" in file.` });
    } else if (knownItemIds.has(i.id)) {
      issues.push({ line: idx + 1, severity: 'error', message: `${where}: item id "${i.id}" already exists in the catalogue; skipped.` });
    } else {
      seenItems.add(i.id);
      pack.items.push({ id: i.id, name: i.name, category: typeof i.category === 'string' ? i.category : undefined, source: 'user-import', verification: 'user-entered' });
    }
  });
  const seenRecipes = new Set<string>();
  (json.recipes ?? []).forEach((r: any, idx: number) => {
    const where = `recipes[${idx}]`;
    const rec: Recipe = {
      id: String(r?.id ?? ''),
      outputItemId: String(r?.outputItemId ?? ''),
      outputQuantity: Number(r?.outputQuantity),
      ingredients: Array.isArray(r?.ingredients) ? r.ingredients.map((x: any) => ({ itemId: String(x?.itemId ?? ''), quantity: Number(x?.quantity) })) : [],
      professionId: typeof r?.professionId === 'string' ? r.professionId : undefined,
      source: 'user-import',
      verification: 'user-entered',
      notes: typeof r?.notes === 'string' ? r.notes : undefined,
    };
    const err = !rec.id ? 'missing id' : validateRecipe(rec);
    if (err) issues.push({ line: idx + 1, severity: 'error', message: `${where}: ${err}.` });
    else if (seenRecipes.has(rec.id)) issues.push({ line: idx + 1, severity: 'error', message: `${where}: duplicate recipe id "${rec.id}" in file.` });
    else if (knownRecipeIds.has(rec.id)) issues.push({ line: idx + 1, severity: 'error', message: `${where}: recipe id "${rec.id}" already exists; skipped.` });
    else {
      seenRecipes.add(rec.id);
      pack.recipes.push(rec);
      const known = new Set([...knownItemIds, ...seenItems]);
      for (const id of [rec.outputItemId, ...rec.ingredients.map((x) => x.itemId)]) {
        if (!known.has(id)) issues.push({ line: idx + 1, severity: 'warning', message: `${where}: item "${id}" has no known name.` });
      }
    }
  });
  return { pack, issues };
}

export function applyRecipePack(data: UserData, pack: RecipePack): UserData {
  return {
    ...data,
    customItems: mergeById(data.customItems, pack.items),
    customRecipes: mergeById(data.customRecipes, pack.recipes),
  };
}
