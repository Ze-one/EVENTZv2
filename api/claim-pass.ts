import { processAccessClaim } from '../src/server/access-control.js';
import { requireSession } from '../src/server/session-auth.js';

function getPassId(req: any) {
  const queryId = req.query?.passId;
  if (Array.isArray(queryId)) return queryId[0];
  if (queryId) return String(queryId);
  const match = String(req.url || '').match(/\/api\/verify\/([^/]+)\/claim/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function getClientInfo(req: any) {
  return {
    ipAddress: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'),
    deviceInfo: String(req.headers['user-agent'] || 'Unknown Device')
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = requireSession(req, ['admin', 'gate_officer']);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const passId = getPassId(req).trim().toUpperCase();
  const checkedInBy = String(req.body?.checkedInBy || 'Gate Officer');
  const token = String(req.body?.token || '').trim();
  const direction = req.body?.direction === 'exit' ? 'exit' : 'entry';
  const localDate = String(req.body?.localDate || '').trim();
  const { ipAddress, deviceInfo } = getClientInfo(req);

  if (!passId) {
    res.status(400).json({ error: 'Pass ID is required.' });
    return;
  }

  try {
    const result = await processAccessClaim({
      passId,
      token: token || undefined,
      direction,
      checkedInBy,
      localDate,
      deviceInfo,
      ipAddress,
      offline: false
    });

    if (!result.success) {
      const status =
        result.status === 'Invalid' ? 404 :
        result.status === 'InvalidSignature' ? 403 :
        result.status === 'Cancelled' ? 409 :
        result.status === 'NotAllowedToday' ? 403 :
        result.status === 'Used' || result.status === 'RuleDenied' ? 409 :
        400;
      res.status(status).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to claim pass.' });
  }
}
