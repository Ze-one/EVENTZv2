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

type ReportKind = 'checked-in' | 'roster' | 'scan-logs' | 'email-logs';

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function loadData() {
  const supabase = getSupabase();
  if (supabase) {
    const [participantsRes, scanLogsRes, emailLogsRes, eventsRes] = await Promise.all([
      supabase.from('participants').select('*').order('createdAt', { ascending: true }),
      supabase.from('scanLogs').select('*').order('createdAt', { ascending: false }),
      supabase.from('emailLogs').select('*').order('sentAt', { ascending: false }),
      supabase.from('events').select('*').limit(1)
    ]);
    if (participantsRes.error) throw new Error(participantsRes.error.message);
    if (scanLogsRes.error) throw new Error(scanLogsRes.error.message);
    if (emailLogsRes.error) throw new Error(emailLogsRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    return {
      participants: participantsRes.data || [],
      scanLogs: scanLogsRes.data || [],
      emailLogs: emailLogsRes.data || [],
      event: eventsRes.data?.[0] || {}
    };
  }

  const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) : {};
  return { participants: db.participants || [], scanLogs: db.scanLogs || [], emailLogs: db.emailLogs || [], event: db.events?.[0] || db.event || {} };
}

function safe(value: any) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function titleFor(kind: ReportKind) {
  if (kind === 'checked-in') return 'Checked-In Attendance Registry';
  if (kind === 'roster') return 'Complete Event Roster';
  if (kind === 'scan-logs') return 'Gate Scan Audit Logs';
  return 'Pass Email Dispatch Logs';
}

function rowsFor(kind: ReportKind, data: any) {
  if (kind === 'checked-in' || kind === 'roster') {
    const source = kind === 'checked-in' ? data.participants.filter((p: any) => p.status === 'Used') : data.participants;
    return source.map((p: any, index: number) => ({
      No: index + 1,
      'Full Name': safe(p.fullName),
      Email: safe(p.email),
      Phone: safe(p.phone),
      Organization: safe(p.organization),
      Category: safe(p.category),
      'Pass ID': safe(p.passId),
      Status: safe(p.status),
      'Checked In At': safe(p.checkedInAt),
      'Checked In By': safe(p.checkedInBy)
    }));
  }

  if (kind === 'scan-logs') {
    return data.scanLogs.map((log: any, index: number) => ({
      No: index + 1,
      'Scan ID': safe(log.id),
      'Pass ID': safe(log.passId),
      'Participant Name': safe(log.participantName || 'Unknown'),
      Result: safe(log.scanResult),
      'Scanned By': safe(log.scannedBy),
      Device: safe(log.deviceInfo),
      'IP Address': safe(log.ipAddress),
      Timestamp: safe(log.createdAt)
    }));
  }

  return data.emailLogs.map((log: any, index: number) => ({
    No: index + 1,
    'Log ID': safe(log.id),
    Participant: safe(log.participantName),
    Recipient: safe(log.recipientEmail),
    Subject: safe(log.subject),
    Status: safe(log.status),
    Error: safe(log.errorMessage),
    Timestamp: safe(log.sentAt)
  }));
}

function buildCsv(rows: Record<string, any>[], title: string) {
  const headers = Object.keys(rows[0] || { No: '' });
  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [`${BRAND.name} - ${BRAND.slogan}`, title, `Generated At,${new Date().toISOString()}`, '', headers.join(','), ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))].join('\n');
}

function buildExcel(rows: Record<string, any>[], title: string, event: any) {
  const headers = Object.keys(rows[0] || { No: '' });
  const worksheetData = [
    [BRAND.name, BRAND.slogan],
    ['Report', title],
    ['Event', safe(event?.eventName)],
    ['Generated At', new Date().toLocaleString()],
    [],
    headers,
    ...rows.map((row) => headers.map((h) => row[h]))
  ];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = headers.map((header) => ({ wch: Math.max(14, Math.min(34, header.length + 12)) }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, headers.length - 1) } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function buildPdf(rows: Record<string, any>[], title: string, event: any) {
  const mod = await import('pdfkit');
  const PDFDocument = (mod as any).default || mod;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const drawBrandHeader = () => {
    doc.rect(0, 0, doc.page.width, 86).fill(BRAND.navy);
    doc.fillColor('white').fontSize(30).font('Helvetica-Bold').text('EVENT', 40, 20, { continued: true });
    doc.fillColor(BRAND.gold).text('Z');
    doc.fillColor('#dbe4f0').fontSize(9).font('Helvetica-Bold').text(BRAND.slogan.toUpperCase(), 42, 57);
    doc.fillColor('white').fontSize(14).font('Helvetica-Bold').text(title, 390, 22, { align: 'right', width: doc.page.width - 430 });
    doc.fillColor('#dbe4f0').fontSize(8).font('Helvetica').text(`${safe(event?.eventName || '')} • Generated ${new Date().toLocaleString()}`, 390, 48, { align: 'right', width: doc.page.width - 430 });
  };

  drawBrandHeader();
  let y = 112;
  const headers = Object.keys(rows[0] || { No: '' });
  const pageWidth = doc.page.width - 72;
  const colWidth = Math.max(48, pageWidth / Math.max(headers.length, 1));
  const rowH = 24;

  const drawTableHeader = () => {
    let x = 36;
    doc.roundedRect(36, y, pageWidth, rowH, 5).fill('#f1f5f9');
    doc.fillColor(BRAND.navy).fontSize(6.5).font('Helvetica-Bold');
    headers.forEach((h) => {
      doc.text(h, x + 4, y + 8, { width: colWidth - 8, ellipsis: true });
      x += colWidth;
    });
    y += rowH + 3;
  };

  doc.fillColor(BRAND.navy).fontSize(11).font('Helvetica-Bold').text(`${rows.length} record(s)`, 36, y);
  y += 24;
  drawTableHeader();

  rows.forEach((row, index) => {
    if (y > doc.page.height - 50) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
      drawBrandHeader();
      y = 112;
      drawTableHeader();
    }
    let x = 36;
    if (index % 2 === 0) doc.rect(36, y - 2, pageWidth, rowH).fill('#fbfdff');
    doc.fillColor('#0f172a').fontSize(6.3).font('Helvetica');
    headers.forEach((h) => {
      doc.text(safe(row[h]), x + 4, y + 5, { width: colWidth - 8, height: rowH - 4, ellipsis: true });
      x += colWidth;
    });
    y += rowH;
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor('#94a3b8').fontSize(7).text(`${BRAND.name} • ${BRAND.slogan} • Page ${i + 1}`, 36, doc.page.height - 24, { align: 'center', width: doc.page.width - 72 });
  }

  doc.end();
  return await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
}

function fileName(kind: ReportKind, ext: string) {
  return `eventz-${kind}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export default async function handler(req: any, res: any) {
  try {
    const kind = String(req.query?.kind || 'scan-logs') as ReportKind;
    const format = String(req.query?.format || 'csv').toLowerCase();
    if (!['checked-in', 'roster', 'scan-logs', 'email-logs'].includes(kind)) {
      res.status(400).json({ error: 'Unsupported report kind.' });
      return;
    }

    const data = await loadData();
    const rows = rowsFor(kind, data);
    const title = titleFor(kind);

    if (format === 'csv') {
      const csv = buildCsv(rows, title);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'csv')}"`);
      res.status(200).send(csv);
      return;
    }

    if (format === 'xlsx' || format === 'excel') {
      const buffer = buildExcel(rows, title, data.event);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'xlsx')}"`);
      res.status(200).send(buffer);
      return;
    }

    if (format === 'pdf') {
      const buffer = await buildPdf(rows, title, data.event);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'pdf')}"`);
      res.status(200).send(buffer);
      return;
    }

    res.status(400).json({ error: 'Unsupported export format. Use csv, xlsx, or pdf.' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Report export failed.' });
  }
}
