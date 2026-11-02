// One-shot MAINTAINER script: fetches https://kisk.app/scoring ONCE (no crawling, never run by the app) and writes
// public/data/gear-shares.json. Only what the page lists is written; nothing is invented or filled in.
// Usage: node scripts/import-kisk-shares.mjs [saved-page.html]   (a saved file avoids the network request)
import { readFileSync, writeFileSync } from 'node:fs';
import { parseKiskScoring } from './kisk-shares-lib.mjs';

const URL_ = 'https://kisk.app/scoring';
const UA = 'Aion2CraftLab-maintainer-import/1.0 (one-shot, single page; https://github.com/akrios-d/aion2-craft-calculator)';

const file = process.argv[2];
let html;
if (file) html = readFileSync(file, 'utf8');
else {
  const res = await fetch(URL_, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${URL_}: HTTP ${res.status}`);
  html = await res.text();
}

const parsed = parseKiskScoring(html);
if (!parsed.classes.length) throw new Error('No class tables found: the page layout changed, nothing written.');

const out = {
  schema: 1,
  source: 'kisk.app/scoring',
  sourceUrl: URL_,
  upstream: { name: 'cielui.com', url: 'https://cielui.com/stats/engrave' },
  snapshotDate: parsed.snapshotDate,
  fetchedAt: new Date().toISOString().slice(0, 10),
  credit: `Shares: kisk.app / cielui.com, snapshot ${parsed.snapshotDate ?? 'unknown'} (per kisk), fetched ${new Date().toISOString().slice(0, 10)}`,
  notes: [
    'Share = % of top Korean PvE players of the class carrying that stat line on that slot, as listed by kisk.app/scoring (which cites cielui.com).',
    'Each slot lists only the most carried lines; rarer lines are not listed and count as 0.',
    'The page gives no largest roll per slot (maxRoll), so scores use the observed maximum and are flagged approximate.',
    'No Arcana table is listed on the page.',
    'Korea is patches ahead of Global and PvE-only: the data may be outdated or not apply to Global. Not affiliated with kisk.app, cielui.com or NCSOFT.',
  ],
  bands: parsed.bands,
  classes: parsed.classes,
};
writeFileSync('public/data/gear-shares.json', JSON.stringify(out, null, 1) + '\n');

console.log(`Snapshot ${out.snapshotDate}; bands: ${parsed.bands.map((b) => `${b.letter}>=${b.min}`).join(' ')}`);
for (const c of parsed.classes) {
  const slots = Object.entries(c.slots);
  console.log(`${c.className.padEnd(13)} sample=${String(c.sample).padEnd(5)} slots=${slots.length} lines=${slots.reduce((n, [, l]) => n + l.length, 0)}  [${slots.map(([s, l]) => `${s}:${l.length}`).join(' ')}]`);
}
if (parsed.warnings.length) console.log('Warnings:\n' + parsed.warnings.map((w) => '  - ' + w).join('\n'));
