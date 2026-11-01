export interface BossSpawn {
  map: string;
  /** Respawn after the kill, in minutes (null when the boss uses a fixed schedule). */
  minutes: number | null;
  /** Fixed schedule text, when applicable. */
  schedule?: string;
}

const H = 60;
/**
 * Field boss respawn timers, from Game8 "All World Boss Timers" (third-party, not verified in game).
 * Altgard bosses are Asmodian, Verteron bosses are Elyos.
 */
const RAW: [string, string, number][] = [
  ['Blooming Korin', 'Verteron', H], ['Heretic Layla', 'Verteron', 3 * H], ['Black Tentacle Lawa', 'Verteron', 2 * H],
  ['Phantasm Kasia', 'Verteron', 6 * H], ['Centurion Demiros', 'Verteron', 2 * H], ['Divine Ansas', 'Verteron', 6 * H],
  ['Harvest Manager Moshav', 'Verteron', 3 * H], ['Sentinel Knash', 'Verteron', 2 * H], ['Scholar Aulla', 'Verteron', 2 * H],
  ['Forest Warrior Aullamu', 'Verteron', 2 * H], ['Chaser Taulo', 'Verteron', 2 * H], ['Neikel of the East', 'Verteron', 30],
  ['Researcher Setram', 'Verteron', 6 * H], ['Eternal Gartua', 'Verteron', 12 * H], ['Silent Dartan', 'Verteron', 6 * H],
  ['Soul Ruler Kashapa', 'Verteron', 6 * H], ['High Commander Lagta', 'Verteron', 12 * H], ['Rotten Kutar', 'Verteron', 30],
  ['Kernon of the West', 'Verteron', 30], ['Kusan the Mad Gladiator', 'Verteron', 2 * H], ['Ritualist Garshim', 'Verteron', 2 * H],
  ['Bodyguard Teegant', 'Verteron', 90], ['Furious Saursus', 'Verteron', 3 * H], ['Bloodfang Pnyn', 'Verteron', 3 * H],
  ['Melted Danar', 'Altgard', 30], ['Faithful Rajit', 'Altgard', 30], ['Berserker Vargor', 'Altgard', H],
  ['Blood Warrior Lannar', 'Altgard', 90], ['Advisor Resana', 'Altgard', 3 * H], ['Black Warrior Aed', 'Altgard', 30],
  ['Predator Garsan', 'Altgard', 2 * H], ['Deceiver Trid', 'Altgard', 2 * H], ['Blue Wave Kelpina', 'Altgard', 2 * H],
  ['High Overseer Nutah', 'Altgard', 2 * H], ['Special Operations Leader Linx', 'Altgard', 3 * H],
  ['Desecrator Newbold', 'Altgard', 4 * H], ['Specter Archon Axios', 'Altgard', 4 * H], ['Addicted Hardirun', 'Altgard', 3 * H],
  ['Executioner Barthien', 'Altgard', 4 * H], ['Drakan Battalion Weapon Guruta', 'Altgard', 6 * H],
  ['Veteran Shujakan', 'Altgard', 3 * H], ['Visionary Karuka', 'Altgard', 4 * H], ['Dark Shadow Vishwada', 'Altgard', 6 * H],
  ['Sharp Shylak', 'Altgard', 6 * H], ['Immortal Gartua', 'Altgard', 12 * H], ['High Commander Lagta', 'Altgard', 12 * H],
  ['Soul Ruler Kashapa', 'Altgard', 6 * H], ['Silent Dartan', 'Altgard', 6 * H], ['Watcher Kaira', 'Lower Reshanta', 4 * H],
];

const norm = (s: string) => s.toLowerCase().replace(/^(artwork|statue|colossus):\s*/, '').replace(/[^a-z0-9]/g, '');

const BY_NAME = new Map<string, BossSpawn[]>();
for (const [name, map, minutes] of RAW) {
  const k = norm(name);
  BY_NAME.set(k, [...(BY_NAME.get(k) ?? []), { map, minutes }]);
}
BY_NAME.set(norm('Guardian Lord Nahma'), [{ map: 'Lower Reshanta', minutes: null, schedule: 'Fri/Sun 12:00 UTC' }]);

export function spawnsOf(name: string): BossSpawn[] {
  return BY_NAME.get(norm(name)) ?? [];
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return [h ? `${h}h` : '', r ? `${r}min` : ''].filter(Boolean).join(' ');
}

/** Shortest respawn in minutes, used for sorting (schedules and unknown sort last). */
export function minRespawn(name: string): number | undefined {
  const v = spawnsOf(name).map((s) => s.minutes).filter((x): x is number => x !== null);
  return v.length ? Math.min(...v) : undefined;
}
