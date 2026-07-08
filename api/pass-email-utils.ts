import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { db } from '../src/server/db.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return EMAIL_REGEX.test(email);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAppOrigin(req: any): string {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (configured) {
    return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

function parseSender(value: string, fallbackName: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim() || fallbackName,
      email: match[2]?.trim()
    };
  }
  return {
    name: fallbackName,
    email: trimmed
  };
}

function getSender(event: any) {
  const organizerName = event?.organizerName || 'ETS N-TECH';
  const rawSender =
    process.env.SENDGRID_FROM ||
    process.env.SMTP_FROM ||
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    '';

  if (!rawSender) {
    throw new Error('No sender configured. Set SENDGRID_FROM or SMTP_FROM to a verified sender email.');
  }

  const sender = parseSender(rawSender, organizerName);
  if (!isValidEmail(sender.email)) {
    throw new Error(`Invalid sender email configured: ${sender.email}`);
  }
  return sender;
}

export function getEmailProviderStatus() {
  return {
    sendGrid: Boolean(process.env.SENDGRID_API_KEY),
    smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    sender: Boolean(process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER),
  };
}

function buildEmailHtml(participant: any, event: any, customMessage: string | undefined, verifyUrl: string) {
  const primaryColor = event?.primaryColor || '#0f172a';
  const accentColor = event?.accentColor || '#eab308';
  const messageHtml = customMessage?.trim()
    ? `<div style="background:#f1f5f9;border-left:4px solid ${primaryColor};padding:14px 18px;margin:24px 0;text-align:left;border-radius:0 12px 12px 0;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1px;color:#64748b;margin-bottom:6px;">Message from Organizer</div>
        <p style="margin:0;font-size:13px;color:#1e293b;line-height:1.5;font-style:italic;">${escapeHtml(customMessage).replace(/\n/g, '<br>')}</p>
      </div>`
    : '';

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Event Entrance Pass</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 10px 30px rgba(15,23,42,.08);">
    <div style="background:${primaryColor};color:#fff;text-align:center;padding:30px 24px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;opacity:.9;">${escapeHtml(event?.organizerName || 'ETS N-TECH')}</div>
      <div style="display:inline-block;margin:14px 0 12px;padding:5px 12px;border-radius:8px;background:rgba(255,255,255,.14);color:${accentColor};font-size:10px;font-weight:900;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(event?.passTitle || 'EVENT PASS')}</div>
      <h1 style="font-size:21px;line-height:1.3;margin:0 0 8px;font-weight:900;">${escapeHtml(event?.eventName || 'Event')}</h1>
      <div style="font-size:12px;opacity:.82;line-height:1.5;">${escapeHtml(event?.venue || '')}<br>${escapeHtml(event?.eventDate || '')} ${escapeHtml(event?.eventTime || '')}</div>
    </div>

    <div style="padding:30px 28px;text-align:center;">
      <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">Hello <b>${escapeHtml(participant.fullName)}</b>,<br>Your entrance pass has been generated. Please present this QR code at the entrance.</p>
      ${messageHtml}
      <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:20px;padding:22px;margin:24px 0;">
        <h2 style="font-size:22px;color:#0f172a;margin:0 0 6px;font-weight:900;">${escapeHtml(participant.fullName)}</h2>
        <div style="display:inline-block;font-family:monospace;font-size:12px;font-weight:800;color:${accentColor};background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:5px 12px;margin-bottom:18px;letter-spacing:1px;">${escapeHtml(participant.passId)}</div>
        <div style="background:#fff;display:inline-block;border:1px solid #e2e8f0;border-radius:16px;padding:14px;">
          <img src="cid:qrCodeImage" width="190" height="190" alt="Entrance Pass QR Code" style="display:block;width:190px;height:190px;" />
        </div>
        <p style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:1px;line-height:1.5;margin:18px 0 0;">${escapeHtml(event?.accessInstruction || 'Scan this pass at the entrance gate.')}</p>
      </div>
      <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;border-radius:12px;padding:12px 18px;font-size:12px;font-weight:800;">Open Verification Link</a>
    </div>

    <div style="background:#0f172a;color:#94a3b8;text-align:center;padding:18px;font-size:10px;font-family:monospace;">
      <div>${escapeHtml(event?.footerNote || 'Generated by ETSNTECH Event Access System.')}</div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendParticipantPassEmail(req: any, participant: any, event: any, logId: string, customMessage?: string) {
  const recipient = normalizeEmail(participant?.email);
  if (!isValidEmail(recipient)) {
    throw new Error(`Invalid participant email address: ${participant?.email || 'empty'}`);
  }

  const verifyUrl = `${getAppOrigin(req)}/verify/${encodeURIComponent(participant.passId)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' }
  });
  const qrBase64 = qrDataUrl.split('base64,')[1];
  const subject = `Your Entrance Pass: ${event?.eventName || 'Event'}`;
  const sender = getSender(event);
  const html = buildEmailHtml(participant, event, customMessage, verifyUrl);

  try {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const [result] = await sgMail.send({
        to: recipient,
        from: sender,
        replyTo: sender,
        subject,
        html,
        attachments: [{
          content: qrBase64,
          filename: 'event-pass-qr.png',
          type: 'image/png',
          disposition: 'inline',
          content_id: 'qrCodeImage'
        }]
      } as any);

      const sendGridResult = result as any;
      await db.updateEmailLogStatus(logId, 'Delivered');
      return {
        provider: 'sendgrid',
        statusCode: sendGridResult?.statusCode || 202,
        messageId: sendGridResult?.headers?.['x-message-id'] || sendGridResult?.id || null
      };
    }

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const result = await transporter.sendMail({
        from: `"${sender.name}" <${sender.email}>`,
        replyTo: `"${sender.name}" <${sender.email}>`,
        to: recipient,
        subject,
        html,
        attachments: [{
          filename: 'event-pass-qr.png',
          content: Buffer.from(qrBase64, 'base64'),
          cid: 'qrCodeImage'
        }]
      });

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
