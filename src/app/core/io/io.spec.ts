import { syncActiveCharacter } from '../characters';
import { Item, UserData } from '../models';
import { emptyUserData } from '../storage/schema';
import { applyBackup, applyRecipePack, buildBackup, exportInventoryCsv, exportPricesCsv, parseBackup, parseRecipePack } from './backup';
import { parseCsv, toCsv } from './csv';
import { applyInventoryImport, applyPriceImport, parseInventoryCsv, parsePriceCsv, summarizeChanges } from './imports';

const items: Item[] = [
  { id: 'ore', name: 'Iron Ore', source: 't', verification: 'verified' },
  { id: 'wood', name: 'Oak Wood', source: 't', verification: 'verified' },
  { id: 'sap', name: 'Sap', source: 't', verification: 'verified' },
  { id: 'dup1', name: 'Twin', source: 't', verification: 'verified' },
  { id: 'dup2', name: 'twin', source: 't', verification: 'verified' },
];
const ctx = { items, defaultServer: 'Zikel SA', now: new Date('2026-05-01T00:00:00Z') };

describe('CSV parsing', () => {
  it('handles quotes, embedded delimiters, newlines, BOM and CRLF', () => {
    const r = parseCsv('\uFEFFa,b\r\n"x,1","he said ""hi"""\r\n"multi\nline",2\r\n');
    expect(r.rows).toEqual([['a', 'b'], ['x,1', 'he said "hi"'], ['multi\nline', '2']]);
  });

  it('detects semicolon delimiters and skips blank lines', () => {
    expect(parseCsv('a;b\n\n1;2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('reports unterminated quotes', () => {
    expect(parseCsv('a,b\n"oops,1').error).toBeTruthy();
  });

  it('neutralises formula injection on export', () => {
    expect(toCsv(['n'], [['=HYPERLINK("x")']], [0])).toContain(`'=HYPERLINK`);
  });
});

describe('price CSV import validation', () => {
  it('parses valid rows with defaults for server and timestamp', () => {
    const p = parsePriceCsv('itemId,buyPrice,sellListingPrice,quantityObserved,feePercent,notes\nore,10,12,50,5,"cheap, today"\n', ctx);
    expect(p.fatal).toBeUndefined();
    expect(p.records).toEqual([
      { itemId: 'ore', server: 'Zikel SA', buyPrice: 10, sellListingPrice: 12, quantityObserved: 50, feePercent: 5, observedAt: '2026-05-01T00:00:00.000Z', notes: 'cheap, today' },
    ]);
  });

  it('resolves item names case-insensitively and rejects ambiguous or unknown names', () => {
    const p = parsePriceCsv('itemName,buyPrice\niron ore,10\ntwin,5\nGhost,1\n', ctx);
    expect(p.records.map((r) => r.itemId)).toEqual(['ore']);
    expect(p.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('|')).toMatch(/ambiguous.*not found/);
  });

  it('flags invalid numbers, dates, fees and rows without prices', () => {
    const p = parsePriceCsv('itemId,buyPrice,sellListingPrice,feePercent,observedAt\nore,abc,,,\nwood,-5,,,\nore,1,,150,\nwood,1,,,not-a-date\nore,,,,\n', ctx);
    expect(p.records).toHaveLength(0);
    expect(p.issues.filter((i) => i.severity === 'error').length).toBeGreaterThanOrEqual(5);
  });

  it('detects duplicates within the file and reports the first line', () => {
    const p = parsePriceCsv('itemId,buyPrice\nore,1\nore,2\nwood,3\n', ctx);
    expect(p.records.map((r) => r.itemId)).toEqual(['ore', 'wood']);
    expect(p.issues.find((i) => i.message.includes('Duplicate'))?.line).toBe(3);
  });

  it('treats the same item on different servers as distinct', () => {
    const p = parsePriceCsv('itemId,buyPrice,server\nore,1,A\nore,2,B\n', ctx);
    expect(p.records).toHaveLength(2);
  });

  it('rejects ids that are not game items', () => {
    const p = parsePriceCsv('itemId,buyPrice\nunknown-1,5\n', ctx);
    expect(p.records).toHaveLength(0);
    expect(p.issues[0].severity).toBe('error');
  });

  it('fails fast on empty input and missing columns', () => {
    expect(parsePriceCsv('', ctx).fatal).toMatch(/empty/);
    expect(parsePriceCsv('foo,bar\n1,2', ctx).fatal).toMatch(/itemId/);
    expect(parsePriceCsv('itemId,x\nore,1', ctx).fatal).toMatch(/price column/);
  });
});

describe('price import merge and replace', () => {
  const existing: UserData = {
    ...emptyUserData(),
    prices: {
      'Zikel SA|ore': { itemId: 'ore', server: 'Zikel SA', buyPrice: 9, observedAt: '2026-04-01T00:00:00.000Z' },
      'Zikel SA|wood': { itemId: 'wood', server: 'Zikel SA', buyPrice: 3, observedAt: '2026-06-01T00:00:00.000Z' },
    },
  };

  it('merge adds, updates newer, keeps newer existing and never drops other records', () => {
    const p = parsePriceCsv('itemId,buyPrice,observedAt\nore,10,2026-05-01\nwood,99,2026-05-01\nsap,1,2026-05-01\n', ctx);
    const res = applyPriceImport(existing, p.records, 'merge');
    expect(res.data.prices['Zikel SA|ore'].buyPrice).toBe(10);
    expect(res.data.prices['Zikel SA|wood'].buyPrice).toBe(3);
    expect(res.data.prices['Zikel SA|sap'].buyPrice).toBe(1);
    expect(summarizeChanges(res.changes)).toMatchObject({ updated: 1, kept: 1, added: 1, removed: 0 });
    expect(res.data.priceHistory.length).toBe(3);
  });

  it('replace removes unlisted prices and lists them as removed in the preview', () => {
    const p = parsePriceCsv('itemId,buyPrice\nore,10\n', ctx);
    const res = applyPriceImport(existing, p.records, 'replace');
    expect(Object.keys(res.data.prices)).toEqual(['Zikel SA|ore']);
    expect(res.changes.filter((c) => c.kind === 'removed')).toHaveLength(1);
  });

  it('does not mutate the input data (preview is side-effect free)', () => {
    const snapshot = structuredClone(existing);
    applyPriceImport(existing, parsePriceCsv('itemId,buyPrice\nore,10\n', ctx).records, 'replace');
    expect(existing).toEqual(snapshot);
  });
});

describe('inventory CSV import', () => {
  const existing: UserData = { ...emptyUserData(), inventory: { ore: { quantity: 5, updatedAt: 'x' }, wood: { quantity: 2, updatedAt: 'x' } } };

  it('validates quantities and duplicates', () => {
    const p = parseInventoryCsv('itemId,quantity\nore,3\nore,4\nwood,-1\nwood,1.5\nsap,abc\nsap,7\n', ctx);
    expect(p.records).toEqual([{ itemId: 'ore', quantity: 3 }, { itemId: 'sap', quantity: 7 }]);
    expect(p.issues.filter((i) => i.severity === 'error')).toHaveLength(4);
  });

  it('merge overrides listed items and keeps the rest; zero removes', () => {
    const res = applyInventoryImport(existing, [{ itemId: 'ore', quantity: 0 }, { itemId: 'sap', quantity: 7 }], 'merge');
    expect(Object.keys(res.data.inventory).sort()).toEqual(['sap', 'wood']);
    expect(existing.inventory['ore'].quantity).toBe(5);
  });

  it('replace discards unlisted items', () => {
    const res = applyInventoryImport(existing, [{ itemId: 'sap', quantity: 7 }], 'replace');
    expect(Object.keys(res.data.inventory)).toEqual(['sap']);
    expect(res.changes.filter((c) => c.kind === 'removed')).toHaveLength(2);
  });

  it('requires the quantity column', () => {
    expect(parseInventoryCsv('itemId\nore', ctx).fatal).toMatch(/quantity/);
  });
});

describe('JSON backup and restore', () => {
  const data: UserData = syncActiveCharacter({
    ...emptyUserData(),
    inventory: { ore: { quantity: 5, updatedAt: '2026-01-01T00:00:00.000Z' } },
    prices: { 'Zikel SA|ore': { itemId: 'ore', server: 'Zikel SA', buyPrice: 9, observedAt: '2026-04-01T00:00:00.000Z' } },
    strategies: { ingot: 'buy' },
  });

  it('round-trips through export and parse', () => {
    const parsed = parseBackup(JSON.stringify(buildBackup(data, '1.0.0')));
    expect(parsed.error).toBeUndefined();
    expect(parsed.data).toEqual(data);
  });

  it('rejects invalid JSON, foreign files and future schemas', () => {
    expect(parseBackup('{nope').error).toMatch(/JSON/);
    expect(parseBackup('{"a":1}').error).toMatch(/Not a backup/);
    const future = { ...buildBackup(data, '1'), data: { ...data, schemaVersion: 999 } };
    expect(parseBackup(JSON.stringify(future)).error).toMatch(/newer version/);
  });

  it('merge keeps current records and takes newer incoming prices', () => {
    const current: UserData = { ...emptyUserData(), inventory: { wood: { quantity: 1, updatedAt: 'x' } }, prices: { 'Zikel SA|ore': { itemId: 'ore', server: 'Zikel SA', buyPrice: 1, observedAt: '2026-01-01T00:00:00.000Z' } } };
    const res = applyBackup(current, data, 'merge');
    expect(Object.keys(res.data.inventory).sort()).toEqual(['ore', 'wood']);
    expect(res.data.prices['Zikel SA|ore'].buyPrice).toBe(9);
  });

  it('replace swaps everything for the backup', () => {
    const current: UserData = { ...emptyUserData(), inventory: { wood: { quantity: 1, updatedAt: 'x' } } };
    expect(Object.keys(applyBackup(current, data, 'replace').data.inventory)).toEqual(['ore']);
  });

  it('exports CSVs that re-import cleanly', () => {
    const csv = exportPricesCsv(data.prices, (id) => (id === 'ore' ? 'Iron Ore' : id));
    const p = parsePriceCsv(csv, ctx);
    expect(p.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(p.records[0].buyPrice).toBe(9);
    const inv = parseInventoryCsv(exportInventoryCsv(data.inventory, (id) => id), ctx);
    expect(inv.records).toEqual([{ itemId: 'ore', quantity: 5 }]);
  });
});

describe('recipe pack import', () => {
  const known = new Set(['ore']);
  it('validates structure, duplicates and conflicts with existing ids', () => {
    const pack = {
      items: [{ id: 'ingot', name: 'Ingot' }, { id: 'ingot', name: 'again' }, { id: 'ore', name: 'clash' }, { name: 'no id' }],
      recipes: [
        { id: 'r1', outputItemId: 'ingot', outputQuantity: 2, ingredients: [{ itemId: 'ore', quantity: 3 }] },
        { id: 'r1', outputItemId: 'ingot', outputQuantity: 2, ingredients: [{ itemId: 'ore', quantity: 3 }] },
        { id: 'r2', outputItemId: 'ingot', outputQuantity: 0, ingredients: [{ itemId: 'ore', quantity: 3 }] },
      ],
    };
    const r = parseRecipePack(JSON.stringify(pack), known, new Set());
    expect(r.pack.items.map((i) => i.id)).toEqual(['ingot']);
    expect(r.pack.recipes.map((x) => x.id)).toEqual(['r1']);
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(5);
    const applied = applyRecipePack(emptyUserData(), r.pack);
    expect(applied.customRecipes[0].verification).toBe('user-entered');
  });

  it('rejects non-JSON and wrong shapes', () => {
    expect(parseRecipePack('x', known, new Set()).fatal).toBeTruthy();
    expect(parseRecipePack('[]', known, new Set()).fatal).toBeTruthy();
  });
});
