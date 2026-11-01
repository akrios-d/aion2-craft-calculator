import { describe, expect, it } from 'vitest';
import { artworkAttributes, artworkOrigins, filterArtwork, linkArtwork } from './pantheon';

const entries = [
  { type: 'artwork' as const, name: 'Argo, the Spirit King', rarity: 'Unique', effects: [{ attribute: 'Illusion', deity: 'Kaisinel', value: 4 }, { attribute: 'Life', deity: 'Yustiel', value: 4 }] },
  { type: 'artwork' as const, name: 'Artisan Chef', rarity: 'Rare', effects: [{ attribute: 'Life', deity: 'Yustiel', value: 2 }] },
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

  it('supports OR matching', () => {
    expect(filterArtwork(rows, ['Illusion', 'Life'], '', '', '', 'or').length).toBe(2);
    expect(filterArtwork(rows, ['Illusion', 'Life'], '', '', '', 'and').length).toBe(1);
  });

  it('filters by type', () => {
    expect(filterArtwork(rows, [], '', '', 'statue').length).toBe(0);
    expect(filterArtwork(rows, [], '', '', 'artwork').length).toBe(2);
  });

  it('filters by source category', () => {
    const r = linkArtwork([{ ...entries[0], origins: ['Monster Loot'] }, { ...entries[1], origins: ['Trade Shop'] }], []);
    expect(filterArtwork(r, [], '', '', '', 'and', 'Trade Shop').map((x) => x.name)).toEqual(['Artisan Chef']);
    expect(artworkOrigins(r)).toEqual(['Monster Loot', 'Trade Shop']);
  });

  it('lists distinct attributes', () => {
    expect(artworkAttributes(rows)).toEqual(['Illusion', 'Life']);
  });
});

import { addToBuild, buildTotals } from './pantheon';
describe('pantheon build', () => {
  it('respects slot limits and duplicates', () => {
    let b: string[] = [];
    b = addToBuild(b, { type: 'colossus', name: 'A' });
    b = addToBuild(b, { type: 'colossus', name: 'B' });
    b = addToBuild(b, { type: 'colossus', name: 'A' });
    expect(b).toEqual(['colossus|A']);
    for (let i = 0; i < 6; i++) b = addToBuild(b, { type: 'statue', name: 'S' + i });
    expect(b.filter((x) => x.startsWith('statue')).length).toBe(4);
  });
  it('sums attributes', () => {
    const e = (v: number) => ({ type: 'artwork' as const, name: 'x', rarity: '', effects: [{ attribute: 'Life', deity: '', value: v }] });
    expect(buildTotals([e(2), e(3)])).toEqual([{ attribute: 'Life', value: 5 }]);
  });
});

import { factionsOf } from './pantheon-factions';
describe('factionsOf', () => {
  it('maps recipes to factions', () => {
    expect(factionsOf('Artwork: Melted Danar')).toEqual(['Asmodian']);
    expect(factionsOf('Kernon of the West')).toEqual(['Elyos']);
    expect(factionsOf('Silent Dartan')).toEqual(['Asmodian', 'Elyos']);
    expect(factionsOf('Safe Haven')).toEqual([]);
  });
});
