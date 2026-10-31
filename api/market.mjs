// Optional proxy for the market import only (the app's one serverless exception).
// It contacts a single fixed host, reads public data and uses no secrets or env vars.
const UPSTREAM = 'https://aion2.exchange/api';

// The source publishes a new snapshot about once an hour (around minute :10). Cache until the next one is due,
// then re-check every minute until it appears.
const SNAPSHOT_MS = 60 * 60 * 1000;

function cacheSeconds(body) {
  const times = Array.isArray(body?.items) ? body.items.map((i) => Date.parse(i?.captured_at)).filter(Number.isFinite) : [];
  if (!times.length) return 300;
  const due = Math.max(...times) + SNAPSHOT_MS + 60_000;
  return Math.min(SNAPSHOT_MS / 1000, Math.max(60, Math.round((due - Date.now()) / 1000)));
}

function json(body, status = 200, maxAge = 300) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': `s-maxage=${maxAge}, stale-while-revalidate=60` },
  });
}

async function get(path) {
  const res = await fetch(`${UPSTREAM}${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'Aion2CraftLab/1.0' } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  try {
    if (q.get('servers') !== null) return json(await get('/servers'));
    const server = q.get('server') ?? '';
    if (!/^\d{4,6}$/.test(server)) return json({ error: 'invalid server' }, 400);
    const body = await get(`/items?limit=1000&server=${server}`);
    return json(body, 200, cacheSeconds(body));
  } catch {
    return json({ error: 'upstream unavailable' }, 502);
  }
}
