/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';

dotenv.config({ path: ['.env.local', '.env'] });
// `vite` is imported dynamically during development only to avoid loading
// native build-time dependencies in the serverless runtime on Vercel.
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { db } from './src/server/db.js';
import { PassStatus, ScanResult, UserRole } from './src/types.js';

const appRoot = process.cwd();
const app = express();

export { app };

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

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
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await db.verifyUser(email, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Return user without password hash
    const { passwordHash, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  // DB Status
  app.get('/api/db-status', (req, res) => {
    res.json({
      useSupabase: db.useSupabase,
      dbType: db.useSupabase ? 'Supabase' : 'Local JSON File',
      databaseFile: process.env.VERCEL ? '/tmp/db.json' : 'db.json'
    });
  });

  // Health check for deployment verification
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      mode: db.useSupabase ? 'supabase' : 'local',
      timestamp: new Date().toISOString()
    });
  });

  // Event: Get settings
  app.get('/api/event', async (req, res) => {
    const event = await db.getEvent();
    res.json(event);
  });

  // Event: Update settings
  app.post('/api/event', async (req, res) => {
    const updates = req.body;
    const event = await db.updateEvent('event-1', updates);
    res.json(event);
  });

  // Participants: List
  app.get('/api/participants', async (req, res) => {
    const list = await db.getParticipants();
    res.json(list);
  });

  // Participants: Create one
  app.post('/api/participants', async (req, res) => {
    const { fullName, phone, email, organization, category } = req.body;
    if (!fullName) {
      res.status(400).json({ error: 'Full name is required' });
      return;
    }

    const participant = await db.createParticipant({
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
  app.post('/api/participants/batch', async (req, res) => {
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

    const created = await db.createParticipantsBatch(batchData);
    res.json({ success: true, count: created.length, data: created });
  });

  // Participants: Update
  app.put('/api/participants/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const updated = await db.updateParticipant(id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.json(updated);
  });

  // Participants: Delete
  app.delete('/api/participants/:id', async (req, res) => {
    const { id } = req.params;
    const deleted = await db.deleteParticipant(id);
    if (!deleted) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }
    res.json({ success: true });
  });

  // Participants: Bulk Delete
  app.post('/api/participants/bulk-delete', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Array of ids is required' });
      return;
    }
    const initialCount = (await db.getParticipants()).length;
    await db.deleteParticipantsBatch(ids);
    const deletedCount = initialCount - (await db.getParticipants()).length;
    res.json({ success: true, count: deletedCount });
  });

  // Participants: Reset check-in
  app.post('/api/participants/:id/reset', async (req, res) => {
    const { id } = req.params;
    const participant = await db.getParticipantById(id);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    const updated = await db.updateParticipant(id, {
      status: PassStatus.NOT_USED,
      checkedInAt: undefined,
      checkedInBy: undefined
    });

    res.json(updated);
  });

  // QR Verification: Query and Log
  app.get('/api/verify/:passId', async (req, res) => {
    const { passId } = req.params;
    const { ipAddress, deviceInfo } = getClientInfo(req);
    const scannedBy = (req.query.scannedBy as string) || 'Gate Browser';

    const participant = await db.getParticipantByPassId(passId);

    if (!participant) {
      // Record Invalid attempt
      await db.addScanLog({
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
      await db.addScanLog({
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
      await db.addScanLog({
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
  app.post('/api/verify/:passId/claim', async (req, res) => {
    const { passId } = req.params;
    const { checkedInBy } = req.body;
    const { ipAddress, deviceInfo } = getClientInfo(req);
    const scannedBy = checkedInBy || 'Gate Officer';

    const participant = await db.getParticipantByPassId(passId);

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
    const updated = await db.updateParticipant(participant.id, {
      status: PassStatus.USED,
      checkedInAt,
      checkedInBy: scannedBy
    });

    // Record Valid Scan Log
    await db.addScanLog({
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
  app.get('/api/scan-logs', async (req, res) => {
    const logs = await db.getScanLogs();
    res.json(logs);
  });

  // Scan Logs: Clear
  app.post('/api/scan-logs/clear', async (req, res) => {
    await db.clearScanLogs();
    res.json({ success: true });
  });

  // Email Logs: List
  app.get('/api/email-logs', async (req, res) => {
    res.json(await db.getEmailLogs());
  });

  // Email Logs: Clear
  app.post('/api/email-logs/clear', async (req, res) => {
    await db.clearEmailLogs();
    res.json({ success: true });
  });

  // Email Pass: Send single pass to participant email
  // Helper function to send email (real SMTP or robust simulated delivery fallback)
  async function sendEventPassEmail(participant: any, event: any, logId: string, customMessage?: string) {
    const isSmtpConfigured = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(participant.passId, {
        margin: 1,
        width: 300,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('QR generation error for email:', err);
    }

    const subject = `Your Entrance Pass: ${event.eventName || 'Tech Summit'}`;
    const primaryColor = event.primaryColor || '#0f172a';
    const accentColor = event.accentColor || '#eab308';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Your Event Entrance Pass</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          .container {
            max-width: 500px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            border: 1px solid #f1f5f9;
          }
          .header {
            padding: 32px;
            text-align: center;
            color: #ffffff;
            position: relative;
          }
          .organizer {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 8px;
            opacity: 0.9;
          }
          .pass-badge {
            display: inline-block;
            font-size: 10px;
            font-weight: 800;
            padding: 4px 12px;
            border-radius: 6px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 16px;
          }
          .event-name {
            font-size: 20px;
            font-weight: 900;
            margin: 0 0 8px 0;
            line-height: 1.3;
          }
          .event-meta {
            font-size: 11px;
            opacity: 0.8;
            font-family: monospace;
          }
          .content {
            padding: 32px;
            text-align: center;
          }
          .greeting {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 24px;
            line-height: 1.6;
          }
          .custom-msg-box {
            background-color: #f1f5f9;
            border-left: 4px solid ${primaryColor};
            padding: 14px 18px;
            margin-bottom: 24px;
            text-align: left;
            border-radius: 0 12px 12px 0;
          }
          .custom-msg-label {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 800;
            letter-spacing: 1px;
            color: #64748b;
            margin-bottom: 6px;
          }
          .custom-msg-text {
            margin: 0;
            font-size: 13px;
            color: #1e293b;
            line-height: 1.5;
            font-style: italic;
          }
          .pass-card {
            background-color: #f8fafc;
            border: 1px dashed #cbd5e1;
            border-radius: 20px;
            padding: 24px;
            margin-bottom: 24px;
          }
          .attendee-name {
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 6px 0;
          }
          .pass-id {
            font-family: monospace;
            font-size: 12px;
            font-weight: 700;
            color: ${accentColor};
            background: #ffffff;
            padding: 4px 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            display: inline-block;
            letter-spacing: 1px;
            margin-bottom: 20px;
          }
          .qr-container {
            background: #ffffff;
            padding: 16px;
            border-radius: 16px;
            display: inline-block;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
          }
          .qr-image {
            display: block;
            width: 180px;
            height: 180px;
          }
          .instruction {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 16px;
            line-height: 1.5;
          }
          .footer {
            background-color: #0f172a;
            color: #64748b;
            padding: 20px;
            text-align: center;
            font-size: 10px;
            font-family: monospace;
            border-top: 1px solid #1e293b;
          }
          .footer p {
            margin: 4px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header" style="background-color: ${primaryColor};">
            <div class="organizer">${event.organizerName || 'ETS N-TECH'}</div>
            <div class="pass-badge" style="background-color: rgba(255,255,255,0.15); color: ${accentColor};">${event.passTitle || 'DELEGATE PASS'}</div>
            <h1 class="event-name">${event.eventName}</h1>
            <div class="event-meta">📍 ${event.venue} | ⏰ ${event.eventDate} ${event.eventTime}</div>
          </div>
          <div class="content">
            <p class="greeting">Hello <b>${participant.fullName}</b>,<br>Your entrance pass has been generated. Please present the QR code below at the security gate to scan in.</p>
            
            ${customMessage ? `
            <div class="custom-msg-box">
              <div class="custom-msg-label">Message from Organizer:</div>
              <p class="custom-msg-text">${customMessage.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}

            <div class="pass-card">
              <h2 class="attendee-name">${participant.fullName}</h2>
              <div class="pass-id">${participant.passId}</div>
              
              <div class="qr-container">
                <img class="qr-image" src="cid:qrCodeImage" alt="Entrance Pass QR Code" />
              </div>
              
              <div class="instruction">${event.accessInstruction}</div>
            </div>
          </div>
          <div class="footer">
            <p>© 2026 ${event.organizerName || 'ETS N-TECH'}. All rights reserved.</p>
            <p>${event.footerNote}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Prefer explicit Mailjet SMTP credentials if provided
    const useMailjet = !!(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET);
    if (isSmtpConfigured || useMailjet) {
      try {
        const transporterOptions: any = {};

        if (useMailjet) {
          transporterOptions.host = process.env.MAILJET_SMTP_HOST || 'in-v3.mailjet.com';
          transporterOptions.port = parseInt(process.env.MAILJET_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
          transporterOptions.secure = transporterOptions.port === 465;
          transporterOptions.auth = {
            user: process.env.MAILJET_API_KEY,
            pass: process.env.MAILJET_SECRET
          };
        } else {
          transporterOptions.host = process.env.SMTP_HOST;
          transporterOptions.port = parseInt(process.env.SMTP_PORT || '587', 10);
          transporterOptions.secure = process.env.SMTP_PORT === '465';
          transporterOptions.auth = {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          };
        }

        const transporter = nodemailer.createTransport(transporterOptions);

        const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const qrBuffer = Buffer.from(base64Data, 'base64');

        const fromAddress = process.env.SMTP_FROM || process.env.MAILJET_SENDER || `"${event.organizerName || 'ETS N-TECH'}" <${(process.env.SMTP_USER || process.env.MAILJET_SENDER || 'no-reply@eventz.com')}>`;
        const sendResult = await transporter.sendMail({
          from: fromAddress,
          replyTo: fromAddress,
          to: participant.email,
          subject,
          html: htmlContent,
          attachments: [
            {
              filename: 'pass-qr.png',
              content: qrBuffer,
              cid: 'qrCodeImage'
            }
          ]
        });

        // Log transporter response for diagnostics (messageId, accepted, rejected)
        console.log('SMTP send result:', {
          messageId: sendResult?.messageId,
          accepted: sendResult?.accepted,
          rejected: sendResult?.rejected,
          response: sendResult?.response
        });

        await db.updateEmailLogStatus(logId, 'Delivered');
      } catch (err: any) {
        console.error('SMTP/Mailjet sending failed:', err);
        await db.updateEmailLogStatus(logId, 'Failed', err.message || 'SMTP delivery failed');
      }
    } else {
      // Simulate network delivery
      setTimeout(async () => {
        const isInvalid = participant.email.toLowerCase().includes('invalid') || participant.email.toLowerCase().includes('bounce') || participant.email.toLowerCase().includes('fail');
        if (isInvalid) {
          await db.updateEmailLogStatus(logId, 'Failed', 'SMTP Transport Error: Mailbox unavailable or rejected recipient address.');
        } else {
          await db.updateEmailLogStatus(logId, 'Delivered', 'Simulated (SMTP host credentials not configured in workspace)');
        }
      }, 1200 + Math.random() * 1200);
    }
  }


  // Email Pass: Send single pass to participant email
  app.post('/api/participants/:id/email', async (req, res) => {
    const { id } = req.params;
    let participant = await db.getParticipantById(id);
    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    const { customMessage, email } = req.body;

    if (email && email.trim() && email.trim() !== participant.email) {
      const updated = await db.updateParticipant(id, { email: email.trim() });
      if (updated) {
        participant = updated;
      }
    }

    if (!participant.email) {
      res.status(400).json({ error: 'Participant has no email address' });
      return;
    }

    const event = await db.getEvent();
    const subject = `Your Entrance Pass: ${event?.eventName || 'Tech Summit'}`;

    const log = await db.addEmailLog({
      eventId: 'event-1',
      participantId: participant.id,
      participantName: participant.fullName,
      recipientEmail: participant.email,
      subject,
      status: 'Sending'
    });

    // Execute sending asynchronously
    sendEventPassEmail(participant, event, log.id, customMessage).catch(console.error);

    const isSmtpConfigured = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    res.json({ success: true, log, simulated: !isSmtpConfigured });
  });

  // Email Pass: Bulk Send passes to participants
  app.post('/api/participants/bulk-email', async (req, res) => {
    const { ids, customMessage } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Array of ids is required' });
      return;
    }

    const event = await db.getEvent();
    const subject = `Your Entrance Pass: ${event?.eventName || 'Tech Summit'}`;
    const sentLogs = [];

    const isSmtpConfigured = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    for (const id of ids) {
      const participant = await db.getParticipantById(id);
      if (participant && participant.email) {
        const log = await db.addEmailLog({
          eventId: 'event-1',
          participantId: participant.id,
          participantName: participant.fullName,
          recipientEmail: participant.email,
          subject,
          status: 'Sending'
        });
        sentLogs.push(log);

        // Execute sending asynchronously
        sendEventPassEmail(participant, event, log.id, customMessage).catch(console.error);
      }
    }

    res.json({ success: true, count: sentLogs.length, logs: sentLogs, simulated: !isSmtpConfigured });
  });

  // Quick SMTP/Mailjet diagnostic endpoint
  app.post('/api/email-test', async (req, res) => {
    const { to, customMessage } = req.body || {};
    const recipient = (to && to.trim()) || req.body.email || '';
    if (!recipient) {
      res.status(400).json({ error: 'Recipient email `to` is required in request body.' });
      return;
    }

    const event = await db.getEvent();
    const participant = {
      id: 'test-participant',
      fullName: 'Test Recipient',
      email: recipient,
      passId: 'TEST-PASS-0001'
    };

    const log = await db.addEmailLog({
      eventId: 'event-1',
      participantId: participant.id,
      participantName: participant.fullName,
      recipientEmail: participant.email,
      subject: `Test: ${event?.eventName || 'Event'}`,
      status: 'Sending'
    });

    // Attempt to send and wait for result so serverless function does not exit
    try {
      await sendEventPassEmail(participant, event, log.id, customMessage);
      const logs = await db.getEmailLogs();
      const updated = logs.find(l => l.id === log.id) || log;
      res.json({ success: true, log: updated, message: 'Email send completed (or status updated).' });
    } catch (err: any) {
      console.error('Email test failed:', err);
      const logs = await db.getEmailLogs();
      const updated = logs.find(l => l.id === log.id) || log;
      res.status(500).json({ success: false, error: err?.message || 'Send failed', log: updated });
    }
  });


  // --- VITE DEV / PRODUCTION INTEGRATION ---

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      // Import Vite dynamically so production serverless functions don't
      // attempt to load build-time native dependencies (rollup, etc.).
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(appRoot, 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[ETSNTECH Server] Running at http://localhost:${PORT}`);
    });
  }
}

startServer();
