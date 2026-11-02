// Read-only proxy for the NCSOFT armory (name search, character info + equipment), used only when the user
// clicks "Look up". CORS blocks the browser from calling these hosts, so this function does it server-side.
// No credentials or env vars; the hosts are fixed in armory-lib.mjs and all input is validated.
import { makeLimiter, validate } from './armory-lib.mjs';

const allow = makeLimiter(20, 60_000);

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': maxAge ? `s-maxage=${maxAge}, stale-while-revalidate=60` : 'no-store' },
  });
}

async function get(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Aion2CraftLab/1.0' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function GET(request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (!allow(ip)) return json({ error: 'rate limited' }, 429);
  const v = validate(new URL(request.url).searchParams);
  if (!v.ok) return json({ error: v.error }, 400);
  try {
    const parts = await Promise.all(v.urls.map(get));
    return json(v.kind === 'search' ? parts[0] : { info: parts[0], equipment: parts[1] }, 200, 60);
  } catch (e) {
    return json({ error: e instanceof Error && e.message === '404' ? 'character not found' : 'armory unavailable' }, 502);
  }
}
