import { Item } from './models';
import { reconcileUserData } from './reconcile';
import { emptyUserData } from './storage/schema';

const item = (id: string, previousIds?: string[]): Item => ({ id, name: id, previousIds, source: 't', verification: 'verified' });

describe('reconcileUserData (dataset updates)', () => {
  it('keeps records whose ids still exist untouched', () => {
    const d = { ...emptyUserData(), inventory: { ore: { quantity: 2, updatedAt: 'x' } } };
    const { data, report } = reconcileUserData(d, [item('ore')]);
    expect(data.inventory).toEqual(d.inventory);
    expect(report).toEqual({ remapped: [], unresolved: [], changed: false });
  });

  it('follows previousIds when an item id changed', () => {
    const d = {
      ...emptyUserData(),
      inventory: { 'old-ore': { quantity: 2, updatedAt: 'x' } },
      prices: { 'Zikel SA|old-ore': { itemId: 'old-ore', server: 'Zikel SA', buyPrice: 5, observedAt: '2026-01-01T00:00:00.000Z' } },
      strategies: { 'old-ore': 'buy' as const },
    };
    const { data, report } = reconcileUserData(d, [item('ore', ['old-ore'])]);
    expect(data.inventory['ore'].quantity).toBe(2);
    expect(data.inventory['old-ore']).toBeUndefined();
    expect(data.prices['Zikel SA|ore'].itemId).toBe('ore');
    expect(data.strategies['ore']).toBe('buy');
    expect(report.remapped.map((r) => r.kind).sort()).toEqual(['inventory', 'price']);
    expect(report.changed).toBe(true);
  });

  it('reports unmatched records instead of deleting them', () => {
    const d = {
      ...emptyUserData(),
      inventory: { ghost: { quantity: 1, updatedAt: 'x' } },
      prices: { 'Zikel SA|ghost': { itemId: 'ghost', server: 'Zikel SA', buyPrice: 5, observedAt: '2026-01-01T00:00:00.000Z' } },
    };
    const { data, report } = reconcileUserData(d, [item('ore')]);
    expect(data.inventory['ghost']).toBeDefined();
    expect(data.prices['Zikel SA|ghost']).toBeDefined();
    expect(report.unresolved.map((u) => `${u.kind}:${u.itemId}`).sort()).toEqual(['inventory:ghost', 'price:ghost']);
  });

  it('does not overwrite when the renamed target already has data', () => {
    const d = { ...emptyUserData(), inventory: { 'old-ore': { quantity: 2, updatedAt: 'x' }, ore: { quantity: 9, updatedAt: 'x' } } };
    const { data, report } = reconcileUserData(d, [item('ore', ['old-ore'])]);
    expect(data.inventory['ore'].quantity).toBe(9);
    expect(data.inventory['old-ore'].quantity).toBe(2);
    expect(report.unresolved).toHaveLength(1);
  });

  it('treats the user custom items as known', () => {
    const d = { ...emptyUserData(), customItems: [{ id: 'mine', name: 'Mine', source: 'user', verification: 'user-entered' as const }], inventory: { mine: { quantity: 1, updatedAt: 'x' } } };
    expect(reconcileUserData(d, []).report.unresolved).toEqual([]);
  });
});
