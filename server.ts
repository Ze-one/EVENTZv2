/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { db } from './src/server/db.js';
import { apiErrorHandler } from './src/server/errors.js';
import { PassStatus, ScanResult } from './src/types.js';
import { createSignedPassToken } from './src/server/pass-security.js';
import { evaluateAccess, normalizeLocalDate, processAccessClaim, recordDeniedScan, validateSignedTokenForParticipant } from './src/server/access-control.js';
import { requireSession } from './src/server/session-auth.js';
import { platformRouter, asyncRoute, account, fail, eventInput } from './src/server/platform-router.js';
import { workspaceRouter } from './src/server/workspace-router.js';
import { sessionSecret, passSecret } from './src/server/runtime-secrets.js';
import { currentEventId, eventScope, withEventLock } from './src/server/event-scope.js';
import { MAX_ROSTER_ROWS, normalizeParticipant, participantErrors, partitionDuplicates } from './src/roster/model.js';

dotenv.config({ path: ['.env.local', '.env'] });
sessionSecret();
passSecret();

const appRoot = process.cwd();
const app = express();
const httpServer = createServer(app);

export { app };

function makeRsvpToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getClientInfo(req: express.Request) {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
  return { ipAddress, deviceInfo };
}

app.use(express.json({ limit: '10mb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/platform', platformRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: db.useSupabase ? 'supabase' : 'local' }));
app.get('/api/ready', asyncRoute(async (_req, res) => {
  await db.checkReadiness();
  res.json({ ok: true, mode: db.useSupabase ? 'supabase' : 'local', database: 'ready' });
}));
// All legacy management routes pass through the same event authorization boundary.
app.use('/api', asyncRoute(async (req, res, next) => {
  const match = req.url.match(/^\/workspace\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return fail(404, 'Use an event workspace or the public platform API.');
  const user = await account(req), event = await db.getEvent(decodeURIComponent(match[1]));
  if (!event) return fail(404, 'Event not found.');
  const role = event.ownerId === user.id ? 'admin' : event.gateOfficerIds?.includes(user.id) ? 'gate_officer' : null;
  if (!role) return fail(403, 'You do not have access to this event workspace.');
  const routePath = match[2] || '/';
  if (role === 'gate_officer' && req.method !== 'GET' && !/^\/verify\/[^/]+\/claim$/.test(routePath) && routePath !== '/offline-sync') return fail(403, 'Gate staff cannot change event management data.');
  if (event.publicationStatus === 'cancelled' && (/^\/verify\//.test(routePath) || routePath === '/offline-sync')) return fail(409, 'This event has been cancelled.');
  // The mounted /api middleware restores the /api prefix when next() resumes.
  req.url = routePath + (match[3] || '');
  const invoke = () => new Promise<void>(resolve => {
    res.once('finish', resolve); res.once('close', resolve);
    eventScope.run({ eventId: event.id, role }, next);
  });
  // Serialize event writes locally, including capacity checks and gate claims.
  if (req.method !== 'GET') await withEventLock(event.id, invoke);
  else await invoke();
}));
app.use('/api', workspaceRouter);
// Express 4 does not propagate rejected async handlers automatically.
const route = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (url: string, ...handlers: any[]) => (app as any)[method](url, ...handlers.map(asyncRoute))])) as Record<string, (...args: any[]) => void>;


route.get('/api/db-status', (_req, res) => {
  return res.json({ useSupabase: db.useSupabase, dbType: db.useSupabase ? 'Supabase' : 'Local JSON File', databaseFile: process.env.VERCEL ? '/tmp/db.json' : 'db.json' });
});

route.get('/api/health', (_req, res) => {
  return res.json({ ok: true, mode: db.useSupabase ? 'supabase' : 'local', timestamp: new Date().toISOString() });
});

route.get('/api/event', async (_req, res) => {
  const event = await db.getEvent();
  return res.json(event);
});

route.post('/api/event', async (req, res) => {
  const designFields = ['passTitle', 'accessInstruction', 'footerNote', 'logoPath', 'organizerName', 'primaryColor', 'accentColor', 'showPhone', 'showEmail', 'showCategory', 'showOrganization', 'dashboardMediaFit', 'dashboardMediaPosition', 'dashboardMediaOverlay', 'dashboardMediaAutoplay', 'dashboardMediaLoop'];
  const design = Object.fromEntries(designFields.filter(key => Object.hasOwn(req.body || {}, key)).map(key => [key, req.body[key]]));
  const previous = await db.getEvent();
  const fields = eventInput({ ...req.body, publicationStatus: previous!.publicationStatus }, previous);
  if (fields.eventCapacity && fields.eventCapacity < (await db.getParticipants()).filter(p => p.status !== PassStatus.CANCELLED).length)
    return fail(409, 'Capacity cannot be below the number of registered attendees.');
  const event = await db.updateEvent(currentEventId()!, { ...design, ...fields });
  return res.json(event);
});

route.post('/api/dashboard-media/upload-ticket', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const contentType = String(req.body?.contentType || '').trim().toLowerCase();
    const fileName = String(req.body?.fileName || 'dashboard-media');
    const fileSize = Number(req.body?.fileSize || 0);
    const allowed = new Set([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm'
    ]);

    if (!allowed.has(contentType)) {
      return res.status(415).json({ error: 'Unsupported dashboard media type.' });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'Dashboard media must be between 1 byte and 12 MB.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return res.status(500).json({ error: 'Supabase Storage client configuration is incomplete.' });
    }

    const extensionByType: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm'
    };

    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100);
    const safeBase = cleanName.replace(/\.[^.]+$/, '').replace(/^-+|-+$/g, '') || 'dashboard-media';
    const objectPath = `${currentEventId()}/dashboard/${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeBase}.${extensionByType[contentType]}`;

    const storage = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await storage.storage
      .from('eventz-media')
      .createSignedUploadUrl(objectPath, { upsert: false });

    if (error || !data?.token) throw new Error(error?.message || 'Unable to create signed upload URL.');

    return res.json({
      success: true,
      bucket: 'eventz-media',
      path: objectPath,
      token: data.token,
      signedUrl: data.signedUrl,
      supabaseUrl,
      anonKey
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Unable to prepare dashboard media upload.' });
  }
});

route.post('/api/dashboard-media/activate', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const objectPath = String(req.body?.path || '').trim();
    const mediaType = String(req.body?.mediaType || '');
    const name = String(req.body?.name || 'Dashboard visual').slice(0, 140);

    if (!objectPath.startsWith(`${currentEventId()}/dashboard/`)) {
      return res.status(400).json({ error: 'Invalid dashboard media path.' });
    }
    if (!['image', 'gif', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'Invalid dashboard media type.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Supabase Storage is not configured on the server.' });
    }

    const storage = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: publicData } = storage.storage.from('eventz-media').getPublicUrl(objectPath);

    const event = await db.updateEvent((currentEventId() || 'event-1'), {
      dashboardMediaUrl: publicData.publicUrl,
      dashboardMediaPath: objectPath,
      dashboardMediaType: mediaType,
      dashboardMediaName: name,
      dashboardMediaEnabled: true
    } as any);

    return res.json({
      success: true,
      event,
      url: publicData.publicUrl,
      path: objectPath,
      mediaType,
      name
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Unable to activate dashboard media.' });
  }
});

route.post(
  '/api/dashboard-media',
  express.raw({
    type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    limit: '12mb'
  }),
  async (req, res) => {
    const auth = requireSession(req, ['admin']);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    try {
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const allowed = new Set([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/webm'
      ]);

      if (!allowed.has(contentType)) {
        return res.status(415).json({ error: 'Unsupported dashboard media type. Use PNG, JPG, WebP, GIF, MP4, or WebM.' });
      }

      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
      if (!body.length) return res.status(400).json({ error: 'No media file was received.' });
      if (body.length > 12 * 1024 * 1024) {
        return res.status(413).json({ error: 'Dashboard media must be 12 MB or smaller.' });
      }

      const supabaseUrl = process.env.SUPABASE_URL || '';
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Supabase Storage is not configured on the server.' });
      }

      const extensionByType: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm'
      };

      const originalName = String(req.headers['x-file-name'] || 'dashboard-media')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 100);
      const ext = extensionByType[contentType] || 'bin';
      const safeBase = originalName.replace(/\.[^.]+$/, '').replace(/^-+|-+$/g, '') || 'dashboard-media';
      const objectPath = `${currentEventId()}/dashboard/${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeBase}.${ext}`;

      const storage = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false }
      });

      const { error: uploadError } = await storage.storage
        .from('eventz-media')
        .upload(objectPath, body, {
          contentType,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicData } = storage.storage.from('eventz-media').getPublicUrl(objectPath);
      const mediaType = contentType === 'image/gif' ? 'gif' : contentType.startsWith('video/') ? 'video' : 'image';

      const event = await db.updateEvent((currentEventId() || 'event-1'), {
        dashboardMediaUrl: publicData.publicUrl,
        dashboardMediaPath: objectPath,
        dashboardMediaType: mediaType,
        dashboardMediaName: originalName,
        dashboardMediaEnabled: true
      } as any);

      return res.status(201).json({
        success: true,
        url: publicData.publicUrl,
        path: objectPath,
        mediaType,
        name: originalName,
        size: body.length,
        contentType,
        event
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Dashboard media upload failed.' });
    }
  }
);

route.delete('/api/dashboard-media', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const objectPath = String(req.body?.path || '').trim();
    if (!objectPath || !objectPath.startsWith(`${currentEventId()}/dashboard/`)) {
      return res.status(400).json({ error: 'A valid EVENTZ dashboard media path is required.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Supabase Storage is not configured on the server.' });
    }

    const storage = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false }
    });

    const { error } = await storage.storage.from('eventz-media').remove([objectPath]);
    if (error) throw new Error(error.message);

    const event = await db.updateEvent((currentEventId() || 'event-1'), {
      dashboardMediaUrl: null,
      dashboardMediaPath: null,
      dashboardMediaType: null,
      dashboardMediaName: null,
      dashboardMediaEnabled: false
    } as any);

    return res.json({ success: true, event });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Unable to remove dashboard media.' });
  }
});


route.get('/api/participants', async (_req, res) => {
  const list = await db.getParticipants();
  return res.json(list);
});

route.post('/api/participants', async (req, res) => {
  const errors = participantErrors(req.body);
  if (errors.length) return fail(400, errors.join(' '));
  const { fullName, phone, email, organization, category } = normalizeParticipant(req.body);
  const participant = await db.createParticipant({
    eventId: (currentEventId() || 'event-1'),
    fullName,
    phone: phone || '',
    email: email || '',
    organization: organization || '',
    category: category || '',
    status: PassStatus.NOT_USED,
    rsvpToken: makeRsvpToken(),
    rsvpStatus: 'pending',
    passCancelledByRsvp: false
  });
  return res.json(participant);
});

route.post('/api/participants/batch', async (req, res) => {
  const { participants, duplicateMode = 'skip' } = req.body || {};
  if (!Array.isArray(participants) || participants.length === 0) return res.status(400).json({ error: 'Participants array is required' });
  if (participants.length > MAX_ROSTER_ROWS) return fail(400, `Import up to ${MAX_ROSTER_ROWS} participants at a time.`);
  if (!['skip', 'allow'].includes(duplicateMode)) return fail(400, 'Choose whether to skip or allow duplicate rows.');
  for (let index = 0; index < participants.length; index++) {
    const errors = participantErrors(participants[index]);
    if (errors.length) return fail(400, `Row ${index + 1}: ${errors.join(' ')} No participants were imported.`);
  }
  const normalized = participants.map(normalizeParticipant);
  const unique = duplicateMode === 'skip' ? partitionDuplicates(normalized, await db.getParticipants()).unique : normalized;
  const skipped = normalized.length - unique.length;
  if (!unique.length) return res.json({ success: true, count: 0, skipped, data: [] });
  const batchData = unique.map(p => ({
    eventId: (currentEventId() || 'event-1'),
    fullName: p.fullName,
    phone: p.phone || '',
    email: p.email || '',
    organization: p.organization || '',
    category: p.category || 'Attendees',
    status: PassStatus.NOT_USED,
    rsvpToken: makeRsvpToken(),
    rsvpStatus: 'pending' as const,
    passCancelledByRsvp: false
  }));
  const created = await db.createParticipantsBatch(batchData);
  return res.json({ success: true, count: created.length, skipped, data: created });
});

route.put('/api/participants/:id', async (req, res) => {
  const fields = ['fullName', 'phone', 'email', 'organization', 'category', 'status'];
  const updates = Object.fromEntries(fields.filter(key => Object.hasOwn(req.body || {}, key)).map(key => [key, String(req.body[key]).trim().slice(0, 300)]));
  if (Object.hasOwn(updates, 'fullName') && !updates.fullName) return fail(400, 'Full name is required.');
  if (updates.status && !Object.values(PassStatus).includes(updates.status as PassStatus)) return fail(400, 'Invalid pass status.');
  const updated = await db.updateParticipant(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Participant not found' });
  return res.json(updated);
});

route.delete('/api/participants/:id', async (req, res) => {
  const deleted = await db.deleteParticipant(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Participant not found' });
  return res.json({ success: true });
});

route.post('/api/participants/bulk-delete', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Array of ids is required' });
  const initialCount = (await db.getParticipants()).length;
  await db.deleteParticipantsBatch(ids);
  const deletedCount = initialCount - (await db.getParticipants()).length;
  return res.json({ success: true, count: deletedCount });
});

route.post('/api/participants/:id/reset', async (req, res) => {
  const participant = await db.getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  const updated = await db.updateParticipant(req.params.id, { status: PassStatus.NOT_USED, checkedInAt: null, checkedInBy: null, accessCount: 0, presenceState: 'outside', lastAccessAt: null, lastAccessGate: null, lastExitAt: null, lastExitGate: null });
  return res.json(updated);
});

route.get('/api/verify/:passId', async (req, res) => {
  const passId = String(req.params.passId || '').trim().toUpperCase();
  const token = String(req.query.token || req.query.t || '').trim();
  const direction = req.query.direction === 'exit' ? 'exit' : 'entry';
  const localDate = normalizeLocalDate(String(req.query.localDate || ''));
  const { ipAddress, deviceInfo } = getClientInfo(req);
  const scannedBy = (req.query.scannedBy as string) || 'Gate Browser';
  const participant = await db.getParticipantByPassId(passId);

  if (!participant) {
    await db.addScanLog({
      eventId: (currentEventId() || 'event-1'),
      passId,
      scanResult: ScanResult.INVALID,
      scannedBy,
      deviceInfo,
      ipAddress,
      direction,
      offline: false,
      riskLevel: 'high',
      riskReason: 'Pass ID does not exist.',
      qrVerified: false
    } as any);
    return res.status(404).json({ status: 'Invalid', error: 'This pass does not exist in the system.' });
  }

  const tokenCheck = validateSignedTokenForParticipant(participant, token || undefined);
  if (token && !tokenCheck.valid) {
    await recordDeniedScan({
      participant,
      passId,
      scannedBy,
      deviceInfo,
      ipAddress,
      result: ScanResult.INVALID,
      reason: tokenCheck.error || 'QR signature validation failed.',
      qrVerified: false,
      direction
    });
    return res.status(403).json({
      status: 'InvalidSignature',
      error: tokenCheck.error || 'This QR code is not a valid current EVENTZ signed credential.',
      participant
    });
  }

  const access = evaluateAccess(participant, direction, localDate);
  if (!access.allowed) {
    const result =
      access.status === 'Used' ? ScanResult.USED :
      access.status === 'Cancelled' ? ScanResult.CANCELLED :
      ScanResult.INVALID;

    await recordDeniedScan({
      participant,
      passId,
      scannedBy,
      deviceInfo,
      ipAddress,
      result,
      reason: access.reason || 'Access rule denied this scan.',
      qrVerified: tokenCheck.qrVerified,
      direction
    });

    return res.status(access.status === 'Cancelled' ? 200 : 409).json({
      status: access.status,
      error: access.reason,
      participant,
      qrVerified: tokenCheck.qrVerified,
      allowedDays: (access as any).allowedDays || participant.allowedDays || []
    });
  }

  return res.json({
    status: 'Valid',
    participant,
    qrVerified: tokenCheck.qrVerified,
    verificationMode: tokenCheck.qrVerified ? 'signed_qr' : 'manual_lookup',
    access: {
      entryMode: participant.entryMode || 'single',
      presenceState: participant.presenceState || 'outside',
      accessCount: participant.accessCount || 0,
      allowedDays: participant.allowedDays || [],
      requestedDirection: direction,
      localDate
    }
  });
});

route.post('/api/verify/:passId/claim-internal', async (req, res) => {
  const { ipAddress, deviceInfo } = getClientInfo(req);
  const result = await processAccessClaim({
    passId: req.params.passId,
    token: req.body?.token,
    direction: req.body?.direction,
    checkedInBy: req.body?.checkedInBy || 'Gate Officer',
    localDate: req.body?.localDate,
    deviceInfo,
    ipAddress
  });
  return res.status(result.success ? 200 : 409).json(result);
});

route.get('/api/offline-manifest', async (req, res) => {
  const auth = requireSession(req, ['admin', 'gate_officer']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  try {
    const participants = await db.getParticipants();
    const manifest = participants.map((participant: any) => ({
      passId: participant.passId,
      token: createSignedPassToken(participant),
      participant: {
        id: participant.id,
        fullName: participant.fullName,
        organization: participant.organization || '',
        category: participant.category || '',
        status: participant.status,
        passVersion: participant.passVersion || 1,
        passRevokedAt: participant.passRevokedAt || null,
        entryMode: participant.entryMode || 'single',
        allowedDays: participant.allowedDays || [],
        presenceState: participant.presenceState || 'outside',
        accessCount: participant.accessCount || 0
      }
    }));

    return res.json({
      eventId: (currentEventId() || 'event-1'),
      generatedAt: new Date().toISOString(),
      count: manifest.length,
      passes: manifest
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Unable to prepare offline pass manifest.' });
  }
});

route.post('/api/offline-sync', async (req, res) => {
  const auth = requireSession(req, ['admin', 'gate_officer']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions.slice(0, 500) : [];
  if (!transactions.length) return res.json({ success: true, processed: 0, results: [] });

  const { ipAddress, deviceInfo } = getClientInfo(req);
  const results: any[] = [];

  for (const transaction of transactions) {
    try {
      const result = await processAccessClaim({
        passId: transaction.passId,
        token: transaction.token,
        direction: transaction.direction,
        checkedInBy: transaction.checkedInBy || 'Offline Gate',
        localDate: transaction.localDate,
        deviceInfo: transaction.deviceInfo || deviceInfo,
        ipAddress,
        offline: true,
        syncId: transaction.syncId,
        scannedAt: transaction.scannedAt
      });
      results.push({ syncId: transaction.syncId, ...result });
    } catch (error: any) {
      results.push({ syncId: transaction.syncId, success: false, status: 'Error', error: error?.message || 'Offline reconciliation failed.' });
    }
  }

  return res.json({
    success: true,
    processed: results.length,
    accepted: results.filter((item) => item.success).length,
    rejected: results.filter((item) => !item.success).length,
    results
  });
});

route.get('/api/participants/:id/pass-history', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const participant = await db.getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found.' });
  const history = await db.getPassHistory(participant.id);
  return res.json({
    participant: {
      id: participant.id,
      fullName: participant.fullName,
      passId: participant.passId,
      passVersion: participant.passVersion || 1,
      status: participant.status
    },
    history
  });
});

route.post('/api/participants/:id/revoke', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const participant = await db.getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found.' });

  const performedBy = String(req.body?.performedBy || 'Admin');
  const reason = String(req.body?.reason || 'Pass revoked by administrator').trim();
  const revokedAt = new Date().toISOString();
  const nextVersion = Number(participant.passVersion || 1) + 1;

  const updated = await db.updateParticipant(participant.id, {
    status: PassStatus.CANCELLED,
    passRevokedAt: revokedAt,
    passRevokedBy: performedBy,
    passRevocationReason: reason,
    passVersion: nextVersion
  } as any);

  await db.addPassHistory({
    eventId: participant.eventId || (currentEventId() || 'event-1'),
    participantId: participant.id,
    action: 'revoked',
    oldPassId: participant.passId,
    newPassId: participant.passId,
    passVersion: nextVersion,
    performedBy,
    reason
  });

  return res.json({ success: true, participant: updated });
});

route.post('/api/participants/:id/access-rules', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const participant = await db.getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found.' });

  const entryMode = ['single', 'multiple', 'reentry'].includes(req.body?.entryMode)
    ? req.body.entryMode
    : participant.entryMode || 'single';

  const allowedDays = Array.isArray(req.body?.allowedDays)
    ? Array.from(new Set(req.body.allowedDays.map((value: any) => String(value)).filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)))).slice(0, 31)
    : participant.allowedDays || [];

  const updated = await db.updateParticipant(participant.id, {
    entryMode,
    allowedDays,
    presenceState: entryMode === 'reentry' ? participant.presenceState || 'outside' : participant.presenceState || 'outside'
  } as any);

  await db.addPassHistory({
    eventId: participant.eventId || (currentEventId() || 'event-1'),
    participantId: participant.id,
    action: 'access_rules_updated',
    oldPassId: participant.passId,
    newPassId: participant.passId,
    passVersion: participant.passVersion || 1,
    performedBy: String(req.body?.performedBy || 'Admin'),
    metadata: { entryMode, allowedDays }
  });

  return res.json({ success: true, participant: updated });
});

route.get('/api/security-alerts', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  return res.json(await db.getSecurityAlerts());
});

route.post('/api/security-alerts/:id/resolve', async (req, res) => {
  const auth = requireSession(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const alert = await db.resolveSecurityAlert(req.params.id, String(req.body?.resolvedBy || 'Admin'));
  if (!alert) return res.status(404).json({ error: 'Security alert not found.' });
  return res.json({ success: true, alert });
});

route.get('/api/scan-logs', async (_req, res) => res.json(await db.getScanLogs()));
route.post('/api/scan-logs/clear', async (_req, res) => { await db.clearScanLogs(); return res.json({ success: true }); });
route.get('/api/email-logs', async (_req, res) => res.json(await db.getEmailLogs()));
route.post('/api/email-logs/clear', async (_req, res) => { await db.clearEmailLogs(); return res.json({ success: true }); });

route.post('/api/participants/:id/email', async (_req, res) => {
  return res.status(410).json({ error: 'This endpoint is handled by the Vercel serverless email route.' });
});

route.post('/api/participants/bulk-email', async (_req, res) => {
  return res.status(410).json({ error: 'This endpoint is handled by the Vercel serverless bulk email route.' });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(apiErrorHandler);

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const vite = await import('vite');
  const viteServer = await vite.createServer({ server: { middlewareMode: true, hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer } }, appType: 'spa', root: appRoot });
  app.use(viteServer.middlewares);
}

app.use(express.static(path.join(appRoot, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(appRoot, 'dist', 'index.html')));

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, () => console.log(`EVENTZ server running on http://localhost:${PORT}`));
}

if (!process.env.VERCEL) {
  startServer().catch((error) => {
    console.error('Failed to start EVENTZ server:', error);
    process.exit(1);
  });
}
