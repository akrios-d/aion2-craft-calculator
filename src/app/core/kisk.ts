/**
 * Parser for the public kisk.app character gear page (https://kisk.app/c/{region}/{server}/{name}/gear).
 * Pure string parsing (no DOM): it reads only what the page lists and never fills in values; anything it cannot
 * read is reported through `ParseError`. kisk's numbers are its own and may be inaccurate.
 */
import { ShareLine, ShareTable, shareSlotOf } from './share-score';

export const KISK_REGIONS = ['naw', 'nae', 'eu', 'as', 'la'] as const;

export interface KiskLine {
  stat: string;
  /** Current value as printed, e.g. "11.9%", "91", "+3". */
  value: string;
  /** Largest value for the item ("/ 11.9%"); absent on ideal lines. */
  max?: string;
  /** % of the class's top players carrying the line on the slot. */
  share: number;
  /** Ideal lines only: the equipped item has this line. */
  have?: boolean;
}

export interface KiskCard {
  /** kisk's data-slot, e.g. MainHand, Earring1, Arcana3. */
  slot: string;
  name: string;
  icon: string;
  /** "Lv 86 Unique, exceed 3". */
  subtitle: string;
  enchant: string;
  score: number | null;
  letter: string;
  lines: KiskLine[];
  ideal?: { title: string; subtitle: string; score: number | null; letter: string; lines: KiskLine[] };
}

export interface KiskUnscored { name: string; icon: string; subtitle: string; enchant: string }

export interface KiskReport {
  name: string;
  faction: string;
  level: string;
  className: string;
  server: string;
  legion: string;
  cp: string;
  overallLetter: string;
  portrait: string;
  gear: KiskCard[];
  unscored: KiskUnscored[];
  arcana: KiskCard[];
}

export interface KiskSnapshot {
  url: string;
  fetchedAt: string;
  region: string;
  server: string;
  report: KiskReport;
}

export class KiskParseError extends Error {}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (h: string) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const first = (h: string, re: RegExp) => re.exec(h)?.[1];

function parseLines(html: string): KiskLine[] {
  const out: KiskLine[] = [];
  const re = /<div class="line([^"]*)">([\s\S]*?)<div class="bar">/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const cls = m[1];
    const body = m[2];
    const label = first(body, /<span>([\s\S]*?)<\/span><span title=/);
    const share = Number(first(body, /Carried by (\d+(?:\.\d+)?)%/));
    if (label === undefined || !Number.isFinite(share)) throw new KiskParseError('unreadable stat line');
    const note = first(label, /<span class="note">\s*\/\s*([^<]*)<\/span>/);
    const main = text(label.replace(/<span class="note">[\s\S]*?<\/span>/, ''));
    const v = /^(.*?)\s+([+-]?\d[\d.,]*%?)$/.exec(main);
    if (!v) throw new KiskParseError(`unreadable stat "${main}"`);
    const line: KiskLine = { stat: v[1].trim(), value: v[2], share };
    if (note !== undefined) line.max = decode(note).trim();
    if (cls.includes('ideal')) line.have = !cls.includes('lacking');
    out.push(line);
  }
  return out;
}

function header(h: string) {
  const name = text(first(h, /<b>([\s\S]*?)<\/b>/) ?? '');
  const scoreRaw = first(h, /<span class="facet"><small>Score<\/small>\s*(\d+(?:\.\d+)?)/);
  return {
    name,
    icon: first(h, /<img src="([^"]+)"/) ?? '',
    subtitle: text(first(h, /<span class="note">([\s\S]*?)<\/span>/) ?? ''),
    enchant: first(h, /<span class="enchant[^"]*"[^>]*>([^<]*)<\/span>/) ?? '',
    score: scoreRaw === undefined ? null : Number(scoreRaw),
    letter: text(first(h, /<span class="letter">([\s\S]*?)<\/span>/) ?? ''),
  };
}

function parseCard(slot: string, block: string): KiskCard {
  const [front, back = ''] = block.split('<div class="side back">');
  const fh = header(front);
  if (!fh.name) throw new KiskParseError(`card ${slot}: no item name`);
  const card: KiskCard = { slot, ...fh, lines: parseLines(front) };
  if (back.includes('class="card bis"')) {
    const bh = header(back);
    card.ideal = { title: bh.name, subtitle: bh.subtitle, score: bh.score, letter: bh.letter, lines: parseLines(back) };
  }
  return card;
}

function splitCards(html: string): KiskCard[] {
  const parts = html.split('<div class="flip" data-slot="').slice(1);
  return parts.map((p) => {
    const slot = p.slice(0, p.indexOf('"'));
    return parseCard(slot, p);
  });
}

export function parseKiskGear(html: string): KiskReport {
  if (!html.includes('id="report"')) throw new KiskParseError('not a kisk character report');
  const hero = first(html, /<section class="hero">([\s\S]*?)<\/section>/) ?? '';
  const name = text(first(hero, /<h1>([\s\S]*?)<\/h1>/) ?? '');
  if (!name) throw new KiskParseError('character header not found');
  const lv = /Lv\s*(\d+)\s+([A-Za-z]+)/.exec(text(hero));
  const unIdx = html.indexOf('<h2>Unscored</h2>');
  const arIdx = html.indexOf('<h2>Arcana</h2>');
  const gearStart = html.indexOf('<h2>Gear</h2>');
  if (gearStart < 0) throw new KiskParseError('Gear section not found');
  const gearEnd = unIdx >= 0 ? unIdx : arIdx >= 0 ? arIdx : html.length;
  const gear = splitCards(html.slice(gearStart, gearEnd));
  if (!gear.length) throw new KiskParseError('no gear cards found');
  const unscored: KiskUnscored[] = [];
  if (unIdx >= 0) {
    const seg = html.slice(unIdx, arIdx > unIdx ? arIdx : html.length);
    for (const b of seg.split('<div class="board piece">').slice(1)) {
      const h = header(b);
      if (h.name) unscored.push({ name: h.name, icon: h.icon, subtitle: h.subtitle, enchant: h.enchant });
    }
  }
  const arcana = arIdx >= 0 ? splitCards(html.slice(arIdx)) : [];
  return {
    name,
    faction: text(first(hero, /<span class="pill (?:asmodian|elyos)[^"]*">([\s\S]*?)<\/span>/) ?? ''),
    level: lv?.[1] ?? '',
    className: lv?.[2] ?? '',
    server: text(first(hero, /<a class="pill link" href="\/census\/[^"]*">([\s\S]*?)<\/a>/) ?? ''),
    legion: text(first(hero, /<a class="pill link" href="\/l\/[^"]*">([\s\S]*?)<\/a>/) ?? ''),
    cp: first(hero, /([\d,]+)\s*CP/) ?? '',
    overallLetter: text(first(hero, /<div class="face"><b>([\s\S]*?)<\/b>/) ?? ''),
    portrait: decode(first(hero, /<img src="([^"]+)"/) ?? ''),
    gear,
    unscored,
    arcana,
  };
}

/** Ideal cards -> a share table for the class (first card wins per slot); the ideal value becomes `maxRoll`. */
export function kiskToShareTable(r: KiskReport, fetchedAt: string): ShareTable | null {
  const slots: ShareTable['slots'] = {};
  for (const c of [...r.gear, ...r.arcana]) {
    const slot = shareSlotOf(c.slot);
    if (!slot || slots[slot] || !c.ideal?.lines.length) continue;
    slots[slot] = c.ideal.lines.map((l): ShareLine => {
      const v = Number(l.value.replace(/[%+,]/g, ''));
      return Number.isFinite(v) && v > 0 ? { stat: l.stat, share: l.share, maxRoll: v } : { stat: l.stat, share: l.share };
    });
  }
  if (!r.className || !Object.keys(slots).length) return null;
  return { className: r.className.toLowerCase(), slots, updatedAt: fetchedAt };
}

export function kiskCacheKey(region: string, server: string, name: string): string {
  return `${region}/${server}/${name}`.toLowerCase();
}

export interface KiskBisSummary { className: string; gearSlots: number; arcanaSlots: number; lines: number; fetchedAt: string; source: KiskSnapshot }

/** Per class, the BiS auto-populated from the latest kisk lookup of that class (Ideal cards: gear and arcana). */
export function kiskBisSummaries(snaps: readonly KiskSnapshot[]): KiskBisSummary[] {
  const out = new Map<string, KiskBisSummary>();
  for (const s of snaps) {
    const cls = s.report.className?.toLowerCase();
    if (!cls) continue;
    const g = s.report.gear.filter((c) => c.ideal?.lines.length);
    const a = s.report.arcana.filter((c) => c.ideal?.lines.length);
    if (!g.length && !a.length) continue;
    const prev = out.get(cls);
    if (prev && prev.fetchedAt >= s.fetchedAt) continue;
    out.set(cls, { className: cls, gearSlots: g.length, arcanaSlots: a.length, lines: [...g, ...a].reduce((n, c) => n + (c.ideal?.lines.length ?? 0), 0), fetchedAt: s.fetchedAt, source: s });
  }
  return [...out.values()].sort((x, y) => x.className.localeCompare(y.className));
}
