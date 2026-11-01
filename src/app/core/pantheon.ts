import { Item } from './models';

export interface ArtworkEffect {
  attribute: string;
  deity: string;
  value: number;
}

export type PantheonType = 'artwork' | 'statue' | 'colossus';

export interface ArtworkEntry {
  type: PantheonType;
  name: string;
  rarity: string;
  effects: ArtworkEffect[];
  /** Source categories (Monster Loot, Substance Morph, Trade Shop, Quest, Expedition, Achievement, Unknown). */
  origins?: string[];
  /** Icon URL from the imported data. */
  icon?: string;
  /** Source lines as listed by Game8. */
  sources?: string[];
}

export interface ArtworkRow extends ArtworkEntry {
  /** Market/catalogue item id when the artwork is a known item. */
  itemId?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/^(artwork|statue|colossus):\s*/, '').replace(/\s+/g, ' ').trim();

/** Links artwork entries to items by name ("Artwork: <name>"). Unmatched entries keep no id. */
export function linkArtwork(entries: readonly ArtworkEntry[], items: readonly Item[]): ArtworkRow[] {
  const byName = new Map<string, string>();
  for (const i of items) {
    const m = /^(artwork|statue|colossus):/i.exec(i.name);
    if (m) byName.set(`|${norm(i.name)}`, i.id);
  }
  return entries.map((e) => ({ ...e, itemId: byName.get(`|${norm(e.name)}`) }));
}

export function artworkOrigins(rows: readonly ArtworkEntry[]): string[] {
  return [...new Set(rows.flatMap((r) => r.origins ?? ['Unknown']))].sort();
}

export function artworkAttributes(rows: readonly ArtworkEntry[]): string[] {
  return [...new Set(rows.flatMap((r) => r.effects.map((e) => e.attribute)))].sort();
}

/** Keeps artwork granting every ('and') or any ('or') selected attribute (empty selection keeps all), optionally by rarity and name. */
export function filterArtwork(rows: readonly ArtworkRow[], attributes: readonly string[], rarity = '', query = '', type: PantheonType | '' = '', mode: 'and' | 'or' = 'and', origin = ''): ArtworkRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (mode === 'or' ? !attributes.length || attributes.some((a) => r.effects.some((e) => e.attribute === a)) : attributes.every((a) => r.effects.some((e) => e.attribute === a))) &&
      (!type || r.type === type) &&
      (!origin || (r.origins ?? ['Unknown']).includes(origin)) &&
      (!rarity || r.rarity === rarity) &&
      (!q || r.name.toLowerCase().includes(q)),
  );
}

export const PANTHEON_SLOTS: Record<PantheonType, number> = { colossus: 1, statue: 4, artwork: 12 };

export const buildKey = (r: Pick<ArtworkEntry, 'type' | 'name'>): string => `${r.type}|${r.name}`;

/** Adds an entry to a build; returns the same list when full or duplicated. */
export function addToBuild(keys: string[], r: Pick<ArtworkEntry, 'type' | 'name'>): string[] {
  const k = buildKey(r);
  if (keys.includes(k)) return keys;
  if (keys.filter((x) => x.startsWith(r.type + '|')).length >= PANTHEON_SLOTS[r.type]) return keys;
  return [...keys, k];
}

/** Sums effect values per attribute for the build entries. */
export function buildTotals(entries: ArtworkEntry[]): { attribute: string; value: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) for (const f of e.effects) m.set(f.attribute, (m.get(f.attribute) ?? 0) + f.value);
  return [...m].map(([attribute, value]) => ({ attribute, value })).sort((a, b) => b.value - a.value);
}
