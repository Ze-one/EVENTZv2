import { db } from '../src/server/db.js';
import { getEmailProviderStatus, isValidEmail, normalizeEmail, sendParticipantPassEmail } from '../src/server/pass-email-utils.js';

function getParticipantId(req: any): string {
  const queryId = req.query?.id;
  if (Array.isArray(queryId)) return queryId[0];
  if (queryId) return String(queryId);

  const match = String(req.url || '').match(/\/api\/participants\/([^/]+)\/email/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = getParticipantId(req);
  if (!id) {
    res.status(400).json({ error: 'Participant id is required.' });
    return;
  }

  let participant = await db.getParticipantById(id);
  if (!participant) {
    res.status(404).json({ error: 'Participant not found' });
    return;
  }

  const { email, customMessage } = req.body || {};
  const submittedEmail = normalizeEmail(email);

  if (submittedEmail && submittedEmail !== normalizeEmail(participant.email)) {
    if (!isValidEmail(submittedEmail)) {
      res.status(400).json({ error: 'The email address entered is not valid.' });
      return;
    }

    const updated = await db.updateParticipant(id, { email: submittedEmail });
    if (updated) participant = updated;
  }

  if (!isValidEmail(participant.email)) {
    res.status(400).json({ error: 'Participant has no valid email address. Add a valid email before sending the pass.' });
    return;
  }

  const providerStatus = getEmailProviderStatus();
  if (!providerStatus.sendGrid && !providerStatus.smtp) {
    res.status(500).json({
      error: 'No real email provider configured. Add SENDGRID_API_KEY and SENDGRID_FROM in Vercel, or configure SMTP variables.',
      providerStatus
    });
    return;
  }

  if (!providerStatus.sender) {
    res.status(500).json({
      error: 'No sender address configured. Add SENDGRID_FROM or SMTP_FROM in Vercel using a verified sender email.',
      providerStatus
    });
    return;
  }

  const event = await db.getEvent();
  const subject = `Your Entrance Pass: ${event?.eventName || 'Event'}`;
  const log = await db.addEmailLog({ eventId: 'event-1', participantId: participant.id, participantName: participant.fullName, recipientEmail: normalizeEmail(participant.email), subject, status: 'Sending' });

  try {
    const delivery = await sendParticipantPassEmail(req, participant, event, log.id, customMessage);
    const logs = await db.getEmailLogs();
    const updatedLog = logs.find((entry) => entry.id === log.id) || log;
    res.status(200).json({ success: true, delivered: true, simulated: false, delivery, log: updatedLog });
  } catch (error: any) {
    const logs = await db.getEmailLogs();
    const updatedLog = logs.find((entry) => entry.id === log.id) || log;
    res.status(500).json({ success: false, delivered: false, error: error?.message || 'Pass email delivery failed.', log: updatedLog });
  }
}
