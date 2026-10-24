// Run after add-combo-recipes.mjs. A tradeable COMBO item (e.g. Splendent Star Dragon Lord Ring) has a
// same-name, same-faction Bind-on-pickup twin whose recipe is the in-game upgrade
// "1x base item + a few materials". Use that recipe for the COMBO item instead of the full base recipe.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../public/data/', import.meta.url);
const items = JSON.parse(readFileSync(new URL('items.json', dir), 'utf8'));
const recipes = JSON.parse(readFileSync(new URL('recipes.json', dir), 'utf8'));

let linked = 0;
for (const combo of recipes.filter((r) => r.id.startsWith('combo-'))) {
  const out = items.find((i) => i.id === combo.outputItemId);
  if (!out) continue;
  const twinIds = items.filter((i) => i.name === out.name && i.id !== out.id && i.faction === out.faction).map((i) => i.id);
  const twin = recipes.find((r) => twinIds.includes(r.outputItemId) && !r.id.startsWith('combo-'));
  if (!twin) continue;
  combo.ingredients = twin.ingredients.map((g) => ({ ...g }));
  combo.outputQuantity = twin.outputQuantity;
  combo.notes = `Uses the upgrade recipe of ${twin.id} (bound twin of this item).`;
  linked++;
}
writeFileSync(new URL('recipes.json', dir), JSON.stringify(recipes, null, 2) + '\n');
console.log(`Linked ${linked} COMBO recipes to their upgrade recipe.`);
