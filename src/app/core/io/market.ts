import { Item, PriceEntry } from '../models';

export interface MarketServer {
  serverId: number;
  name: string;
  region: string;
}

export interface MarketImport {
  records: PriceEntry[];
  unmatched: string[];
  /** Listed market items missing from the catalogue; shown by name so they can still be priced and alerted. */
  extraItems: Item[];
  total: number;
}

export function parseServers(raw: unknown): MarketServer[] {
  const list = (raw as { servers?: Record<string, unknown>[] } | null)?.servers;
  if (!Array.isArray(list)) return [];
  return list.flatMap((s) =>
    typeof s['server_id'] === 'number' ? [{ serverId: s['server_id'], name: String(s['name'] ?? ''), region: String(s['region'] ?? '') }] : [],
  );
}

/** Maps listed market items onto catalogue items (by id, then by exact English name). Unlisted items are ignored. */
export function parseMarketItems(raw: unknown, catalog: readonly Item[], server: string, now = new Date()): MarketImport {
  const list = (raw as { items?: Record<string, unknown>[] } | null)?.items;
  if (!Array.isArray(list)) return { records: [], unmatched: [], extraItems: [], total: 0 };
  const byId = new Set(catalog.map((i) => i.id));
  const byName = new Map(catalog.map((i) => [i.name.toLowerCase(), i.id]));
  const records = new Map<string, PriceEntry>();
  const unmatched: string[] = [];
  const extra = new Map<string, Item>();
  let total = 0;
  for (const e of list) {
    const price = e['price'];
    if (e['listed'] !== true || typeof price !== 'number' || !(price > 0)) continue;
    total++;
    const name = String(e['name'] ?? '');
    const key = String(e['item_key'] ?? '');
    let id = byId.has(key) ? key : byName.get(name.toLowerCase());
    if (!id) {
      if (!key || !name) {
        unmatched.push(name || key);
        continue;
      }
      id = key;
      const cat = (e['category'] as { name?: unknown } | null)?.name;
      extra.set(id, { id, name, category: typeof cat === 'string' ? cat : undefined, source: 'aion2.exchange', verification: 'unverified' });
    }
    const at = typeof e['captured_at'] === 'string' && !Number.isNaN(Date.parse(e['captured_at'])) ? new Date(e['captured_at']).toISOString() : now.toISOString();
    records.set(id, {
      itemId: id,
      server,
      sellListingPrice: price,
      quantityObserved: typeof e['listings'] === 'number' ? e['listings'] : undefined,
      observedAt: at,
      notes: 'Aion2Market listing price (not a completed sale)',
    });
  }
  return { records: [...records.values()], unmatched, extraItems: [...extra.values()], total };
}
