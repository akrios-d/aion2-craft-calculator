#!/usr/bin/env node
/**
 * Adds icon URLs to public/data/items.json (as `icon`), read from the public Aion2.gg recipe pages
 * already listed in public/data/recipes.json. Images are NOT downloaded; the app links to them.
 * Same rules as fetch-aion2gg.mjs: only with the site operator's permission; public HTML pages only.
 *
 * Usage: node scripts/fetch-aion2gg-icons.mjs [--delay 700]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const idx = process.argv.indexOf('--delay');
const delay = idx > 0 ? Number(process.argv[idx + 1]) : 700;
const UA = 'Aion2CraftLab-import/1.0 (personal crafting calculator; operator permission)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const itemsPath = resolve(root, 'public/data/items.json');
const items = JSON.parse(readFileSync(itemsPath, 'utf8'));
const recipes = JSON.parse(readFileSync(resolve(root, 'public/data/recipes.json'), 'utf8'));
const byId = new Map(items.map((i) => [i.id, i]));
const icons = new Map();

let n = 0;
for (const r of recipes) {
  n++;
  let html = null;
  for (let attempt = 1; attempt <= 3 && !html; attempt++) {
    const res = await fetch(r.sourceUrl, { headers: { 'user-agent': UA } });
    if (res.ok) html = await res.text();
    else await sleep(delay * attempt * 2);
  }
  await sleep(delay);
  if (!html) { console.warn(`skip ${r.sourceUrl}`); continue; }
  const product = html.match(/class="craft-module__VsEHQa__icon" src="([^"]+)"/)?.[1];
  if (product && !icons.has(r.outputItemId)) icons.set(r.outputItemId, product);
  for (const m of html.matchAll(/<li class="craft-module__VsEHQa__mat"><span[^>]*><img class="a2-slot__icon" src="([^"]+)"[^>]*\/><\/span>[\s\S]*?database\/items\/[a-z0-9-]+-(\d+)"/g)) {
    if (!icons.has(m[2])) icons.set(m[2], m[1]);
  }
  if (n % 50 === 0) console.log(`recipe ${n}/${recipes.length}`);
}

let added = 0;
for (const [id, icon] of icons) {
  const item = byId.get(id);
  if (item) { item.icon = icon; added++; }
}
writeFileSync(itemsPath, JSON.stringify(items, null, 2) + '\n');
console.log(`Icons added for ${added} of ${items.length} items.`);
