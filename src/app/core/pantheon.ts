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

export function artworkAttributes(rows: readonly ArtworkEntry[]): string[] {
  return [...new Set(rows.flatMap((r) => r.effects.map((e) => e.attribute)))].sort();
}

/** Keeps artwork granting every selected attribute (empty selection keeps all), optionally by rarity and name. */
export function filterArtwork(rows: readonly ArtworkRow[], attributes: readonly string[], rarity = '', query = '', type: PantheonType | '' = ''): ArtworkRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      attributes.every((a) => r.effects.some((e) => e.attribute === a)) &&
      (!type || r.type === type) &&
      (!rarity || r.rarity === rarity) &&
      (!q || r.name.toLowerCase().includes(q)),
  );
}
