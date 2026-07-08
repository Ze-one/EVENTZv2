import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const DB_FILE = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'db.json')
  : path.join(process.cwd(), 'db.json');

function getSupabase() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('emailLogs').delete().neq('id', '');
      if (error) throw new Error(error.message);
      res.status(200).json({ success: true, cleared: 'emailLogs', mode: 'supabase' });
      return;
    }

    const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) : {};
    db.emailLogs = [];
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    res.status(200).json({ success: true, cleared: 'emailLogs', mode: 'local' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to clear email logs.' });
  }
}
