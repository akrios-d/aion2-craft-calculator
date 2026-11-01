export type Faction = 'Asmodian' | 'Elyos';

/**
 * Artwork craftable in Substance Morph, per faction.
 * Source: allthings.how "AION 2 Pantheon Decor Recipes in Substance Morph" (third-party, not verified in game);
 * Game8 lists the same recipes. Some artwork is craftable by both factions.
 */
const ASMODIAN = [
  'Melted Danar', 'Black Warrior Aed', 'Faithful Rajit', 'Berserker Vargor', 'Blood Warrior Lannar',
  'Predator Garsan', 'Deceiver Trid', 'Blue Wave Kelpina', 'Advisor Resana', 'High Overseer Nutah',
  'Special Operations Leader Linx', 'Addicted Hardirun', 'Veteran Shujakan', 'Silent Dartan', 'Soul Ruler Kashapa',
  'Desecrator Newbold', 'High Commander Lagta', 'Specter Archon Axios', 'Executioner Barthien',
  'Drakan Battalion Weapon Guruta', 'Visionary Karuka', 'Dark Shadow Vishwada', 'Sharp Shylak', 'Immortal Gartua',
];

const ELYOS = [
  'Kernon of the West', 'Neikel of the East', 'Rotten Kutar', 'Blooming Korin', 'Bodyguard Teegant',
  'Kusan the Mad Gladiator', 'Ritualist Garshim', 'Bloodfang Pnyn', 'Furious Saursus', 'Scholar Aulla', 'Chaser Taulo',
  'Heretic Layla', 'Harvest Manager Moshav', 'Silent Dartan', 'Soul Ruler Kashapa', 'High Commander Lagta',
  'Forest Warrior Aullamu', 'Black Tentacle Lawa', 'Centurion Demiros', 'Divine Ansas', 'Sentinel Knash', 'Sentinel K',
  'Researcher Setram', 'Phantasm Kasia', 'Eternal Gartua',
];

const norm = (s: string) => s.toLowerCase().replace(/^(artwork|statue|colossus):\s*/, '').replace(/[^a-z0-9]/g, '');
const A = new Set(ASMODIAN.map(norm));
const E = new Set(ELYOS.map(norm));

/** Factions that can craft the item; empty when the item is not faction-specific or unknown. */
export function factionsOf(name: string): Faction[] {
  const n = norm(name);
  return [...(A.has(n) ? (['Asmodian'] as const) : []), ...(E.has(n) ? (['Elyos'] as const) : [])];
}
