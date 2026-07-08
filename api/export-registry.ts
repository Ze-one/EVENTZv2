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

async function buildPdf(rows: Record<string, any>[], event: any) {
  const mod = await import('pdfkit');
  const PDFDocument = (mod as any).default || mod;
  const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  doc.rect(0, 0, doc.page.width, 86).fill(BRAND.navy);
  doc.fillColor('white').fontSize(30).font('Helvetica-Bold').text('EVENT', 40, 22, { continued: true });
  doc.fillColor(BRAND.gold).text('Z');
  doc.fillColor('#dbe4f0').fontSize(10).font('Helvetica-Bold').text(BRAND.slogan.toUpperCase(), 42, 58);
  doc.fillColor('white').fontSize(14).text(safe(event?.eventName || 'Event Registry'), 420, 24, { align: 'right', width: doc.page.width - 460 });
  doc.fillColor('#dbe4f0').fontSize(9).text(`${safe(event?.venue)} • ${safe(event?.eventDate)} ${safe(event?.eventTime)}`, 420, 48, { align: 'right', width: doc.page.width - 460 });

  let y = 112;
  doc.fillColor(BRAND.navy).fontSize(12).font('Helvetica-Bold').text('Participant Registry', 40, y);
  doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(`Generated: ${new Date().toLocaleString()} • Total: ${rows.length}`, 40, y + 16);
  y += 42;

  const columns = [
    ['No', 32], ['Full Name', 140], ['Email', 145], ['Phone', 82], ['Category', 82], ['Pass ID', 122], ['Status', 74], ['Checked In', 100]
  ] as const;
  const startX = 40;
  const rowH = 22;

  const drawHeader = () => {
    let x = startX;
    doc.roundedRect(startX, y, doc.page.width - 80, rowH, 6).fill('#f1f5f9');
    doc.fillColor(BRAND.navy).fontSize(7).font('Helvetica-Bold');
    columns.forEach(([label, width]) => { doc.text(label, x + 4, y + 7, { width: width - 8, ellipsis: true }); x += width; });
    y += rowH + 4;
  };

  drawHeader();
  rows.forEach((row, index) => {
    if (y > doc.page.height - 52) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
      y = 42;
      drawHeader();
    }
    let x = startX;
    if (index % 2 === 0) doc.rect(startX, y - 2, doc.page.width - 80, rowH).fill('#fbfdff');
    doc.fillColor('#0f172a').fontSize(7).font('Helvetica');
    const values = [row.No, row['Full Name'], row.Email, row.Phone, row.Category, row['Pass ID'], row.Status, row['Checked In At']];
    values.forEach((value, idx) => { doc.text(safe(value), x + 4, y + 4, { width: columns[idx][1] - 8, height: rowH - 4, ellipsis: true }); x += columns[idx][1]; });
    y += rowH;
  });

  doc.fillColor('#94a3b8').fontSize(8).text(`${BRAND.name} • ${BRAND.slogan}`, 40, doc.page.height - 28, { align: 'center', width: doc.page.width - 80 });
  doc.end();
  return await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
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
      const buffer = await buildPdf(rows, event);
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
