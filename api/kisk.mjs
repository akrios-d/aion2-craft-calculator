// Read-only fetch of ONE kisk.app character gear page (https://kisk.app/c/{region}/{server}/{name}/gear), only when the
// user clicks "Look up". No crawling, no polling, no credentials. The host is fixed, redirects are refused, input is
// validated, results are cached briefly and each IP is rate limited. kisk's terms ask not to flood their site.
import { makeLimiter } from './armory-lib.mjs';
import { validateKisk, slimHtml } from './kisk-lib.mjs';

const allow = makeLimiter(6, 60_000);
const MAX_BYTES = 600_000;

function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': maxAge ? `s-maxage=${maxAge}, stale-while-revalidate=60` : 'no-store' },
  });
}

export async function GET(request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (!allow(ip)) return json({ error: 'rate limited' }, 429);
  const v = validateKisk(new URL(request.url).searchParams);
  if (!v.ok) return json({ error: v.error }, 400);
  try {
    const res = await fetch(v.url, {
      redirect: 'manual',
      headers: { Accept: 'text/html', 'User-Agent': 'Aion2CraftLab/1.0 (user-triggered single-page lookup; https://github.com/akrios-d/aion2-craft-calculator)' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return json({ error: 'character not found on kisk.app' }, 404);
    if (!res.ok) return json({ error: 'kisk.app unavailable' }, 502);
    const text = await res.text();
    if (text.length > MAX_BYTES * 3) return json({ error: 'response too large' }, 502);
    const html = slimHtml(text);
    if (html.length > MAX_BYTES) return json({ error: 'response too large' }, 502);
    return json({ url: v.url, fetchedAt: new Date().toISOString(), html }, 200, 300);
  } catch {
    return json({ error: 'kisk.app unavailable' }, 502);
  }
}
