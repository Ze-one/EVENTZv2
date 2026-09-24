import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { db } from './db.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRAND = {
  name: 'EVENTZ',
  slogan: 'manage your event access by ETS.NTECH',
  navy: '#0b1f4d',
  gold: '#f2a900'
};

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  return EMAIL_REGEX.test(normalizeEmail(value));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getAppOrigin(req: any): string {
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
  const rawSender = process.env.BREVO_FROM || process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER || process.env.SENDGRID_FROM || '';
  if (!rawSender) throw new Error('No sender configured. Set BREVO_FROM to a sender email verified in Brevo.');
  const sender = parseSender(rawSender, organizerName);
  if (!isValidEmail(sender.email)) throw new Error(`Invalid sender email configured: ${sender.email}`);
  return sender;
}

export function getEmailProviderStatus() {
  return {
    brevo: Boolean(process.env.BREVO_API_KEY),
    smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    sendGridLegacy: Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_ALLOW_SENDGRID_FALLBACK === 'true'),
    sender: Boolean(process.env.BREVO_FROM || process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER || process.env.SENDGRID_FROM)
  };
}

export async function ensureParticipantRsvpToken(participant: any) {
  if (participant?.rsvpToken) return participant;

  const rsvpToken = crypto.randomBytes(24).toString('hex');
  const updated = await db.updateParticipant(participant.id, {
    rsvpToken,
    rsvpStatus: participant?.rsvpStatus || 'pending',
    passCancelledByRsvp: Boolean(participant?.passCancelledByRsvp)
  } as any);

  return updated || { ...participant, rsvpToken, rsvpStatus: participant?.rsvpStatus || 'pending' };
}

export function buildRsvpUrl(req: any, token: string) {
  return `${getAppOrigin(req)}/rsvp/${encodeURIComponent(token)}`;
}

function getDesign(event: any) {
  const fallback = {
    backgroundColor: '#d8dcdf',
    topBarColor: '#d8dcdf',
    brandPanelColor: '#ffffff',
    textColor: '#020617',
    mutedTextColor: '#475569',
    logoBlockColor: BRAND.navy,
    qrFrameColor: '#ffffff',
    primaryColor: event?.primaryColor || BRAND.navy,
    accentColor: event?.accentColor || BRAND.gold,
    slogan: BRAND.slogan,
    logoText: 'eventZ',
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

function buildReliableLogoHtml(design: any, accent: string) {
  const rawText = String(design.logoText || 'EVENTZ').trim() || 'EVENTZ';
  const withoutZ = escapeHtml(rawText.replace(/z/gi, '') || 'EVENT');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="96" height="96" style="width:96px;height:96px;border-collapse:collapse;background:${safeCssColor(design.logoBlockColor, BRAND.navy)};">
      <tr>
        <td align="center" valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1;font-weight:900;color:#ffffff;letter-spacing:-1px;text-align:center;">
          ${withoutZ}<span style="color:${accent};">Z</span>
        </td>
      </tr>
    </table>`;
}

type PassEmailOptions = {
  subject?: string;
  approval?: boolean;
  rsvpUrl?: string;
};

function buildEmailHtml(participant: any, event: any, customMessage: string | undefined, qrImageUrl: string, options: PassEmailOptions = {}) {
  const design = getDesign(event);
  const bg = safeCssColor(design.backgroundColor, '#d8dcdf');
  const top = safeCssColor(design.topBarColor, '#d8dcdf');
  const panel = safeCssColor(design.brandPanelColor, '#ffffff');
  const text = safeCssColor(design.textColor, '#020617');
  const muted = safeCssColor(design.mutedTextColor, '#475569');
  const primary = safeCssColor(design.primaryColor, BRAND.navy);
  const accent = safeCssColor(design.accentColor, BRAND.gold);
  const qrFrame = safeCssColor(design.qrFrameColor, '#ffffff');
  const radius = Math.max(0, Math.min(42, Number(design.cornerRadius) || 32));

  // Email clients often block or break data URLs and relative image paths.
  // The logo is therefore built from HTML text/table elements, so it remains visible in Gmail, Outlook and mobile mail clients.
  const logoHtml = buildReliableLogoHtml(design, accent);
  const notchHtml = design.showTopNotch === false ? '' : `<div style="position:absolute;left:50%;top:-28px;margin-left:-40px;width:80px;height:80px;border-radius:999px;background:#ffffff;"></div>`;
  const brandPanelHtml = design.showBrandPanel === false ? '' : `<tr><td style="background:${panel};padding:24px 26px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td width="95" valign="middle" style="width:95px;"><div style="width:76px;height:76px;border-radius:999px;border:14px solid ${primary};border-right-color:${accent};box-sizing:border-box;"></div></td><td valign="middle"><div style="font-family:Arial,Helvetica,sans-serif;font-size:42px;line-height:1;font-weight:300;letter-spacing:7px;color:${primary};">EVENT<span style="font-weight:900;color:${accent};">Z</span></div><div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.5;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:${muted};margin-top:8px;">${escapeHtml(design.slogan || BRAND.slogan)}</div></td></tr></table></td></tr>`;
  const messageHtml = customMessage?.trim() ? `<tr><td style="padding:0 28px 16px 28px;"><div style="background:#ffffff;border-left:4px solid ${accent};padding:12px 14px;border-radius:0 10px 10px 0;text-align:left;"><div style="font-size:10px;color:${muted};text-transform:uppercase;font-weight:900;letter-spacing:.8px;">Message from Organizer</div><div style="margin-top:6px;color:${text};font-size:13px;line-height:1.5;">${escapeHtml(customMessage).replace(/\n/g, '<br>')}</div></div></td></tr>` : '';

  const approvalHtml = options.approval ? `<tr><td style="padding:22px 28px 4px 28px;"><div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:16px;padding:16px 18px;text-align:left;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.2;font-weight:900;letter-spacing:1.4px;text-transform:uppercase;color:#047857;">REGISTRATION APPROVED</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.35;font-weight:800;color:#064e3b;margin-top:6px;">Your EVENTZ access pass is ready.</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:#065f46;margin-top:6px;">Keep this email accessible for entry. Your QR pass is embedded below.</div></div></td></tr>` : '';

  const rsvpHtml = options.rsvpUrl ? `<tr><td align="center" style="padding:4px 28px 22px 28px;"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;text-align:center;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:900;color:${text};">Manage your attendance</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;color:${muted};margin:6px 0 14px 0;">Confirm that you are attending or let the organizer know if your plans change.</div><a href="${escapeHtml(options.rsvpUrl)}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;padding:12px 20px;border-radius:10px;">CONFIRM / UPDATE RSVP</a></div></td></tr>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EVENTZ Pass</title></head><body style="margin:0;padding:18px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f8fafc;"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" width="430" style="width:430px;max-width:100%;border-collapse:separate;border-spacing:0;background:${bg};border:1px solid #cbd5e1;border-radius:${radius}px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.12);"><tr><td style="height:126px;background:${top};position:relative;padding:16px 24px;box-sizing:border-box;">${notchHtml}<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td valign="top" width="112">${logoHtml}</td><td valign="top" align="right" style="color:${text};padding-top:4px;"><div style="font-size:12px;line-height:1.2;font-weight:900;text-transform:uppercase;">START DATE</div><div style="font-size:21px;line-height:1.35;font-weight:500;">${escapeHtml(event?.eventDate || 'Event Date')}</div><div style="font-size:13px;line-height:1.2;font-weight:800;color:${muted};">${escapeHtml(event?.eventTime || 'Event Time')}</div></td></tr></table></td></tr>${brandPanelHtml}${approvalHtml}<tr><td style="padding:26px 28px;color:${text};"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;"><tr><td width="50%" valign="top" style="padding:0 16px 38px 0;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">EVENT</div><div style="font-size:24px;line-height:1.12;margin-top:7px;color:${text};font-weight:500;">${escapeHtml(event?.eventName || 'Event')}</div></td><td width="50%" valign="top" style="padding:0 0 38px 16px;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">ATTENDEE</div><div style="font-size:24px;line-height:1.12;margin-top:7px;color:${text};font-weight:500;">${escapeHtml(participant.fullName)}</div></td></tr><tr><td width="50%" valign="top" style="padding:0 16px 0 0;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">CATEGORY</div><div style="font-size:24px;line-height:1.12;margin-top:7px;color:${text};font-weight:500;">${escapeHtml(participant.category || event?.passTitle || 'Attendee')}</div></td><td width="50%" valign="top" style="padding:0 0 0 16px;"><div style="font-size:13px;font-weight:900;text-transform:uppercase;color:${text};">PASS ID</div><div style="font-family:monospace;font-size:16px;line-height:1.45;font-weight:900;margin-top:9px;color:${text};word-break:break-all;">${escapeHtml(participant.passId)}</div></td></tr></table></td></tr>${messageHtml}${rsvpHtml}<tr><td align="center" style="padding:18px 0 30px 0;"><div style="display:inline-block;background:${qrFrame};border-radius:10px;padding:18px;box-shadow:0 4px 16px rgba(15,23,42,.08);"><img src="${escapeHtml(qrImageUrl)}" width="220" height="220" alt="Entrance Pass QR Code" style="display:block;width:220px;height:220px;border:0;outline:none;text-decoration:none;" /><div style="font-family:monospace;font-size:18px;margin-top:10px;color:${text};letter-spacing:.5px;">${escapeHtml(participant.passId)}</div></div><div style="font-size:11px;font-weight:800;color:${muted};padding:12px 32px 0 32px;line-height:1.45;">${escapeHtml(event?.accessInstruction || 'Present this QR code at the entrance for verification.')}</div></td></tr></table></td></tr></table></body></html>`;
}

export async function sendParticipantPassEmail(req: any, participant: any, event: any, logId: string, customMessage?: string, options: PassEmailOptions = {}) {
  const recipient = normalizeEmail(participant?.email);
  if (!isValidEmail(recipient)) throw new Error(`Invalid participant email address: ${participant?.email || 'empty'}`);
  const origin = getAppOrigin(req);
  const qrImageUrl = `${origin}/api/pass-qr/${encodeURIComponent(participant.passId)}?v=${encodeURIComponent(String(participant.updatedAt || Date.now()))}`;
  const subject = options.subject || `Your Entrance Pass: ${event?.eventName || 'Event'}`;
  const sender = getSender(event);
  const html = buildEmailHtml(participant, event, customMessage, qrImageUrl, options);

  try {
    if (process.env.BREVO_API_KEY) {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            email: sender.email,
            name: process.env.BREVO_FROM_NAME || sender.name
          },
          to: [{ email: recipient, name: participant?.fullName || recipient }],
          replyTo: sender,
          subject,
          htmlContent: html,
          tags: ['EVENTZ', options.approval ? 'registration-approval' : 'pass-email']
        })
      });

      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.message || data?.code || `Brevo API request failed with HTTP ${response.status}`;
        throw new Error(`Brevo: ${detail}`);
      }

      await db.updateEmailLogStatus(logId, 'Queued');
      return {
        provider: 'brevo',
        statusCode: response.status,
        messageId: data?.messageId || null,
        accepted: true
      };
    }

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
      const result = await transporter.sendMail({ from: `"${sender.name}" <${sender.email}>`, replyTo: `"${sender.name}" <${sender.email}>`, to: recipient, subject, html });
      await db.updateEmailLogStatus(logId, 'Queued');
      return { provider: 'smtp', messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
    }

    if (process.env.SENDGRID_API_KEY && process.env.EMAIL_ALLOW_SENDGRID_FALLBACK === 'true') {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const [result] = await sgMail.send({ to: recipient, from: sender, replyTo: sender, subject, html } as any);
      const sendGridResult = result as any;
      await db.updateEmailLogStatus(logId, 'Queued');
      return { provider: 'sendgrid-legacy', statusCode: sendGridResult?.statusCode || 202, messageId: sendGridResult?.headers?.['x-message-id'] || sendGridResult?.id || null };
    }

    throw new Error('Brevo email is not configured. Add BREVO_API_KEY and BREVO_FROM in Vercel. BREVO_FROM must be a verified sender in Brevo.');
  } catch (error: any) {
    const providerBody = error?.response?.body ? JSON.stringify(error.response.body) : '';
    const message = [error?.message || 'Email delivery failed', providerBody].filter(Boolean).join(' | ');
    await db.updateEmailLogStatus(logId, 'Failed', message);
    throw new Error(message);
  }
}
