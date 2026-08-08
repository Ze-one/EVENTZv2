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
  cyan: '#22d3ee',
  gold: '#f2a900',
  green: '#16a34a',
  red: '#dc2626',
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

function cleanPdfText(value: any) {
  return safe(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[•–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '');
}

function titleFor(kind: ReportKind) {
  if (kind === 'checked-in') return 'Checked-In Attendance Registry';
  if (kind === 'roster') return 'Complete Event Roster';
  if (kind === 'scan-logs') return 'Gate Scan Audit Logs';
  return 'Pass Email Dispatch Logs';
}

function rowsFor(kind: ReportKind, data: any) {
  if (kind === 'checked-in' || kind === 'roster') {
    const source = kind === 'checked-in'
      ? data.participants.filter((p: any) => p.status === 'Used')
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

function buildCsv(rows: ReportRow[], title: string) {
  const headers = Object.keys(rows[0] || { No: '' });
  const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    `${BRAND.name} - ${BRAND.slogan}`,
    title,
    `Generated At,${new Date().toISOString()}`,
    '',
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
  ].join('\n');
}

function buildExcel(rows: ReportRow[], title: string, event: any) {
  const headers = Object.keys(rows[0] || { No: '' });
  const worksheetData = [
    [BRAND.name, BRAND.slogan],
    ['Report', title],
    ['Event', eventValue(event, ['eventName', 'name', 'title', 'eventTitle'])],
    ['Generated At', new Date().toLocaleString()],
    ['Total Records', rows.length],
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

function eventValue(event: any, keys: string[], fallback = 'Not specified') {
  for (const key of keys) {
    const value = safe(event?.[key]);
    if (value) return value;
  }
  return fallback;
}

function formatDateTime(value: any) {
  const raw = safe(value);
  if (!raw) return 'Not specified';
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

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255
  };
}

function pdfEscape(text: string) {
  return cleanPdfText(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(value: any, maxChars: number, maxLines = 2) {
  const text = cleanPdfText(value) || '-';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines) clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  return clipped;
}

function buildPdf(rows: ReportRow[], title: string, event: any, kind: ReportKind) {
  const PAGE_W = 612;
  const PAGE_H = 842;
  const pages: string[][] = [];
  let current: string[] = [];
  let y = 0;

  const color = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  };
  const fill = (hex: string) => `${color(hex)} rg`;
  const stroke = (hex: string) => `${color(hex)} RG`;
  const rect = (x: number, top: number, w: number, h: number, fillHex: string, strokeHex?: string) => {
    const bottom = PAGE_H - top - h;
    current.push(`${strokeHex ? stroke(strokeHex) : fill(fillHex)} ${fill(fillHex)} ${x} ${bottom} ${w} ${h} re ${strokeHex ? 'B' : 'f'}`);
  };
  const line = (x1: number, top1: number, x2: number, top2: number, hex: string, width = 1) => {
    current.push(`${stroke(hex)} ${width} w ${x1} ${PAGE_H - top1} m ${x2} ${PAGE_H - top2} l S`);
  };
  const text = (x: number, top: number, value: any, size = 10, font: '/F1' | '/F2' = '/F2', hex = '#0f172a') => {
    current.push(`BT ${color(hex)} rg ${font} ${size} Tf ${x} ${PAGE_H - top} Td (${pdfEscape(String(value))}) Tj ET`);
  };

  const drawBrandHeader = () => {
    rect(0, 0, PAGE_W, 82, BRAND.navy);
    text(40, 32, 'EVENT', 28, '/F1', '#ffffff');
    text(128, 32, 'Z', 28, '/F1', BRAND.gold);
    text(40, 58, BRAND.slogan, 9, '/F2', '#dbeafe');
    text(330, 34, title, 15, '/F1', '#ffffff');
    text(330, 57, `Generated: ${new Date().toLocaleString('en-GB')}`, 8.5, '/F2', '#dbeafe');
    y = 108;
  };

  const newPage = () => {
    if (current.length) pages.push(current);
    current = [];
    drawBrandHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height > 770) newPage();
  };

  const field = (label: string, value: any, x: number, top: number, maxChars = 32) => {
    text(x, top, label.toUpperCase(), 6.8, '/F1', BRAND.gray);
    wrapText(value, maxChars, 2).forEach((lineText, index) => {
      text(x, top + 14 + index * 12, lineText, 9.3, index === 0 ? '/F1' : '/F2', '#0f172a');
    });
  };

  const drawEventSummary = () => {
    rect(34, y, 544, 126, '#f8fafc', '#cbd5e1');
    text(54, y + 26, 'Event Details', 14, '/F1', BRAND.navy);
    text(410, y + 26, `Total Records: ${rows.length}`, 12, '/F1', BRAND.blue);

    field('Event Name', eventValue(event, ['eventName', 'name', 'title', 'eventTitle']), 54, y + 50, 38);
    field('Venue / Location', eventValue(event, ['venue', 'location', 'eventLocation', 'address']), 250, y + 50, 32);
    field('Event Date', eventValue(event, ['eventDate', 'date', 'startDate', 'scheduledAt']), 420, y + 50, 25);

    field('Organizer', eventValue(event, ['organizer', 'host', 'company', 'createdBy'], 'ETSNTECH'), 54, y + 88, 32);
    field('Report Type', title, 250, y + 88, 32);
    field('Export Format', 'PDF Attendance Report', 420, y + 88, 25);
    y += 150;
  };

  const drawStatusChip = (status: string, x: number, top: number) => {
    const normalized = status.toLowerCase();
    const chipColor = normalized.includes('used') || normalized.includes('valid') || normalized.includes('success') ? BRAND.green
      : normalized.includes('cancel') || normalized.includes('invalid') || normalized.includes('fail') || normalized.includes('alert') ? BRAND.red
      : '#f59e0b';
    rect(x, top, 96, 22, chipColor);
    text(x + 14, top + 15, status || '-', 8, '/F1', '#ffffff');
  };

  const drawParticipantCard = (row: ReportRow) => {
    ensureSpace(128);
    rect(34, y, 544, 112, '#ffffff', '#dbeafe');
    rect(34, y, 544, 28, '#eff6ff', '#dbeafe');
    text(48, y + 19, `#${row.No}`, 10, '/F1', BRAND.blue);
    text(92, y + 19, row['Full Name'] || 'Unnamed participant', 11.5, '/F1', BRAND.navy);
    drawStatusChip(safe(row.Status), 468, y + 5);

    field('Email', row.Email, 52, y + 43, 31);
    field('Phone', row.Phone, 250, y + 43, 18);
    field('Category', row.Category, 388, y + 43, 20);

    field('Organization', row.Organization, 52, y + 78, 37);
    field('Pass ID', row['Pass ID'], 250, y + 78, 26);
    field('Checked In', formatDateTime(row['Checked In At']), 388, y + 78, 25);
    y += 126;
  };

  const drawScanCard = (row: ReportRow) => {
    ensureSpace(118);
    rect(34, y, 544, 102, '#ffffff', '#dbeafe');
    rect(34, y, 544, 28, '#eff6ff', '#dbeafe');
    text(48, y + 19, `#${row.No}`, 10, '/F1', BRAND.blue);
    text(92, y + 19, row['Participant Name'] || 'Unknown participant', 11.5, '/F1', BRAND.navy);
    drawStatusChip(safe(row.Result), 468, y + 5);

    field('Pass ID', row['Pass ID'], 52, y + 45, 28);
    field('Scanned By', row['Scanned By'], 250, y + 45, 24);
    field('Timestamp', formatDateTime(row.Timestamp), 388, y + 45, 24);
    field('Device / IP', `${row.Device || '-'} / ${row['IP Address'] || '-'}`, 52, y + 78, 70);
    y += 116;
  };

  const drawEmailCard = (row: ReportRow) => {
    ensureSpace(118);
    rect(34, y, 544, 102, '#ffffff', '#dbeafe');
    rect(34, y, 544, 28, '#eff6ff', '#dbeafe');
    text(48, y + 19, `#${row.No}`, 10, '/F1', BRAND.blue);
    text(92, y + 19, row.Participant || 'Unknown participant', 11.5, '/F1', BRAND.navy);
    drawStatusChip(safe(row.Status), 468, y + 5);

    field('Recipient', row.Recipient, 52, y + 45, 34);
    field('Subject', row.Subject, 250, y + 45, 36);
    field('Timestamp', formatDateTime(row.Timestamp), 52, y + 78, 30);
    field('Error', row.Error || '-', 250, y + 78, 42);
    y += 116;
  };

  newPage();
  drawEventSummary();
  text(34, y, 'Report Records', 13, '/F1', BRAND.navy);
  line(34, y + 10, 578, y + 10, '#dbeafe', 1);
  y += 28;

  if (!rows.length) {
    rect(34, y, 544, 70, '#ffffff', '#dbeafe');
    text(54, y + 34, 'No records found for this report.', 12, '/F1', BRAND.gray);
  } else {
    rows.forEach((row) => {
      if (kind === 'checked-in' || kind === 'roster') drawParticipantCard(row);
      else if (kind === 'scan-logs') drawScanCard(row);
      else drawEmailCard(row);
    });
  }

  if (current.length) pages.push(current);

  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const fontBoldObj = 3 + pages.length * 2;
  const fontRegularObj = fontBoldObj + 1;

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(`2 0 obj << /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`);

  pages.forEach((contentParts, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    pageObjectNumbers.push(pageObj);
    const footer = [
      `${color(BRAND.gray)} rg BT /F2 8 Tf 40 28 Td (${pdfEscape(`${BRAND.name} - ${title}`)}) Tj ET`,
      `${color(BRAND.gray)} rg BT /F2 8 Tf 520 28 Td (${pdfEscape(`Page ${index + 1} of ${pages.length}`)}) Tj ET`
    ];
    const stream = [...contentParts, ...footer].join('\n');
    objects.push(`${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontBoldObj} 0 R /F2 ${fontRegularObj} 0 R >> >> /Contents ${contentObj} 0 R >> endobj`);
    objects.push(`${contentObj} 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`);
  });

  objects.push(`${fontBoldObj} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`);
  objects.push(`${fontRegularObj} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function fileName(kind: ReportKind, ext: string) {
  return `eventz-${kind}-${new Date().toISOString().slice(0, 10)}.${ext}`;
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
      const csv = buildCsv(rows, title);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'csv')}"`);
      return res.status(200).send(csv);
    }

    if (format === 'xlsx' || format === 'excel') {
      const buffer = buildExcel(rows, title, data.event);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'xlsx')}"`);
      return res.status(200).send(buffer);
    }

    if (format === 'pdf') {
      const buffer = buildPdf(rows, title, data.event, kind);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName(kind, 'pdf')}"`);
      return res.status(200).send(buffer);
    }

    return res.status(400).json({ error: 'Unsupported export format. Use csv, xlsx, or pdf.' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Report export failed.' });
  }
}
