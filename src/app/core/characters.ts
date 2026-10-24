import { Character, UserData } from './models';

/** Copies the working inventory/strategies/choices into the active character's stored record. */
export function syncActiveCharacter(d: UserData): UserData {
  return {
    ...d,
    characters: d.characters.map((c) =>
      c.id === d.activeCharacterId ? { ...c, inventory: d.inventory, strategies: d.strategies, recipeChoices: d.recipeChoices } : c,
    ),
  };
}

export function switchCharacter(d: UserData, id: string): UserData {
  const synced = syncActiveCharacter(d);
  const target = synced.characters.find((c) => c.id === id);
  if (!target) return d;
  return { ...synced, activeCharacterId: id, inventory: target.inventory, strategies: target.strategies, recipeChoices: target.recipeChoices };
}

export function addCharacter(d: UserData, name: string, id: string): UserData {
  const ch: Character = { id, name: name.trim() || 'Character', inventory: {}, strategies: {}, recipeChoices: {} };
  return switchCharacter({ ...syncActiveCharacter(d), characters: [...d.characters, ch] }, id);
}

export function renameCharacter(d: UserData, id: string, name: string): UserData {
  const n = name.trim();
  if (!n) return d;
  return { ...d, characters: d.characters.map((c) => (c.id === id ? { ...c, name: n } : c)) };
}

/** Removes a character and its plans. The last remaining character cannot be deleted. */
export function deleteCharacter(d: UserData, id: string): UserData {
  if (d.characters.length <= 1 || !d.characters.some((c) => c.id === id)) return d;
  const rest = d.characters.filter((c) => c.id !== id);
  const plans = d.plans.filter((p) => p.characterId !== id);
  const base = { ...syncActiveCharacter(d), characters: rest.length ? rest : d.characters, plans };
  return d.activeCharacterId === id ? switchCharacter(base, rest[0].id) : base;
}
