import { describe, expect, it } from 'vitest';
import { suggestSales } from './sell-suggestions';

const c = (itemId: string, quantity: number, unitPrice: number, extra: object = {}) => ({ itemId, name: itemId, quantity, unitPrice, ...extra });

describe('suggestSales', () => {
  it('skips needed, bound, high-rarity and unpriced items and applies the fee', () => {
    const out = suggestSales(
      [c('a', 10, 1000), c('needed', 5, 9999), c('b', 1, 5000, { bound: true }), c('Helm (Skin: Helm)', 1, 9e6), c('z', 3, 0), c('d', 2, 4000)],
      new Set(['needed']),
      10,
    );
    expect(out.map((s) => s.itemId)).toEqual(['a', 'd']);
    expect(out[0].netKinah).toBe(9000);
    expect(out[1].netKinah).toBe(7200);
  });

  it('respects the limit and does not mutate input', () => {
    const input = [c('a', 1, 10), c('b', 1, 20)];
    expect(suggestSales(input, new Set(), 0, 1).map((s) => s.itemId)).toEqual(['b']);
    expect(input[0].itemId).toBe('a');
  });
});
