/**
 * Parsing and validation of NCSOFT armory (aion2.plaync.com) JSON responses.
 *
 * Only fields observed in real responses are read. The armory is an undocumented interface and its
 * CORS policy only allows NCSOFT origins, so lookups go through the small serverless function in api/.
 */

export interface ArmoryItem {
  slot: number;
  slotName: string;
  id: number;
  name: string;
  grade: string;
  enchant: number;
  exceed: number;
  icon?: string;
  /** Only present if the pasted JSON carries a stats array; the sampled equipmentList rows do not. */
  stats?: ItemStat[];
}

export interface ItemStat {
  name: string;
  value: number;
  max?: number;
}

export interface ArmoryProfile {
  characterId?: string;
  name: string;
  className?: string;
  level?: number;
  combatPower?: number;
  serverId?: number;
  serverName?: string;
  raceName?: string;
}

export interface ArmorySnapshot {
  /** `serverId|name` in lower case. */
  key: string;
  profile: ArmoryProfile;
  gear: ArmoryItem[];
  arcana: ArmoryItem[];
  fetchedAt: string;
}

export interface SearchCandidate {
  characterId: string;
  name: string;
  serverId: number;
  serverName: string;
  level?: number;
  region?: string;
}

export interface ArmoryParseResult {
  kind: 'info' | 'equipment' | 'search' | 'combined' | 'unknown';
  profile?: ArmoryProfile;
  items?: ArmoryItem[];
  candidates?: SearchCandidate[];
  warnings: string[];
  error?: string;
}

export const MAX_SNAPSHOTS = 10;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();

export function isArcanaSlot(slot: number, slotName: string): boolean {
  return /^arcana/i.test(slotName) || (slot >= 41 && slot <= 49);
}

export function snapshotKey(serverId: number | undefined, name: string): string {
  return `${serverId ?? 0}|${name.trim().toLowerCase()}`;
}

function parseProfile(p: Record<string, any>): ArmoryProfile | undefined {
  const name = str(p['characterName']);
  if (!name) return undefined;
  return {
    characterId: str(p['characterId']),
    name,
    className: str(p['className']),
    level: num(p['characterLevel']),
    combatPower: num(p['combatPower']),
    serverId: num(p['serverId']),
    serverName: str(p['serverName']),
    raceName: str(p['raceName']),
  };
}

export function parseStats(raw: unknown): ItemStat[] | undefined {
  const out = (Array.isArray(raw) ? raw : []).flatMap((s) => (isObj(s) && str(s['name']) && num(s['value']) !== undefined ? [{ name: str(s['name']) as string, value: num(s['value']) as number, max: num(s['max']) }] : []));
  return out.length ? out : undefined;
}

export function parseEquipmentList(list: unknown, warnings: string[]): ArmoryItem[] {
  const items: ArmoryItem[] = [];
  const seen = new Set<number>();
  (Array.isArray(list) ? list : []).forEach((e, i) => {
    const slot = isObj(e) ? num(e['slotPos']) : undefined;
    const name = isObj(e) ? str(e['name']) : undefined;
    if (!isObj(e) || slot === undefined || !name) {
      warnings.push(`equipmentList[${i}]: missing slotPos or name; skipped.`);
      return;
    }
    if (seen.has(slot)) {
      warnings.push(`equipmentList[${i}]: duplicate slot ${slot}; skipped.`);
      return;
    }
    seen.add(slot);
    items.push({
      slot,
      slotName: str(e['slotPosName']) ?? `Slot${slot}`,
      id: num(e['id']) ?? 0,
      name,
      grade: str(e['grade']) ?? '',
      enchant: num(e['enchantLevel']) ?? 0,
      exceed: num(e['exceedLevel']) ?? 0,
      icon: str(e['icon']),
      stats: parseStats(e['stats']),
    });
  });
  return items.sort((a, b) => a.slot - b.slot);
}

function parseSearch(list: any[], warnings: string[]): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  list.forEach((c, i) => {
    const name = isObj(c) && typeof c['name'] === 'string' ? stripTags(c['name']) : '';
    const id = isObj(c) ? str(c['characterId']) : undefined;
    const serverId = isObj(c) ? num(c['serverId']) : undefined;
    if (!name || !id || serverId === undefined) {
      warnings.push(`list[${i}]: missing name, characterId or serverId; skipped.`);
      return;
    }
    let characterId = id;
    try {
      characterId = decodeURIComponent(id);
    } catch {
      /* keep as is */
    }
    out.push({ characterId, name, serverId, serverName: str(c['serverName']) ?? String(serverId), level: num(c['level']), region: str(c['region']) });
  });
  return out;
}

/** Recognises one pasted armory response: character info, equipment, a name search, or info + equipment together. */
export function parseArmoryJson(text: string): ArmoryParseResult {
  const warnings: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'unknown', warnings, error: 'The text is not valid JSON.' };
  }
  if (!isObj(json)) return { kind: 'unknown', warnings, error: 'Expected a JSON object.' };

  // Accept { info: {...}, equipment: {...} } wrappers.
  const root: Record<string, any> = isObj(json['info']) ? { ...json['info'], ...(isObj(json['equipment']) ? json['equipment'] : {}) } : json;

  if (Array.isArray(root['list'])) {
    return { kind: 'search', candidates: parseSearch(root['list'], warnings), warnings };
  }
  let profile: ArmoryProfile | undefined;
  let items: ArmoryItem[] | undefined;
  if (isObj(root['profile'])) {
    profile = parseProfile(root['profile']);
    if (!profile) warnings.push('profile has no characterName.');
  }
  const eq = root['equipment'];
  if (isObj(eq) && Array.isArray(eq['equipmentList'])) items = parseEquipmentList(eq['equipmentList'], warnings);
  else if (Array.isArray(root['equipmentList'])) items = parseEquipmentList(root['equipmentList'], warnings);

  if (!profile && !items) {
    return { kind: 'unknown', warnings, error: 'No character profile, equipment list or search result found. Paste the response of /api/character/info or /api/character/equipment.' };
  }
  if (items && !items.length) warnings.push('The equipment list is empty.');
  return { kind: profile && items ? 'combined' : profile ? 'info' : 'equipment', profile, items, warnings };
}

export function buildSnapshot(profile: ArmoryProfile | undefined, items: ArmoryItem[], now = new Date()): ArmorySnapshot {
  const p = profile ?? { name: 'Unknown character' };
  return {
    key: snapshotKey(p.serverId, p.name),
    profile: p,
    gear: items.filter((i) => !isArcanaSlot(i.slot, i.slotName)),
    arcana: items.filter((i) => isArcanaSlot(i.slot, i.slotName)),
    fetchedAt: now.toISOString(),
  };
}

/** Inserts or replaces a snapshot (newest first) and keeps at most MAX_SNAPSHOTS. */
export function upsertSnapshot(cache: ArmorySnapshot[], snap: ArmorySnapshot): ArmorySnapshot[] {
  return [snap, ...cache.filter((s) => s.key !== snap.key)].slice(0, MAX_SNAPSHOTS);
}

export function normalizeSnapshot(raw: unknown): ArmorySnapshot | null {
  if (!isObj(raw) || !isObj(raw['profile'])) return null;
  const name = str(raw['profile']['name']);
  if (!name) return null;
  const asItems = (l: unknown) =>
    (Array.isArray(l) ? l : []).flatMap((e) =>
      isObj(e) && num(e['slot']) !== undefined && str(e['name'])
        ? [{ slot: e['slot'] as number, slotName: str(e['slotName']) ?? `Slot${e['slot']}`, id: num(e['id']) ?? 0, name: str(e['name']) as string, grade: str(e['grade']) ?? '', enchant: num(e['enchant']) ?? 0, exceed: num(e['exceed']) ?? 0, icon: str(e['icon']), stats: parseStats(e['stats']) }]
        : [],
    );
  const p = raw['profile'];
  const profile: ArmoryProfile = { characterId: str(p['characterId']), name, className: str(p['className']), level: num(p['level']), combatPower: num(p['combatPower']), serverId: num(p['serverId']), serverName: str(p['serverName']), raceName: str(p['raceName']) };
  const fetchedAt = str(raw['fetchedAt']) && !isNaN(Date.parse(raw['fetchedAt'])) ? new Date(raw['fetchedAt']).toISOString() : new Date(0).toISOString();
  return { key: snapshotKey(profile.serverId, name), profile, gear: asItems(raw['gear']), arcana: asItems(raw['arcana']), fetchedAt };
}

/** Picks the search hit for an exact character name on the given server (case-insensitive); null if not unique. */
export function pickCandidate(list: SearchCandidate[], name: string, server: string): SearchCandidate | null {
  const n = name.trim().toLowerCase();
  const s = server.trim().toLowerCase();
  const hits = list.filter((c) => c.name.toLowerCase() === n && (!s || c.serverName.toLowerCase() === s));
  return hits.length === 1 ? hits[0] : null;
}

/** Links the user can open in the browser to copy the JSON from. Nothing is requested by the app itself. */
export function armoryLinks(region: string, c: SearchCandidate, lang = 'en-US'): { info: string; equipment: string; page: string } {
  const q = `lang=${encodeURIComponent(lang)}&region=${encodeURIComponent(region)}&characterId=${encodeURIComponent(c.characterId)}&serverId=${c.serverId}`;
  return {
    info: `https://aion2.plaync.com/api/character/info?${q}`,
    equipment: `https://aion2.plaync.com/api/character/equipment?${q}`,
    page: `https://aion2.plaync.com/en-us/characters/${c.serverId}/${encodeURIComponent(c.characterId)}?region=${encodeURIComponent(region)}`,
  };
}

export function searchLink(region: string, keyword: string, lang = 'en-US'): string {
  return `https://api-search.plaync.com/aion2global/search/v2/character?keyword=${encodeURIComponent(keyword)}&region=${encodeURIComponent(region)}&localeInfo=${encodeURIComponent(lang)}`;
}

export interface EquipmentInventoryPlan {
  records: { itemId: string; quantity: number }[];
  unresolved: { name: string; slotName: string; reason: string }[];
}

/**
 * Maps the equipped gear (arcana excluded) to catalogue items by exact, unique name. Quantities are how many
 * equipped pieces share the item. Anything that cannot be matched is returned in `unresolved`, never dropped.
 * In 'merge' mode an existing larger quantity is kept; the caller still shows a preview before applying.
 */
export function planEquipmentInventory(
  gear: ArmoryItem[],
  catalogue: { id: string; name: string }[],
  existing: Record<string, { quantity: number }>,
  mode: 'merge' | 'replace',
): EquipmentInventoryPlan {
  const counts = new Map<string, number>();
  const unresolved: EquipmentInventoryPlan['unresolved'] = [];
  for (const g of gear) {
    const name = g.name.trim().toLowerCase();
    const hits = catalogue.filter((i) => i.name.trim().toLowerCase() === name);
    if (hits.length === 1) counts.set(hits[0].id, (counts.get(hits[0].id) ?? 0) + 1);
    else unresolved.push({ name: g.name, slotName: g.slotName, reason: hits.length ? 'Ambiguous name in the catalogue' : 'Not in the recipe catalogue' });
  }
  const records = [...counts].map(([itemId, n]) => ({ itemId, quantity: mode === 'merge' ? Math.max(n, existing[itemId]?.quantity ?? 0) : n }));
  return { records, unresolved };
}
