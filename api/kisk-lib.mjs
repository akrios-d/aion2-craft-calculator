// Pure helpers for api/kisk.mjs: strict validation and the single fixed upstream URL (https://kisk.app/c/{region}/{server}/{name}/gear).
export const KISK_HOST = 'https://kisk.app';
export const KISK_REGIONS = ['naw', 'nae', 'eu', 'as', 'la'];

/** Returns `{ ok: true, url }` or `{ ok: false, error }`. */
export function validateKisk(params) {
  const region = (params.get('region') ?? '').toLowerCase();
  const server = (params.get('server') ?? '').trim().toLowerCase();
  const name = (params.get('name') ?? '').trim();
  if (!KISK_REGIONS.includes(region)) return { ok: false, error: 'invalid region' };
  if (!/^[a-z]{3,16}$/.test(server)) return { ok: false, error: 'invalid server' };
  if (!/^[\p{L}\p{N}]{2,24}$/u.test(name)) return { ok: false, error: 'invalid name' };
  return { ok: true, url: `${KISK_HOST}/c/${region}/${server}/${encodeURIComponent(name)}/gear` };
}

/** Drops scripts, styles and inline SVG so only the report markup is returned. */
export function slimHtml(html) {
  return html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '');
}
