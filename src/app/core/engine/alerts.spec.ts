import { describe, expect, it } from 'vitest';
import { findAlerts, newAlerts } from './alerts';

const p = (itemId: string, sellListingPrice?: number, buyPrice?: number, alertDirection?: 'below' | 'above') => ({ itemId, server: 's', sellListingPrice, buyPrice, alertDirection, observedAt: 'x' });

describe('price alerts', () => {
  it('alerts only when market <= desired price', () => {
    const a = findAlerts([p('a', 90, 100), p('b', 110, 100), p('c', 50), p('d', undefined, 100), p('e', 100, 100)]);
    expect(a.map((x) => x.itemId)).toEqual(['a', 'e']);
  });

  it('supports alerts when the price goes above', () => {
    const a = findAlerts([p('a', 110, 100, 'above'), p('b', 90, 100, 'above'), p('c', 100, 100, 'above'), p('d', 90, 100, 'below')]);
    expect(a.map((x) => [x.itemId, x.direction])).toEqual([['a', 'above'], ['c', 'above'], ['d', 'below']]);
  });

  it('notifies once per price and re-arms when the price changes', () => {
    const first = newAlerts([{ itemId: 'a', desired: 100, market: 90, direction: 'below' as const }], new Set());
    expect(first.fresh).toHaveLength(1);
    const again = newAlerts([{ itemId: 'a', desired: 100, market: 90, direction: 'below' as const }], first.keys);
    expect(again.fresh).toHaveLength(0);
    const changed = newAlerts([{ itemId: 'a', desired: 100, market: 80, direction: 'below' as const }], first.keys);
    expect(changed.fresh).toHaveLength(1);
  });
});