import { describe, expect, it } from 'vitest';
import { averagePrice, listingsOf, withListings } from './listings';
import { normalizePrice } from './storage/schema';
import { PriceEntry } from './models';

const base: PriceEntry = { itemId: 'a', server: 's', observedAt: '2026-01-01T00:00:00.000Z' };

describe('listings', () => {
  it('averages multiple listing prices into sellListingPrice', () => {
    const e = withListings(base, [100, 200, 300]);
    expect(e.listings).toEqual([100, 200, 300]);
    expect(e.sellListingPrice).toBe(200);
  });

  it('clears the price when the last listing is removed', () => {
    const e = withListings(withListings(base, [100]), []);
    expect(e.sellListingPrice).toBeUndefined();
    expect(e.listings).toBeUndefined();
  });

  it('treats a legacy single price as one listing', () => {
    expect(listingsOf({ ...base, sellListingPrice: 50 })).toEqual([50]);
    expect(averagePrice([])).toBeUndefined();
  });

  it('normalizes stored listings and recomputes the average', () => {
    const e = normalizePrice({ ...base, listings: [10, 'x', -1, 30], sellListingPrice: 999 });
    expect(e?.listings).toEqual([10, 30]);
    expect(e?.sellListingPrice).toBe(20);
  });
});
