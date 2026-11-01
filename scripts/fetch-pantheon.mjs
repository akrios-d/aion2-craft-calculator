// Imports the Pantheon decor (artwork, statues, colossi) from Game8 into public/data/pantheon.json:
// effects from the list pages, plus how each piece is obtained from its detail page.
// Usage: node scripts/fetch-pantheon.mjs
import { writeFileSync } from 'node:fs';

const SOURCES = {
  artwork: 'https://game8.co/games/Aion-2/archives/614593',
  statue: 'https://game8.co/games/Aion-2/archives/614581',
  colossus: 'https://game8.co/games/Aion-2/archives/613814',
};
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function detail(id) {
  const res = await fetch(`https://game8.co/games/Aion-2/archives/${id}`);
  if (!res.ok) return {};
  const html = (await res.text()).replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const start = html.indexOf("id='hm_1'");
  if (start < 0) return {};
  const obtain = text(/id='hm_1'>([^<]*)/.exec(html)?.[1] ?? '');
  const body = text(html.slice(start, start + 8000));
  const src = /Source\(s\)(.*?)Effects/.exec(body)?.[1] ?? '';
  const sources = src.split('・').map((s) => s.trim()).filter(Boolean);
  return { sources, origins: origins(obtain, sources) };
}

// Source categories used by the Pantheon filter, derived from the prefix of each Game8 source line.
function origins(obtain, sources) {
  const set = new Set();
  const byPrefix = { 'Substance Morph': 'Substance Morph', Achievement: 'Achievement', Expedition: 'Expedition', 'Trade Shop': 'Trade Shop', Quest: 'Quest', Ascension: 'Quest' };
  for (const s of sources) {
    const p = Object.keys(byPrefix).find((k) => s.startsWith(k + ':'));
    if (p) set.add(byPrefix[p]);
    else if (s !== 'TBD' && /Monster Loot/.test(obtain)) set.add('Monster Loot');
    else if (s !== 'TBD' && !/Effects and Stats/.test(obtain)) set.add(obtain);
  }
  return set.size ? [...set] : ['Unknown'];
}

const items = [];
for (const [type, source] of Object.entries(SOURCES)) {
  const html = await (await fetch(source)).text();
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  for (const r of rows) {
    const name = /alt='([^']+)'/.exec(r)?.[1]?.trim();
    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (!name || name === 'Artwork' || tds.length < 3) continue;
    const icon = /data-src='([^']+)'/.exec(r)?.[1];
    const id = /archives\/(\d+)/.exec(r)?.[1];
    const rarity = tds[1].replace(/<[^>]+>/g, '').trim();
    const effects = [...tds[2].matchAll(/([A-Za-z' ]+?)\s*\(([A-Za-z' ]+)\)\s*\+(\d+)/g)].map((m) => ({
      attribute: m[1].trim(),
      deity: m[2].trim(),
      value: Number(m[3]),
    }));
    const d = id ? await detail(id) : {};
    items.push({ type, name, rarity, icon, effects, ...d });
  }
}
const out = { sources: SOURCES, importedAt: new Date().toISOString(), count: items.length, items };
writeFileSync(new URL('../public/data/pantheon.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`pantheon: ${items.length} (${items.filter((i) => !i.effects.length).length} without effects, ${items.filter((i) => !i.origins).length} without origins)`);
const g = {};
for (const i of items) for (const o of i.origins ?? ['?']) g[o] = (g[o] ?? 0) + 1;
console.log(g);
