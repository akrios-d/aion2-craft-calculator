// Adds Substance Morph recipes (1 Odyle of the matching grade -> 1 gatherable material).
// Source: https://game8.co/games/Aion-2/archives/631951 (not Aion2.gg), so every record stays "unverified".
// Idempotent. Run after import-recipes.mjs: node scripts/add-morph-recipes.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../public/data/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const write = (f, v) => writeFileSync(new URL(f, dir), JSON.stringify(v, null, 2) + '\n');

const SOURCE_URL = 'https://game8.co/games/Aion-2/archives/631951';
const PROFESSION = 'substance-morph';
const MATERIALS = [
  ...['Orichalcum Ore', 'Sapphire Gemstone', 'Diamond Gemstone', 'Ruby Gemstone', 'Asvata Log'].flatMap((n) => [n, `Fine ${n}`, `Pure ${n}`, `Radiant ${n}`]),
  'Azpha', 'Fresh Azpha', 'Calendula', 'Fresh Calendula', 'Morfa', 'Ohkra', 'Raydam', 'Conide', 'Pujery',
];
const odyleFor = (name) => (/^(Fine|Fresh) /.test(name) ? 'Fine Odyle' : /^Pure /.test(name) ? 'Pure Odyle' : /^Radiant /.test(name) ? 'Radiant Odyle' : 'Odyle');

const items = read('items.json');
const byName = new Map(items.map((i) => [i.name, i]));
const recipes = read('recipes.json').filter((r) => r.professionId !== PROFESSION);
const professions = read('professions.json');
if (!professions.some((p) => p.id === PROFESSION)) professions.push({ id: PROFESSION, name: 'Substance Morph' });

const missing = [];
let added = 0;
for (const name of MATERIALS) {
  const out = byName.get(name);
  const odyle = byName.get(odyleFor(name));
  if (!out || !odyle) { missing.push(!out ? name : `${name} (needs ${odyleFor(name)})`); continue; }
  recipes.push({
    id: `morph-${out.id}`,
    outputItemId: out.id,
    outputQuantity: 1,
    ingredients: [{ itemId: odyle.id, quantity: 1 }],
    professionId: PROFESSION,
    source: 'game8.co',
    sourceUrl: SOURCE_URL,
    verification: 'unverified',
    notes: 'Substance Morph conversion (1 Odyle of the matching grade). Weekly limits and success chances are not modelled.',
  });
  added++;
}

const manifest = read('data-manifest.json');
manifest.recipeCount = recipes.length;
manifest.professionCount = professions.length;
manifest.verificationStatus = `${manifest.verifiedRecipeCount} of ${recipes.length} recipes verified`;
manifest.knownLimitations = [
  ...(manifest.knownLimitations ?? []).filter((l) => !l.startsWith('Substance Morph')),
  `Substance Morph recipes (${added}) come from game8.co, not Aion2.gg; weekly limits and success chances are not modelled.`,
];

write('recipes.json', recipes);
write('professions.json', professions);
write('data-manifest.json', manifest);
console.log(`Morph recipes added: ${added}; missing items: ${missing.length ? missing.join(', ') : 'none'}`);
