#!/usr/bin/env node
/**
 * Adds `faction` ("Elyos" | "Asmodians") to items that share their name with another item, so the
 * item picker can tell the two variants apart. Reads the public item page (same rules as
 * fetch-aion2gg.mjs: operator permission, public HTML only, polite delay).
 *
 * Usage: node scripts/fetch-aion2gg-factions.mjs [--delay 700]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const di = process.argv.indexOf('--delay');
const delay = di > 0 ? Number(process.argv[di + 1]) : 700;
const UA = 'Aion2CraftLab-import/1.0 (personal crafting calculator; operator permission)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const path = resolve(root, 'public/data/items.json');
const items = JSON.parse(readFileSync(path, 'utf8'));
const counts = new Map();
for (const i of items) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
const targets = items.filter((i) => counts.get(i.name) > 1 && i.sourceUrl && !i.faction);

let done = 0;
const failed = [];
for (const item of targets) {
  let html = null;
  for (let attempt = 1; attempt <= 3 && !html; attempt++) {
    const res = await fetch(item.sourceUrl, { headers: { 'user-agent': UA } });
    if (res.ok) html = await res.text();
    else await sleep(delay * attempt * 2);
  }
  const m = html && (/aria-current="true"[^>]*><i[^>]*><\/i>(Elyos|Asmodians?)</.exec(html) ?? /items-module__\w+__flag [^>]*title="(Elyos|Asmodians?)"/.exec(html));
  if (m) item.faction = m[1].startsWith('Asmodian') ? 'Asmodians' : 'Elyos';
  else failed.push(item.id);
  if (++done % 25 === 0) console.log(`${done}/${targets.length}`);
  await sleep(delay);
}

writeFileSync(path, JSON.stringify(items, null, 2) + '\n');
console.log(`Faction set on ${targets.length - failed.length}/${targets.length} items.${failed.length ? ' Unresolved: ' + failed.join(', ') : ''}`);
