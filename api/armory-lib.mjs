// Pure helpers for api/armory.mjs: strict input validation and fixed upstream URLs.
export const REGIONS = ['la', 'eu', 'na', 'asia'];
export const SEARCH_HOST = 'https://api-search.plaync.com/aion2global/search/v2/character';
export const CHARACTER_HOST = 'https://aion2.plaync.com/api/character';

/** Returns `{ ok: true, ... }` with the upstream URLs, or `{ ok: false, error }`. */
export function validate(params) {
  const get = (k) => params.get(k) ?? '';
  const region = get('region');
  if (!REGIONS.includes(region)) return { ok: false, error: 'invalid region' };
  if (params.has('keyword')) {
    const keyword = get('keyword').trim();
    if (keyword.length < 2 || keyword.length > 24 || /[<>\\\u0000-\u001f]/.test(keyword)) return { ok: false, error: 'invalid keyword' };
    const q = `keyword=${encodeURIComponent(keyword)}&region=${region}&localeInfo=en-US`;
    return { ok: true, kind: 'search', urls: [`${SEARCH_HOST}?${q}`] };
  }
  const characterId = get('characterId');
  const serverId = get('serverId');
  if (!/^[A-Za-z0-9_%=-]{8,128}$/.test(characterId)) return { ok: false, error: 'invalid characterId' };
  if (!/^\d{3,6}$/.test(serverId)) return { ok: false, error: 'invalid serverId' };
  const q = `lang=en-US&region=${region}&characterId=${encodeURIComponent(decodeSafe(characterId))}&serverId=${serverId}`;
  return { ok: true, kind: 'character', urls: [`${CHARACTER_HOST}/info?${q}`, `${CHARACTER_HOST}/equipment?${q}`] };
}

function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Best-effort fixed-window limiter (per server instance); returns true when the call is allowed. */
export function makeLimiter(max = 20, windowMs = 60_000, now = () => Date.now()) {
  const hits = new Map();
  return (key) => {
    const t = now();
    if (hits.size > 5000) hits.clear();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      hits.set(key, { start: t, n: 1 });
      return true;
    }
    h.n += 1;
    return h.n <= max;
  };
}
