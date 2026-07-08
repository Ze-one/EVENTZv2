/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db } from './src/server/db.js';
import { PassStatus, ScanResult, UserRole } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: '10mb' }));

  // Request IP & Device helper
  const getClientInfo = (req: express.Request) => {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    return { ipAddress, deviceInfo };
  };

  // --- API ROUTES ---

  // Auth: Login
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = db.verifyUser(email, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Return user without password hash
    const { passwordHash, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  // Event: Get settings
  app.get('/api/event', (req, res) => {
    const event = db.getEvent();
    res.json(event);
  });

  // Event: Update settings
  app.post('/api/event', (req, res) => {
    const updates = req.body;
    const event = db.updateEvent('event-1', updates);
    res.json(event);
  });

  // Participants: List
  app.get('/api/participants', (req, res) => {
    const list = db.getParticipants();
    res.json(list);
  });

  // Participants: Create one
  app.post('/api/participants', (req, res) => {
    const { fullName, phone, email, organization, category } = req.body;
    if (!fullName) {
      res.status(400).json({ error: 'Full name is required' });
      return;
    }

    const participant = db.createParticipant({
      eventId: 'event-1',
      fullName,
      phone: phone || '',
      email: email || '',
      organization: organization || '',
      category: category || '',
      status: PassStatus.NOT_USED
    });

    res.json(participant);
  });

  // Participants: Create batch
  app.post('/api/participants/batch', (req, res) => {
    const { participants } = req.body;
    if (!Array.isArray(participants) || participants.length === 0) {
      res.status(400).json({ error: 'Participants array is required' });
      return;
    }

    const batchData = participants.map(p => ({
      eventId: 'event-1',
      fullName: p.fullName || 'Anonymous',
      phone: p.phone || '',
      email: p.email || '',
      organization: p.organization || '',
      category: p.category || '',
      status: PassStatus.NOT_USED
    }));

    const created = db.createParticipantsBatch(batchData);
    res.json({ success: true, count: created.length, data: created });
  });

  // Participants: Update
  app.put('/api/participants/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const updated = db.updateParticipant(id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.json(updated);
  });

  // Participants: Delete
  app.delete('/api/participants/:id', (req, res) => {
    const { id } = req.params;
    const deleted = db.deleteParticipant(id);
    if (!deleted) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.json({ success: true });
  });

  // Participants: Bulk Delete
  app.post('/api/participants/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Array of ids is required' });
      return;
    }
    const initialCount = db.getParticipants().length;
    db.deleteParticipantsBatch(ids);
    const deletedCount = initialCount - db.getParticipants().length;
    res.json({ success: true, count: deletedCount });
  });

  // Participants: Reset check-in
  app.post('/api/participants/:id/reset', (req, res) => {
    const { id } = req.params;
    const participant = db.getParticipantById(id);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    const updated = db.updateParticipant(id, {
      status: PassStatus.NOT_USED,
      checkedInAt: undefined,
      checkedInBy: undefined
    });

    res.json(updated);
  });

  // QR Verification: Query and Log
  app.get('/api/verify/:passId', (req, res) => {
    const { passId } = req.params;
    const { ipAddress, deviceInfo } = getClientInfo(req);
    const scannedBy = (req.query.scannedBy as string) || 'Gate Browser';

    const participant = db.getParticipantByPassId(passId);

    if (!participant) {
      // Record Invalid attempt
      db.addScanLog({
        eventId: 'event-1',
        passId,
        scanResult: ScanResult.INVALID,
        scannedBy,
        deviceInfo,
        ipAddress
      });
      res.status(404).json({ status: 'Invalid', error: 'This pass does not exist in the system.' });
      return;
    }

    if (participant.status === PassStatus.CANCELLED) {
      // Record Cancelled attempt
      db.addScanLog({
        eventId: 'event-1',
        participantId: participant.id,
        passId,
        scanResult: ScanResult.CANCELLED,
        scannedBy,
        deviceInfo,
        ipAddress
      });
      res.json({ status: 'Cancelled', participant });
      return;
    }

    if (participant.status === PassStatus.USED) {
      // Record duplicate entry attempt
      db.addScanLog({
        eventId: 'event-1',
        participantId: participant.id,
        passId,
        scanResult: ScanResult.USED,
        scannedBy,
        deviceInfo,
        ipAddress
      });
      res.json({ status: 'Used', participant });
      return;
    }

    // Found and NOT_USED: Valid Pass (do NOT mark as used yet; wait for Gate Officer button click)
    res.json({ status: 'Valid', participant });
  });

  // QR Verification: Claim (Mark as Entered)
  app.post('/api/verify/:passId/claim', (req, res) => {
    const { passId } = req.params;
    const { checkedInBy } = req.body;
    const { ipAddress, deviceInfo } = getClientInfo(req);
    const scannedBy = checkedInBy || 'Gate Officer';

    const participant = db.getParticipantByPassId(passId);

    if (!participant) {
      res.status(404).json({ error: 'Participant pass not found' });
      return;
    }

    if (participant.status === PassStatus.USED) {
      res.status(400).json({ error: 'This pass is already checked in.', participant });
      return;
    }

    // Update status to USED
    const checkedInAt = new Date().toISOString();
    const updated = db.updateParticipant(participant.id, {
      status: PassStatus.USED,
      checkedInAt,
      checkedInBy: scannedBy
    });

    // Record Valid Scan Log
    db.addScanLog({
      eventId: 'event-1',
      participantId: participant.id,
      passId,
      scanResult: ScanResult.VALID,
      scannedBy,
      deviceInfo,
      ipAddress
    });

    res.json({ success: true, participant: updated });
  });

  // Scan Logs: List
  app.get('/api/scan-logs', (req, res) => {
    const logs = db.getScanLogs();
    res.json(logs);
  });

  // Scan Logs: Clear
  app.post('/api/scan-logs/clear', (req, res) => {
    db.clearScanLogs();
    res.json({ success: true });
  });


  // --- VITE DEV / PRODUCTION INTEGRATION ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ETSNTECH Server] Running at http://localhost:${PORT}`);
  });
}

startServer();
