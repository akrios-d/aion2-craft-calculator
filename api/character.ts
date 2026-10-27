// Optional proxy for the character lookup only. The rest of the app is client-side.
// Only the two NCSOFT hosts below are ever contacted; no secrets or env vars are used.
const REGIONS = ['naw', 'nae', 'eu', 'la', 'as'];
const SEARCH_HOST = 'https://api-search.plaync.com/aion2global/search/v2/character';
const INFO_HOST = 'https://aion2.plaync.com/api/character/info';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Aion2CraftLab/1.0)',
  Referer: 'https://aion2.plaync.com/',
  Accept: 'application/json',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 's-maxage=60' },
  });
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const region = (q.get('region') ?? '').toLowerCase();
  if (!REGIONS.includes(region)) return json({ error: 'invalid region' }, 400);

  const name = q.get('name');
  const characterId = q.get('characterId');
  const serverId = q.get('serverId');
  let target: string;

  if (name !== null) {
    if (!/^[\p{L}\p{N}]{1,30}$/u.test(name)) return json({ error: 'invalid name' }, 400);
    target = `${SEARCH_HOST}?${new URLSearchParams({ keyword: name, page: '1', size: '20', localeInfo: 'en-US', region })}`;
  } else if (characterId && serverId) {
    if (!/^[A-Za-z0-9_\-=%]{10,100}$/.test(characterId) || !/^\d{3,6}$/.test(serverId)) {
      return json({ error: 'invalid id' }, 400);
    }
    const id = decodeURIComponent(characterId);
    target = `${INFO_HOST}?${new URLSearchParams({ lang: 'en', region, characterId: id, serverId })}`;
  } else {
    return json({ error: 'missing parameters' }, 400);
  }

  try {
    const upstream = await fetch(target, { headers: HEADERS });
    if (!upstream.ok) return json({ error: `upstream ${upstream.status}` }, 502);
    return json(await upstream.json());
  } catch {
    return json({ error: 'upstream unavailable' }, 502);
  }
}
