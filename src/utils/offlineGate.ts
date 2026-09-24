import { eventzAuthHeaders } from './auth.js';

export type GateDirection = 'entry' | 'exit';

type OfflinePass = {
  passId: string;
  token: string;
  participant: {
    id: string;
    fullName: string;
    organization?: string;
    category?: string;
    status: string;
    passVersion: number;
    passRevokedAt?: string | null;
    entryMode: 'single' | 'multiple' | 'reentry';
    allowedDays: string[];
    presenceState: 'outside' | 'inside';
    accessCount: number;
  };
};

type OfflineManifest = {
  eventId: string;
  generatedAt: string;
  count: number;
  passes: OfflinePass[];
};

type OfflineTransaction = {
  syncId: string;
  passId: string;
  token: string;
  direction: GateDirection;
  checkedInBy: string;
  localDate: string;
  scannedAt: string;
  deviceInfo: string;
};

const MANIFEST_KEY = 'eventz_offline_gate_manifest_v1';
const QUEUE_KEY = 'eventz_offline_gate_queue_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function parseEventzScanValue(rawValue: string) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { passId: '', token: '', raw };

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const match = url.pathname.match(/\/verify\/([^/]+)/i);
      if (match?.[1]) {
        return {
          passId: decodeURIComponent(match[1]).trim().toUpperCase(),
          token: String(url.searchParams.get('t') || url.searchParams.get('token') || '').trim(),
          raw
        };
      }
    }
  } catch {}

  if (raw.includes('/verify/')) {
    const after = raw.split('/verify/').pop() || '';
    const [pathId, query = ''] = after.split('?');
    const params = new URLSearchParams(query);
    return {
      passId: decodeURIComponent(pathId).trim().toUpperCase(),
      token: String(params.get('t') || params.get('token') || '').trim(),
      raw
    };
  }

  return { passId: decodeURIComponent(raw.split('?')[0]).trim().toUpperCase(), token: '', raw };
}

export function getOfflineManifest(): OfflineManifest | null {
  return readJson<OfflineManifest | null>(MANIFEST_KEY, null);
}

export function getOfflineQueue(): OfflineTransaction[] {
  return readJson<OfflineTransaction[]>(QUEUE_KEY, []);
}

export function getOfflineGateStatus() {
  const manifest = getOfflineManifest();
  const queue = getOfflineQueue();
  const ageMs = manifest ? Date.now() - new Date(manifest.generatedAt).getTime() : null;
  return {
    ready: Boolean(manifest?.passes?.length),
    generatedAt: manifest?.generatedAt || null,
    manifestCount: manifest?.passes?.length || 0,
    pendingSync: queue.length,
    ageMs
  };
}

export async function refreshOfflineManifest() {
  const response = await fetch('/api/offline-manifest', { cache: 'no-store', headers: eventzAuthHeaders() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to download offline pass manifest.');
  writeJson(MANIFEST_KEY, data);
  return data as OfflineManifest;
}

function saveManifest(manifest: OfflineManifest) {
  writeJson(MANIFEST_KEY, manifest);
}

export function verifyOfflineScan(rawValue: string, direction: GateDirection, localDate: string) {
  const { passId, token } = parseEventzScanValue(rawValue);
  const manifest = getOfflineManifest();
  if (!manifest) return { status: 'Invalid', error: 'No offline pass manifest is available on this gate device.' };
  if (!token) return { status: 'InvalidSignature', error: 'Offline verification requires the signed QR, not a manually typed Pass ID.' };

  const record = manifest.passes.find((item) => item.passId.toUpperCase() === passId && item.token === token);
  if (!record) {
    const passExists = manifest.passes.find((item) => item.passId.toUpperCase() === passId);
    return {
      status: passExists ? 'InvalidSignature' : 'Invalid',
      error: passExists
        ? 'The QR signature does not match the synced current pass generation.'
        : 'This pass is not present in the most recent offline gate manifest.'
    };
  }

  const participant = record.participant;
  if (participant.status === 'Cancelled' || participant.passRevokedAt) {
    return { status: 'Cancelled', participant, qrVerified: true, offline: true };
  }

  const allowedDays = Array.isArray(participant.allowedDays) ? participant.allowedDays : [];
  if (allowedDays.length && !allowedDays.includes(localDate)) {
    return {
      status: 'NotAllowedToday',
      participant,
      qrVerified: true,
      offline: true,
      allowedDays,
      error: `This pass is not valid on ${localDate}.`
    };
  }

  const mode = participant.entryMode || 'single';
  if (mode === 'single' && (participant.status === 'Used' || Number(participant.accessCount || 0) > 0)) {
    return { status: 'Used', participant, qrVerified: true, offline: true, error: 'This single-entry pass is already used.' };
  }

  if (mode === 'single' && direction === 'exit') {
    return { status: 'RuleDenied', participant, qrVerified: true, offline: true, error: 'Single-entry passes do not support exit/re-entry.' };
  }

  if (mode === 'reentry') {
    if (direction === 'entry' && participant.presenceState === 'inside') {
      return { status: 'Used', participant, qrVerified: true, offline: true, error: 'Participant is already recorded inside.' };
    }
    if (direction === 'exit' && participant.presenceState !== 'inside') {
      return { status: 'RuleDenied', participant, qrVerified: true, offline: true, error: 'Participant is already recorded outside.' };
    }
  }

  return {
    status: 'Valid',
    participant: { ...participant, passId },
    qrVerified: true,
    verificationMode: 'offline_signed_manifest',
    offline: true,
    access: {
      entryMode: mode,
      presenceState: participant.presenceState,
      accessCount: participant.accessCount,
      allowedDays,
      requestedDirection: direction,
      localDate
    },
    signedToken: token,
    manifestGeneratedAt: manifest.generatedAt
  };
}

function randomSyncId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function queueOfflineClaim(params: {
  rawValue: string;
  direction: GateDirection;
  checkedInBy: string;
  localDate: string;
}) {
  const { passId, token } = parseEventzScanValue(params.rawValue);
  if (!passId || !token) throw new Error('A signed QR payload is required for offline gate claims.');

  const manifest = getOfflineManifest();
  if (!manifest) throw new Error('No offline manifest is available.');
  const index = manifest.passes.findIndex((item) => item.passId.toUpperCase() === passId && item.token === token);
  if (index < 0) throw new Error('This signed QR is not in the current offline manifest.');

  const record = manifest.passes[index];
  const participant = { ...record.participant };
  const now = new Date().toISOString();

  if (params.direction === 'entry') {
    participant.status = 'Used';
    participant.accessCount = Number(participant.accessCount || 0) + 1;
    if (participant.entryMode === 'reentry') participant.presenceState = 'inside';
  } else if (participant.entryMode === 'reentry') {
    participant.presenceState = 'outside';
  }

  manifest.passes[index] = { ...record, participant };
  saveManifest(manifest);

  const transaction: OfflineTransaction = {
    syncId: randomSyncId(),
    passId,
    token,
    direction: params.direction,
    checkedInBy: params.checkedInBy,
    localDate: params.localDate,
    scannedAt: now,
    deviceInfo: navigator.userAgent || 'Offline Gate Browser'
  };

  const queue = getOfflineQueue();
  queue.push(transaction);
  writeJson(QUEUE_KEY, queue);
  return transaction;
}

export async function syncOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length) return { processed: 0, accepted: 0, rejected: 0, results: [] };

  const response = await fetch('/api/offline-sync', {
    method: 'POST',
    headers: eventzAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ transactions: queue })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Offline gate synchronization failed.');

  const completed = new Set(
    (data.results || [])
      .filter((item: any) => item.success || ['Invalid', 'InvalidSignature', 'Cancelled', 'Used', 'RuleDenied', 'NotAllowedToday'].includes(item.status))
      .map((item: any) => String(item.syncId))
  );

  const remaining = queue.filter((item) => !completed.has(item.syncId));
  writeJson(QUEUE_KEY, remaining);

  try {
    await refreshOfflineManifest();
  } catch {}

  return { ...data, remaining: remaining.length };
}
