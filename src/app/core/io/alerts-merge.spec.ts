import { describe, expect, it } from 'vitest';
import { emptyUserData } from '../storage/schema';
import { applyPriceImport } from './imports';

describe('market merge keeps alerts', () => {
  it('does not drop the alert price and direction when a market record replaces the price', () => {
    const data = emptyUserData();
    data.prices['Z|a'] = { itemId: 'a', server: 'Z', buyPrice: 50, alertDirection: 'above', sellListingPrice: 40, observedAt: '2026-01-01T00:00:00.000Z' };
    const res = applyPriceImport(data, [{ itemId: 'a', server: 'Z', sellListingPrice: 60, observedAt: '2026-02-01T00:00:00.000Z' }], 'merge');
    expect(res.data.prices['Z|a']).toMatchObject({ sellListingPrice: 60, buyPrice: 50, alertDirection: 'above' });
  });
});
