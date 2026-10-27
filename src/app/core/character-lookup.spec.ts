import { describe, expect, it } from 'vitest';
import { parseInfoResponse, parseSearchResponse } from './character-lookup';

describe('character lookup parsing', () => {
  it('strips highlight tags and drops malformed hits', () => {
    const hits = parseSearchResponse({
      list: [
        { characterId: 'abc%3D', serverId: 1401, name: '<strong>Sun</strong>n', serverName: 'Siel', level: 45, race: 1 },
        { name: 'broken' },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe('Sunn');
    expect(parseSearchResponse(null)).toEqual([]);
  });

  it('builds a card and ignores zero attributes', () => {
    const card = parseInfoResponse({
      profile: { characterName: 'A', className: 'Chanter', characterLevel: 45, combatPower: 100 },
      stat: {
        statList: [
          { type: 'STR', name: 'Might', value: 15, statSecondList: ['Attack increase +1.5%'] },
          { type: 'INT', name: 'Intelligence', value: 0, statSecondList: null },
          { type: 'ItemLevel', name: 'Item level', value: 836 },
        ],
      },
    });
    expect(card?.itemLevel).toBe(836);
    expect(card?.attributes).toHaveLength(1);
    expect(parseInfoResponse({})).toBeNull();
  });
});
