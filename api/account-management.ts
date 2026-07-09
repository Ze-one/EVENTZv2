import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { UserRole } from '../src/types.js';

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function safeUser(user: any) {
  if (!user) return user;
  const { passwordHash, ...rest } = user;
  if (!rest.avatarUrl && rest.profileImage) rest.avatarUrl = rest.profileImage;
  if (!rest.profileImage && rest.avatarUrl) rest.profileImage = rest.avatarUrl;
  return rest;
}

function normalizeProfileImage(value: unknown): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 900_000) throw new Error('Profile picture is too large. Use an image below 900 KB.');
  if (!raw.startsWith('data:image/') && !raw.startsWith('http')) throw new Error('Profile picture must be an image URL or a valid uploaded image data URL.');
  return raw;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function readLocalDb() {
  const fallback = { users: [], events: [], participants: [], scanLogs: [], emailLogs: [] };
  try {
    if (!fs.existsSync(DB_FILE)) return fallback;
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch { return fallback; }
}

function writeLocalDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function getUsers() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').order('createdAt', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(safeUser);
  }
  return (readLocalDb().users || []).map(safeUser);
}

async function updateUser(id: string, updates: any) {
  const cleaned: any = {};
  if (updates.name) cleaned.name = String(updates.name).trim();
  if (updates.email) cleaned.email = String(updates.email).trim().toLowerCase();
  if (updates.password) cleaned.passwordHash = hashPassword(String(updates.password));
  if (Object.prototype.hasOwnProperty.call(updates, 'profileImage') || Object.prototype.hasOwnProperty.call(updates, 'avatarUrl') || Object.prototype.hasOwnProperty.call(updates, 'photoUrl')) {
    const profileImage = normalizeProfileImage(updates.profileImage || updates.avatarUrl || updates.photoUrl || '');
    cleaned.profileImage = profileImage;
  }

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('users').update(cleaned).eq('id', id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return safeUser(data);
  }

  const db = readLocalDb();
  const index = (db.users || []).findIndex((u: any) => u.id === id);
  if (index === -1) return null;
  db.users[index] = { ...db.users[index], ...cleaned, avatarUrl: cleaned.profileImage ?? db.users[index].avatarUrl };
  writeLocalDb(db);
  return safeUser(db.users[index]);
}

async function createGateOfficer(input: any) {
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '').trim();
  if (!name || !email || !password) throw new Error('Name, email and password are required.');

  const users = await getUsers();
  if (users.some((u: any) => String(u.email).toLowerCase() === email)) throw new Error('A user with this email already exists.');

  const profileImage = normalizeProfileImage(input.profileImage || input.avatarUrl || input.photoUrl || '') || '';
  const newUser: any = {
    id: `user-${Math.random().toString(36).slice(2, 9)}`,
    name,
    email,
    role: UserRole.GATE_OFFICER,
    profileImage,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('users').insert(newUser);
    if (error) throw new Error(error.message);
    return safeUser(newUser);
  }

  const db = readLocalDb();
  if (!db.users) db.users = [];
  db.users.push({ ...newUser, avatarUrl: profileImage });
  writeLocalDb(db);
  return safeUser(newUser);
}

async function deleteGateOfficer(id: string) {
  const users = await getUsers();
  const target = users.find((u: any) => u.id === id);
  if (!target) throw new Error('User not found.');
  if (target.role !== UserRole.GATE_OFFICER) throw new Error('Only gate officer accounts can be deleted from this panel.');

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('users').delete().eq('id', id).eq('role', UserRole.GATE_OFFICER);
    if (error) throw new Error(error.message);
    return true;
  }

  const db = readLocalDb();
  db.users = (db.users || []).filter((u: any) => !(u.id === id && u.role === UserRole.GATE_OFFICER));
  writeLocalDb(db);
  return true;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const users = await getUsers();
      res.status(200).json(users.map(safeUser));
      return;
    }
    if (req.method === 'POST') {
      const created = await createGateOfficer(req.body || {});
      res.status(201).json(safeUser(created));
      return;
    }
    if (req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) throw new Error('User id is required.');
      const updated = await updateUser(id, updates);
      if (!updated) { res.status(404).json({ error: 'User not found.' }); return; }
      res.status(200).json(safeUser(updated));
      return;
    }
    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) throw new Error('User id is required.');
      await deleteGateOfficer(String(id));
      res.status(200).json({ success: true });
      return;
    }
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Account management request failed.' });
  }
}
