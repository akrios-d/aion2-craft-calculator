// Optional proxy for the market import only (the app's one serverless exception).
// It contacts a single fixed host, reads public data and uses no secrets or env vars.
const UPSTREAM = 'https://aion2.exchange/api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 's-maxage=300, stale-while-revalidate=600' },
  });
}

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${UPSTREAM}${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'Aion2CraftLab/1.0' } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  try {
    if (q.get('servers') !== null) return json(await get('/servers'));
    const server = q.get('server') ?? '';
    if (!/^\d{4,6}$/.test(server)) return json({ error: 'invalid server' }, 400);
    return json(await get(`/items?limit=1000&server=${server}`));
  } catch {
    return json({ error: 'upstream unavailable' }, 502);
  }
}
