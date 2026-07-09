import QRCode from 'qrcode';

function getAppOrigin(req: any): string {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (configured) return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

export default async function handler(req: any, res: any) {
  try {
    const passId = String(req.query?.passId || '').trim();
    if (!passId) {
      res.status(400).json({ error: 'passId is required.' });
      return;
    }

    const verifyUrl = `${getAppOrigin(req)}/verify/${encodeURIComponent(passId)}`;
    const buffer = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      margin: 1,
      width: 420,
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'QR generation failed.' });
  }
}
