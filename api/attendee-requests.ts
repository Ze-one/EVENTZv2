import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const REQUESTS_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'eventz-attendee-requests.json')
  : path.join(process.cwd(), 'eventz-attendee-requests.json');

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

type AttendeeRequest = {
  id: string;
  type: 'add_attendee' | 'delete_attendee' | 'update_attendee' | 'reset_checkin';
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: { id?: string; name: string; email?: string; role?: string };
  payload: any;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function readRequests(): AttendeeRequest[] {
  try {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeRequests(requests: AttendeeRequest[]) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf-8');
}

function readLocalDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return { participants: [] };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return { participants: [] };
  }
}

function writeLocalDb(db: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function makePassId(count: number) {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EVTZ-2026-${String(count).padStart(4, '0')}-${suffix}`;
}

async function applyRequest(reqItem: AttendeeRequest) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  if (supabase) {
    if (reqItem.type === 'add_attendee') {
      const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true });
      const participant = {
        id: `part-${Math.random().toString(36).slice(2, 9)}`,
        eventId: 'event-1',
        fullName: reqItem.payload.fullName || 'Unnamed Attendee',
        phone: reqItem.payload.phone || '',
        email: reqItem.payload.email || '',
        organization: reqItem.payload.organization || '',
        category: reqItem.payload.category || 'Attendee',
        passId: makePassId((count || 0) + 1),
        status: 'Not Used',
        createdAt: now,
        updatedAt: now
      };
      const { error } = await supabase.from('participants').insert(participant);
      if (error) throw new Error(error.message);
      return participant;
    }

    if (reqItem.type === 'delete_attendee') {
      const { error } = await supabase.from('participants').delete().eq('id', reqItem.payload.participantId);
      if (error) throw new Error(error.message);
      return true;
    }

    if (reqItem.type === 'update_attendee' || reqItem.type === 'reset_checkin') {
      const updates = reqItem.type === 'reset_checkin'
        ? { status: 'Not Used', checkedInAt: null, checkedInBy: null, updatedAt: now }
        : { ...(reqItem.payload.updates || {}), updatedAt: now };
      const { error } = await supabase.from('participants').update(updates).eq('id', reqItem.payload.participantId);
      if (error) throw new Error(error.message);
      return true;
    }
  }

  const db = readLocalDb();
  if (!db.participants) db.participants = [];

  if (reqItem.type === 'add_attendee') {
    const participant = {
      id: `part-${Math.random().toString(36).slice(2, 9)}`,
      eventId: 'event-1',
      fullName: reqItem.payload.fullName || 'Unnamed Attendee',
      phone: reqItem.payload.phone || '',
      email: reqItem.payload.email || '',
      organization: reqItem.payload.organization || '',
      category: reqItem.payload.category || 'Attendee',
      passId: makePassId(db.participants.length + 1),
      status: 'Not Used',
      createdAt: now,
      updatedAt: now
    };
    db.participants.push(participant);
    writeLocalDb(db);
    return participant;
  }

  const index = db.participants.findIndex((p: any) => p.id === reqItem.payload.participantId);
  if (index === -1) throw new Error('Participant not found.');

  if (reqItem.type === 'delete_attendee') {
    db.participants.splice(index, 1);
  } else if (reqItem.type === 'reset_checkin') {
    db.participants[index] = { ...db.participants[index], status: 'Not Used', checkedInAt: undefined, checkedInBy: undefined, updatedAt: now };
  } else if (reqItem.type === 'update_attendee') {
    db.participants[index] = { ...db.participants[index], ...(reqItem.payload.updates || {}), updatedAt: now };
  }

  writeLocalDb(db);
  return true;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      res.status(200).json(readRequests().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const request: AttendeeRequest = {
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
      const requests = readRequests();
      requests.push(request);
      writeRequests(requests);
      res.status(201).json(request);
      return;
    }

    if (req.method === 'PUT') {
      const { id, decision, reviewedBy } = req.body || {};
      const requests = readRequests();
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
        await applyRequest(requests[index]);
        requests[index].status = 'approved';
      } else if (decision === 'rejected') {
        requests[index].status = 'rejected';
      } else {
        res.status(400).json({ error: 'Decision must be approved or rejected.' });
        return;
      }
      requests[index].reviewedAt = new Date().toISOString();
      requests[index].reviewedBy = reviewedBy || 'Admin';
      writeRequests(requests);
      res.status(200).json(requests[index]);
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Attendee request failed.' });
  }
}
