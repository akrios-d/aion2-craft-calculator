import { describe, expect, it } from 'vitest';
import { applyBackup, buildBackup, parseBackup } from './io/backup';
import { buildSnapshot, normalizeSnapshot, parseArmoryJson, upsertSnapshot, MAX_SNAPSHOTS } from './armory';
import { makeLimiter, validate } from '../../../api/armory-lib.mjs';
import { pickCandidate } from './armory';
import { starterBisList, letterGrade, overallGrade, parseStatCell, scoreItem, applyBisImport, compareBis, parseBisCsv, parseBisJson, BisList } from './bis';
import { MIGRATIONS, emptyUserData, migrateUserData } from './storage/schema';

const equipmentJson = JSON.stringify({
  equipment: {
    equipmentList: [
      { slotPos: 1, slotPosName: 'MainHand', id: 100, name: 'Sword', grade: 'Legend', enchantLevel: 5, exceedLevel: 1, icon: 'x' },
      { slotPos: 13, slotPosName: 'Ring1', id: 200, name: 'Ring A', grade: 'Unique' },
      { slotPos: 14, slotPosName: 'Ring2', id: 201, name: 'Ring B', grade: 'Unique' },
      { slotPos: 41, slotPosName: 'Arcana1', id: 300, name: 'Chalice of Vigor', grade: 'Rare' },
      { slotPos: 13, slotPosName: 'Ring1', id: 999, name: 'Dup', grade: 'Unique' },
      { slotPos: 2 },
    ],
  },
});
const infoJson = JSON.stringify({ profile: { characterId: 'abc', characterName: 'Hero', className: 'Gladiator', characterLevel: 55, serverId: 2319, serverName: 'Fafnir' } });

describe('armory parsing', () => {
  it('parses equipment, skipping duplicates and malformed rows with warnings', () => {
    const r = parseArmoryJson(equipmentJson);
    expect(r.kind).toBe('equipment');
    expect(r.items?.map((i) => i.slot)).toEqual([1, 13, 14, 41]);
    expect(r.warnings.length).toBe(2);
  });
  it('parses info and combined wrappers', () => {
    expect(parseArmoryJson(infoJson).profile?.name).toBe('Hero');
    const c = parseArmoryJson(JSON.stringify({ info: JSON.parse(infoJson), equipment: JSON.parse(equipmentJson) }));
    expect(c.kind).toBe('combined');
    expect(c.items?.length).toBe(4);
  });
  it('parses search results and strips markup', () => {
    const r = parseArmoryJson(JSON.stringify({ list: [{ characterId: 'a%3D', name: '<strong>He</strong>ro', serverId: 1, serverName: 'S' }, { name: 'x' }] }));
    expect(r.candidates?.[0]).toMatchObject({ name: 'Hero', characterId: 'a=' });
    expect(r.warnings.length).toBe(1);
  });
  it('rejects invalid input with a clear error', () => {
    expect(parseArmoryJson('not json').error).toMatch(/valid JSON/);
    expect(parseArmoryJson('[]').error).toBeTruthy();
    expect(parseArmoryJson('{"foo":1}').kind).toBe('unknown');
  });
  it('splits arcana from gear and caches newest first with a cap', () => {
    const r = parseArmoryJson(equipmentJson);
    const s = buildSnapshot(parseArmoryJson(infoJson).profile, r.items!);
    expect(s.arcana.map((a) => a.name)).toEqual(['Chalice of Vigor']);
    expect(s.gear.length).toBe(3);
    let cache = [s];
    for (let i = 0; i < 15; i++) cache = upsertSnapshot(cache, { ...s, key: `k${i}` });
    expect(cache.length).toBe(MAX_SNAPSHOTS);
    expect(upsertSnapshot(cache, { ...s, key: 'k3' })[0].key).toBe('k3');
  });
  it('normalizes cached snapshots and drops invalid ones', () => {
    const s = buildSnapshot(parseArmoryJson(infoJson).profile, parseArmoryJson(equipmentJson).items!);
    expect(normalizeSnapshot(JSON.parse(JSON.stringify(s)))?.gear.length).toBe(3);
    expect(normalizeSnapshot({ profile: {} })).toBeNull();
  });
});

const snap = buildSnapshot(parseArmoryJson(infoJson).profile, parseArmoryJson(equipmentJson).items!);
const list: BisList = {
  className: 'gladiator',
  updatedAt: '2025-01-01T00:00:00.000Z',
  entries: [
    { slot: 'MainHand', itemName: 'Sword', armoryId: 100 },
    { slot: 'Helmet', itemName: 'Helm' },
    { slot: 'Ring1', itemName: 'Ring B' },
    { slot: 'Arcana1', itemName: 'Chalice of Vigor' },
    { slot: 'Arcana2', itemName: 'Other Card' },
    { slot: 'Ring2', itemName: 'Different' },
  ],
};

describe('BiS comparison', () => {
  it('classifies match, missing and mismatch per slot', () => {
    const c = compareBis(list, snap);
    expect(c.rows.map((r) => r.status)).toEqual(['match', 'missing', 'match', 'match', 'missing', 'mismatch']);
    expect(c.matched).toBe(3);
    expect(c.missing.length).toBe(3);
  });
  it('prefers armory id over name', () => {
    const c = compareBis({ ...list, entries: [{ slot: 'MainHand', itemName: 'Sword', armoryId: 555 }] }, snap);
    expect(c.rows[0].status).toBe('mismatch');
  });
});

describe('BiS import', () => {
  it('parses JSON lists and reports problems', () => {
    const r = parseBisJson(JSON.stringify([{ className: 'Gladiator', entries: [{ slot: 'Ring1', name: 'A' }, { slot: 'Ring1', name: 'B' }, { slot: 'x' }] }, { className: 'gladiator', entries: [] }, { entries: [] }]));
    expect(r.lists.length).toBe(1);
    expect(r.lists[0].entries.length).toBe(1);
    expect(r.errors.length).toBe(2);
    expect(r.warnings.length).toBe(1);
    expect(parseBisJson('{').errors.length).toBe(1);
  });
  it('parses CSV with duplicate detection', () => {
    const r = parseBisCsv('class,slot,item,id\nGladiator,MainHand,Sword,100\nGladiator,MainHand,Sword2,\nTemplar,Helmet,Helm,\n,Ring1,Ring,');
    expect(r.lists.map((l) => l.className).sort()).toEqual(['gladiator', 'templar']);
    expect(r.lists[0].entries[0].armoryId).toBe(100);
    expect(r.errors.length).toBe(2);
    expect(parseBisCsv('a,b\n1,2').errors[0]).toMatch(/Header/);
  });
  it('merges slots or replaces whole lists', () => {
    const imp: BisList[] = [{ className: 'gladiator', updatedAt: 'x', entries: [{ slot: 'Helmet', itemName: 'New Helm' }] }];
    const merged = applyBisImport([list], imp, 'merge');
    expect(merged[0].entries.length).toBe(list.entries.length);
    expect(merged[0].entries.find((e) => e.slot === 'Helmet')?.itemName).toBe('New Helm');
    expect(applyBisImport([list], imp, 'replace')[0].entries.length).toBe(1);
  });
});

describe('schema v5 and backup', () => {
  it('migrates v4 data adding empty BiS and cache', () => {
    const v4 = { ...emptyUserData(), schemaVersion: 4 } as Record<string, unknown>;
    delete v4['bisLists'];
    delete v4['armoryCache'];
    expect(MIGRATIONS[4](v4)['schemaVersion']).toBe(5);
    const { data, fromVersion } = migrateUserData(v4);
    expect(fromVersion).toBe(4);
    expect(data.bisLists).toEqual([]);
    expect(data.armoryCache).toEqual([]);
  });
  it('drops invalid BiS data on normalize and round-trips through backup', () => {
    const d = { ...emptyUserData(), bisLists: [list, { className: '' }], armoryCache: [snap, 5] } as any;
    const { data } = migrateUserData(d);
    expect(data.bisLists.length).toBe(1);
    expect(data.armoryCache.length).toBe(1);
    const parsed = parseBackup(JSON.stringify(buildBackup(data, "t")));
    expect(parsed.data?.bisLists.length).toBe(1);
    const r = applyBackup(emptyUserData(), data, 'merge');
    expect(r.data.bisLists.length).toBe(1);
    expect(r.data.armoryCache.length).toBe(1);
  });
});

describe('BiS scoring (own heuristic)', () => {
  const item = { slot: 1, slotName: 'MainHand', id: 100, name: 'Sword', grade: 'Legend', enchant: 15, exceed: 5, stats: [{ name: 'Attack', value: 50, max: 100 }] };
  it('maps scores to letters', () => {
    expect([100, 90, 80, 65, 45, 10].map(letterGrade)).toEqual(['S+', 'S', 'A', 'B', 'C', 'D']);
  });
  it('scores a maxed BiS item at 100 and flags stats', () => {
    const e = { slot: 'MainHand', itemName: 'Sword', armoryId: 100, stats: [{ name: 'Attack' }, { name: 'Crit' }] };
    const r = scoreItem({ ...item, stats: [{ name: 'Attack', value: 100 }] }, e);
    expect(r.statChecks.map((s) => s.have)).toEqual([true, false]);
    expect(r.score).toBe(Math.round((100 * (0.3 + 0.25 + 0.15 + 0.15 + 0.3)) / 1.3));
    expect(scoreItem({ ...item, enchant: 0, exceed: 0 }).score).toBeLessThan(60);
  });
  it('penalises a non-BiS item and ignores unscored slots in the overall grade', () => {
    const e = { slot: 'MainHand', itemName: 'Other' };
    expect(scoreItem(item, e).score).toBeLessThan(scoreItem(item).score);
    const belt = { ...item, slotName: 'Belt' };
    const o = overallGrade([{ item, score: scoreItem(item) }, { item: belt, score: { score: 0, letter: 'D', statChecks: [] } }]);
    expect(o?.score).toBe(scoreItem(item).score);
    expect(overallGrade([])).toBeNull();
  });
  it('parses stat cells and JSON stat lists', () => {
    expect(parseStatCell('Attack:10;Crit')).toEqual([{ name: 'Attack', max: 10 }, { name: 'Crit', max: undefined }]);
    const r = parseBisJson(JSON.stringify([{ className: 'c', entries: [{ slot: 'Ring1', name: 'R', stats: ['A', { name: 'B', max: 3 }] }] }]));
    expect(r.lists[0].entries[0].stats).toEqual([{ name: 'A' }, { name: 'B', max: 3 }]);
    expect(parseBisCsv('class,slot,item,stats\nc,Ring1,R,A:2').lists[0].entries[0].stats).toEqual([{ name: 'A', max: 2 }]);
  });
});

describe('armory function validation', () => {
  const v = (q: string) => validate(new URLSearchParams(q));
  it('builds fixed-host search and character URLs', () => {
    const s = v('region=la&keyword=Akrios');
    expect(s.ok && s.urls[0]).toBe('https://api-search.plaync.com/aion2global/search/v2/character?keyword=Akrios&region=la&localeInfo=en-US');
    const c = v('region=la&characterId=QXqaL3Kug_lIiNDi%3D&serverId=2402');
    expect(c.ok && c.urls.length).toBe(2);
    expect(c.ok && c.urls.every((u) => u.startsWith('https://aion2.plaync.com/api/character/'))).toBe(true);
  });
  it('rejects bad input', () => {
    for (const q of ['region=xx&keyword=ab', 'region=la&keyword=a', 'region=la&keyword=' + 'a'.repeat(30), 'region=la&keyword=a<b>', 'region=la&characterId=../../x&serverId=2402', 'region=la&characterId=abcdefghij&serverId=12', 'region=la', '']) {
      expect(v(q).ok, q).toBe(false);
    }
  });
  it('rate limits per key within a window', () => {
    let t = 0;
    const allow = makeLimiter(2, 1000, () => t);
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true]);
    t = 1500;
    expect(allow('a')).toBe(true);
  });
});

describe('lookup helpers and starter template', () => {
  it('picks an exact name on the chosen server only when unique', () => {
    const l = [
      { characterId: '1', name: 'Akrios', serverId: 2402, serverName: 'Zikel' },
      { characterId: '2', name: 'Akrios', serverId: 2311, serverName: 'Ludra' },
      { characterId: '3', name: 'Akrios2', serverId: 2402, serverName: 'Zikel' },
    ];
    expect(pickCandidate(l, 'akrios', 'Zikel')?.characterId).toBe('1');
    expect(pickCandidate(l, 'Akrios', '')).toBeNull();
  });
  it('creates an all-slots starter list that survives normalization and is not scored', () => {
    const s = starterBisList('Cleric');
    expect(s.className).toBe('cleric');
    expect(s.entries.length).toBeGreaterThan(20);
    expect(s.entries.every((e) => e.itemName === '')).toBe(true);
    const { data } = migrateUserData({ ...emptyUserData(), bisLists: [s] });
    expect(data.bisLists[0].entries.length).toBe(s.entries.length);
    const c = compareBis(s, snap);
    expect(c.total).toBe(0);
    expect(c.rows.every((r) => r.status === 'unset')).toBe(true);
  });
});
