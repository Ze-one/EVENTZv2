import { db } from '../src/server/db.js';
import { getEmailProviderStatus, isValidEmail, normalizeEmail, sendParticipantPassEmail } from './pass-email-utils.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { ids, customMessage } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'Array of participant ids is required.' });
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
  const results: any[] = [];

  for (const id of ids) {
    const participant = await db.getParticipantById(String(id));
    if (!participant) {
      results.push({ id, success: false, error: 'Participant not found' });
      continue;
    }

    if (!isValidEmail(participant.email)) {
      results.push({ id, participantName: participant.fullName, success: false, error: 'Participant has no valid email address' });
      continue;
    }

    const log = await db.addEmailLog({
      eventId: 'event-1',
      participantId: participant.id,
      participantName: participant.fullName,
      recipientEmail: normalizeEmail(participant.email),
      subject,
      status: 'Sending'
    });

    try {
      const delivery = await sendParticipantPassEmail(req, participant, event, log.id, customMessage);
      results.push({ id, participantName: participant.fullName, email: participant.email, success: true, delivery, logId: log.id });
    } catch (error: any) {
      results.push({ id, participantName: participant.fullName, email: participant.email, success: false, error: error?.message || 'Delivery failed', logId: log.id });
    }
  }

  const deliveredCount = results.filter((item) => item.success).length;
  const failedCount = results.length - deliveredCount;

  res.status(failedCount > 0 && deliveredCount === 0 ? 500 : 200).json({
    success: deliveredCount > 0,
    delivered: deliveredCount,
    failed: failedCount,
    total: results.length,
    simulated: false,
    results
  });
}
