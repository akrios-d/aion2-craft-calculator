#!/usr/bin/env node
/**
 * Builds public/data/*.json from a LOCAL file of recipe data.
 *
 * This script never touches the network. Aion2.gg's Terms of Use forbid bulk downloading and
 * dataset building, so only feed it data you are permitted to use (your own transcription, a
 * licensed export, or data provided with the site owner's written permission).
 *
 * Usage:
 *   node scripts/import-recipes.mjs --in my-recipes.json --source-url https://example/ \
 *        --permission "Written permission from ... dated ..." [--version 2026.10.1] [--dry-run]
 *
 * Input: { "items": [...], "recipes": [...], "professions": [...] }
 *   item:   { id, name, category?, previousIds?, sourceUrl?, verification? }
 *   recipe: { id, outputItemId, outputQuantity, ingredients:[{itemId, quantity}], professionId?,
 *             professionLevel?, sourceUrl?, verification?, notes? }
 * verification must be "verified" only if a person checked the record against the game or source.
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

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!args.in || typeof args.in !== 'string') fail('--in <local file> is required.');
if (/^https?:/i.test(args.in)) fail('Network inputs are not supported. Provide a local file.');
if (!args['source-url'] || !args.permission || args.permission === true) {
  fail('--source-url and --permission "<how you are permitted to use this data>" are required.');
}

const input = JSON.parse(readFileSync(resolve(args.in), 'utf8'));
const errors = [];
const sourceName = new URL(args['source-url']).hostname;
const itemIds = new Set();
const items = [];
for (const [i, it] of (input.items ?? []).entries()) {
  if (!it?.id || !it?.name) errors.push(`items[${i}]: id and name required`);
  else if (itemIds.has(it.id)) errors.push(`items[${i}]: duplicate id ${it.id}`);
  else {
    itemIds.add(it.id);
    items.push({
      id: String(it.id),
      name: String(it.name),
      ...(it.category ? { category: String(it.category) } : {}),
      ...(it.previousIds ? { previousIds: it.previousIds.map(String) } : {}),
      source: sourceName,
      ...(it.sourceUrl ? { sourceUrl: it.sourceUrl } : {}),
      verification: it.verification === 'verified' ? 'verified' : 'unverified',
    });
  }
}
const professions = (input.professions ?? []).map((p) => ({ id: String(p.id), name: String(p.name) }));
const professionIds = new Set(professions.map((p) => p.id));
const recipeIds = new Set();
const recipes = [];
for (const [i, r] of (input.recipes ?? []).entries()) {
  const w = `recipes[${i}]`;
  if (!r?.id) { errors.push(`${w}: id required`); continue; }
  if (recipeIds.has(r.id)) { errors.push(`${w}: duplicate id ${r.id}`); continue; }
  if (!itemIds.has(r.outputItemId)) errors.push(`${w}: unknown output item ${r.outputItemId}`);
  if (!Number.isInteger(r.outputQuantity) || r.outputQuantity <= 0) errors.push(`${w}: bad outputQuantity`);
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) errors.push(`${w}: no ingredients`);
  for (const g of r.ingredients ?? []) {
    if (!itemIds.has(g.itemId)) errors.push(`${w}: unknown ingredient ${g.itemId}`);
    if (!Number.isInteger(g.quantity) || g.quantity <= 0) errors.push(`${w}: bad ingredient quantity for ${g.itemId}`);
  }
  if (r.professionId && !professionIds.has(r.professionId)) errors.push(`${w}: unknown profession ${r.professionId}`);
  recipeIds.add(r.id);
  recipes.push({
    id: String(r.id),
    outputItemId: r.outputItemId,
    outputQuantity: r.outputQuantity,
    ingredients: r.ingredients,
    ...(r.professionId ? { professionId: r.professionId } : {}),
    ...(r.professionLevel ? { professionLevel: r.professionLevel } : {}),
    source: sourceName,
    ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}),
    verification: r.verification === 'verified' ? 'verified' : 'unverified',
    ...(r.notes ? { notes: r.notes } : {}),
  });
}
if (errors.length) fail(`Validation failed:\n  ${errors.join('\n  ')}`);

const verified = recipes.filter((r) => r.verification === 'verified').length;
const manifest = {
  dataVersion: typeof args.version === 'string' ? args.version : new Date().toISOString().slice(0, 10),
  sourceUrl: args['source-url'],
  importDate: new Date().toISOString(),
  itemCount: items.length,
  recipeCount: recipes.length,
  professionCount: professions.length,
  verifiedRecipeCount: verified,
  verificationStatus: `${verified} of ${recipes.length} recipes verified`,
  knownLimitations: [`Permission/licence basis: ${args.permission}`, 'Coverage of the full Global recipe list has not been established.'],
};

console.log(JSON.stringify(manifest, null, 2));
if (args['dry-run']) process.exit(0);
const out = (name, data) => writeFileSync(resolve(root, 'public/data', name), JSON.stringify(data, null, 2) + '\n');
out('items.json', items);
out('recipes.json', recipes);
out('professions.json', professions);
out('data-manifest.json', manifest);
console.log('Wrote public/data/*.json. Run `npm run coverage` to refresh docs/DATA-COVERAGE.md.');
