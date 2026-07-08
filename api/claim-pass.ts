import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

const PASS_STATUS = {
  NOT_USED: 'Not Used',
  USED: 'Used',
  CANCELLED: 'Cancelled'
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

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

  const passId = getPassId(req).trim().toUpperCase();
  const checkedInBy = String(req.body?.checkedInBy || 'Gate Officer');
  const checkedInAt = new Date().toISOString();
  const { ipAddress, deviceInfo } = getClientInfo(req);

  if (!passId) {
    res.status(400).json({ error: 'Pass ID is required.' });
    return;
  }

  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data: claimed, error: claimError } = await supabase
        .from('participants')
        .update({ status: PASS_STATUS.USED, checkedInAt, checkedInBy, updatedAt: checkedInAt })
        .eq('passId', passId)
        .eq('status', PASS_STATUS.NOT_USED)
        .select()
        .maybeSingle();

      if (claimError) throw new Error(claimError.message);

      if (claimed) {
        await supabase.from('scanLogs').insert({
          id: `log-${Math.random().toString(36).slice(2, 9)}`,
          eventId: 'event-1',
          participantId: claimed.id,
          passId,
          scanResult: 'Valid',
          scannedBy: checkedInBy,
          deviceInfo,
          ipAddress,
          createdAt: checkedInAt
        });
        res.status(200).json({ success: true, participant: claimed });
        return;
      }

      const { data: existing } = await supabase.from('participants').select('*').eq('passId', passId).maybeSingle();
      if (!existing) {
        res.status(404).json({ error: 'Participant pass not found.' });
        return;
      }

      res.status(409).json({ error: existing.status === PASS_STATUS.CANCELLED ? 'This pass has been cancelled.' : 'This pass is already checked in.', participant: existing });
      return;
    }

    const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) : { participants: [], scanLogs: [] };
    const index = (db.participants || []).findIndex((p: any) => String(p.passId).trim().toUpperCase() === passId);
    if (index === -1) {
      res.status(404).json({ error: 'Participant pass not found.' });
      return;
    }

    const participant = db.participants[index];
    if (participant.status !== PASS_STATUS.NOT_USED) {
      res.status(409).json({ error: participant.status === PASS_STATUS.CANCELLED ? 'This pass has been cancelled.' : 'This pass is already checked in.', participant });
      return;
    }

    db.participants[index] = { ...participant, status: PASS_STATUS.USED, checkedInAt, checkedInBy, updatedAt: checkedInAt };
    if (!db.scanLogs) db.scanLogs = [];
    db.scanLogs.push({
      id: `log-${Math.random().toString(36).slice(2, 9)}`,
      eventId: 'event-1',
      participantId: participant.id,
      passId,
      scanResult: 'Valid',
      scannedBy: checkedInBy,
      deviceInfo,
      ipAddress,
      createdAt: checkedInAt
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    res.status(200).json({ success: true, participant: db.participants[index] });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to claim pass.' });
  }
}
