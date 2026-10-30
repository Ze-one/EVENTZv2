import Papa from 'papaparse';
import { detectMapping, MAX_ROSTER_BYTES, MAX_ROSTER_ROWS } from './model.js';

export type RosterSheet = { name: string; rows: string[][]; truncated?: boolean };
export function validateTable(rows: string[][]) {
  if (!rows.length) throw new Error('This source has no rows. Choose another sheet or file.');
  if (rows.length > MAX_ROSTER_ROWS + 1) throw new Error(`Import up to ${MAX_ROSTER_ROWS.toLocaleString()} participants at a time. Split this roster into smaller files.`);
  if (rows.some(row => row.length > 100)) throw new Error('This roster has more than 100 columns. Export only the participant columns.');
  if (rows.some(row => row.some(value => value.length > 10000))) throw new Error('A cell is too long. Export only the participant columns.');
  return rows;
}
export function parseRosterText(text: string): string[][] {
  if (new TextEncoder().encode(text).length > MAX_ROSTER_BYTES) throw new Error('Choose a file or pasted text smaller than 10 MB.');
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimitersToGuess: [',', '\t', ';', '|'], preview: MAX_ROSTER_ROWS + 2 });
  if (parsed.errors.some(error => error.code !== 'UndetectableDelimiter')) throw new Error('The text contains malformed CSV quoting. Check the exported file before importing.');
  return validateTable(parsed.data.map(row => row.map(value => String(value ?? '').trim())));
}
export async function parseRosterWorkbook(data: ArrayBuffer): Promise<RosterSheet[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type: 'array', sheetRows: MAX_ROSTER_ROWS + 2, cellFormula: false, cellHTML: false });
  if (!workbook.SheetNames.length) throw new Error('This workbook has no worksheets.');
  return workbook.SheetNames.map(name => ({ name, truncated: Boolean(workbook.Sheets[name]['!fullref']), rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }).map(row => row.map(value => String(value ?? '').trim())) }));
}

export type PdfText = { str: string; transform: number[]; width: number; height: number };
// Preserve table columns using their positions, rather than flattening all PDF
// text into names. The organizer reviews and maps the resulting cells.
export function pdfTextRows(items: PdfText[]): string[][] {
  const lines: { y: number; items: PdfText[] }[] = [];
  for (const item of [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    if (!item.str.trim()) continue;
    const line = lines.find(line => Math.abs(line.y - item.transform[5]) < 3);
    if (line) line.items.push(item); else lines.push({ y: item.transform[5], items: [item] });
  }
  let anchors: number[] | undefined;
  return lines.map(line => {
    const cells: { text: string; x: number }[] = [];
    let end = -Infinity;
    for (const item of line.items.sort((a, b) => a.transform[4] - b.transform[4])) {
      const gap = item.transform[4] - end;
      const segments = item.str.trim().split(/\t|\s{2,}|\s*\|\s*/);
      if (cells.length && gap < Math.max(12, item.height * 1.2)) cells[cells.length - 1].text += ` ${segments.shift()}`;
      cells.push(...segments.map(text => ({ text, x: item.transform[4] })));
      end = item.transform[4] + item.width;
    }
    const values = cells.map(cell => cell.text);
    const mapped = detectMapping(values);
    if (Object.values(mapped).filter(index => index >= 0).length >= 2 && (mapped.fullName >= 0 || mapped.firstName >= 0 || mapped.lastName >= 0) && new Set(cells.map(cell => cell.x)).size === cells.length) {
      anchors = cells.map(cell => cell.x);
      return values;
    }
    if (!anchors) return values;
    const row = anchors.map(() => '');
    for (const cell of cells) {
      const closest = anchors.reduce((best, x, index) => Math.abs(x - cell.x) < Math.abs(anchors![best] - cell.x) ? index : best, 0);
      row[closest] = [row[closest], cell.text].filter(Boolean).join(' ');
    }
    return row;
  });
}
