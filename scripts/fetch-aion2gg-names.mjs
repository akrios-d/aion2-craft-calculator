#!/usr/bin/env node
/**
 * Adds Portuguese (pt-br) item names to public/data/items.json (as `names.pt`), reading the
 * pt-br version of each recipe page already listed in public/data/recipes.json.
 * Same rules as fetch-aion2gg.mjs: only with the site operator's permission; public HTML pages only.
 *
 * Usage: node scripts/fetch-aion2gg-names.mjs [--delay 700]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const delay = Number(args.delay ?? 700);
const UA = 'Aion2CraftLab-import/1.0 (personal crafting calculator; operator permission)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const itemsPath = resolve(root, 'public/data/items.json');
const items = JSON.parse(readFileSync(itemsPath, 'utf8'));
const recipes = JSON.parse(readFileSync(resolve(root, 'public/data/recipes.json'), 'utf8'));
const byId = new Map(items.map((i) => [i.id, i]));
const names = new Map();

let n = 0;
for (const r of recipes) {
  n++;
  const url = r.sourceUrl.replace('aion2.gg/', 'aion2.gg/pt-br/');
  let html = null;
  for (let attempt = 1; attempt <= 3 && !html; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' } });
    if (res.ok) html = await res.text();
    else await sleep(delay * attempt * 2);
  }
  await sleep(delay);
  if (!html) { console.warn(`skip ${url}`); continue; }
  const matStart = html.indexOf('craft-module__VsEHQa__matTitle');
  const matEnd = html.indexOf('Resumo', matStart);
  const matHtml = html.slice(matStart, matEnd > 0 ? matEnd : undefined);
  for (const m of matHtml.matchAll(/database\/items\/[a-z0-9-]+-(\d+)">([^<]+)<\/a><\/span><span class="[^"]*matCount">/g)) {
    if (!names.has(m[1])) names.set(m[1], decode(m[2]).trim());
  }
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]*>/g, '').trim();
  if (h1 && !names.has(r.outputItemId)) names.set(r.outputItemId, decode(h1));
  if (n % 50 === 0) console.log(`recipe ${n}/${recipes.length}`);
}

let added = 0;
for (const [id, pt] of names) {
  const item = byId.get(id);
  if (item && pt) { item.names = { ...(item.names ?? {}), pt }; added++; }
}
writeFileSync(itemsPath, JSON.stringify(items, null, 2) + '\n');
console.log(`Portuguese names added for ${added} of ${items.length} items.`);
