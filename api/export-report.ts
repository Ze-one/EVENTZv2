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
  blue: '#2563eb',
  gold: '#f2a900',
  green: '#16a34a',
  red: '#dc2626',
  amber: '#f59e0b',
  gray: '#64748b',
  light: '#f8fafc'
};

type ReportKind = 'checked-in' | 'roster' | 'scan-logs' | 'email-logs';
type ReportRow = Record<string, any>;

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
  return {
    participants: db.participants || [],
    scanLogs: db.scanLogs || [],
    emailLogs: db.emailLogs || [],
    event: db.events?.[0] || db.event || {}
  };
}

function safe(value: any) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function plain(value: any) {
  return safe(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '');
}

function eventValue(event: any, keys: string[], fallback = 'Not specified') {
  for (const key of keys) {
    const value = safe(event?.[key]);
    if (value) return value;
  }
  return fallback;
}

function eventName(event: any) {
  return eventValue(event, ['eventName', 'name', 'title', 'eventTitle']);
}

function eventDate(event: any) {
  return eventValue(event, ['eventDate', 'date', 'startDate', 'scheduledAt']);
}

function eventVenue(event: any) {
  return eventValue(event, ['venue', 'location', 'eventLocation', 'address']);
}

function eventOrganizer(event: any) {
  return eventValue(event, ['organizer', 'host', 'company', 'createdBy'], 'ETSNTECH');
}

function formatDateTime(value: any) {
  const raw = safe(value);
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function titleFor(kind: ReportKind) {
  if (kind === 'checked-in') return 'Checked-In Attendance Registry';
  if (kind === 'roster') return 'Complete Event Roster';
  if (kind === 'scan-logs') return 'Gate Scan Audit Logs';
  return 'Pass Email Dispatch Logs';
}

function headersFor(kind: ReportKind) {
  if (kind === 'checked-in' || kind === 'roster') {
    return ['No', 'Full Name', 'Email', 'Phone', 'Organization', 'Category', 'Pass ID', 'Status', 'Checked In At', 'Checked In By'];
  }
  if (kind === 'scan-logs') {
    return ['No', 'Scan ID', 'Pass ID', 'Participant Name', 'Result', 'Scanned By', 'Device', 'IP Address', 'Timestamp'];
  }
  return ['No', 'Log ID', 'Participant', 'Recipient', 'Subject', 'Status', 'Error', 'Timestamp'];
}

function rowsFor(kind: ReportKind, data: any): ReportRow[] {
  if (kind === 'checked-in' || kind === 'roster') {
    const source = kind === 'checked-in'
      ? data.participants.filter((p: any) => safe(p.status).toLowerCase() === 'used')
      : data.participants;

    return source.map((p: any, index: number) => ({
      No: index + 1,
      'Full Name': safe(p.fullName),
      Email: safe(p.email),
      Phone: safe(p.phone),
      Organization: safe(p.organization),
      Category: safe(p.category),
      'Pass ID': safe(p.passId),
      Status: safe(p.status),
      'Checked In At': formatDateTime(p.checkedInAt),
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
      Timestamp: formatDateTime(log.createdAt)
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
    Timestamp: formatDateTime(log.sentAt)
  }));
}

function exportFileName(kind: ReportKind, ext: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `eventz-${kind}-${date}.${ext}`;
}

function buildCsv(rows: ReportRow[], title: string, event: any, kind: ReportKind) {
  const headers = headersFor(kind);
  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const metaRows = [
    ['Application', BRAND.name],
    ['Brand', BRAND.slogan],
    ['Report', title],
    ['Event', eventName(event)],
    ['Venue / Location', eventVenue(event)],
    ['Event Date', eventDate(event)],
    ['Organizer', eventOrganizer(event)],
    ['Generated At', new Date().toLocaleString('en-GB')],
    ['Total Records', rows.length],
    []
  ];

  const content = [
    ...metaRows.map((row) => row.map(escapeCsv).join(',')),
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
  ].join('\r\n');

  return `\uFEFF${content}`;
}

function buildExcel(rows: ReportRow[], title: string, event: any, kind: ReportKind) {
  const headers = headersFor(kind);
  const worksheetData = [
    [BRAND.name, BRAND.slogan],
    ['Report', title],
    ['Event', eventName(event)],
    ['Venue / Location', eventVenue(event)],
    ['Event Date', eventDate(event)],
    ['Organizer', eventOrganizer(event)],
    ['Generated At', new Date().toLocaleString('en-GB')],
    ['Total Records', rows.length],
    [],
    headers,
    ...rows.map((row) => headers.map((h) => row[h] ?? ''))
  ];

  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = headers.map((header) => ({
    wch: Math.max(12, Math.min(42, header.length + 14))
  }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(1, headers.length - 1) } }];
  ws['!freeze'] = { xSplit: 0, ySplit: 10 } as any;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function hexColor(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function pdfEscape(value: any) {
  return plain(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(value: any, max = 42, maxLines = 2) {
  const text = plain(value) || '-';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines && clipped.length) {
    clipped[clipped.length - 1] = `${clipped[clipped.length - 1].slice(0, Math.max(0, max - 3))}...`;
  }
  return clipped;
}

function buildPdf(rows: ReportRow[], title: string, event: any, kind: ReportKind) {
  const pageW = 612;
  const pageH = 842;
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = 0;

  const txt = (x: number, top: number, value: any, size = 9, font: '/F1' | '/F2' = '/F2', color = '#0f172a') => {
    commands.push(`BT ${hexColor(color)} rg ${font} ${size} Tf ${x} ${pageH - top} Td (${pdfEscape(value)}) Tj ET`);
  };

  const rect = (x: number, top: number, w: number, h: number, fill: string, stroke?: string) => {
    const bottom = pageH - top - h;
    if (stroke) commands.push(`${hexColor(stroke)} RG ${hexColor(fill)} rg ${x} ${bottom} ${w} ${h} re B`);
    else commands.push(`${hexColor(fill)} rg ${x} ${bottom} ${w} ${h} re f`);
  };

  const header = () => {
    rect(0, 0, pageW, 82, BRAND.navy);
    txt(40, 32, 'EVENT', 28, '/F1', '#ffffff');
    txt(128, 32, 'Z', 28, '/F1', BRAND.gold);
    txt(40, 58, BRAND.slogan, 9, '/F2', '#dbeafe');
    txt(325, 34, title, 14, '/F1', '#ffffff');
    txt(325, 56, `Generated: ${new Date().toLocaleString('en-GB')}`, 8, '/F2', '#dbeafe');
    y = 108;
  };

  const newPage = () => {
    if (commands.length) pages.push(commands);
    commands = [];
    header();
  };

  const ensure = (height: number) => {
    if (y + height > 775) newPage();
  };

  const field = (label: string, value: any, x: number, top: number, maxChars = 30) => {
    txt(x, top, label.toUpperCase(), 6.5, '/F1', BRAND.gray);
    wrap(value, maxChars, 2).forEach((line, index) => {
      txt(x, top + 13 + index * 11, line, 8.4, index === 0 ? '/F1' : '/F2', '#0f172a');
    });
  };

  const statusColor = (value: any) => {
    const status = safe(value).toLowerCase();
    if (status.includes('used') || status.includes('valid') || status.includes('success')) return BRAND.green;
    if (status.includes('invalid') || status.includes('cancel') || status.includes('fail') || status.includes('alert')) return BRAND.red;
    return BRAND.amber;
  };

  const statusChip = (value: any, x: number, top: number) => {
    const label = safe(value) || '-';
    rect(x, top, 96, 20, statusColor(label));
    txt(x + 12, top + 14, label.slice(0, 18), 7.5, '/F1', '#ffffff');
  };

  const summary = () => {
    rect(34, y, 544, 126, BRAND.light, '#cbd5e1');
    txt(54, y + 24, 'Event Details', 14, '/F1', BRAND.navy);
    txt(420, y + 24, `Total Records: ${rows.length}`, 11, '/F1', BRAND.blue);
    field('Event Name', eventName(event), 54, y + 48, 36);
    field('Venue / Location', eventVenue(event), 245, y + 48, 30);
    field('Event Date', eventDate(event), 410, y + 48, 24);
    field('Organizer', eventOrganizer(event), 54, y + 88, 34);
    field('Report Type', title, 245, y + 88, 30);
    field('Export Format', 'PDF', 410, y + 88, 24);
    y += 150;
  };

  const participantCard = (row: ReportRow) => {
    ensure(126);
    rect(34, y, 544, 112, '#ffffff', '#dbeafe');
    rect(34, y, 544, 28, '#eff6ff', '#dbeafe');
    txt(48, y + 19, `#${row.No}`, 9, '/F1', BRAND.blue);
    txt(92, y + 19, wrap(row['Full Name'], 46, 1)[0], 10.5, '/F1', BRAND.navy);
    statusChip(row.Status, 468, y + 5);
    field('Email', row.Email, 52, y + 43, 31);
    field('Phone', row.Phone, 245, y + 43, 18);
    field('Category', row.Category, 380, y + 43, 22);
    field('Organization', row.Organization, 52, y + 78, 36);
    field('Pass ID', row['Pass ID'], 245, y + 78, 26);
    field('Checked In', row['Checked In At'], 380, y + 78, 25);
    y += 126;
  };

  const genericCard = (row: ReportRow) => {
    ensure(112);
    const headers = headersFor(kind).filter((h) => h !== 'No');
    rect(34, y, 544, 98, '#ffffff', '#dbeafe');
    rect(34, y, 544, 26, '#eff6ff', '#dbeafe');
    txt(48, y + 18, `#${row.No}`, 9, '/F1', BRAND.blue);
    txt(92, y + 18, wrap(row[headers[0]], 55, 1)[0], 10, '/F1', BRAND.navy);
    field(headers[1] || 'Value', row[headers[1]], 52, y + 42, 30);
    field(headers[2] || 'Value', row[headers[2]], 245, y + 42, 30);
    field(headers[3] || 'Value', row[headers[3]], 405, y + 42, 22);
    field(headers[headers.length - 1] || 'Timestamp', row[headers[headers.length - 1]], 52, y + 73, 38);
    y += 112;
  };

  const emptyState = () => {
    rect(34, y, 544, 82, '#ffffff', '#dbeafe');
    txt(54, y + 32, 'No records found for this export.', 12, '/F1', BRAND.gray);
    txt(54, y + 54, 'Try exporting another report type or confirm that records exist in EVENTZ.', 9, '/F2', BRAND.gray);
    y += 100;
  };

  header();
  summary();

  if (!rows.length) emptyState();
  else {
    rows.forEach((row) => {
      if (kind === 'checked-in' || kind === 'roster') participantCard(row);
      else genericCard(row);
    });
  }
  pages.push(commands);

  pages.forEach((page, index) => {
    page.push(`BT ${hexColor(BRAND.gray)} rg /F2 8 Tf 500 30 Td (Page ${index + 1} of ${pages.length}) Tj ET`);
  });

  const objects: string[] = [];
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontBoldId = 3;
  const fontRegularId = 4;

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[fontBoldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  objects[fontRegularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = 6 + index * 2;
    pageIds.push(pageId);
    contentIds.push(contentId);
    const stream = page.join('\n');
    objects[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontBoldId} 0 R /F2 ${fontRegularId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream`;
  });

  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function setDownloadHeaders(res: any, contentType: string, filename: string) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req: any, res: any) {
  try {
    const kind = String(req.query?.kind || 'scan-logs') as ReportKind;
    const format = String(req.query?.format || 'csv').toLowerCase();

    if (!['checked-in', 'roster', 'scan-logs', 'email-logs'].includes(kind)) {
      return res.status(400).json({ error: 'Unsupported report kind.' });
    }

    const data = await loadData();
    const rows = rowsFor(kind, data);
    const title = titleFor(kind);

    if (format === 'csv') {
      const csv = buildCsv(rows, title, data.event, kind);
      setDownloadHeaders(res, 'text/csv; charset=utf-8', exportFileName(kind, 'csv'));
      return res.status(200).send(csv);
    }

    if (format === 'xlsx' || format === 'excel') {
      const buffer = buildExcel(rows, title, data.event, kind);
      setDownloadHeaders(res, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', exportFileName(kind, 'xlsx'));
      return res.status(200).send(buffer);
    }

    if (format === 'pdf') {
      const buffer = buildPdf(rows, title, data.event, kind);
      setDownloadHeaders(res, 'application/pdf', exportFileName(kind, 'pdf'));
      return res.status(200).send(buffer);
    }

    return res.status(400).json({ error: 'Unsupported export format. Use csv, xlsx, excel, or pdf.' });
  } catch (error: any) {
    console.error('[EXPORT_REPORT]', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Report export failed.' });
  }
}
