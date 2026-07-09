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
  const fallback = {
    backgroundColor: '#d8dcdf',
    topBarColor: '#d8dcdf',
    brandPanelColor: '#ffffff',
    textColor: '#020617',
    mutedTextColor: '#475569',
    logoBlockColor: '#0b1f4d',
    qrFrameColor: '#ffffff',
    primaryColor: event?.primaryColor || BRAND.navy,
    accentColor: event?.accentColor || BRAND.gold,
    slogan: BRAND.slogan,
    logoText: 'eventZ',
    customLogoDataUrl: '',
    logoFit: 'contain',
    showTopNotch: true,
    showBrandPanel: true,
    cornerRadius: 32
  };
  try {
    const parsed = JSON.parse(event?.logoPath || '{}');
    if (parsed?.type === 'eventz-pass-design') return { ...fallback, ...parsed };
  } catch {}
  return fallback;
}

function safeCssColor(value: any, fallback: string) {
  const raw = String(value || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) || /^rgba?\(/.test(raw) || /^[a-zA-Z]+$/.test(raw) ? raw : fallback;
}

function buildFallbackLogoHtml(design: any) {
  const baseText = escapeHtml(String(design.logoText || 'eventZ').replace(/Z/g, '')) || 'event';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1;font-weight:900;color:#ffffff;letter-spacing:-1px;text-align:center;">${baseText}<span style="color:${safeCssColor(design.accentColor, BRAND.gold)};">Z</span></div>`;
}

function buildEmailHtml(participant: any, event: any, customMessage: string | undefined, verifyUrl: string, qrDataUrl: string) {
  const design = getDesign(event);
  const bg = safeCssColor(design.backgroundColor, '#d8dcdf');
  const top = safeCssColor(design.topBarColor, '#d8dcdf');
  const panel = safeCssColor(design.brandPanelColor, '#ffffff');
  const text = safeCssColor(design.textColor, '#020617');
  const muted = safeCssColor(design.mutedTextColor, '#475569');
  const logoBlock = safeCssColor(design.logoBlockColor, '#0b1f4d');
  const qrFrame = safeCssColor(design.qrFrameColor, '#ffffff');
  const primary = safeCssColor(design.primaryColor, BRAND.navy);
  const accent = safeCssColor(design.accentColor, BRAND.gold);
  const radius = Math.max(0, Math.min(42, Number(design.cornerRadius) || 32));
  const logoHtml = design.customLogoDataUrl
    ? `<img src="${escapeHtml(design.customLogoDataUrl)}" width="96" height="64" alt="Logo" style="display:block;width:96px;height:64px;object-fit:${escapeHtml(design.logoFit || 'contain')};border:0;" />`
    : buildFallbackLogoHtml({ ...design, accentColor: accent });
  const notchHtml = design.showTopNotch === false ? '' : `<div style="position:absolute;left:50%;top:-28px;margin-left:-40px;width:80px;height:80px;border-radius:999px;background:#ffffff;"></div>`;
  const brandPanelHtml = design.showBrandPanel === false ? '' : `
    <tr>
      <td style="background:${panel};padding:24px 26px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="95" valign="middle" style="width:95px;">
              <div style="width:76px;height:76px;border-radius:999px;border:14px solid ${primary};border-right-color:${accent};box-sizing:border-box;"></div>
            </td>
            <td valign="middle">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:42px;line-height:1;font-weight:300;letter-spacing:7px;color:${primary};">EVENT<span style="font-weight:900;color:${accent};">Z</span></div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.5;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:${muted};margin-top:8px;">${escapeHtml(design.slogan || BRAND.slogan)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  const messageHtml = customMessage?.trim() ? `
    <tr><td style="padding:0 28px 16px 28px;"><div style="background:#ffffff;border-left:4px solid ${accent};padding:12px 14px;border-radius:0 10px 10px 0;text-align:left;"><div style="font-size:10px;color:${muted};text-transform:uppercase;font-weight:900;letter-spacing:.8px;">Message from Organizer</div><div style="margin-top:6px;color:${text};font-size:13px;line-height:1.5;">${escapeHtml(customMessage).replace(/\n/g, '<br>')}</div></div></td></tr>` : '';

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EVENTZ Pass</title></head>
<body style="margin:0;padding:18px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f8fafc;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="430" style="width:430px;max-width:100%;border-collapse:separate;border-spacing:0;background:${bg};border:1px solid #cbd5e1;border-radius:${radius}px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.12);">
        <tr>
          <td style="height:126px;background:${top};position:relative;padding:16px 24px;box-sizing:border-box;">
            ${notchHtml}
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td valign="top" width="112"><div style="width:96px;height:96px;background:${logoBlock};display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;overflow:hidden;">${logoHtml}</div></td>
                <td valign="top" align="right" style="color:${text};padding-top:4px;">
                  <div style="font-size:12px;line-height:1.2;font-weight:900;text-transform:uppercase;">START DATE</div>
                  <div style="font-size:21px;line-height:1.35;font-weight:500;">${escapeHtml(event?.eventDate || 'Event Date')}</div>
                  <div style="font-size:13px;line-height:1.2;font-weight:800;color:${muted};">${escapeHtml(event?.eventTime || 'Event Time')}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${brandPanelHtml}
        <tr>
          <td style="padding:26px 28px;color:${text};">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td width="50%" valign="top" style="padding:0 16px 38px 0;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">EVENT</div><div style="font-size:24px;line-height:1.12;margin-top:7px;color:${text};font-weight:500;">${escapeHtml(event?.eventName || 'Event')}</div></td>
                <td width="50%" valign="top" style="padding:0 0 38px 16px;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">ATTENDEE</div><div style="font-size:24px;line-height:1.12;margin-top:7px;color:${text};font-weight:500;">${escapeHtml(participant.fullName)}</div></td>
              </tr>
              <tr>
                <td width="50%" valign="top" style="padding:0 16px 0 0;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">TICKET</div><div style="font-size:24px;line-height:1.12;margin-top:7px;color:${text};font-weight:500;">${escapeHtml(participant.category || event?.passTitle || 'Attendee')}</div></td>
                <td width="50%" valign="top" style="padding:0 0 0 16px;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">PASS ID</div><div style="font-family:monospace;font-size:16px;line-height:1.45;font-weight:900;margin-top:9px;color:${text};word-break:break-all;">${escapeHtml(participant.passId)}</div></td>
              </tr>
            </table>
          </td>
        </tr>
        ${messageHtml}
        <tr>
          <td align="center" style="padding:18px 0 30px 0;">
            <div style="display:inline-block;background:${qrFrame};border-radius:10px;padding:18px;box-shadow:0 4px 16px rgba(15,23,42,.08);">
              <img src="${qrDataUrl}" width="220" height="220" alt="Entrance Pass QR Code" style="display:block;width:220px;height:220px;border:0;outline:none;text-decoration:none;" />
              <div style="font-family:monospace;font-size:18px;margin-top:10px;color:${text};letter-spacing:.5px;">${escapeHtml(participant.passId)}</div>
            </div>
            <div style="font-size:11px;font-weight:800;color:${muted};padding:12px 32px 0 32px;line-height:1.45;">${escapeHtml(event?.accessInstruction || 'Present this QR code at the entrance for verification.')}</div>
            <div style="padding-top:14px;"><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;border-radius:12px;padding:11px 16px;font-size:12px;font-weight:900;">Open Verification Link</a></div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendParticipantPassEmail(req: any, participant: any, event: any, logId: string, customMessage?: string) {
  const recipient = normalizeEmail(participant?.email);
  if (!isValidEmail(recipient)) throw new Error(`Invalid participant email address: ${participant?.email || 'empty'}`);
  const verifyUrl = `${getAppOrigin(req)}/verify/${encodeURIComponent(participant.passId)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } });
  const subject = `Your Entrance Pass: ${event?.eventName || 'Event'}`;
  const sender = getSender(event);
  const html = buildEmailHtml(participant, event, customMessage, verifyUrl, qrDataUrl);

  try {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const [result] = await sgMail.send({ to: recipient, from: sender, replyTo: sender, subject, html } as any);
      const sendGridResult = result as any;
      await db.updateEmailLogStatus(logId, 'Delivered');
      return { provider: 'sendgrid', statusCode: sendGridResult?.statusCode || 202, messageId: sendGridResult?.headers?.['x-message-id'] || sendGridResult?.id || null };
    }
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      const result = await transporter.sendMail({ from: `"${sender.name}" <${sender.email}>`, replyTo: `"${sender.name}" <${sender.email}>`, to: recipient, subject, html });
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
