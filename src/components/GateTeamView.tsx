import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Trash2 } from 'lucide-react';
import { workspaceFetch } from '../utils/auth.js';
import type { User } from '../types.js';
import { UserRole } from '../types.js';
import './organizer.css';

export default function GateTeamView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [users, setUsers] = useState<Omit<User, 'passwordHash'>[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  async function refresh() {
    const response = await workspaceFetch('/api/account-management');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load this event’s gate team.');
    setUsers(data);
  }
  useEffect(() => { refresh().catch(error => setError(error.message)).finally(() => setLoading(false)); }, []);
  async function change(id?: string) {
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await workspaceFetch(`/api/account-management${id ? `?id=${encodeURIComponent(id)}` : ''}`, id ? { method: 'DELETE' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the gate team.');
      if (!id) setForm({ name: '', email: '', password: '' });
      setMessage(id ? 'Gate access removed for this event.' : 'Gate access assigned for this event.');
      await Promise.all([refresh(), onChanged()]);
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }
  const staff = users.filter(user => user.role === UserRole.GATE_OFFICER);
  return <section className="gate-team organizer-card"><div className="organizer-heading"><div><span className="organizer-eyebrow">WELCOME PEOPLE TOGETHER</span><h2><ShieldCheck size={24} />Your gate team</h2><p>Staff can scan and check guests in for this event. Only you can edit the event, roster and pass design.</p></div></div>
    {error && <p role="alert" className="organizer-error">{error}</p>}{message && <p role="status" className="organizer-success">{message}</p>}
    <form onSubmit={e => { e.preventDefault(); void change(); }}><fieldset disabled={busy}><legend>Assign a gate officer</legend><div className="roster-mapping"><label>Name<input required maxLength={100} autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Initial password<input type="password" minLength={10} maxLength={128} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><small>Required for a new account. Leave blank for an existing EVENTZ account.</small></label></div><p className="roster-note">Share the event workspace link and sign-in instructions with your staff. Assigning access does not send an email.</p><button className="organizer-primary" type="submit"><UserPlus size={16} />{busy ? 'Saving…' : 'Assign gate access'}</button></fieldset></form>
    <h3>Assigned staff ({staff.length})</h3>{loading ? <p role="status">Loading gate team…</p> : !staff.length ? <p className="roster-note">No gate staff assigned yet. You can also use the scanner yourself.</p> : <ul className="gate-team-list">{staff.map(user => <li key={user.id}><div><strong>{user.name}</strong><p>{user.email}</p></div><button className="organizer-secondary" disabled={busy} onClick={() => { if (window.confirm(`Remove ${user.name}’s gate access for this event?`)) void change(user.id); }}><Trash2 size={15} />Remove access</button></li>)}</ul>}
  </section>;
}
