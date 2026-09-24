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
    const { data: registration, error: registrationError } = await supabase
      .from('registrationRequests')
      .select('*')
      .eq('rsvpToken', token)
      .maybeSingle();
    if (registrationError) throw new Error(registrationError.message);
    if (registration && registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');

    let { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('*')
      .eq('rsvpToken', token)
      .maybeSingle();
    if (participantError) throw new Error(participantError.message);

    if (!participant && registration?.participantId) {
      const lookup = await supabase.from('participants').select('*').eq('id', registration.participantId).maybeSingle();
      if (lookup.error) throw new Error(lookup.error.message);
      participant = lookup.data;
    }

    if (!participant) throw new Error('This RSVP link is invalid or no longer active.');

    const eventId = registration?.eventId || participant.eventId || 'event-1';
    const { data: event } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();

    return {
      registration: registration ? {
        id: registration.id,
        fullName: registration.fullName,
        categoryName: registration.categoryName,
        rsvpStatus: participant.rsvpStatus || registration.rsvpStatus || 'pending',
        rsvpUpdatedAt: participant.rsvpUpdatedAt || registration.rsvpUpdatedAt,
        submittedAt: registration.submittedAt,
        status: registration.status
      } : {
        id: participant.id,
        fullName: participant.fullName,
        categoryName: participant.category || 'Attendee',
        rsvpStatus: participant.rsvpStatus || 'pending',
        rsvpUpdatedAt: participant.rsvpUpdatedAt,
        submittedAt: participant.createdAt,
        status: 'approved'
      },
      participant: {
        id: participant.id,
        passId: participant.passId,
        status: participant.status
      },
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
  const registration = (local.registrationRequests || []).find((item: any) => item.rsvpToken === token) || null;
  if (registration && registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');

  let participant = (local.participants || []).find((item: any) => item.rsvpToken === token) || null;
  if (!participant && registration?.participantId) {
    participant = (local.participants || []).find((item: any) => item.id === registration.participantId) || null;
  }
  if (!participant) throw new Error('This RSVP link is invalid or no longer active.');

  const eventId = registration?.eventId || participant.eventId || 'event-1';
  const event = (local.events || []).find((item: any) => item.id === eventId) || local.events?.[0] || null;

  return {
    registration: registration ? {
      id: registration.id,
      fullName: registration.fullName,
      categoryName: registration.categoryName,
      rsvpStatus: participant.rsvpStatus || registration.rsvpStatus || 'pending',
      rsvpUpdatedAt: participant.rsvpUpdatedAt || registration.rsvpUpdatedAt,
      submittedAt: registration.submittedAt,
      status: registration.status
    } : {
      id: participant.id,
      fullName: participant.fullName,
      categoryName: participant.category || 'Attendee',
      rsvpStatus: participant.rsvpStatus || 'pending',
      rsvpUpdatedAt: participant.rsvpUpdatedAt,
      submittedAt: participant.createdAt,
      status: 'approved'
    },
    participant: { id: participant.id, passId: participant.passId, status: participant.status },
    event
  };
}

async function updateRsvp(token: string, response: 'yes' | 'declined') {
  if (!['yes', 'declined'].includes(response)) throw new Error('RSVP response must be attending or declined.');
  const supabase = getSupabase();
  const now = new Date().toISOString();

  if (supabase) {
    const { data: registration, error: registrationError } = await supabase
      .from('registrationRequests')
      .select('*')
      .eq('rsvpToken', token)
      .maybeSingle();
    if (registrationError) throw new Error(registrationError.message);
    if (registration && registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');

    let { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('*')
      .eq('rsvpToken', token)
      .maybeSingle();
    if (participantError) throw new Error(participantError.message);

    if (!participant && registration?.participantId) {
      const lookup = await supabase.from('participants').select('*').eq('id', registration.participantId).maybeSingle();
      if (lookup.error) throw new Error(lookup.error.message);
      participant = lookup.data;
    }

    if (!participant) throw new Error('Participant record not found.');
    if (participant.status === 'Used') throw new Error('Attendance can no longer be changed after check-in.');

    let passCancelledByRsvp = Boolean(participant.passCancelledByRsvp || registration?.passCancelledByRsvp);
    let nextPassStatus = participant.status;

    if (response === 'declined' && participant.status === 'Not Used') {
      nextPassStatus = 'Cancelled';
      passCancelledByRsvp = true;
    } else if (response === 'yes' && passCancelledByRsvp && participant.status === 'Cancelled') {
      nextPassStatus = 'Not Used';
      passCancelledByRsvp = false;
    }

    const { error: participantUpdateError } = await supabase
      .from('participants')
      .update({
        status: nextPassStatus,
        rsvpStatus: response,
        rsvpUpdatedAt: now,
        rsvpDeclinedAt: response === 'declined' ? now : null,
        passCancelledByRsvp,
        updatedAt: now
      })
      .eq('id', participant.id);
    if (participantUpdateError) throw new Error(participantUpdateError.message);

    if (registration) {
      const { error: registrationUpdateError } = await supabase
        .from('registrationRequests')
        .update({
          rsvpStatus: response,
          rsvpUpdatedAt: now,
          rsvpDeclinedAt: response === 'declined' ? now : null,
          passCancelledByRsvp
        })
        .eq('id', registration.id);
      if (registrationUpdateError) throw new Error(registrationUpdateError.message);
    }

    return getRsvpState(token);
  }

  const local = readLocalDb();
  const registrationIndex = (local.registrationRequests || []).findIndex((item: any) => item.rsvpToken === token);
  const registration = registrationIndex >= 0 ? local.registrationRequests[registrationIndex] : null;
  if (registration && registration.status !== 'approved') throw new Error('This RSVP link is invalid or no longer active.');

  let participantIndex = (local.participants || []).findIndex((item: any) => item.rsvpToken === token);
  if (participantIndex === -1 && registration?.participantId) {
    participantIndex = (local.participants || []).findIndex((item: any) => item.id === registration.participantId);
  }
  if (participantIndex === -1) throw new Error('Participant record not found.');

  const participant = local.participants[participantIndex];
  if (participant.status === 'Used') throw new Error('Attendance can no longer be changed after check-in.');

  let passCancelledByRsvp = Boolean(participant.passCancelledByRsvp || registration?.passCancelledByRsvp);
  if (response === 'declined' && participant.status === 'Not Used') {
    participant.status = 'Cancelled';
    passCancelledByRsvp = true;
  } else if (response === 'yes' && passCancelledByRsvp && participant.status === 'Cancelled') {
    participant.status = 'Not Used';
    passCancelledByRsvp = false;
  }

  participant.rsvpStatus = response;
  participant.rsvpUpdatedAt = now;
  participant.rsvpDeclinedAt = response === 'declined' ? now : null;
  participant.passCancelledByRsvp = passCancelledByRsvp;
  participant.updatedAt = now;
  local.participants[participantIndex] = participant;

  if (registration) {
    registration.rsvpStatus = response;
    registration.rsvpUpdatedAt = now;
    registration.rsvpDeclinedAt = response === 'declined' ? now : null;
    registration.passCancelledByRsvp = passCancelledByRsvp;
    local.registrationRequests[registrationIndex] = registration;
  }

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
      .order('name', { ascending: true });
    if (publicOnly) query = query.eq('isActive', true).eq('isPublic', true);
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
  return publicOnly ? source.filter((item: any) => item.isActive !== false && item.isPublic !== false) : source;
}


async function getEventRegistrationSettings() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', 'event-1')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data || {};
  }
  const local = readLocalDb();
  return local.events?.find((item: any) => item.id === 'event-1') || local.events?.[0] || {};
}

async function countActiveParticipants(categoryName?: string) {
  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('eventId', 'event-1')
      .neq('status', 'Cancelled');
    if (categoryName) query = query.eq('category', categoryName);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count || 0;
  }

  const local = readLocalDb();
  return (local.participants || []).filter((item: any) =>
    item.eventId === 'event-1' &&
    item.status !== 'Cancelled' &&
    (!categoryName || item.category === categoryName)
  ).length;
}

async function getInvitationByToken(token: string) {
  if (!token) return null;
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('registrationInvitations')
      .select('*')
      .eq('eventId', 'event-1')
      .eq('token', token)
      .eq('isActive', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) return null;
    if ((data.usesCount || 0) >= (data.maxUses || 1)) return null;
    return data;
  }

  const local = readLocalDb();
  const invitation = (local.registrationInvitations || []).find((item: any) =>
    item.eventId === 'event-1' &&
    item.token === token &&
    item.isActive !== false
  );
  if (!invitation) return null;
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) return null;
  if ((invitation.usesCount || 0) >= (invitation.maxUses || 1)) return null;
  return invitation;
}

function normalizeCustomAnswers(fields: any[], answers: any) {
  const output: Record<string, any> = {};
  for (const field of Array.isArray(fields) ? fields : []) {
    const id = String(field?.id || '').trim();
    if (!id) continue;
    const raw = answers?.[id];
    const value = field?.type === 'checkbox' ? Boolean(raw) : String(raw ?? '').trim();
    if (field?.required && (field?.type === 'checkbox' ? value !== true : !value)) {
      throw new Error(`${field.label || 'A required field'} is required.`);
    }
    if (field?.type === 'select' && value && Array.isArray(field.options) && !field.options.includes(value)) {
      throw new Error(`Invalid value for ${field.label || 'custom field'}.`);
    }
    output[id] = value;
  }
  return output;
}

async function getRegistrationAvailability(category: any, requestedSlots: number) {
  const event = await getEventRegistrationSettings();
  const activeEventParticipants = await countActiveParticipants();
  const activeCategoryParticipants = category?.name ? await countActiveParticipants(category.name) : 0;

  const eventRemaining = event?.eventCapacity == null
    ? null
    : Math.max(0, Number(event.eventCapacity) - activeEventParticipants);

  const categoryRemaining = category?.capacity == null
    ? null
    : Math.max(0, Number(category.capacity) - activeCategoryParticipants);

  const eventHasSpace = eventRemaining == null || eventRemaining >= requestedSlots;
  const categoryHasSpace = categoryRemaining == null || categoryRemaining >= requestedSlots;

  return {
    event,
    eventRemaining,
    categoryRemaining,
    hasSpace: eventHasSpace && categoryHasSpace
  };
}

async function getRegistrationConfig(inviteToken = '') {
  const event = await getEventRegistrationSettings();
  const invitation = inviteToken ? await getInvitationByToken(inviteToken) : null;
  const deadlinePassed = Boolean(event?.registrationDeadline && new Date(event.registrationDeadline).getTime() < Date.now());
  const invitationRequired = event?.registrationMode === 'invitation_only';
  const invitationValid = invitationRequired ? Boolean(invitation) : true;

  const categories = invitation?.categoryId ? await getCategories(false) : await getCategories(true);
  const allowedCategories = invitation?.categoryId
    ? categories.filter((item: any) => item.id === invitation.categoryId && item.isActive !== false)
    : categories;

  return {
    registrationEnabled: event?.registrationEnabled !== false,
    registrationMode: event?.registrationMode || 'public',
    registrationDeadline: event?.registrationDeadline || null,
    eventCapacity: event?.eventCapacity ?? null,
    waitlistEnabled: event?.waitlistEnabled !== false,
    allowGuests: Boolean(event?.allowGuests),
    maxGuestsPerRegistration: Number(event?.maxGuestsPerRegistration ?? 1),
    customRegistrationFields: Array.isArray(event?.customRegistrationFields) ? event.customRegistrationFields : [],
    deadlinePassed,
    invitationRequired,
    invitationValid,
    invitationLabel: invitation?.label || null,
    invitationCategoryId: invitation?.categoryId || null,
    categories: allowedCategories
  };
}

async function getInvitations() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('registrationInvitations')
      .select('*')
      .eq('eventId', 'event-1')
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
  const local = readLocalDb();
  return [...(local.registrationInvitations || [])].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function createInvitation(body: any) {
  const token = crypto.randomBytes(12).toString('hex');
  const record = {
    id: `inv-${Math.random().toString(36).slice(2, 10)}`,
    eventId: 'event-1',
    token,
    label: String(body.label || 'Private invitation').trim().slice(0, 120),
    categoryId: body.categoryId || null,
    maxUses: Math.max(1, Math.min(500, Number(body.maxUses || 1))),
    usesCount: 0,
    expiresAt: body.expiresAt || null,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('registrationInvitations').insert(record).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  const local = readLocalDb();
  if (!local.registrationInvitations) local.registrationInvitations = [];
  local.registrationInvitations.push(record);
  writeLocalDb(local);
  return record;
}

async function deleteInvitation(id: string) {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('registrationInvitations').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }
  const local = readLocalDb();
  const before = (local.registrationInvitations || []).length;
  local.registrationInvitations = (local.registrationInvitations || []).filter((item: any) => item.id !== id);
  writeLocalDb(local);
  return local.registrationInvitations.length < before;
}

async function updateCategoryControl(body: any) {
  const id = String(body.id || '');
  if (!id) throw new Error('Category id is required.');
  const updates: any = {};
  if ('capacity' in body) updates.capacity = body.capacity === '' || body.capacity == null ? null : Math.max(0, Number(body.capacity));
  if ('isPublic' in body) updates.isPublic = Boolean(body.isPublic);
  if ('isActive' in body) updates.isActive = Boolean(body.isActive);

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('participantCategories')
      .update({ ...updates, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const local = readLocalDb();
  const index = (local.participantCategories || []).findIndex((item: any) => item.id === id);
  if (index === -1) throw new Error('Category not found.');
  local.participantCategories[index] = { ...local.participantCategories[index], ...updates, updatedAt: new Date().toISOString() };
  writeLocalDb(local);
  return local.participantCategories[index];
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

async function clearRegistrations() {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('registrationRequests')
      .delete()
      .eq('eventId', 'event-1')
      .select('id');
    if (error) throw new Error(error.message);
    return { cleared: data?.length || 0 };
  }

  const local = readLocalDb();
  const before = (local.registrationRequests || []).length;
  local.registrationRequests = [];
  writeLocalDb(local);
  return { cleared: before };
}

async function createRegistration(body: any) {
  const fullName = String(body.fullName || '').trim();
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const organization = String(body.organization || '').trim();
  const categoryId = String(body.categoryId || '').trim();
  const notes = String(body.notes || '').trim().slice(0, 1000);
  const rsvpStatus = body.rsvpStatus === 'maybe' ? 'maybe' : 'yes';
  const inviteToken = String(body.inviteToken || '').trim();

  if (fullName.length < 2) throw new Error('Please enter your full name.');
  if (!email && !phone) throw new Error('Enter at least an email address or phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');

  const event = await getEventRegistrationSettings();
  if (event?.registrationEnabled === false) throw new Error('Public registration is currently closed for this event.');
  if (event?.registrationDeadline && new Date(event.registrationDeadline).getTime() < Date.now()) {
    throw new Error('The registration deadline for this event has passed.');
  }

  const invitation = inviteToken ? await getInvitationByToken(inviteToken) : null;
  if (event?.registrationMode === 'invitation_only' && !invitation) {
    throw new Error('A valid invitation link is required to register for this event.');
  }

  const categories = invitation?.categoryId ? await getCategories(false) : await getCategories(true);
  const category = categories.find((item: any) => item.id === categoryId && item.isActive !== false && (invitation?.categoryId ? true : item.isPublic !== false));
  if (!category) throw new Error('Select an available registration category.');
  if (invitation?.categoryId && invitation.categoryId !== category.id) {
    throw new Error('This invitation is restricted to a different participant category.');
  }

  const guestLimit = event?.allowGuests ? Math.max(0, Math.min(10, Number(event.maxGuestsPerRegistration ?? 1))) : 0;
  const rawGuests = Array.isArray(body.guests) ? body.guests.slice(0, guestLimit) : [];
  const guests = rawGuests
    .map((guest: any) => ({
      fullName: String(guest?.fullName || '').trim(),
      email: normalizeEmail(guest?.email),
      phone: normalizePhone(guest?.phone)
    }))
    .filter((guest: any) => guest.fullName);

  if (!event?.allowGuests && rawGuests.length) throw new Error('Guest registration is not enabled for this event.');
  if (guests.length > guestLimit) throw new Error(`A maximum of ${guestLimit} guest(s) is allowed.`);
  for (const guest of guests) {
    if (guest.fullName.length < 2) throw new Error('Each guest must have a valid full name.');
    if (guest.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) throw new Error(`Enter a valid email address for ${guest.fullName}.`);
  }

  const customFields = Array.isArray(event?.customRegistrationFields) ? event.customRegistrationFields : [];
  const customAnswers = normalizeCustomAnswers(customFields, body.customAnswers || {});
  const requestedSlots = 1 + guests.length;
  const availability = await getRegistrationAvailability(category, requestedSlots);
  const waitlistEnabled = event?.waitlistEnabled !== false;

  if (!availability.hasSpace && !waitlistEnabled) {
    throw new Error('This event or participant category has reached capacity.');
  }

  const initialStatus: RegistrationStatus = availability.hasSpace ? 'pending' : 'waitlisted';

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
      status: initialStatus,
      notes,
      source: invitation ? 'invitation' : 'public_form',
      guests,
      customAnswers,
      invitationId: invitation?.id || null,
      requestedSlots,
      submittedAt: new Date().toISOString()
    };
    const { data, error } = await supabase.from('registrationRequests').insert(record).select().single();
    if (error) throw new Error(error.message);

    if (invitation) {
      const { error: inviteError } = await supabase
        .from('registrationInvitations')
        .update({ usesCount: Number(invitation.usesCount || 0) + 1 })
        .eq('id', invitation.id);
      if (inviteError) throw new Error(inviteError.message);
    }

    return data;
  }

  const local = readLocalDb();
  if (!local.registrationRequests) local.registrationRequests = [];
  if (email && local.registrationRequests.some((r: any) => normalizeEmail(r.email) === email && ['pending', 'approved', 'waitlisted'].includes(r.status))) {
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
    status: initialStatus,
    notes,
    source: invitation ? 'invitation' : 'public_form',
    guests,
    customAnswers,
    invitationId: invitation?.id || null,
    requestedSlots,
    submittedAt: new Date().toISOString()
  };
  local.registrationRequests.push(record);

  if (invitation) {
    if (!local.registrationInvitations) local.registrationInvitations = [];
    const inviteIndex = local.registrationInvitations.findIndex((item: any) => item.id === invitation.id);
    if (inviteIndex >= 0) local.registrationInvitations[inviteIndex].usesCount = Number(invitation.usesCount || 0) + 1;
  }

  writeLocalDb(local);
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
    let guestParticipants: any[] = [];
    let event: any = null;
    let rsvpToken = request.rsvpToken || null;

    if (decision === 'approved') {
      const { data: category } = request.categoryId
        ? await supabase.from('participantCategories').select('*').eq('id', request.categoryId).maybeSingle()
        : { data: null };

      const requestedSlots = Math.max(1, Number(request.requestedSlots || 1));
      const availability = await getRegistrationAvailability(category || { name: request.categoryName }, requestedSlots);

      if (!availability.hasSpace) {
        const { data, error } = await supabase.from('registrationRequests')
          .update({ status: 'waitlisted', reviewedAt: now, reviewedBy })
          .eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return {
          registration: data,
          participant: null,
          guestParticipants: [],
          capacityReached: true,
          capacity: {
            eventRemaining: availability.eventRemaining,
            categoryRemaining: availability.categoryRemaining,
            requestedSlots
          }
        };
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
      rsvpToken = rsvpToken || makeRsvpToken();

      let sequence = count || 0;
      sequence += 1;
      participant = {
        id: `part-${Math.random().toString(36).slice(2, 9)}`,
        eventId: 'event-1',
        fullName: request.fullName,
        phone: request.phone || '',
        email: request.email || '',
        organization: request.organization || '',
        category: request.categoryName || 'Attendees',
        passId: makePassId(sequence, event?.eventDate),
        status: 'Not Used',
        rsvpToken,
        rsvpStatus: request.rsvpStatus || 'yes',
        passCancelledByRsvp: false,
        registrationId: request.id,
        isGuest: false,
        guestOfParticipantId: null,
        createdAt: now,
        updatedAt: now
      };

      const guests = Array.isArray(request.guests) ? request.guests : [];
      guestParticipants = guests.map((guest: any) => {
        sequence += 1;
        return {
          id: `part-${Math.random().toString(36).slice(2, 9)}`,
          eventId: 'event-1',
          fullName: String(guest.fullName || 'Guest').trim(),
          phone: guest.phone || '',
          email: guest.email || '',
          organization: request.organization || '',
          category: request.categoryName || 'Attendees',
          passId: makePassId(sequence, event?.eventDate),
          status: 'Not Used',
          rsvpToken: makeRsvpToken(),
          rsvpStatus: 'pending',
          passCancelledByRsvp: false,
          registrationId: request.id,
          isGuest: true,
          guestOfParticipantId: participant.id,
          createdAt: now,
          updatedAt: now
        };
      });

      const { error: participantError } = await supabase
        .from('participants')
        .insert([participant, ...guestParticipants]);
      if (participantError) throw new Error(participantError.message);
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
    const guestEmailDeliveries: any[] = [];

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
          guestParticipants.length
            ? `Your registration has been approved together with ${guestParticipants.length} guest pass(es). Your own entrance pass is included below. Guest passes are issued separately.`
            : 'Your registration has been approved. Your entrance pass is included below. Please use the RSVP button to confirm or update your attendance.',
          { subject, approval: true, rsvpUrl }
        );
        const { data: updatedRegistration } = await supabase
          .from('registrationRequests')
          .update({
            approvalEmailStatus: 'queued',
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

    for (const guest of guestParticipants) {
      if (!isValidEmail(guest.email)) continue;
      const subject = `Your Guest Pass: ${event?.eventName || 'Your Event'}`;
      const log = await db.addEmailLog({
        eventId: 'event-1',
        participantId: guest.id,
        participantName: guest.fullName,
        recipientEmail: normalizeEmail(guest.email),
        subject,
        status: 'Sending'
      });
      try {
        const delivery = await sendParticipantPassEmail(
          req,
          guest,
          event,
          log.id,
          'You have been registered as a guest for this event. Your individual entrance pass is included below.',
          {
            subject,
            approval: true,
            rsvpUrl: `${getRequestOrigin(req)}/rsvp/${encodeURIComponent(guest.rsvpToken)}`
          }
        );
        guestEmailDeliveries.push({ participantId: guest.id, status: 'queued', delivery });
      } catch (guestMailError: any) {
        guestEmailDeliveries.push({ participantId: guest.id, status: 'failed', error: guestMailError?.message || 'Guest pass email failed.' });
      }
    }

    return { registration, participant, guestParticipants, emailDelivery, guestEmailDeliveries };
  }

  const local = readLocalDb();
  if (!local.registrationRequests) local.registrationRequests = [];
  if (!local.participants) local.participants = [];
  const index = local.registrationRequests.findIndex((r: any) => r.id === id);
  if (index === -1) throw new Error('Registration request not found.');
  const request = local.registrationRequests[index];
  if (request.status === 'approved') throw new Error('This registration is already approved.');

  let participant: any = null;
  let guestParticipants: any[] = [];
  if (decision === 'approved') {
    const category = (local.participantCategories || []).find((item: any) => item.id === request.categoryId) || { name: request.categoryName };
    const requestedSlots = Math.max(1, Number(request.requestedSlots || 1));
    const availability = await getRegistrationAvailability(category, requestedSlots);
    if (!availability.hasSpace) {
      request.status = 'waitlisted';
      request.reviewedAt = now;
      request.reviewedBy = reviewedBy || 'Admin';
      local.registrationRequests[index] = request;
      writeLocalDb(local);
      return { registration: request, participant: null, guestParticipants: [], capacityReached: true };
    }

    let sequence = local.participants.length;
    sequence += 1;
    participant = {
      id: `part-${Math.random().toString(36).slice(2, 9)}`,
      eventId: 'event-1',
      fullName: request.fullName,
      phone: request.phone || '',
      email: request.email || '',
      organization: request.organization || '',
      category: request.categoryName || 'Attendees',
      passId: makePassId(sequence, local.events?.[0]?.eventDate),
      status: 'Not Used',
      rsvpToken: request.rsvpToken || makeRsvpToken(),
      rsvpStatus: request.rsvpStatus || 'yes',
      passCancelledByRsvp: false,
      registrationId: request.id,
      isGuest: false,
      createdAt: now,
      updatedAt: now
    };
    local.participants.push(participant);

    const guests = Array.isArray(request.guests) ? request.guests : [];
    guestParticipants = guests.map((guest: any) => {
      sequence += 1;
      return {
        id: `part-${Math.random().toString(36).slice(2, 9)}`,
        eventId: 'event-1',
        fullName: guest.fullName || 'Guest',
        phone: guest.phone || '',
        email: guest.email || '',
        organization: request.organization || '',
        category: request.categoryName || 'Attendees',
        passId: makePassId(sequence, local.events?.[0]?.eventDate),
        status: 'Not Used',
        rsvpToken: makeRsvpToken(),
        rsvpStatus: 'pending',
        passCancelledByRsvp: false,
        registrationId: request.id,
        isGuest: true,
        guestOfParticipantId: participant.id,
        createdAt: now,
        updatedAt: now
      };
    });
    local.participants.push(...guestParticipants);
    request.participantId = participant.id;
    request.rsvpToken = participant.rsvpToken;
    request.approvalEmailStatus = 'not_sent';
  }

  request.status = decision;
  request.reviewedAt = now;
  request.reviewedBy = reviewedBy || 'Admin';
  request.rejectionReason = decision === 'rejected' ? String(rejectionReason || '').trim() : null;
  local.registrationRequests[index] = request;
  writeLocalDb(local);
  return { registration: request, participant, guestParticipants };
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
      rsvpToken: makeRsvpToken(),
      rsvpStatus: 'pending',
      passCancelledByRsvp: false,
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

    if (req.method === 'GET' && mode === 'categories-admin') {
      res.status(200).json(await getCategories(false));
      return;
    }

    if (req.method === 'GET' && mode === 'registration-config') {
      res.status(200).json(await getRegistrationConfig(String(req.query?.invite || '')));
      return;
    }

    if (req.method === 'GET' && mode === 'invitations') {
      res.status(200).json(await getInvitations());
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

    if (req.method === 'DELETE' && mode === 'registrations') {
      const result = await clearRegistrations();
      res.status(200).json({
        success: true,
        ...result,
        message: 'Registration request history cleared. Existing participant passes were preserved.'
      });
      return;
    }

    if (req.method === 'DELETE' && mode === 'invitation') {
      const deleted = await deleteInvitation(String(req.query?.id || ''));
      res.status(deleted ? 200 : 404).json({ success: deleted });
      return;
    }

    if (req.method === 'POST' && req.body?.action === 'public_registration') {
      const registration = await createRegistration(req.body);
      res.status(201).json({ success: true, registration, message: 'Registration submitted for review.' });
      return;
    }

    if (req.method === 'POST' && req.body?.action === 'create_invitation') {
      const invitation = await createInvitation(req.body);
      res.status(201).json({ success: true, invitation });
      return;
    }

    if (req.method === 'PUT' && req.body?.kind === 'rsvp') {
      const state = await updateRsvp(String(req.body.token || ''), req.body.response);
      res.status(200).json({ success: true, ...state });
      return;
    }

    if (req.method === 'PUT' && req.body?.kind === 'category') {
      const category = await updateCategoryControl(req.body);
      res.status(200).json({ success: true, category });
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

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const message = error?.message || 'Registration request failed.';
    const status = /already exists|already approved|valid email|full name|Select an available/.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
}