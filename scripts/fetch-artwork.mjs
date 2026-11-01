// Imports the Pantheon Artwork effects table from Game8 into public/data/artwork.json.
// Usage: node scripts/fetch-artwork.mjs
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://game8.co/games/Aion-2/archives/614593';
const html = await (await fetch(SOURCE)).text();
const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const items = [];
for (const r of rows) {
  const name = /alt='([^']+)'/.exec(r)?.[1]?.trim();
  const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (!name || name === 'Artwork' || tds.length < 3) continue;
  const rarity = tds[1].replace(/<[^>]+>/g, '').trim();
  const effects = [...tds[2].matchAll(/([A-Za-z' ]+?)\s*\(([A-Za-z' ]+)\)\s*\+(\d+)/g)].map((m) => ({
    attribute: m[1].trim(),
    deity: m[2].trim(),
    value: Number(m[3]),
  }));
  items.push({ name, rarity, effects });
}
const out = { source: SOURCE, importedAt: new Date().toISOString(), count: items.length, items };
writeFileSync(new URL('../public/data/artwork.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`artwork: ${items.length} (${items.filter((i) => !i.effects.length).length} without parsed effects)`);
