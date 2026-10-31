import { describe, expect, it } from 'vitest';
import { Item } from '../models';
import { parseMarketItems, parseServers } from './market';

const catalog = [
  { id: '100', name: 'Alpha' },
  { id: '200', name: 'Beta Stone' },
] as Item[];

describe('market import', () => {
  it('matches by id then name, skips unlisted, reports unmatched', () => {
    const r = parseMarketItems(
      {
        items: [
          { item_key: 100, name: 'Alpha', price: 500, listings: 3, listed: true, captured_at: '2026-10-31T15:00:00Z' },
          { item_key: 999, name: 'beta stone', price: 70, listings: 1, listed: true },
          { item_key: 5, name: 'Unknown', price: 10, listed: true },
          { item_key: 6, name: 'Alpha', price: 0, listed: false },
        ],
      },
      catalog,
      'Zikel SA',
    );
    expect(r.total).toBe(3);
    expect(r.records.map((x) => x.itemId).sort()).toEqual(['100', '200']);
    expect(r.records.find((x) => x.itemId === '100')?.quantityObserved).toBe(3);
    expect(r.unmatched).toEqual(['Unknown']);
  });

  it('tolerates malformed input', () => {
    expect(parseMarketItems(null, catalog, 's').records).toEqual([]);
    expect(parseServers({ servers: [{ server_id: 1, name: 'A', region: 'LA' }, {}] })).toHaveLength(1);
  });
});
