import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

const BRAND = {
  name: 'EVENTZ',
  slogan: 'manage your event access by ETS.NTECH',
  navy: '#0b1f4d',
  gold: '#f2a900'
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function loadData() {
  const supabase = getSupabase();
  if (supabase) {
    const [{ data: participants, error: pError }, { data: eventRows, error: eError }] = await Promise.all([
      supabase.from('participants').select('*').order('createdAt', { ascending: true }),
      supabase.from('events').select('*').limit(1)
    ]);
    if (pError) throw new Error(pError.message);
    if (eError) throw new Error(eError.message);
    return { participants: participants || [], event: eventRows?.[0] || {} };
  }

  const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) : {};
  return { participants: db.participants || [], event: db.events?.[0] || db.event || {} };
}

function safe(value: any) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function registryRows(participants: any[]) {
  return participants.map((p, index) => ({
    No: index + 1,
    'Full Name': safe(p.fullName),
    Email: safe(p.email),
    Phone: safe(p.phone),
    Organization: safe(p.organization),
    Category: safe(p.category),
    'Pass ID': safe(p.passId),
    Status: safe(p.status),
    'Checked In At': safe(p.checkedInAt),
    'Checked In By': safe(p.checkedInBy),
    'Created At': safe(p.createdAt)
  }));
}

function filename(event: any, ext: string) {
  const base = safe(event?.eventName || 'event-registry').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event-registry';
  return `${base}-registry-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function buildCsv(rows: Record<string, any>[]) {
  const headers = Object.keys(rows[0] || {
    No: '', 'Full Name': '', Email: '', Phone: '', Organization: '', Category: '', 'Pass ID': '', Status: '', 'Checked In At': '', 'Checked In By': '', 'Created At': ''
  });
  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    `${BRAND.name} - ${BRAND.slogan}`,
    `Generated At,${new Date().toISOString()}`,
    '',
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','))
  ].join('\n');
}

function buildExcel(rows: Record<string, any>[], event: any) {
  const worksheetData = [
    [BRAND.name, BRAND.slogan],
    ['Event', safe(event?.eventName)],
    ['Venue', safe(event?.venue)],
    ['Date', safe(event?.eventDate), 'Time', safe(event?.eventTime)],
    ['Generated At', new Date().toLocaleString()],
    [],
    Object.keys(rows[0] || { No: '', 'Full Name': '', Email: '', Phone: '', Organization: '', Category: '', 'Pass ID': '', Status: '', 'Checked In At': '', 'Checked In By': '', 'Created At': '' }),
    ...rows.map((row) => Object.values(row))
  ];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = [
    { wch: 6 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 24 }
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'EVENTZ Registry');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function pdfEscape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(rows: Record<string, any>[], event: any) {
  const lines = [
    'EVENTZ',
    BRAND.slogan,
    `Event: ${safe(event?.eventName || 'Event Registry')}`,
    `Venue: ${safe(event?.venue)}`,
    `Date/Time: ${safe(event?.eventDate)} ${safe(event?.eventTime)}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Total Participants: ${rows.length}`,
    '',
    'No | Full Name | Email | Phone | Category | Pass ID | Status',
    ...rows.slice(0, 42).map((row) => `${row.No} | ${row['Full Name']} | ${row.Email} | ${row.Phone} | ${row.Category} | ${row['Pass ID']} | ${row.Status}`)
  ];
  if (rows.length > 42) lines.push(`... ${rows.length - 42} more rows available in CSV/Excel export.`);

  let y = 555;
  const content = [
    'q',
    '0.043 0.122 0.302 rg 0 760 612 82 re f',
    '1 1 1 rg /F1 28 Tf 40 800 Td (EVENT) Tj',
    '0.949 0.663 0 rg /F1 28 Tf 122 800 Td (Z) Tj',
    'Q',
    'BT /F1 12 Tf 40 735 Td (manage your event access by ETS.NTECH) Tj ET',
    ...lines.map((line, index) => {
      const size = index === 0 ? 18 : index < 7 ? 10 : 8;
      const font = index === 0 || index === 8 ? '/F1' : '/F2';
      const currentY = y - index * 13;
      return `BT ${font} ${size} Tf 40 ${currentY} Td (${pdfEscape(line.slice(0, 130))}) Tj ET`;
    })
  ].join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `6 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export default async function handler(req: any, res: any) {
  try {
    const format = String(req.query?.format || 'csv').toLowerCase();
    const { participants, event } = await loadData();
    const rows = registryRows(participants);

    if (format === 'csv') {
      const csv = buildCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename(event, 'csv')}"`);
      res.status(200).send(csv);
      return;
    }

    if (format === 'xlsx' || format === 'excel') {
      const buffer = buildExcel(rows, event);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename(event, 'xlsx')}"`);
      res.status(200).send(buffer);
      return;
    }

    if (format === 'pdf') {
      const buffer = buildPdf(rows, event);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename(event, 'pdf')}"`);
      res.status(200).send(buffer);
      return;
    }

    res.status(400).json({ error: 'Unsupported export format. Use csv, xlsx, or pdf.' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Registry export failed.' });
  }
}
