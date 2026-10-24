import { describe, expect, it } from 'vitest';
import { addCharacter, deleteCharacter, renameCharacter, switchCharacter } from './characters';
import { migrateUserData, emptyUserData } from './storage/schema';

const plan = (id: string, characterId: string) => ({
  id,
  characterId,
  name: id,
  targetItemId: 'x',
  quantity: 1,
  server: 'Zikel SA',
  createdAt: '2024-01-01T00:00:00.000Z',
});

describe('characters', () => {
  it('migrates v2 data into a Main character', () => {
    const v2 = {
      schemaVersion: 2,
      inventory: { a: { quantity: 3, updatedAt: '2024-01-01T00:00:00.000Z' } },
      plans: [{ id: 'p', name: 'P', targetItemId: 'x', quantity: 1, server: 'Zikel SA', createdAt: '2024-01-01T00:00:00.000Z' }],
    };
    const d = migrateUserData(v2).data;
    expect(d.characters).toHaveLength(1);
    expect(d.inventory['a'].quantity).toBe(3);
    expect(d.plans[0].characterId).toBe(d.activeCharacterId);
  });

  it('keeps the inventory shared and strategies separate when switching', () => {
    let d = emptyUserData();
    d = { ...d, inventory: { a: { quantity: 1, updatedAt: '' } }, strategies: { a: 'buy' } };
    d = addCharacter(d, 'Alt', 'alt');
    expect(d.activeCharacterId).toBe('alt');
    expect(d.inventory['a'].quantity).toBe(1);
    expect(d.strategies).toEqual({});
    d = switchCharacter(d, 'main');
    expect(d.strategies['a']).toBe('buy');
  });

  it('renames and deletes characters with their plans, keeping at least one', () => {
    let d = addCharacter(emptyUserData(), 'Alt', 'alt');
    d = { ...d, plans: [plan('p1', 'main'), plan('p2', 'alt')] };
    d = renameCharacter(d, 'alt', 'Renamed');
    expect(d.characters.find((c) => c.id === 'alt')?.name).toBe('Renamed');
    d = deleteCharacter(d, 'alt');
    expect(d.characters.map((c) => c.id)).toEqual(['main']);
    expect(d.activeCharacterId).toBe('main');
    expect(d.plans.map((p) => p.id)).toEqual(['p1']);
    expect(deleteCharacter(d, 'main').characters).toHaveLength(1);
  });

  it('normalizes a bad active character id and orphan plans', () => {
    const raw = { ...emptyUserData(), activeCharacterId: 'nope', plans: [plan('p', 'ghost')] };
    const d = migrateUserData(raw).data;
    expect(d.activeCharacterId).toBe('main');
    expect(d.plans[0].characterId).toBe('main');
  });
});
