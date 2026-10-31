import { describe, expect, it } from 'vitest';
import { parseMarketItems } from './market';

describe('parseMarketItems extra items', () => {
  it('keeps listed items missing from the catalogue', () => {
    const raw = { items: [
      { item_key: 1, name: 'Known', listed: true, price: 10, listings: 1 },
      { item_key: 2, name: 'Artwork X', category: { name: 'Artwork' }, listed: true, price: 99, listings: 2 },
    ] };
    const r = parseMarketItems(raw, [{ id: '1', name: 'Known', source: 's', verification: 'unverified' }], 'Zikel LA');
    expect(r.records.map((x) => x.itemId).sort()).toEqual(['1', '2']);
    expect(r.extraItems).toEqual([expect.objectContaining({ id: '2', name: 'Artwork X', category: 'Artwork' })]);
  });
});
