/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { db } from './src/server/db.js';
import { PassStatus, ScanResult } from './src/types.js';

dotenv.config({ path: ['.env.local', '.env'] });

const appRoot = process.cwd();
const app = express();

export { app };

function getClientInfo(req: express.Request) {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
  return { ipAddress, deviceInfo };
}

app.use(express.json({ limit: '10mb' }));

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await db.verifyUser(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const { passwordHash, ...safeUser } = user;
    return res.json({ user: safeUser });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Login failed' });
  }
});

app.get('/api/db-status', (_req, res) => {
  return res.json({ useSupabase: db.useSupabase, dbType: db.useSupabase ? 'Supabase' : 'Local JSON File', databaseFile: process.env.VERCEL ? '/tmp/db.json' : 'db.json' });
});

app.get('/api/health', (_req, res) => {
  return res.json({ ok: true, mode: db.useSupabase ? 'supabase' : 'local', timestamp: new Date().toISOString() });
});

app.get('/api/event', async (_req, res) => {
  const event = await db.getEvent();
  return res.json(event);
});

app.post('/api/event', async (req, res) => {
  const event = await db.updateEvent('event-1', req.body || {});
  return res.json(event);
});

app.get('/api/participants', async (_req, res) => {
  const list = await db.getParticipants();
  return res.json(list);
});

app.post('/api/participants', async (req, res) => {
  const { fullName, phone, email, organization, category } = req.body || {};
  if (!fullName) return res.status(400).json({ error: 'Full name is required' });
  const participant = await db.createParticipant({ eventId: 'event-1', fullName, phone: phone || '', email: email || '', organization: organization || '', category: category || '', status: PassStatus.NOT_USED });
  return res.json(participant);
});

app.post('/api/participants/batch', async (req, res) => {
  const { participants } = req.body || {};
  if (!Array.isArray(participants) || participants.length === 0) return res.status(400).json({ error: 'Participants array is required' });
  const batchData = participants.map((p: any) => ({ eventId: 'event-1', fullName: p.fullName || 'Anonymous', phone: p.phone || '', email: p.email || '', organization: p.organization || '', category: p.category || '', status: PassStatus.NOT_USED }));
  const created = await db.createParticipantsBatch(batchData);
  return res.json({ success: true, count: created.length, data: created });
});

app.put('/api/participants/:id', async (req, res) => {
  const updated = await db.updateParticipant(req.params.id, req.body || {} as any);
  if (!updated) return res.status(404).json({ error: 'Participant not found' });
  return res.json(updated);
});

app.delete('/api/participants/:id', async (req, res) => {
  const deleted = await db.deleteParticipant(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Participant not found' });
  return res.json({ success: true });
});

app.post('/api/participants/bulk-delete', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Array of ids is required' });
  const initialCount = (await db.getParticipants()).length;
  await db.deleteParticipantsBatch(ids);
  const deletedCount = initialCount - (await db.getParticipants()).length;
  return res.json({ success: true, count: deletedCount });
});

app.post('/api/participants/:id/reset', async (req, res) => {
  const participant = await db.getParticipantById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  const updated = await db.updateParticipant(req.params.id, { status: PassStatus.NOT_USED, checkedInAt: undefined, checkedInBy: undefined });
  return res.json(updated);
});

app.get('/api/verify/:passId', async (req, res) => {
  const { passId } = req.params;
  const { ipAddress, deviceInfo } = getClientInfo(req);
  const scannedBy = (req.query.scannedBy as string) || 'Gate Browser';
  const participant = await db.getParticipantByPassId(passId);
  if (!participant) {
    await db.addScanLog({ eventId: 'event-1', passId, scanResult: ScanResult.INVALID, scannedBy, deviceInfo, ipAddress });
    return res.status(404).json({ status: 'Invalid', error: 'This pass does not exist in the system.' });
  }
  if (participant.status === PassStatus.CANCELLED) {
    await db.addScanLog({ eventId: 'event-1', participantId: participant.id, passId, scanResult: ScanResult.CANCELLED, scannedBy, deviceInfo, ipAddress });
    return res.json({ status: 'Cancelled', participant });
  }
  if (participant.status === PassStatus.USED) {
    await db.addScanLog({ eventId: 'event-1', participantId: participant.id, passId, scanResult: ScanResult.USED, scannedBy, deviceInfo, ipAddress });
    return res.json({ status: 'Used', participant });
  }
  return res.json({ status: 'Valid', participant });
});

app.post('/api/verify/:passId/claim', async (req, res) => {
  const { passId } = req.params;
  const { checkedInBy } = req.body || {};
  const { ipAddress, deviceInfo } = getClientInfo(req);
  const scannedBy = checkedInBy || 'Gate Officer';
  const participant = await db.getParticipantByPassId(passId);
  if (!participant) return res.status(404).json({ error: 'Participant pass not found' });
  if (participant.status === PassStatus.USED) return res.status(400).json({ error: 'This pass is already checked in.', participant });
  const checkedInAt = new Date().toISOString();
  const updated = await db.updateParticipant(participant.id, { status: PassStatus.USED, checkedInAt, checkedInBy: scannedBy });
  await db.addScanLog({ eventId: 'event-1', participantId: participant.id, passId, scanResult: ScanResult.VALID, scannedBy, deviceInfo, ipAddress });
  return res.json({ success: true, participant: updated });
});

app.get('/api/scan-logs', async (_req, res) => res.json(await db.getScanLogs()));
app.post('/api/scan-logs/clear', async (_req, res) => { await db.clearScanLogs(); return res.json({ success: true }); });
app.get('/api/email-logs', async (_req, res) => res.json(await db.getEmailLogs()));
app.post('/api/email-logs/clear', async (_req, res) => { await db.clearEmailLogs(); return res.json({ success: true }); });

app.post('/api/participants/:id/email', async (_req, res) => {
  return res.status(410).json({ error: 'This endpoint is handled by the Vercel serverless email route.' });
});

app.post('/api/participants/bulk-email', async (_req, res) => {
  return res.status(410).json({ error: 'This endpoint is handled by the Vercel serverless bulk email route.' });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const vite = await import('vite');
  const viteServer = await vite.createServer({ server: { middlewareMode: true }, appType: 'spa', root: appRoot });
  app.use(viteServer.middlewares);
}

app.use(express.static(path.join(appRoot, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(appRoot, 'dist', 'index.html')));

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`EVENTZ server running on http://localhost:${PORT}`));
}

if (!process.env.VERCEL) {
  startServer().catch((error) => {
    console.error('Failed to start EVENTZ server:', error);
    process.exit(1);
  });
}
