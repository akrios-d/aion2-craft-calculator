import { describe, expect, it } from 'vitest';
import { findAlerts, newAlerts } from './alerts';

const p = (itemId: string, sellListingPrice?: number, buyPrice?: number) => ({ itemId, server: 's', sellListingPrice, buyPrice, observedAt: 'x' });

describe('price alerts', () => {
  it('alerts only when market <= desired price', () => {
    const a = findAlerts({ a: p('a', 90, 100), b: p('b', 110, 100), c: p('c', 50), d: p('d', undefined, 100), e: p('e', 100, 100) });
    expect(a.map((x) => x.itemId)).toEqual(['a', 'e']);
  });

  it('notifies once per price and re-arms when the price changes', () => {
    const first = newAlerts([{ itemId: 'a', desired: 100, market: 90 }], new Set());
    expect(first.fresh).toHaveLength(1);
    const again = newAlerts([{ itemId: 'a', desired: 100, market: 90 }], first.keys);
    expect(again.fresh).toHaveLength(0);
    const changed = newAlerts([{ itemId: 'a', desired: 100, market: 80 }], first.keys);
    expect(changed.fresh).toHaveLength(1);
  });
});