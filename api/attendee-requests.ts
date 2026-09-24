import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { db } from '../src/server/db.js';
import { isValidEmail, sendParticipantPassEmail } from '../src/server/pass-email-utils.js';

const REQUESTS_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'eventz-attendee-requests.json')
  : path.join(process.cwd(), 'eventz-attendee-requests.json');

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

type LegacyRequest = {
  id: string;
  type: 'add_attendee' | 'delete_attendee' | 'update_attendee' | 'reset_checkin';
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: { id?: string; name: string; email?: string; role?: string };
  payload: any;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted';

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function readJsonFile(file: string, fallback: any) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: any) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

function readLegacyRequests(): LegacyRequest[] {
  return readJsonFile(REQUESTS_FILE, []);
}

function readLocalDb() {
  return readJsonFile(DB_FILE, { participants: [], events: [], participantCategories: [], registrationRequests: [] });
}

function writeLocalDb(db: any) {
  writeJsonFile(DB_FILE, db);
}

function slugify(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function makePassId(count: number, eventDate?: string) {
  const year = String(eventDate || '').slice(0, 4) || new Date().getFullYear().toString();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ETSN-${year}-${String(count).padStart(4, '0')}-${suffix}`;
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value: unknown) {
  return String(value || '').trim();
}

function makeRsvpToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getRequestOrigin(req: any) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (configured) return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  const protocol = req.headers?.['x-forwarded-proto'] || 'https';
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

async function getRsvpState(token: string) {
  if (!token) throw new Error('RSVP token is required.');
  const supabase = getSupabase();

  if (supabase) {
    const { data: registration, error } = await supabase
      .from('registrationRequests')
      .select('*')
      .eq('rsvpToken', token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!registration || registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');

    const { data: participant } = registration.participantId
      ? await supabase.from('participants').select('*').eq('id', registration.participantId).maybeSingle()
      : { data: null };
    const { data: event } = await supabase.from('events').select('*').eq('id', registration.eventId || 'event-1').maybeSingle();

    return {
      registration: {
        id: registration.id,
        fullName: registration.fullName,
        categoryName: registration.categoryName,
        rsvpStatus: registration.rsvpStatus,
        rsvpUpdatedAt: registration.rsvpUpdatedAt,
        submittedAt: registration.submittedAt,
        status: registration.status
      },
      participant: participant ? {
        id: participant.id,
        passId: participant.passId,
        status: participant.status
      } : null,
      event: event ? {
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventTime: event.eventTime,
        venue: event.venue,
        organizerName: event.organizerName
      } : null
    };
  }

  const local = readLocalDb();
  const registration = (local.registrationRequests || []).find((item: any) => item.rsvpToken === token);
  if (!registration || registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');
  const participant = (local.participants || []).find((item: any) => item.id === registration.participantId) || null;
  const event = (local.events || []).find((item: any) => item.id === (registration.eventId || 'event-1')) || local.events?.[0] || null;
  return {
    registration: {
      id: registration.id,
      fullName: registration.fullName,
      categoryName: registration.categoryName,
      rsvpStatus: registration.rsvpStatus,
      rsvpUpdatedAt: registration.rsvpUpdatedAt,
      submittedAt: registration.submittedAt,
      status: registration.status
    },
    participant: participant ? { id: participant.id, passId: participant.passId, status: participant.status } : null,
    event
  };
}

async function updateRsvp(token: string, response: 'yes' | 'declined') {
  if (!['yes', 'declined'].includes(response)) throw new Error('RSVP response must be attending or declined.');
  const supabase = getSupabase();
  const now = new Date().toISOString();

  if (supabase) {
    const { data: registration, error } = await supabase
      .from('registrationRequests')
      .select('*')
      .eq('rsvpToken', token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!registration || registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');
    if (!registration.participantId) throw new Error('No participant pass is linked to this registration.');

    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('*')
      .eq('id', registration.participantId)
      .maybeSingle();
    if (participantError) throw new Error(participantError.message);
    if (!participant) throw new Error('Participant record not found.');
    if (participant.status === 'Used') throw new Error('Attendance can no longer be changed after check-in.');

    let passCancelledByRsvp = Boolean(registration.passCancelledByRsvp);

    if (response === 'declined') {
      if (participant.status === 'Not Used') {
        const { error: cancelError } = await supabase
          .from('participants')
          .update({ status: 'Cancelled', updatedAt: now })
          .eq('id', participant.id);
        if (cancelError) throw new Error(cancelError.message);
        passCancelledByRsvp = true;
      }
    } else if (response === 'yes' && passCancelledByRsvp && participant.status === 'Cancelled') {
      const { error: restoreError } = await supabase
        .from('participants')
        .update({ status: 'Not Used', updatedAt: now })
        .eq('id', participant.id);
      if (restoreError) throw new Error(restoreError.message);
      passCancelledByRsvp = false;
    }

    const updates = {
      rsvpStatus: response,
      rsvpUpdatedAt: now,
      rsvpDeclinedAt: response === 'declined' ? now : null,
      passCancelledByRsvp
    };
    const { error: updateError } = await supabase
      .from('registrationRequests')
      .update(updates)
      .eq('id', registration.id);
    if (updateError) throw new Error(updateError.message);

    return getRsvpState(token);
  }

  const local = readLocalDb();
  const index = (local.registrationRequests || []).findIndex((item: any) => item.rsvpToken === token);
  if (index === -1 || local.registrationRequests[index].status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');
  const registration = local.registrationRequests[index];
  const participantIndex = (local.participants || []).findIndex((item: any) => item.id === registration.participantId);
  if (participantIndex === -1) throw new Error('Participant record not found.');
  const participant = local.participants[participantIndex];
  if (participant.status === 'Used') throw new Error('Attendance can no longer be changed after check-in.');

  if (response === 'declined' && participant.status === 'Not Used') {
    participant.status = 'Cancelled';
    participant.updatedAt = now;
    registration.passCancelledByRsvp = true;
  } else if (response === 'yes' && registration.passCancelledByRsvp && participant.status === 'Cancelled') {
    participant.status = 'Not Used';
    participant.updatedAt = now;
    registration.passCancelledByRsvp = false;
  }
  registration.rsvpStatus = response;
  registration.rsvpUpdatedAt = now;
  registration.rsvpDeclinedAt = response === 'declined' ? now : null;
  local.registrationRequests[index] = registration;
  local.participants[participantIndex] = participant;
  writeLocalDb(local);
  return getRsvpState(token);
}

async function getCategories(publicOnly = false) {
  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from('participantCategories')
      .select('*')
      .eq('eventId', 'event-1')
      .eq('isActive', true)
      .order('name', { ascending: true });
    if (publicOnly) query = query.eq('isPublic', true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  const db = readLocalDb();
  const defaults = [
    { id: 'cat-attendees', eventId: 'event-1', name: 'Attendees', slug: 'attendees', description: 'General event participants.', color: '#0f172a', accessLevel: 'General Access', instructions: '', capacity: null, isActive: true, isPublic: true },
    { id: 'cat-volunteers', eventId: 'event-1', name: 'Volunteers', slug: 'volunteers', description: 'Event volunteers and support team.', color: '#059669', accessLevel: 'Operations Access', instructions: '', capacity: null, isActive: true, isPublic: true }
  ];
  const source = Array.isArray(db.participantCategories) && db.participantCategories.length ? db.participantCategories : defaults;
  return source.filter((c: any) => c.isActive !== false && (!publicOnly || c.isPublic !== false));
}

async function getRegistrations() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('registrationRequests')
      .select('*')
      .eq('eventId', 'event-1')
      .order('submittedAt', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
  const db = readLocalDb();
  return [...(db.registrationRequests || [])].sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

async function createRegistration(body: any) {
  const fullName = String(body.fullName || '').trim();
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const organization = String(body.organization || '').trim();
  const categoryId = String(body.categoryId || '').trim();
  const notes = String(body.notes || '').trim().slice(0, 1000);
  const rsvpStatus = body.rsvpStatus === 'maybe' ? 'maybe' : 'yes';

  if (fullName.length < 2) throw new Error('Please enter your full name.');
  if (!email && !phone) throw new Error('Enter at least an email address or phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');

  const categories = await getCategories(true);
  const category = categories.find((item: any) => item.id === categoryId);
  if (!category) throw new Error('Select an available registration category.');

  const supabase = getSupabase();
  if (supabase) {
    if (email) {
      const { data: duplicate } = await supabase
        .from('registrationRequests')
        .select('id,status')
        .eq('eventId', 'event-1')
        .ilike('email', email)
        .in('status', ['pending', 'approved', 'waitlisted'])
        .limit(1);
      if (duplicate?.length) throw new Error('A registration with this email address already exists.');
    }

    const record = {
      id: `reg-${Math.random().toString(36).slice(2, 10)}`,
      eventId: 'event-1',
      fullName,
      email,
      phone,
      organization,
      categoryId: category.id,
      categoryName: category.name,
      rsvpStatus,
      status: 'pending',
      notes,
      source: 'public_form',
      submittedAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('registrationRequests').insert(record).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  const db = readLocalDb();
  if (!db.registrationRequests) db.registrationRequests = [];
  if (email && db.registrationRequests.some((r: any) => normalizeEmail(r.email) === email && ['pending', 'approved', 'waitlisted'].includes(r.status))) {
    throw new Error('A registration with this email address already exists.');
  }
  const record = {
    id: `reg-${Math.random().toString(36).slice(2, 10)}`,
    eventId: 'event-1',
    fullName,
    email,
    phone,
    organization,
    categoryId: category.id,
    categoryName: category.name,
    rsvpStatus,
    status: 'pending',
    notes,
    source: 'public_form',
    submittedAt: new Date().toISOString()
  };
  db.registrationRequests.push(record);
  writeLocalDb(db);
  return record;
}

async function reviewRegistration(id: string, decision: RegistrationStatus, reviewedBy: string, rejectionReason: string | undefined, req: any) {
  if (!['approved', 'rejected', 'waitlisted'].includes(decision)) throw new Error('Invalid registration decision.');
  const supabase = getSupabase();
  const now = new Date().toISOString();

  if (supabase) {
    const { data: request, error: requestError } = await supabase
      .from('registrationRequests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error('Registration request not found.');
    if (request.status === 'approved') throw new Error('This registration is already approved.');

    let participant: any = null;
    let event: any = null;
    let rsvpToken = request.rsvpToken || null;

    if (decision === 'approved') {
      const { data: category } = request.categoryId
        ? await supabase.from('participantCategories').select('*').eq('id', request.categoryId).maybeSingle()
        : { data: null };

      if (category?.capacity != null) {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('eventId', 'event-1')
          .eq('category', request.categoryName);
        if ((count || 0) >= category.capacity) {
          const { data, error } = await supabase.from('registrationRequests')
            .update({ status: 'waitlisted', reviewedAt: now, reviewedBy })
            .eq('id', id).select().single();
          if (error) throw new Error(error.message);
          return { registration: data, participant: null, capacityReached: true };
        }
      }

      if (request.email) {
        const { data: existing } = await supabase
          .from('participants')
          .select('id')
          .eq('eventId', 'event-1')
          .ilike('email', request.email)
          .limit(1);
        if (existing?.length) throw new Error('A participant with this email already exists.');
      }

      const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true });
      const { data: eventData } = await supabase.from('events').select('*').eq('id', 'event-1').maybeSingle();
      event = eventData || await db.getEvent();
      participant = {
        id: `part-${Math.random().toString(36).slice(2, 9)}`,
        eventId: 'event-1',
        fullName: request.fullName,
        phone: request.phone || '',
        email: request.email || '',
        organization: request.organization || '',
        category: request.categoryName || 'Attendees',
        passId: makePassId((count || 0) + 1, event?.eventDate),
        status: 'Not Used',
        createdAt: now,
        updatedAt: now
      };
      const { error: participantError } = await supabase.from('participants').insert(participant);
      if (participantError) throw new Error(participantError.message);
      rsvpToken = rsvpToken || makeRsvpToken();
    }

    const updates: any = {
      status: decision,
      reviewedAt: now,
      reviewedBy: reviewedBy || 'Admin',
      rejectionReason: decision === 'rejected' ? String(rejectionReason || '').trim() : null
    };
    if (participant) {
      updates.participantId = participant.id;
      updates.rsvpToken = rsvpToken;
      updates.approvalEmailStatus = isValidEmail(participant.email) ? 'sending' : 'skipped';
      updates.approvalEmailError = isValidEmail(participant.email) ? null : 'No valid email address on registration.';
    }

    let { data: registration, error } = await supabase
      .from('registrationRequests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    let emailDelivery: any = null;

    if (participant && isValidEmail(participant.email)) {
      const subject = `Registration Approved: ${event?.eventName || 'Your Event'}`;
      const log = await db.addEmailLog({
        eventId: 'event-1',
        participantId: participant.id,
        participantName: participant.fullName,
        recipientEmail: normalizeEmail(participant.email),
        subject,
        status: 'Sending'
      });
      const rsvpUrl = `${getRequestOrigin(req)}/rsvp/${encodeURIComponent(rsvpToken)}`;

      try {
        emailDelivery = await sendParticipantPassEmail(
          req,
          participant,
          event,
          log.id,
          'Your registration has been approved. Your entrance pass is included below. Please use the RSVP button to confirm or update your attendance.',
          { subject, approval: true, rsvpUrl }
        );
        const { data: updatedRegistration } = await supabase
          .from('registrationRequests')
          .update({
            approvalEmailStatus: 'sent',
            approvalEmailSentAt: new Date().toISOString(),
            approvalEmailError: null
          })
          .eq('id', id)
          .select()
          .single();
        if (updatedRegistration) registration = updatedRegistration;
      } catch (mailError: any) {
        const mailMessage = mailError?.message || 'Approval email delivery failed.';
        const { data: updatedRegistration } = await supabase
          .from('registrationRequests')
          .update({
            approvalEmailStatus: 'failed',
            approvalEmailError: mailMessage
          })
          .eq('id', id)
          .select()
          .single();
        if (updatedRegistration) registration = updatedRegistration;
        emailDelivery = { error: mailMessage };
      }
    }

    return { registration, participant, emailDelivery };
  }

  const local = readLocalDb();
  if (!local.registrationRequests) local.registrationRequests = [];
  if (!local.participants) local.participants = [];
  const index = local.registrationRequests.findIndex((r: any) => r.id === id);
  if (index === -1) throw new Error('Registration request not found.');
  const request = local.registrationRequests[index];
  if (request.status === 'approved') throw new Error('This registration is already approved.');

  let participant: any = null;
  if (decision === 'approved') {
    participant = {
      id: `part-${Math.random().toString(36).slice(2, 9)}`,
      eventId: 'event-1',
      fullName: request.fullName,
      phone: request.phone || '',
      email: request.email || '',
      organization: request.organization || '',
      category: request.categoryName || 'Attendees',
      passId: makePassId(local.participants.length + 1, local.events?.[0]?.eventDate),
      status: 'Not Used',
      createdAt: now,
      updatedAt: now
    };
    local.participants.push(participant);
    request.participantId = participant.id;
    request.rsvpToken = request.rsvpToken || makeRsvpToken();
    request.approvalEmailStatus = 'not_sent';
  }
  request.status = decision;
  request.reviewedAt = now;
  request.reviewedBy = reviewedBy || 'Admin';
  request.rejectionReason = decision === 'rejected' ? String(rejectionReason || '').trim() : null;
  local.registrationRequests[index] = request;
  writeLocalDb(local);
  return { registration: request, participant };
}

async function applyLegacyRequest(reqItem: LegacyRequest) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  if (supabase && reqItem.type === 'add_attendee') {
    const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true });
    const participant = {
      id: `part-${Math.random().toString(36).slice(2, 9)}`,
      eventId: 'event-1',
      fullName: reqItem.payload.fullName || 'Unnamed Attendee',
      phone: reqItem.payload.phone || '',
      email: reqItem.payload.email || '',
      organization: reqItem.payload.organization || '',
      category: reqItem.payload.category || 'Attendees',
      passId: makePassId((count || 0) + 1),
      status: 'Not Used',
      createdAt: now,
      updatedAt: now
    };
    const { error } = await supabase.from('participants').insert(participant);
    if (error) throw new Error(error.message);
    return participant;
  }
  return true;
}

export default async function handler(req: any, res: any) {
  try {
    const mode = String(req.query?.mode || '');

    if (req.method === 'GET' && mode === 'categories') {
      res.status(200).json(await getCategories(true));
      return;
    }

    if (req.method === 'GET' && mode === 'registrations') {
      res.status(200).json(await getRegistrations());
      return;
    }

    if (req.method === 'GET' && mode === 'rsvp') {
      res.status(200).json(await getRsvpState(String(req.query?.token || '')));
      return;
    }

    if (req.method === 'POST' && req.body?.action === 'public_registration') {
      const registration = await createRegistration(req.body);
      res.status(201).json({ success: true, registration, message: 'Registration submitted for review.' });
      return;
    }

    if (req.method === 'PUT' && req.body?.kind === 'rsvp') {
      const state = await updateRsvp(String(req.body.token || ''), req.body.response);
      res.status(200).json({ success: true, ...state });
      return;
    }

    if (req.method === 'PUT' && req.body?.kind === 'registration') {
      const result = await reviewRegistration(
        String(req.body.id || ''),
        req.body.decision,
        String(req.body.reviewedBy || 'Admin'),
        req.body.rejectionReason,
        req
      );
      res.status(200).json({ success: true, ...result });
      return;
    }

    // Backward-compatible gate/admin attendee request workflow.
    if (req.method === 'GET') {
      res.status(200).json(readLegacyRequests().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const request: LegacyRequest = {
        id: `req-${Math.random().toString(36).slice(2, 9)}`,
        type: body.type,
        status: 'pending',
        requestedBy: body.requestedBy || { name: 'Gate Officer' },
        payload: body.payload || {},
        createdAt: new Date().toISOString()
      };
      if (!['add_attendee', 'delete_attendee', 'update_attendee', 'reset_checkin'].includes(request.type)) {
        res.status(400).json({ error: 'Invalid request type.' });
        return;
      }
      const requests = readLegacyRequests();
      requests.push(request);
      writeJsonFile(REQUESTS_FILE, requests);
      res.status(201).json(request);
      return;
    }

    if (req.method === 'PUT') {
      const { id, decision, reviewedBy } = req.body || {};
      const requests = readLegacyRequests();
      const index = requests.findIndex((item) => item.id === id);
      if (index === -1) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }
      if (requests[index].status !== 'pending') {
        res.status(409).json({ error: 'This request has already been reviewed.' });
        return;
      }
      if (decision === 'approved') {
        await applyLegacyRequest(requests[index]);
        requests[index].status = 'approved';
      } else if (decision === 'rejected') {
        requests[index].status = 'rejected';
      } else {
        res.status(400).json({ error: 'Decision must be approved or rejected.' });
        return;
      }
      requests[index].reviewedAt = new Date().toISOString();
      requests[index].reviewedBy = reviewedBy || 'Admin';
      writeJsonFile(REQUESTS_FILE, requests);
      res.status(200).json(requests[index]);
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const message = error?.message || 'Registration request failed.';
    const status = /already exists|already approved|valid email|full name|Select an available/.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
}