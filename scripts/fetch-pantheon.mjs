// Imports the Pantheon decor (artwork, statues, colossi) effect tables from Game8 into public/data/pantheon.json.
// Usage: node scripts/fetch-artwork.mjs
import { writeFileSync } from 'node:fs';

const SOURCES = {
  artwork: 'https://game8.co/games/Aion-2/archives/614593',
  statue: 'https://game8.co/games/Aion-2/archives/614581',
  colossus: 'https://game8.co/games/Aion-2/archives/613814',
};
const items = [];
for (const [type, source] of Object.entries(SOURCES)) {
const html = await (await fetch(source)).text();
const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
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
  items.push({ type, name, rarity, effects });
}
}
const out = { sources: SOURCES, importedAt: new Date().toISOString(), count: items.length, items };
writeFileSync(new URL('../public/data/pantheon.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`pantheon: ${items.length} (${items.filter((i) => !i.effects.length).length} without parsed effects)`);
