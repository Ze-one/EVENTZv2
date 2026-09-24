import { db } from './db.js';
import { PassStatus, ScanResult } from '../types.js';
import { verifySignedPassToken } from './pass-security.js';

export type AccessDirection = 'entry' | 'exit';

export function normalizeLocalDate(value?: string) {
  const candidate = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : new Date().toISOString().slice(0, 10);
}

export function validateSignedTokenForParticipant(participant: any, token?: string) {
  if (!token) return { valid: false, qrVerified: false, error: 'Unsigned/manual lookup.' };

  const verified = verifySignedPassToken(token);
  if (!verified.valid || !verified.payload) {
    return { valid: false, qrVerified: false, error: verified.error || 'Invalid QR signature.' };
  }

  const payload = verified.payload;
  if (
    String(payload.participantId) !== String(participant.id) ||
    String(payload.passId).toUpperCase() !== String(participant.passId).toUpperCase() ||
    String(payload.eventId) !== String(participant.eventId || 'event-1') ||
    Number(payload.passVersion) !== Number(participant.passVersion || 1)
  ) {
    return { valid: false, qrVerified: false, error: 'Signed QR belongs to an older or different pass generation.' };
  }

  return { valid: true, qrVerified: true, payload };
}

export function evaluateAccess(participant: any, direction: AccessDirection, localDate: string) {
  if (participant.status === PassStatus.CANCELLED || participant.passRevokedAt) {
    return { allowed: false, status: 'Cancelled', reason: participant.passRevocationReason || 'This pass has been revoked.' };
  }

  const allowedDays = Array.isArray(participant.allowedDays) ? participant.allowedDays : [];
  if (allowedDays.length > 0 && !allowedDays.includes(localDate)) {
    return {
      allowed: false,
      status: 'NotAllowedToday',
      reason: `This pass is not valid on ${localDate}.`,
      allowedDays
    };
  }

  const mode = participant.entryMode || 'single';
  const presence = participant.presenceState || 'outside';

  if (mode === 'single') {
    if (direction === 'exit') {
      return { allowed: false, status: 'RuleDenied', reason: 'This is a single-entry pass and does not support exit/re-entry tracking.' };
    }
    if (participant.status === PassStatus.USED || Number(participant.accessCount || 0) > 0) {
      return { allowed: false, status: 'Used', reason: 'This single-entry pass has already been used.' };
    }
  }

  if (mode === 'reentry') {
    if (direction === 'entry' && presence === 'inside') {
      return { allowed: false, status: 'Used', reason: 'This participant is already recorded inside. Record an exit before another entry.' };
    }
    if (direction === 'exit' && presence !== 'inside') {
      return { allowed: false, status: 'RuleDenied', reason: 'This participant is already recorded outside.' };
    }
  }

  return { allowed: true, status: 'Valid', mode, presence };
}

async function detectCrossGateRisk(participant: any, gate: string, nowIso: string) {
  const logs = await db.getScanLogs();
  const now = new Date(nowIso).getTime();
  const recent = logs.filter((log: any) =>
    String(log.passId).toUpperCase() === String(participant.passId).toUpperCase() &&
    now - new Date(log.createdAt).getTime() <= 10 * 60 * 1000 &&
    now - new Date(log.createdAt).getTime() >= 0
  );

  const otherGate = recent.find((log: any) => log.scannedBy && log.scannedBy !== gate);
  if (!otherGate) return null;

  const message = `Pass scanned at multiple gates within 10 minutes: ${otherGate.scannedBy} → ${gate}.`;
  const alert = await db.addSecurityAlert({
    eventId: participant.eventId || 'event-1',
    participantId: participant.id,
    passId: participant.passId,
    type: 'cross_gate_repeat',
    severity: 'high',
    message,
    gates: [otherGate.scannedBy, gate],
    scanLogIds: [otherGate.id]
  });

  return { level: 'high', reason: message, alert };
}

export async function recordDeniedScan(params: {
  participant?: any;
  passId: string;
  scannedBy: string;
  deviceInfo?: string;
  ipAddress?: string;
  result: ScanResult;
  reason: string;
  qrVerified?: boolean;
  direction?: AccessDirection;
  offline?: boolean;
  syncId?: string;
}) {
  const log = await db.addScanLog({
    eventId: params.participant?.eventId || 'event-1',
    participantId: params.participant?.id,
    passId: params.passId,
    scanResult: params.result,
    scannedBy: params.scannedBy,
    deviceInfo: params.deviceInfo || 'Gate Scanner',
    ipAddress: params.ipAddress || '0.0.0.0',
    direction: params.direction || 'entry',
    offline: Boolean(params.offline),
    syncId: params.syncId || null,
    riskLevel: 'high',
    riskReason: params.reason,
    qrVerified: Boolean(params.qrVerified),
    createdAt: new Date().toISOString()
  } as any);

  if (params.participant) {
    await db.addSecurityAlert({
      eventId: params.participant.eventId || 'event-1',
      participantId: params.participant.id,
      passId: params.passId,
      type: params.result === ScanResult.USED ? 'duplicate_scan' : 'blocked_scan',
      severity: 'high',
      message: params.reason,
      gates: [params.scannedBy],
      scanLogIds: [log.id]
    });
  }

  return log;
}

export async function processAccessClaim(params: {
  passId: string;
  token?: string;
  direction?: AccessDirection;
  checkedInBy: string;
  localDate?: string;
  deviceInfo?: string;
  ipAddress?: string;
  offline?: boolean;
  syncId?: string;
  scannedAt?: string;
}) {
  const passId = String(params.passId || '').trim().toUpperCase();
  const direction: AccessDirection = params.direction === 'exit' ? 'exit' : 'entry';
  const localDate = normalizeLocalDate(params.localDate);
  const timestamp = params.scannedAt || new Date().toISOString();

  if (params.syncId) {
    const previous = await db.getScanLogBySyncId(params.syncId);
    if (previous) {
      const participant = await db.getParticipantByPassId(passId);
      return { success: true, idempotent: true, participant, scanLog: previous };
    }
  }

  const participant = await db.getParticipantByPassId(passId);
  if (!participant) {
    await db.addScanLog({
      eventId: 'event-1',
      passId,
      scanResult: ScanResult.INVALID,
      scannedBy: params.checkedInBy,
      deviceInfo: params.deviceInfo || 'Gate Scanner',
      ipAddress: params.ipAddress || '0.0.0.0',
      direction,
      offline: Boolean(params.offline),
      syncId: params.syncId || null,
      riskLevel: 'high',
      riskReason: 'Pass ID does not exist.',
      qrVerified: false,
      createdAt: timestamp
    } as any);
    return { success: false, status: 'Invalid', error: 'Participant pass not found.' };
  }

  const tokenCheck = validateSignedTokenForParticipant(participant, params.token);
  if (params.token && !tokenCheck.valid) {
    await recordDeniedScan({
      participant,
      passId,
      scannedBy: params.checkedInBy,
      deviceInfo: params.deviceInfo,
      ipAddress: params.ipAddress,
      result: ScanResult.INVALID,
      reason: tokenCheck.error || 'Invalid QR signature.',
      qrVerified: false,
      direction,
      offline: params.offline,
      syncId: params.syncId
    });
    return { success: false, status: 'InvalidSignature', error: tokenCheck.error, participant };
  }

  if (params.offline && !params.token) {
    return { success: false, status: 'InvalidSignature', error: 'Offline claims require a signed QR payload.', participant };
  }

  const access = evaluateAccess(participant, direction, localDate);
  if (!access.allowed) {
    const result = access.status === 'Used' ? ScanResult.USED : access.status === 'Cancelled' ? ScanResult.CANCELLED : ScanResult.INVALID;
    await recordDeniedScan({
      participant,
      passId,
      scannedBy: params.checkedInBy,
      deviceInfo: params.deviceInfo,
      ipAddress: params.ipAddress,
      result,
      reason: access.reason || 'Access rule denied this scan.',
      qrVerified: tokenCheck.qrVerified,
      direction,
      offline: params.offline,
      syncId: params.syncId
    });
    return { success: false, status: access.status, error: access.reason, participant, allowedDays: (access as any).allowedDays };
  }

  const risk = await detectCrossGateRisk(participant, params.checkedInBy, timestamp);
  const mode = participant.entryMode || 'single';
  const updates: any = {
    accessCount: Number(participant.accessCount || 0) + (direction === 'entry' ? 1 : 0),
    updatedAt: timestamp
  };

  if (direction === 'entry') {
    updates.status = PassStatus.USED;
    updates.checkedInAt = participant.checkedInAt || timestamp;
    updates.checkedInBy = participant.checkedInBy || params.checkedInBy;
    updates.lastAccessAt = timestamp;
    updates.lastAccessGate = params.checkedInBy;
    updates.presenceState = mode === 'reentry' ? 'inside' : participant.presenceState || 'inside';
  } else {
    updates.lastExitAt = timestamp;
    updates.lastExitGate = params.checkedInBy;
    updates.presenceState = 'outside';
  }

  const updated = await db.updateParticipant(participant.id, updates as any);
  if (!updated) return { success: false, status: 'Error', error: 'Unable to update participant access state.' };

  const scanLog = await db.addScanLog({
    eventId: participant.eventId || 'event-1',
    participantId: participant.id,
    passId,
    scanResult: ScanResult.VALID,
    scannedBy: params.checkedInBy,
    deviceInfo: params.deviceInfo || 'Gate Scanner',
    ipAddress: params.ipAddress || '0.0.0.0',
    direction,
    offline: Boolean(params.offline),
    syncId: params.syncId || null,
    riskLevel: risk?.level || null,
    riskReason: risk?.reason || null,
    qrVerified: tokenCheck.qrVerified,
    createdAt: timestamp
  } as any);

  return {
    success: true,
    status: 'Valid',
    participant: updated,
    scanLog,
    risk,
    access: {
      mode,
      direction,
      localDate,
      presenceState: updated.presenceState,
      accessCount: updated.accessCount
    }
  };
}
