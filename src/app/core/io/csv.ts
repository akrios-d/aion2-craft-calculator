export function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 style parser supporting quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text: string): { rows: string[][]; lines: number[]; error?: string } {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    if (!(row.length === 1 && row[0].trim() === '')) {
      rows.push(row);
      lines.push(rowLine);
    }
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else field += ch;
    i++;
  }
  if (inQuotes) return { rows: [], lines: [], error: 'Unterminated quoted field.' };
  if (field !== '' || row.length > 0) endRow();
  return { rows, lines };
}

/** Prevents spreadsheet formula injection in exported text cells. */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: string[], rows: (string | number | undefined)[][], textColumns: number[] = []): string {
  const out = [header.map(escapeCell).join(',')];
  for (const r of rows) {
    out.push(
      r
        .map((v, idx) => {
          if (v === undefined) return '';
          const s = typeof v === 'number' ? String(v) : textColumns.includes(idx) ? safeText(v) : v;
          return escapeCell(s);
        })
        .join(','),
    );
  }
  return out.join('\r\n') + '\r\n';
}
