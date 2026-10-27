export const LOOKUP_REGIONS = [
  { id: 'la', label: 'LA (Zikel SA)' },
  { id: 'nae', label: 'NA East' },
  { id: 'naw', label: 'NA West' },
  { id: 'eu', label: 'EU' },
  { id: 'as', label: 'Asia' },
];

export interface CharacterHit {
  characterId: string;
  serverId: number;
  name: string;
  serverName: string;
  level: number;
  race: number;
}

export interface CharacterCard {
  name: string;
  className: string;
  level: number;
  serverName: string;
  raceName: string;
  combatPower: number;
  itemLevel: number | null;
  attributes: { name: string; value: number; effects: string[] }[];
}

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');

export function parseSearchResponse(raw: unknown): CharacterHit[] {
  const list = (raw as { list?: unknown[] } | null)?.list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((e) => {
    const r = e as Record<string, unknown>;
    if (typeof r['characterId'] !== 'string' || typeof r['serverId'] !== 'number') return [];
    return [
      {
        characterId: r['characterId'],
        serverId: r['serverId'],
        name: stripTags(String(r['name'] ?? '')),
        serverName: String(r['serverName'] ?? ''),
        level: Number(r['level'] ?? 0),
        race: Number(r['race'] ?? 0),
      },
    ];
  });
}

export function parseInfoResponse(raw: unknown): CharacterCard | null {
  const o = raw as {
    profile?: Record<string, unknown>;
    stat?: { statList?: Record<string, unknown>[] };
  } | null;
  const p = o?.profile;
  if (!p || typeof p['characterName'] !== 'string') return null;
  const stats = o?.stat?.statList ?? [];
  const itemLevel = stats.find((s) => s['type'] === 'ItemLevel');
  return {
    name: p['characterName'] as string,
    className: String(p['className'] ?? ''),
    level: Number(p['characterLevel'] ?? 0),
    serverName: String(p['serverName'] ?? ''),
    raceName: String(p['raceName'] ?? ''),
    combatPower: Number(p['combatPower'] ?? 0),
    itemLevel: itemLevel ? Number(itemLevel['value']) : null,
    attributes: stats
      .filter((s) => s['type'] !== 'ItemLevel' && Number(s['value']) > 0)
      .map((s) => ({
        name: String(s['name'] ?? ''),
        value: Number(s['value']),
        effects: Array.isArray(s['statSecondList']) ? (s['statSecondList'] as string[]) : [],
      })),
  };
}

export async function lookupCharacters(region: string, name: string): Promise<CharacterHit[]> {
  const res = await fetch(`/api/character?region=${encodeURIComponent(region)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(String(res.status));
  return parseSearchResponse(await res.json());
}

export async function lookupCharacterInfo(region: string, hit: CharacterHit): Promise<CharacterCard | null> {
  const res = await fetch(
    `/api/character?region=${encodeURIComponent(region)}&characterId=${encodeURIComponent(hit.characterId)}&serverId=${hit.serverId}`,
  );
  if (!res.ok) throw new Error(String(res.status));
  return parseInfoResponse(await res.json());
}
