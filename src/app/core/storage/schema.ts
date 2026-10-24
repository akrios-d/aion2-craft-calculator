import {
  DEFAULT_FEE_PERCENT,
  DEFAULT_SERVER,
  InventoryEntry,
  Item,
  PriceEntry,
  Recipe,
  SavedPlan,
  Settings,
  Strategy,
  UserData,
  priceKey,
} from '../models';

export const CURRENT_SCHEMA_VERSION = 2;
export const MAX_PRICE_HISTORY = 5000;

export function defaultSettings(): Settings {
  return {
    server: DEFAULT_SERVER,
    defaultFeePercent: DEFAULT_FEE_PERCENT,
    defaultStrategy: 'auto',
    currencyLabel: 'Kinah',
  };
}

export function emptyUserData(): UserData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    inventory: {},
    prices: {},
    priceHistory: [],
    settings: defaultSettings(),
    plans: [],
    strategies: {},
    recipeChoices: {},
    customItems: [],
    customRecipes: [],
    lastSeenDataVersion: null,
  };
}

type Raw = Record<string, any>;
type Migration = (data: Raw) => Raw;

/**
 * Each entry upgrades data from version N (the key) to N + 1.
 * v0: unversioned early layout, inventory as `{id: qty}` or `[{id, qty}]`, prices as an array of `{itemId, buy, sell, date}`.
 * v1: versioned, prices keyed by item id only (no server).
 * v2: prices keyed by `server|itemId`, price history, per-item strategies and settings.
 */
export const MIGRATIONS: Record<number, Migration> = {
  0: (d) => {
    const inventory: Raw = {};
    if (Array.isArray(d['inventory'])) {
      for (const row of d['inventory']) {
        if (row && typeof row === 'object' && row.id !== undefined) inventory[String(row.id)] = Number(row.qty ?? row.quantity);
      }
    } else if (d['inventory'] && typeof d['inventory'] === 'object') {
      Object.assign(inventory, d['inventory']);
    }
    const prices: Raw = {};
    const list: any[] = Array.isArray(d['prices']) ? d['prices'] : [];
    for (const p of list) {
      if (!p || p.itemId === undefined) continue;
      prices[String(p.itemId)] = {
        itemId: String(p.itemId),
        buyPrice: p.buy,
        sellListingPrice: p.sell,
        observedAt: p.date,
      };
    }
    return { ...d, schemaVersion: 1, inventory, prices, settings: d['settings'] ?? {} };
  },
  1: (d) => {
    const server = typeof d['settings']?.server === 'string' ? d['settings'].server : DEFAULT_SERVER;
    const prices: Raw = {};
    const history: unknown[] = [];
    for (const [itemId, p] of Object.entries<any>(d['prices'] ?? {})) {
      if (!p || typeof p !== 'object') continue;
      const entry = { ...p, itemId, server: p.server ?? server };
      prices[priceKey(entry.server, itemId)] = entry;
      history.push(entry);
    }
    const inventory: Raw = {};
    for (const [id, q] of Object.entries<any>(d['inventory'] ?? {})) {
      inventory[id] = typeof q === 'object' && q !== null ? q : { quantity: Number(q), updatedAt: new Date(0).toISOString() };
    }
    return {
      ...d,
      schemaVersion: 2,
      inventory,
      prices,
      priceHistory: d['priceHistory'] ?? history,
      strategies: d['strategies'] ?? {},
      recipeChoices: d['recipeChoices'] ?? {},
      plans: d['plans'] ?? [],
    };
  },
};

export class SchemaError extends Error {}

export function migrateUserData(raw: unknown): { data: UserData; fromVersion: number; warnings: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SchemaError('Stored data is not an object.');
  }
  let working = { ...(raw as Raw) };
  const fromVersion = working['schemaVersion'] === undefined ? 0 : Number(working['schemaVersion']);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) {
    throw new SchemaError(`Invalid schema version: ${String(working['schemaVersion'])}.`);
  }
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      `Data was saved by a newer version of the app (schema ${fromVersion}, this app supports ${CURRENT_SCHEMA_VERSION}).`,
    );
  }
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new SchemaError(`No migration from schema ${v}.`);
    working = step(working);
  }
  const warnings: string[] = [];
  return { data: normalizeUserData(working, warnings), fromVersion, warnings };
}

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrategy = (v: unknown): v is Strategy => v === 'auto' || v === 'craft' || v === 'buy';

function optNum(v: unknown): number | undefined {
  return isNum(v) && v >= 0 ? v : undefined;
}

export function normalizePrice(p: unknown, fallbackServer = DEFAULT_SERVER): PriceEntry | null {
  if (!isObj(p) || typeof p['itemId'] !== 'string' || !p['itemId']) return null;
  const buy = optNum(p['buyPrice']);
  const sell = optNum(p['sellListingPrice']);
  if (buy === undefined && sell === undefined) return null;
  const observed = typeof p['observedAt'] === 'string' && !isNaN(Date.parse(p['observedAt'])) ? new Date(p['observedAt']).toISOString() : new Date(0).toISOString();
  const entry: PriceEntry = {
    itemId: p['itemId'],
    server: typeof p['server'] === 'string' && p['server'] ? p['server'] : fallbackServer,
    observedAt: observed,
  };
  if (buy !== undefined) entry.buyPrice = buy;
  if (sell !== undefined) entry.sellListingPrice = sell;
  const qty = optNum(p['quantityObserved']);
  if (qty !== undefined) entry.quantityObserved = qty;
  const fee = optNum(p['feePercent']);
  if (fee !== undefined && fee <= 100) entry.feePercent = fee;
  if (typeof p['notes'] === 'string' && p['notes']) entry.notes = p['notes'];
  return entry;
}

function normalizeItem(i: unknown): Item | null {
  if (!isObj(i) || typeof i['id'] !== 'string' || typeof i['name'] !== 'string' || !i['id']) return null;
  return { id: i['id'], name: i['name'], category: typeof i['category'] === 'string' ? i['category'] : undefined, source: 'user', verification: 'user-entered' };
}

function normalizeRecipe(r: unknown): Recipe | null {
  if (!isObj(r) || typeof r['id'] !== 'string' || typeof r['outputItemId'] !== 'string') return null;
  const ingredients = Array.isArray(r['ingredients'])
    ? r['ingredients']
        .filter((x: any) => isObj(x) && typeof x['itemId'] === 'string' && isNum(x['quantity']))
        .map((x: any) => ({ itemId: x['itemId'] as string, quantity: x['quantity'] as number }))
    : [];
  if (!isNum(r['outputQuantity'])) return null;
  return {
    id: r['id'],
    outputItemId: r['outputItemId'],
    outputQuantity: r['outputQuantity'],
    ingredients,
    professionId: typeof r['professionId'] === 'string' ? r['professionId'] : undefined,
    source: 'user',
    verification: 'user-entered',
    notes: typeof r['notes'] === 'string' ? r['notes'] : undefined,
  };
}

/** Coerces arbitrary migrated data into a valid UserData, dropping malformed records with warnings. */
export function normalizeUserData(raw: Raw, warnings: string[] = []): UserData {
  const base = emptyUserData();
  const settingsRaw = isObj(raw['settings']) ? raw['settings'] : {};
  base.settings = {
    server: typeof settingsRaw['server'] === 'string' && settingsRaw['server'].trim() ? settingsRaw['server'].trim() : base.settings.server,
    defaultFeePercent: optNum(settingsRaw['defaultFeePercent']) !== undefined && settingsRaw['defaultFeePercent'] <= 100 ? settingsRaw['defaultFeePercent'] : base.settings.defaultFeePercent,
    defaultStrategy: isStrategy(settingsRaw['defaultStrategy']) ? settingsRaw['defaultStrategy'] : 'auto',
    currencyLabel: typeof settingsRaw['currencyLabel'] === 'string' && settingsRaw['currencyLabel'] ? settingsRaw['currencyLabel'] : base.settings.currencyLabel,
  };

  for (const [id, e] of Object.entries<any>(isObj(raw['inventory']) ? raw['inventory'] : {})) {
    const qty = isObj(e) ? e['quantity'] : e;
    if (isNum(qty) && qty >= 0 && Number.isInteger(qty)) {
      const entry: InventoryEntry = {
        quantity: qty,
        updatedAt: isObj(e) && typeof e['updatedAt'] === 'string' ? e['updatedAt'] : new Date(0).toISOString(),
      };
      base.inventory[id] = entry;
    } else warnings.push(`Dropped inventory entry "${id}": invalid quantity.`);
  }

  for (const p of Object.values<any>(isObj(raw['prices']) ? raw['prices'] : {})) {
    const entry = normalizePrice(p);
    if (entry) base.prices[priceKey(entry.server, entry.itemId)] = entry;
    else warnings.push('Dropped a malformed price entry.');
  }
  for (const p of Array.isArray(raw['priceHistory']) ? raw['priceHistory'] : []) {
    const entry = normalizePrice(p);
    if (entry) base.priceHistory.push(entry);
  }
  base.priceHistory = base.priceHistory.slice(-MAX_PRICE_HISTORY);

  for (const [id, s] of Object.entries<any>(isObj(raw['strategies']) ? raw['strategies'] : {})) {
    if (isStrategy(s)) base.strategies[id] = s;
  }
  for (const [id, r] of Object.entries<any>(isObj(raw['recipeChoices']) ? raw['recipeChoices'] : {})) {
    if (typeof r === 'string') base.recipeChoices[id] = r;
  }
  for (const p of Array.isArray(raw['plans']) ? raw['plans'] : []) {
    if (isObj(p) && typeof p['id'] === 'string' && typeof p['targetItemId'] === 'string' && isNum(p['quantity']) && p['quantity'] > 0) {
      const plan: SavedPlan = {
        id: p['id'],
        name: typeof p['name'] === 'string' ? p['name'] : p['targetItemId'],
        targetItemId: p['targetItemId'],
        quantity: Math.floor(p['quantity']),
        server: typeof p['server'] === 'string' ? p['server'] : base.settings.server,
        createdAt: typeof p['createdAt'] === 'string' ? p['createdAt'] : new Date(0).toISOString(),
      };
      base.plans.push(plan);
    } else warnings.push('Dropped a malformed saved plan.');
  }
  for (const i of Array.isArray(raw['customItems']) ? raw['customItems'] : []) {
    const item = normalizeItem(i);
    if (item) base.customItems.push(item);
    else warnings.push('Dropped a malformed custom item.');
  }
  for (const r of Array.isArray(raw['customRecipes']) ? raw['customRecipes'] : []) {
    const rec = normalizeRecipe(r);
    if (rec) base.customRecipes.push(rec);
    else warnings.push('Dropped a malformed custom recipe.');
  }
  base.lastSeenDataVersion = typeof raw['lastSeenDataVersion'] === 'string' ? raw['lastSeenDataVersion'] : null;
  return base;
}
