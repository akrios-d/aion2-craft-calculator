import { Item, PriceEntry, UserData, priceKey } from './models';

export interface RemappedRecord {
  kind: string;
  fromId: string;
  toId: string;
}

export interface UnresolvedRecord {
  kind: string;
  itemId: string;
  reason: string;
}

export interface ReconcileReport {
  remapped: RemappedRecord[];
  unresolved: UnresolvedRecord[];
  changed: boolean;
}

/**
 * After the static dataset changes, matches user records to items by stable id, following
 * `previousIds` when an id was renamed. Records that cannot be matched are reported and left
 * untouched: nothing is ever deleted.
 */
export function reconcileUserData(data: UserData, catalogItems: Item[]): { data: UserData; report: ReconcileReport } {
  const known = new Set<string>([...catalogItems, ...data.customItems].map((i) => i.id));
  const renamed = new Map<string, string>();
  for (const it of catalogItems) for (const old of it.previousIds ?? []) if (!known.has(old)) renamed.set(old, it.id);

  const report: ReconcileReport = { remapped: [], unresolved: [], changed: false };
  const resolve = (id: string, kind: string): string => {
    if (known.has(id)) return id;
    const to = renamed.get(id);
    if (to) return to;
    report.unresolved.push({ kind, itemId: id, reason: 'No item with this id exists in the current dataset or your custom items.' });
    return id;
  };

  const inventory: UserData['inventory'] = {};
  for (const [id, e] of Object.entries(data.inventory)) {
    const to = resolve(id, 'inventory');
    if (to !== id) {
      if (data.inventory[to] || inventory[to]) {
        report.unresolved.push({ kind: 'inventory', itemId: id, reason: `Renamed to ${to}, which already has an entry; both kept.` });
        inventory[id] = e;
      } else {
        inventory[to] = e;
        report.remapped.push({ kind: 'inventory', fromId: id, toId: to });
      }
    } else inventory[id] = e;
  }

  const remapPrice = (p: PriceEntry, kind: string): PriceEntry => {
    const to = resolve(p.itemId, kind);
    if (to === p.itemId) return p;
    report.remapped.push({ kind, fromId: p.itemId, toId: to });
    return { ...p, itemId: to };
  };
  const prices: UserData['prices'] = {};
  for (const [key, p] of Object.entries(data.prices)) {
    const np = remapPrice(p, 'price');
    const nk = priceKey(np.server, np.itemId);
    if (nk !== key && (data.prices[nk] || prices[nk])) {
      report.unresolved.push({ kind: 'price', itemId: p.itemId, reason: `Renamed to ${np.itemId}, which already has a price; both kept.` });
      prices[key] = p;
    } else prices[nk] = np;
  }
  const priceHistory = data.priceHistory.map((p) => {
    const to = renamed.get(p.itemId);
    return to && !known.has(p.itemId) ? { ...p, itemId: to } : p;
  });

  const strategies: UserData['strategies'] = {};
  for (const [id, s] of Object.entries(data.strategies)) {
    const to = resolve(id, 'strategy');
    strategies[strategies[to] ? id : to] = s;
  }
  const recipeChoices: UserData['recipeChoices'] = {};
  for (const [id, r] of Object.entries(data.recipeChoices)) recipeChoices[renamed.get(id) && !known.has(id) ? renamed.get(id)! : id] = r;
  const plans = data.plans.map((p) => {
    const to = resolve(p.targetItemId, 'plan');
    if (to !== p.targetItemId) report.remapped.push({ kind: 'plan', fromId: p.targetItemId, toId: to });
    return { ...p, targetItemId: to };
  });

  // De-duplicate repeated unresolved ids per kind.
  const seen = new Set<string>();
  report.unresolved = report.unresolved.filter((u) => {
    const k = `${u.kind}|${u.itemId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  report.changed = report.remapped.length > 0;
  return { data: { ...data, inventory, prices, priceHistory, strategies, recipeChoices, plans }, report };
}
