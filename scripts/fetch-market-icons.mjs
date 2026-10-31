#!/usr/bin/env node
/**
 * Builds public/data/market-icons.json: icon URLs (linked from the Aion2.gg CDN, not bundled) for items that are
 * listed on the market (aion2.exchange) but absent from the static recipe catalogue (armor, artwork, skins, ...).
 * Icons are read from each item's public Aion2.gg database page.
 *
 * Usage: node scripts/fetch-market-icons.mjs [--delay 400]
 * Re-running keeps icons already found and only fetches missing ones.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const delayArg = process.argv.indexOf('--delay');
const delay = delayArg > 0 ? Number(process.argv[delayArg + 1]) : 400;
const OUT = 'public/data/market-icons.json';
const catalog = new Set(JSON.parse(readFileSync('public/data/items.json', 'utf8')).map((i) => i.id));
const icons = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const headers = { 'user-agent': 'Mozilla/5.0 (aion2-craft-lab icon import)' };

const market = await (await fetch('https://aion2.exchange/api/items?limit=1000&server=12402', { headers })).json();
const todo = market.items.map((i) => String(i.item_key)).filter((id) => !catalog.has(id) && !icons[id]);
console.log(`${todo.length} market-only items without an icon`);

let found = 0;
for (const [n, id] of todo.entries()) {
  try {
    const res = await fetch(`https://aion2.gg/database/items/${id}`, { headers });
    if (res.ok) {
      const html = await res.text();
      const icon = html.match(/heroSlot"[^>]*><img class="a2-slot__icon" src="([^"]+)"/)?.[1];
      if (icon) {
        icons[id] = icon;
        found++;
      }
    }
  } catch {
    /* skip; re-run to retry */
  }
  if (n % 25 === 0) console.log(`${n}/${todo.length}`);
  await new Promise((r) => setTimeout(r, delay));
}
writeFileSync(OUT, JSON.stringify(icons, null, 1) + '\n');
console.log(`Found ${found} new icons; ${Object.keys(icons).length} total -> ${OUT}`);
