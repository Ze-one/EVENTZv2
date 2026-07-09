import crypto from 'crypto';
import { db } from '../src/server/db.js';
import { PassStatus, ScanResult } from '../src/types.js';

function makePassId(indexHint: number) {
  const formatted = String(Math.max(1, indexHint)).padStart(4, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ETSN-2026-${formatted}-${suffix}`;
}

async function makeUniquePassId(indexHint: number) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = makePassId(indexHint + attempt);
    const existing = await db.getParticipantByPassId(id);
    if (!existing) return id;
  }
  return `ETSN-2026-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const participantId = String(req.query?.id || req.body?.id || '').trim();
    const regeneratedBy = String(req.body?.regeneratedBy || 'Admin').trim() || 'Admin';
    const resetCheckIn = req.body?.resetCheckIn !== false;
    if (!participantId) {
      res.status(400).json({ error: 'Participant id is required.' });
      return;
    }

    const participant = await db.getParticipantById(participantId);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found.' });
      return;
    }

    const allParticipants = await db.getParticipants();
    const indexHint = allParticipants.findIndex((p) => p.id === participantId) + 1 || allParticipants.length + 1;
    const oldPassId = participant.passId;
    const newPassId = await makeUniquePassId(indexHint);

    const updates: any = {
      passId: newPassId,
      status: resetCheckIn ? PassStatus.NOT_USED : participant.status,
      checkedInAt: resetCheckIn ? null : participant.checkedInAt,
      checkedInBy: resetCheckIn ? null : participant.checkedInBy
    };

    const updated = await db.updateParticipant(participantId, updates as any);
    if (!updated) {
      res.status(500).json({ error: 'Unable to update participant pass.' });
      return;
    }

    await db.addScanLog({
      eventId: participant.eventId || 'event-1',
      participantId: participant.id,
      passId: oldPassId,
      scanResult: ScanResult.CANCELLED,
      scannedBy: `${regeneratedBy} regenerated pass to ${newPassId}`,
      deviceInfo: req.headers['user-agent'] || 'Admin Console',
      ipAddress: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '0.0.0.0')
    });

    res.status(200).json({ success: true, participant: updated, oldPassId, newPassId });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Pass regeneration failed.' });
  }
}
