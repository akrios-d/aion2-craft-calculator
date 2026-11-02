// Pure parser for the public https://kisk.app/scoring page (used by scripts/import-kisk-shares.mjs and unit tests).
// It only reads what the page lists; nothing is invented or filled in.

const SLOT_BY_LABEL = {
  weapon: 'weapon', guard: 'guard', torso: 'torso', pants: 'pants', helmet: 'helmet', shoulders: 'shoulders',
  gloves: 'gloves', boots: 'boots', cape: 'cape', necklace: 'necklace', earrings: 'earrings', rings: 'rings',
  bracelet: 'bracelet', arcana: 'arcana',
};

const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plain = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "Weapon Damage Boost <span class="note">100%</span>, Combat Speed <span ...>99%</span>" -> lines. */
export function parseLines(cellHtml, warnings, where) {
  const lines = [];
  const seen = new Set();
  const re = /([^<>]*?)<span class="note">\s*(\d+(?:\.\d+)?)%\s*<\/span>/g;
  let m;
  while ((m = re.exec(cellHtml))) {
    const stat = decode(m[1]).replace(/^[\s,]+/, '').trim();
    const share = Number(m[2]);
    if (!stat || !Number.isFinite(share) || share < 0 || share > 100) {
      warnings.push(`${where}: skipped unreadable line "${m[0].slice(0, 60)}"`);
      continue;
    }
    if (seen.has(stat.toLowerCase())) {
      warnings.push(`${where}: duplicate stat "${stat}" skipped`);
      continue;
    }
    seen.add(stat.toLowerCase());
    lines.push({ stat, share });
  }
  return lines;
}

export function parseBands(text) {
  const bands = [];
  const re = /\b(BiS|S\+|S|A|B|C|D)\|?\s*(\d+)%\s*(?:and up|to \d+%)/g;
  let m;
  while ((m = re.exec(text))) bands.push({ letter: m[1], min: Number(m[2]) });
  const byLetter = new Map(bands.map((b) => [b.letter, b]));
  return [...byLetter.values()].sort((a, b) => a.min - b.min);
}

/** @returns {{ classes: {className:string, sample:number|null, slots:Record<string,{stat:string,share:number}[]>}[], bands: {letter:string,min:number}[], snapshotDate: string|null, warnings: string[] }} */
export function parseKiskScoring(html) {
  const warnings = [];
  const clean = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const classes = [];
  const sectionRe = /What\s+([\d.,]+)\s+top\s+([A-Za-z]+?)s?\s+in\s+Korea[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
  let sec;
  while ((sec = sectionRe.exec(clean))) {
    const sample = Number(sec[1].replace(/[.,]/g, ''));
    let name = sec[2].toLowerCase();
    // "Gladiators" -> "gladiator" (regex above already drops one trailing "s"); keep names like "assassin" intact.
    if (name.endsWith('s') && !name.endsWith('ss')) name = name.slice(0, -1);
    const slots = {};
    const rowRe = /<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g;
    let row;
    while ((row = rowRe.exec(sec[3]))) {
      const label = plain(row[1]).toLowerCase();
      const slot = SLOT_BY_LABEL[label];
      if (!slot) {
        warnings.push(`${name}: unknown slot "${label}" ignored`);
        continue;
      }
      const lines = parseLines(row[2], warnings, `${name}/${slot}`);
      if (lines.length) slots[slot] = lines;
      else warnings.push(`${name}/${slot}: no lines parsed`);
    }
    classes.push({ className: name, sample: Number.isFinite(sample) ? sample : null, slots });
  }
  const text = plain(clean.replace(/<\/(p|div|li|tr|td|th|h\d)>/g, '| '));
  const snap = /taken on (\d{4}-\d{2}-\d{2})/.exec(text);
  return { classes, bands: parseBands(text), snapshotDate: snap?.[1] ?? null, warnings };
}
