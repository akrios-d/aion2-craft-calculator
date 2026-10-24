#!/usr/bin/env node
/**
 * Adds COMBO recipes to public/data/recipes.json. A recipe page that shows a COMBO result item means
 * a craft yields that item only with the page's "COMBO per craft" chance, using the same materials.
 * Each becomes `combo-<recipeId>` (the COMBO chance is only noted, not used in costs).
 * Also marks same-named item variants that are "Bind on pickup" (`bound: true`).
 * Same rules as fetch-aion2gg.mjs: operator permission, public HTML only, polite delay. Idempotent.
 *
 * Usage: node scripts/add-combo-recipes.mjs [--delay 500]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const di = process.argv.indexOf('--delay');
const delay = di > 0 ? Number(process.argv[di + 1]) : 500;
const UA = 'Aion2CraftLab-import/1.0 (personal crafting calculator; operator permission)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = (n) => resolve(root, 'public/data', n);
const read = (n) => JSON.parse(readFileSync(file(n), 'utf8'));
const write = (n, v) => writeFileSync(file(n), JSON.stringify(v, null, 2) + '\n');

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (res.ok) return res.text();
    await sleep(delay * attempt * 2);
  }
  return null;
}

const items = read('items.json');
const itemIds = new Set(items.map((i) => i.id));
const all = read('recipes.json');
const base = all.filter((r) => !r.id.startsWith('combo-'));
const combos = [];
const failed = [];

for (const [n, r] of base.entries()) {
  if (r.source !== 'aion2.gg') continue;
  const html = await get(r.sourceUrl);
  if (!html) { failed.push(r.id); continue; }
  const m = /<a [^>]*href="\/database\/items\/[^"]*?-(\d+)"[^>]*>(?:(?!<\/a>)[\s\S])*?comboTag/.exec(html);
  const chance = /COMBO per craft<\/dt><dd[^>]*>([\d.]+)%/.exec(html);
  if (m && chance && itemIds.has(m[1]) && m[1] !== r.outputItemId) {
    combos.push({
      ...r,
      id: `combo-${r.id}`,
      outputItemId: m[1],
      notes: `COMBO result of recipe ${r.id}: only ${chance[1]}% of crafts (lowest proficiency; up to more at higher proficiency) yield this item.`,
    });
  }
  if ((n + 1) % 50 === 0) console.log(`${n + 1}/${base.length}`);
  await sleep(delay);
}

write('recipes.json', [...base, ...combos]);

const manifest = read('data-manifest.json');
manifest.recipeCount = base.length + combos.length;
manifest.verificationStatus = `${manifest.verifiedRecipeCount} of ${manifest.recipeCount} recipes verified`;
manifest.knownLimitations = [
  ...(manifest.knownLimitations ?? []).filter((l) => !l.startsWith('COMBO recipes')),
  `COMBO recipes (${combos.length}) use the lowest-proficiency COMBO chance as an expected yield; real chances vary with proficiency.`,
];
write('data-manifest.json', manifest);

// Same-named items in the same faction differ by binding; note which one is Bind on pickup.
const counts = new Map();
for (const i of items) counts.set(i.name + '|' + i.faction, (counts.get(i.name + '|' + i.faction) ?? 0) + 1);
for (const i of items.filter((x) => x.faction && counts.get(x.name + '|' + x.faction) > 1)) {
  const html = await get(i.sourceUrl);
  if (html) i.bound = /Bind on pickup/.test(html);
  await sleep(delay);
}
write('items.json', items);
console.log(`Combo recipes added: ${combos.length}; pages failed: ${failed.length}`);
