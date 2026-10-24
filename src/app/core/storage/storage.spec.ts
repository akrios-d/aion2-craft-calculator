import { syncActiveCharacter } from '../characters';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, SchemaError, emptyUserData, migrateUserData } from './schema';
import { CORRUPT_BACKUP_KEY, STORAGE_KEY, StorageLike, UserDataStorage } from './user-data-storage';

class MemoryStorage implements StorageLike {
  store = new Map<string, string>();
  failWrites = false;
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.failWrites) throw new Error('QuotaExceededError'); this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
}

describe('LocalStorage schema migrations', () => {
  it('has a migration for every historical version', () => {
    for (let v = 0; v < CURRENT_SCHEMA_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function');
  });

  it('migrates unversioned v0 data (array inventory, flat prices) to the current schema', () => {
    const v0 = {
      inventory: [{ id: 'ore', qty: 4 }],
      prices: [{ itemId: 'ore', buy: 10, sell: 12, date: '2026-01-02T00:00:00.000Z' }],
      settings: { server: 'Other' },
    };
    const { data, fromVersion } = migrateUserData(v0);
    expect(fromVersion).toBe(0);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.inventory['ore'].quantity).toBe(4);
    expect(data.prices['Other|ore']).toMatchObject({ itemId: 'ore', server: 'Other', buyPrice: 10, sellListingPrice: 12 });
    expect(data.priceHistory).toHaveLength(1);
    expect(data.settings.server).toBe('Other');
  });

  it('migrates v1 data (server-less prices) and defaults the server', () => {
    const v1 = {
      schemaVersion: 1,
      inventory: { ore: 3 },
      prices: { ore: { itemId: 'ore', buyPrice: 5, observedAt: '2026-01-01T00:00:00.000Z' } },
      settings: {},
    };
    const { data } = migrateUserData(v1);
    expect(data.prices['Zikel SA|ore'].server).toBe('Zikel SA');
    expect(data.inventory['ore'].quantity).toBe(3);
    expect(data.plans).toEqual([]);
  });

  it('is a no-op for current data and preserves it', () => {
    const cur = emptyUserData();
    cur.inventory['x'] = { quantity: 2, updatedAt: '2026-01-01T00:00:00.000Z' };
    cur.strategies['x'] = 'buy';
    const { data, fromVersion } = migrateUserData(JSON.parse(JSON.stringify(syncActiveCharacter(cur))));
    expect(fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data).toEqual(syncActiveCharacter(cur));
  });

  it('drops malformed records with warnings rather than failing', () => {
    const { data, warnings } = migrateUserData({
      schemaVersion: 2,
      inventory: { a: -1, b: 'x', c: 2 },
      prices: { k: { itemId: 'a' }, ok: { itemId: 'c', server: 'S', buyPrice: 1, observedAt: '2026-01-01T00:00:00.000Z' } },
      plans: [{ nope: true }],
    });
    expect(Object.keys(data.inventory)).toEqual(['c']);
    expect(Object.keys(data.prices)).toEqual(['S|c']);
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });

  it('refuses data from a newer schema and non-object data', () => {
    expect(() => migrateUserData({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(SchemaError);
    expect(() => migrateUserData('str')).toThrow(SchemaError);
    expect(() => migrateUserData([])).toThrow(SchemaError);
    expect(() => migrateUserData({ schemaVersion: -3 })).toThrow(SchemaError);
  });
});

describe('UserDataStorage', () => {
  it('returns empty defaults on first run', () => {
    const r = new UserDataStorage(new MemoryStorage()).load();
    expect(r.status).toBe('empty');
    expect(r.data.settings.server).toBe('Zikel SA');
  });

  it('saves and reloads', () => {
    const mem = new MemoryStorage();
    const s = new UserDataStorage(mem);
    const d = emptyUserData();
    d.settings.server = 'Custom';
    expect(s.save(d)).toBeNull();
    expect(new UserDataStorage(mem).load()).toMatchObject({ status: 'ok', data: { settings: { server: 'Custom' } } });
  });

  it('reports migrated status when old data is upgraded', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify({ inventory: { ore: 1 } }));
    expect(new UserDataStorage(mem).load().status).toBe('migrated');
  });

  it('flags corrupted JSON without deleting it and offers the raw text', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, '{broken');
    const s = new UserDataStorage(mem);
    const r = s.load();
    expect(r.status).toBe('corrupted');
    expect(r.message).toMatch(/backup/i);
    expect(r.rawText).toBe('{broken');
    expect(mem.getItem(STORAGE_KEY)).toBe('{broken');
    s.quarantine(r.rawText!);
    expect(mem.getItem(CORRUPT_BACKUP_KEY)).toBe('{broken');
  });

  it('flags data from a newer schema as unreadable', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99 }));
    expect(new UserDataStorage(mem).load().status).toBe('corrupted');
  });

  it('handles unavailable storage', () => {
    const s = new UserDataStorage(null);
    expect(s.load().status).toBe('unavailable');
    expect(s.save(emptyUserData())).toMatch(/unavailable/);
  });

  it('handles a storage that throws on read', () => {
    const throwing: StorageLike = { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} };
    expect(new UserDataStorage(throwing).load().status).toBe('unavailable');
  });

  it('returns an error message when storage is full', () => {
    const mem = new MemoryStorage();
    mem.failWrites = true;
    expect(new UserDataStorage(mem).save(emptyUserData())).toMatch(/full|Could not save/);
  });
});
