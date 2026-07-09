import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { db } from '../src/server/db.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRAND = { name: 'EVENTZ', slogan: 'manage your event access by ETS.NTECH', navy: '#0b1f4d', gold: '#f2a900' };

export function normalizeEmail(value: unknown): string { return String(value || '').trim().toLowerCase(); }
export function isValidEmail(value: unknown): boolean { return EMAIL_REGEX.test(normalizeEmail(value)); }
function escapeHtml(value: unknown): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function getAppOrigin(req: any): string {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (configured) return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

function parseSender(value: string, fallbackName: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) return { name: match[1]?.trim() || fallbackName, email: match[2]?.trim() };
  return { name: fallbackName, email: trimmed };
}

function getSender(event: any) {
  const organizerName = event?.organizerName || 'ETS N-TECH';
  const rawSender = process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER || '';
  if (!rawSender) throw new Error('No sender configured. Set SENDGRID_FROM or SMTP_FROM to a verified sender email.');
  const sender = parseSender(rawSender, organizerName);
  if (!isValidEmail(sender.email)) throw new Error(`Invalid sender email configured: ${sender.email}`);
  return sender;
}

export function getEmailProviderStatus() {
  return { sendGrid: Boolean(process.env.SENDGRID_API_KEY), smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS), sender: Boolean(process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER) };
}

function getDesign(event: any) {
  const fallback = { backgroundColor: '#d8dcdf', topBarColor: '#d8dcdf', brandPanelColor: '#ffffff', textColor: '#020617', mutedTextColor: '#475569', logoBlockColor: '#ffffff', qrFrameColor: '#ffffff', primaryColor: event?.primaryColor || BRAND.navy, accentColor: event?.accentColor || BRAND.gold, slogan: BRAND.slogan, customLogoDataUrl: '', logoFit: 'contain' };
  try {
    const parsed = JSON.parse(event?.logoPath || '{}');
    if (parsed?.type === 'eventz-pass-design') return { ...fallback, ...parsed };
  } catch {}
  return fallback;
}

function parseDataUrl(dataUrl?: string) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function buildEmailHtml(participant: any, event: any, customMessage: string | undefined, verifyUrl: string, hasLogo: boolean) {
  const design = getDesign(event);
  const logoHtml = hasLogo
    ? `<img src="cid:eventzBrandLogo" width="110" height="64" alt="EVENTZ" style="display:block;max-width:110px;max-height:64px;width:110px;height:64px;object-fit:${escapeHtml(design.logoFit)};" />`
    : `<div style="font-weight:900;color:#fff;font-size:20px;letter-spacing:-1px;">event<span style="color:${design.accentColor};">Z</span></div>`;
  const messageHtml = customMessage?.trim() ? `<div style="background:#fff;border-left:4px solid ${design.accentColor};padding:12px 14px;margin:16px 0;border-radius:0 10px 10px 0;text-align:left;"><b style="font-size:10px;color:${design.mutedTextColor};text-transform:uppercase;">Message from Organizer</b><p style="margin:6px 0 0;color:${design.textColor};font-size:13px;line-height:1.5;">${escapeHtml(customMessage).replace(/\n/g, '<br>')}</p></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EVENTZ Pass</title></head>
  <body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;margin:0;padding:24px;">
    <div style="max-width:430px;margin:auto;background:${design.backgroundColor};border-radius:32px;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 20px 50px rgba(15,23,42,.12);">
      <div style="height:116px;background:${design.topBarColor};position:relative;padding:18px 24px;box-sizing:border-box;">
        <div style="width:112px;height:78px;background:${design.logoBlockColor};display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;overflow:hidden;">${logoHtml}</div>
        <div style="position:absolute;right:24px;top:20px;text-align:right;color:${design.textColor};"><div style="font-size:11px;font-weight:900;text-transform:uppercase;">Start Date</div><div style="font-size:20px;">${escapeHtml(event?.eventDate || '')}</div><div style="font-size:13px;font-weight:700;color:${design.mutedTextColor};">${escapeHtml(event?.eventTime || '')}</div></div>
      </div>
      <div style="background:${design.brandPanelColor};padding:24px;display:flex;align-items:center;gap:16px;">
        <div style="width:72px;height:72px;border-radius:50%;border:12px solid ${design.primaryColor};box-sizing:border-box;border-right-color:${design.accentColor};"></div>
        <div><div style="font-size:42px;font-weight:300;letter-spacing:6px;line-height:1;color:${design.primaryColor};">EVENT<span style="font-weight:900;color:${design.accentColor};">Z</span></div><div style="font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${design.mutedTextColor};margin-top:8px;">${escapeHtml(design.slogan)}</div></div>
      </div>
      <div style="padding:26px 28px;color:${design.textColor};display:grid;grid-template-columns:1fr 1fr;gap:34px 28px;">
        <div><b style="font-size:12px;text-transform:uppercase;">Event</b><div style="font-size:22px;line-height:1.1;margin-top:6px;">${escapeHtml(event?.eventName || 'Event')}</div></div>
        <div><b style="font-size:12px;text-transform:uppercase;">Attendee</b><div style="font-size:22px;line-height:1.1;margin-top:6px;">${escapeHtml(participant.fullName)}</div></div>
        <div><b style="font-size:12px;text-transform:uppercase;">Ticket</b><div style="font-size:22px;line-height:1.1;margin-top:6px;">${escapeHtml(participant.category || event?.passTitle || 'Attendee')}</div></div>
        <div><b style="font-size:12px;text-transform:uppercase;">Pass ID</b><div style="font-family:monospace;font-size:15px;font-weight:800;margin-top:8px;word-break:break-all;">${escapeHtml(participant.passId)}</div></div>
      </div>
      ${messageHtml}
      <div style="text-align:center;padding:20px 0 30px;">
        <div style="background:${design.qrFrameColor};border-radius:10px;display:inline-block;padding:18px;box-shadow:0 4px 16px rgba(15,23,42,.08);"><img src="cid:qrCodeImage" width="210" height="210" alt="Entrance Pass QR Code" style="display:block;width:210px;height:210px;" /><div style="font-family:monospace;font-size:17px;margin-top:8px;color:${design.textColor};">${escapeHtml(participant.passId)}</div></div>
        <p style="font-size:11px;font-weight:700;color:${design.mutedTextColor};padding:0 28px;line-height:1.4;">${escapeHtml(event?.accessInstruction || 'Present this QR code at the entrance for verification.')}</p>
        <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:${design.primaryColor};color:#fff;text-decoration:none;border-radius:12px;padding:11px 16px;font-size:12px;font-weight:900;">Open Verification Link</a>
      </div>
    </div>
  </body></html>`;
}

export async function sendParticipantPassEmail(req: any, participant: any, event: any, logId: string, customMessage?: string) {
  const recipient = normalizeEmail(participant?.email);
  if (!isValidEmail(recipient)) throw new Error(`Invalid participant email address: ${participant?.email || 'empty'}`);
  const verifyUrl = `${getAppOrigin(req)}/verify/${encodeURIComponent(participant.passId)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } });
  const qrBase64 = qrDataUrl.split('base64,')[1];
  const design = getDesign(event);
  const logo = parseDataUrl(design.customLogoDataUrl);
  const subject = `Your Entrance Pass: ${event?.eventName || 'Event'}`;
  const sender = getSender(event);
  const html = buildEmailHtml(participant, event, customMessage, verifyUrl, Boolean(logo));
  const sendGridAttachments: any[] = [{ content: qrBase64, filename: 'eventz-pass-qr.png', type: 'image/png', disposition: 'inline', content_id: 'qrCodeImage' }];
  const smtpAttachments: any[] = [{ filename: 'eventz-pass-qr.png', content: Buffer.from(qrBase64, 'base64'), cid: 'qrCodeImage' }];
  if (logo) {
    const ext = logo.mime.includes('png') ? 'png' : logo.mime.includes('webp') ? 'webp' : 'jpg';
    sendGridAttachments.push({ content: logo.base64, filename: `eventz-brand-logo.${ext}`, type: logo.mime, disposition: 'inline', content_id: 'eventzBrandLogo' });
    smtpAttachments.push({ filename: `eventz-brand-logo.${ext}`, content: Buffer.from(logo.base64, 'base64'), cid: 'eventzBrandLogo' });
  }

  try {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const [result] = await sgMail.send({ to: recipient, from: sender, replyTo: sender, subject, html, attachments: sendGridAttachments } as any);
      const sendGridResult = result as any;
      await db.updateEmailLogStatus(logId, 'Delivered');
      return { provider: 'sendgrid', statusCode: sendGridResult?.statusCode || 202, messageId: sendGridResult?.headers?.['x-message-id'] || sendGridResult?.id || null };
    }
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      const result = await transporter.sendMail({ from: `"${sender.name}" <${sender.email}>`, replyTo: `"${sender.name}" <${sender.email}>`, to: recipient, subject, html, attachments: smtpAttachments });
      await db.updateEmailLogStatus(logId, 'Delivered');
      return { provider: 'smtp', messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
    }
    throw new Error('No real email provider configured. Add SENDGRID_API_KEY + SENDGRID_FROM, or SMTP_HOST + SMTP_USER + SMTP_PASS + SMTP_FROM in Vercel.');
  } catch (error: any) {
    const providerBody = error?.response?.body ? JSON.stringify(error.response.body) : '';
    const message = [error?.message || 'Email delivery failed', providerBody].filter(Boolean).join(' | ');
    await db.updateEmailLogStatus(logId, 'Failed', message);
    throw new Error(message);
  }
}
