import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

const BRAND = { name: 'EVENTZ', slogan: 'manage your event access by ETS.NTECH', navy: '#0b1f4d', gold: '#f2a900' };
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
    return { participants: participantsRes.data || [], scanLogs: scanLogsRes.data || [], emailLogs: emailLogsRes.data || [], event: eventsRes.data?.[0] || {} };
  }

  const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) : {};
  return { participants: db.participants || [], scanLogs: db.scanLogs || [], emailLogs: db.emailLogs || [], event: db.events?.[0] || db.event || {} };
}

function safe(value: any) { return String(value ?? '').replace(/\r?\n/g, ' ').trim(); }
function titleFor(kind: ReportKind) {
  if (kind === 'checked-in') return 'Checked-In Attendance Registry';
  if (kind === 'roster') return 'Complete Event Roster';
  if (kind === 'scan-logs') return 'Gate Scan Audit Logs';
  return 'Pass Email Dispatch Logs';
}
function rowsFor(kind: ReportKind, data: any) {
  if (kind === 'checked-in' || kind === 'roster') {
    const source = kind === 'checked-in' ? data.participants.filter((p: any) => p.status === 'Used') : data.participants;
    return source.map((p: any, index: number) => ({ No: index + 1, 'Full Name': safe(p.fullName), Email: safe(p.email), Phone: safe(p.phone), Organization: safe(p.organization), Category: safe(p.category), 'Pass ID': safe(p.passId), Status: safe(p.status), 'Checked In At': safe(p.checkedInAt), 'Checked In By': safe(p.checkedInBy) }));
  }
  if (kind === 'scan-logs') return data.scanLogs.map((log: any, index: number) => ({ No: index + 1, 'Scan ID': safe(log.id), 'Pass ID': safe(log.passId), 'Participant Name': safe(log.participantName || 'Unknown'), Result: safe(log.scanResult), 'Scanned By': safe(log.scannedBy), Device: safe(log.deviceInfo), 'IP Address': safe(log.ipAddress), Timestamp: safe(log.createdAt) }));
  return data.emailLogs.map((log: any, index: number) => ({ No: index + 1, 'Log ID': safe(log.id), Participant: safe(log.participantName), Recipient: safe(log.recipientEmail), Subject: safe(log.subject), Status: safe(log.status), Error: safe(log.errorMessage), Timestamp: safe(log.sentAt) }));
}
function buildCsv(rows: Record<string, any>[], title: string) {
  const headers = Object.keys(rows[0] || { No: '' });
  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [`${BRAND.name} - ${BRAND.slogan}`, title, `Generated At,${new Date().toISOString()}`, '', headers.join(','), ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))].join('\n');
}
function buildExcel(rows: Record<string, any>[], title: string, event: any) {
  const headers = Object.keys(rows[0] || { No: '' });
  const worksheetData = [[BRAND.name, BRAND.slogan], ['Report', title], ['Event', safe(event?.eventName)], ['Generated At', new Date().toLocaleString()], [], headers, ...rows.map((row) => headers.map((h) => row[h]))];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = headers.map((header) => ({ wch: Math.max(14, Math.min(34, header.length + 12)) }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, headers.length - 1) } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
function pdfEscape(text: string) { return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function buildPdf(rows: Record<string, any>[], title: string, event: any) {
  const headers = Object.keys(rows[0] || { No: '' });
  const lines = [`EVENTZ`, BRAND.slogan, title, `Event: ${safe(event?.eventName)}`, `Generated: ${new Date().toLocaleString()}`, `Total: ${rows.length}`, '', headers.join(' | '), ...rows.slice(0, 45).map((row) => headers.map((h) => safe(row[h])).join(' | '))];
  if (rows.length > 45) lines.push(`... ${rows.length - 45} more rows available in CSV/Excel export.`);
  let y = 790;
  const content = ['q', '0.043 0.122 0.302 rg 0 760 612 82 re f', '1 1 1 rg /F1 28 Tf 40 800 Td (EVENT) Tj', '0.949 0.663 0 rg /F1 28 Tf 122 800 Td (Z) Tj', 'Q', ...lines.map((line, index) => { const size = index === 0 ? 18 : index < 6 ? 10 : 7.2; const font = index === 0 || index === 7 ? '/F1' : '/F2'; const currentY = y - index * 13; return `BT ${font} ${size} Tf 40 ${currentY} Td (${pdfEscape(line.slice(0, 135))}) Tj ET`; })].join('\n');
  const objects = ['1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj', '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj', '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj', '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj', '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj', `6 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) { offsets.push(Buffer.byteLength(pdf, 'utf8')); pdf += `${obj}\n`; }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}
function fileName(kind: ReportKind, ext: string) { return `eventz-${kind}-${new Date().toISOString().slice(0, 10)}.${ext}`; }

export default async function handler(req: any, res: any) {
  try {
    const kind = String(req.query?.kind || 'scan-logs') as ReportKind;
    const format = String(req.query?.format || 'csv').toLowerCase();
    if (!['checked-in', 'roster', 'scan-logs', 'email-logs'].includes(kind)) return res.status(400).json({ error: 'Unsupported report kind.' });
    const data = await loadData();
    const rows = rowsFor(kind, data);
    const title = titleFor(kind);
    if (format === 'csv') { const csv = buildCsv(rows, title); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'csv')}"`); return res.status(200).send(csv); }
    if (format === 'xlsx' || format === 'excel') { const buffer = buildExcel(rows, title, data.event); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'xlsx')}"`); return res.status(200).send(buffer); }
    if (format === 'pdf') { const buffer = buildPdf(rows, title, data.event); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'pdf')}"`); return res.status(200).send(buffer); }
    return res.status(400).json({ error: 'Unsupported export format. Use csv, xlsx, or pdf.' });
  } catch (error: any) { return res.status(500).json({ error: error?.message || 'Report export failed.' }); }
}
