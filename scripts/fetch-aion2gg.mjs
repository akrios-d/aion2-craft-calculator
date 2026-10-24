#!/usr/bin/env node
/**
 * Fetches recipe pages from Aion2.gg and writes a LOCAL intermediate file for import-recipes.mjs.
 *
 * Only run this with the site operator's permission (record it with --permission in
 * import-recipes.mjs). It reads public HTML pages only (never /api/ or /data-dump/), identifies
 * itself, and waits between requests.
 *
 * Usage: node scripts/fetch-aion2gg.mjs [--out tmp/aion2gg-pack.json] [--delay 1000] [--limit N]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const BASE = 'https://aion2.gg';
const out = resolve(args.out ?? 'tmp/aion2gg-pack.json');
const delay = Number(args.delay ?? 1000);
const limit = args.limit ? Number(args.limit) : Infinity;
const UA = 'Aion2CraftLab-import/1.0 (personal crafting calculator; operator permission)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(BASE + path, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
    if (res.ok) return res.text();
    if (res.status === 404) return null;
    await sleep(delay * attempt * 2);
  }
  throw new Error(`Failed to fetch ${path}`);
}

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (s) => decode(s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

const slugs = [];
for (let page = 1; ; page++) {
  const html = await get(`/database/recipes?page=${page}`);
  const found = [...(html ?? '').matchAll(/href="\/database\/recipes\/([a-z0-9-]+-\d+)"/g)].map((m) => m[1]);
  const fresh = found.filter((s) => !slugs.includes(s));
  if (!fresh.length) break;
  slugs.push(...new Set(fresh));
  console.log(`list page ${page}: ${slugs.length} recipes so far`);
  await sleep(delay);
}

const items = new Map();
const professions = new Map();
const recipes = [];
const problems = [];
const addItem = (id, name, slug) => {
  if (!items.has(id)) items.set(id, { id, name, sourceUrl: `${BASE}/database/items/${slug}` });
};

let n = 0;
for (const slug of slugs.slice(0, limit)) {
  n++;
  const html = await get(`/database/recipes/${slug}`);
  await sleep(delay);
  if (!html) { problems.push(`${slug}: page not found`); continue; }
  const id = slug.match(/-(\d+)$/)[1];
  const product = html.match(/href="\/database\/items\/([a-z0-9-]+-(\d+))">Item page/);
  const matStart = html.indexOf('craft-module__VsEHQa__matTitle');
  const matEnd = html.indexOf('Material Summary', matStart);
  const matHtml = matStart >= 0 ? html.slice(matStart, matEnd > 0 ? matEnd : undefined) : '';
  const ingredients = [...matHtml.matchAll(/href="\/database\/items\/([a-z0-9-]+-(\d+))">([^<]*)<\/a><\/span><span class="[^"]*matCount">×(\d+)/g)].map((m) => {
    addItem(m[2], decode(m[3]).trim(), m[1]);
    return { itemId: m[2], quantity: Number(m[4]) };
  });
  const name = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const prof = html.match(/recipes\?profession=([A-Za-z]+)"/)?.[1];
  const level = html.match(/Lv\.\s*(\d+)/)?.[1];
  const qty = html.match(/(\d+)\s*×\s*[^<]{0,80}?<[^>]*>[^<]*·\s*≈/)?.[1];
  if (!product || !ingredients.length || !name) { problems.push(`${slug}: could not parse (product=${!!product}, ingredients=${ingredients.length})`); continue; }
  addItem(product[2], name, product[1]);
  if (prof) professions.set(prof.toLowerCase(), { id: prof.toLowerCase(), name: prof });
  recipes.push({
    id,
    outputItemId: product[2],
    outputQuantity: 1,
    ingredients,
    ...(prof ? { professionId: prof.toLowerCase() } : {}),
    ...(level ? { professionLevel: Number(level) } : {}),
    sourceUrl: `${BASE}/database/recipes/${slug}`,
    notes: 'Output quantity is assumed to be 1; not shown on the source page.',
  });
  if (n % 25 === 0) console.log(`recipe ${n}/${slugs.length}`);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ items: [...items.values()], recipes, professions: [...professions.values()], problems }, null, 2));
console.log(`Wrote ${out}: ${recipes.length} recipes, ${items.size} items, ${problems.length} problems`);
