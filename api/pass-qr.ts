import QRCode from 'qrcode';
import { db } from '../src/server/db.js';
import { buildSignedVerifyUrl } from '../src/server/pass-security.js';

function getAppOrigin(req: any): string {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (configured) return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

export default async function handler(req: any, res: any) {
  try {
    const passId = String(req.query?.passId || '').trim().toUpperCase();
    if (!passId) {
      res.status(400).json({ error: 'passId is required.' });
      return;
    }

    const participant = await db.getParticipantByPassId(passId);
    if (!participant) {
      res.status(404).json({ error: 'Participant pass not found.' });
      return;
    }

    const verifyUrl = buildSignedVerifyUrl(getAppOrigin(req), participant);
    const buffer = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      margin: 1,
      width: 420,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('X-EVENTZ-Pass-Version', String(participant.passVersion || 1));
    res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Signed QR generation failed.' });
  }
}
