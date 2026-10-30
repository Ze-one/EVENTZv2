import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { detectMapping, looksLikeHeader, mapRoster, participantErrors, partitionDuplicates, MAX_ROSTER_ROWS } from '../src/roster/model.js';
import { parseRosterText, parseRosterWorkbook, pdfTextRows } from '../src/roster/parsers.js';

test('Google Forms headers map names without importing response timestamps or overwriting categories', () => {
  const rows = parseRosterText('\uFEFFTimestamp,What is your first name?,What is your last name?,Email Address,Company name,Ticket type\r\n2026-10-30 10:00,Ada,Lovelace,ada@example.com,Analytical Society,VIP');
  const mapping = detectMapping(rows[0]);
  assert.equal(mapping.fullName, -1);
  assert.equal(mapping.organization, 4);
  assert.deepEqual(mapRoster(rows.slice(1), mapping, 'Attendees'), [{ fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '', organization: 'Analytical Society', category: 'VIP' }]);
});
test('CSV quoting, semicolon exports, French headers, pasted tabs and headerless lists retain data', () => {
  const quoted = parseRosterText('Full name,Email,Organization\n"Doe, Jane",jane@example.com,"Team, Inc."');
  assert.equal(mapRoster(quoted.slice(1), detectMapping(quoted[0]), 'Guests')[0].fullName, 'Doe, Jane');
  const french = parseRosterText('Nom;Prénom;Adresse e-mail;Téléphone;Catégorie\nNjoya;Amina;amina@example.com;+237600000000;VIP');
  assert.deepEqual(mapRoster(french.slice(1), detectMapping(french[0]), 'Guests')[0], { fullName: 'Amina Njoya', email: 'amina@example.com', phone: '+237600000000', organization: '', category: 'VIP' });
  const tabs = parseRosterText('Full name\tEmail\nSam Reed\tsam@example.com');
  assert.equal(tabs[1][1], 'sam@example.com');
  const names = parseRosterText('Ada Lovelace\n\nSam Reed\n');
  assert.equal(looksLikeHeader(names[0]), false);
  assert.deepEqual(names, [['Ada Lovelace'], ['Sam Reed']]);
});
test('malformed files and oversized rosters fail rather than silently importing a partial roster', () => {
  assert.throws(() => parseRosterText('Name,Email\n"Ada,ada@example.com'), /malformed/);
  assert.throws(() => parseRosterText(['Name', ...Array(MAX_ROSTER_ROWS + 1).fill('Ada')].join('\n')), /Split/);
});
test('Excel preserves formatted phone strings, offers all sheets and flags truncated worksheets', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Instructions']]), 'Read me');
  const sheet = XLSX.utils.aoa_to_sheet([['Name', 'Phone', 'Category'], ['Amina', '00670000123', 'Speaker']]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Form responses');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(Array.from({ length: MAX_ROSTER_ROWS + 4 }, (_, i) => [i % 5 ? 'Person' : ''])), 'Too big');
  const sheets = await parseRosterWorkbook(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
  assert.equal(sheets.length, 3);
  assert.equal(sheets[1].rows[1][1], '00670000123');
  assert.equal(sheets[2].truncated, true);
});
test('PDF table extraction joins words within cells and preserves separate columns', () => {
  const item = (str: string, x: number, y: number, width: number) => ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12 });
  assert.deepEqual(pdfTextRows([
    item('Full name', 20, 700, 55), item('Email', 200, 700, 30), item('Category', 400, 700, 55),
    item('Ada', 20, 680, 20), item('Lovelace', 44, 680, 50), item('ada@example.com', 200, 680, 120), item('VIP', 400, 680, 20),
    item('No Email', 20, 660, 60), item('Guest', 400, 660, 30),
  ]), [['Full name', 'Email', 'Category'], ['Ada Lovelace', 'ada@example.com', 'VIP'], ['No Email', '', 'Guest']]);
});
test('invalid values require correction and duplicate checks respect contact identity', () => {
  const row = { fullName: 'Ada Lovelace', email: 'Ada@Example.com', phone: '', organization: 'Society', category: 'VIP' };
  assert.deepEqual(participantErrors(row), []);
  assert.ok(participantErrors({ ...row, fullName: '', email: 'bad' }).length === 2);
  assert.ok(participantErrors({ ...row, phone: {} }).length === 1);
  assert.deepEqual(partitionDuplicates([row, { ...row, email: 'ada@example.COM' }], []).duplicates, new Set([1]));
  assert.equal(partitionDuplicates([row], [row]).unique.length, 0);
  assert.equal(partitionDuplicates([{ ...row, email: 'someoneelse@example.com' }], [row]).unique.length, 1);
});
