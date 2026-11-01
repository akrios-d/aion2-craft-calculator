import { describe, expect, it } from 'vitest';
import { artworkAttributes, filterArtwork, linkArtwork } from './artwork';

const entries = [
  { name: 'Argo, the Spirit King', rarity: 'Unique', effects: [{ attribute: 'Illusion', deity: 'Kaisinel', value: 4 }, { attribute: 'Life', deity: 'Yustiel', value: 4 }] },
  { name: 'Artisan Chef', rarity: 'Rare', effects: [{ attribute: 'Life', deity: 'Yustiel', value: 2 }] },
];

describe('artwork', () => {
  const rows = linkArtwork(entries, [{ id: '9', name: 'Artwork: Argo, the Spirit King', source: 's', verification: 'unverified' }]);

  it('links by name and leaves unknown items without id', () => {
    expect(rows[0].itemId).toBe('9');
    expect(rows[1].itemId).toBeUndefined();
  });

  it('filters by all selected attributes, rarity and name', () => {
    expect(filterArtwork(rows, ['Illusion']).map((r) => r.name)).toEqual(['Argo, the Spirit King']);
    expect(filterArtwork(rows, ['Life']).length).toBe(2);
    expect(filterArtwork(rows, ['Life', 'Illusion']).length).toBe(1);
    expect(filterArtwork(rows, [], 'Rare').map((r) => r.name)).toEqual(['Artisan Chef']);
    expect(filterArtwork(rows, [], '', 'chef').length).toBe(1);
  });

  it('lists distinct attributes', () => {
    expect(artworkAttributes(rows)).toEqual(['Illusion', 'Life']);
  });
});
