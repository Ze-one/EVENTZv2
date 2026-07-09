import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronDown, LogOut, Save, ShieldCheck, Trash2, User, UserPlus, X } from 'lucide-react';
import { UserRole } from '../types.js';

type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  profileImage?: string;
  avatarUrl?: string;
};

function normalizeUser(user: SafeUser): SafeUser {
  return {
    ...user,
    profileImage: user.profileImage || user.avatarUrl || '',
    avatarUrl: user.avatarUrl || user.profileImage || ''
  };
}

export default function HeaderAccountControl() {
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [open, setOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [avatar, setAvatar] = useState('');
  const [gateName, setGateName] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gatePassword, setGatePassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const gateUsers = useMemo(() => users.filter((u) => u.role === UserRole.GATE_OFFICER), [users]);

  const applyUser = (user: SafeUser | null) => {
    if (!user) {
      setCurrentUser(null);
      return;
    }
    const normalized = normalizeUser(user);
    setCurrentUser(normalized);
    setProfileName(normalized.name || '');
    setProfileEmail(normalized.email || '');
    setAvatar(normalized.profileImage || normalized.avatarUrl || '');
    localStorage.setItem('etsn_user', JSON.stringify(normalized));
  };

  const loadSession = () => {
    try {
      const raw = localStorage.getItem('etsn_user');
      applyUser(raw ? JSON.parse(raw) : null);
    } catch {
      applyUser(null);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/account-management');
      if (!res.ok) return;
      const list: SafeUser[] = await res.json();
      const normalizedList = list.map(normalizeUser);
      setUsers(normalizedList);
      const session = currentUser || (() => {
        try {
          const raw = localStorage.getItem('etsn_user');
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })();
      if (session) {
        const fresh = normalizedList.find((u) => u.id === session.id || u.email?.toLowerCase() === session.email?.toLowerCase());
        if (fresh) applyUser(fresh);
      }
    } catch {}
  };

  useEffect(() => {
    loadSession();
    loadUsers();
    const interval = window.setInterval(() => {
      loadSession();
      loadUsers();
    }, 7000);
    const onStorage = () => loadSession();
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const updateProfile = async (nextAvatar = avatar) => {
    if (!currentUser) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/account-management', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentUser.id,
          name: profileName,
          email: profileEmail,
          password: profilePassword || undefined,
          profileImage: nextAvatar
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile update failed.');
      applyUser(data);
      setProfilePassword('');
      setMessage('Profile updated successfully.');
      await loadUsers();
    } catch (error: any) {
      setMessage(error?.message || 'Profile update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = (file?: File) => {
    if (!file || !currentUser) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Please upload a valid image file.');
      return;
    }
    if (file.size > 900 * 1024) {
      setMessage('Profile photo too large. Use an image below 900 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setAvatar(dataUrl);
      await updateProfile(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const createGateOfficer = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/account-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gateName, email: gateEmail, password: gatePassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to create gate officer account.');
      setGateName('');
      setGateEmail('');
      setGatePassword('');
      setMessage('Gate officer account created.');
      await loadUsers();
    } catch (error: any) {
      setMessage(error?.message || 'Unable to create gate officer account.');
    }
  };

  const deleteGateOfficer = async (id: string) => {
    if (!confirm('Delete this gate officer account?')) return;
    setMessage('');
    try {
      const res = await fetch(`/api/account-management?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete gate officer account.');
      setMessage('Gate officer account deleted.');
      await loadUsers();
    } catch (error: any) {
      setMessage(error?.message || 'Unable to delete gate officer account.');
    }
  };

  const logout = () => {
    localStorage.removeItem('etsn_user');
    setCurrentUser(null);
    window.location.href = '/';
  };

  if (!currentUser) return null;

  const initials = currentUser.name.slice(0, 2).toUpperCase();

  return (
    <div className="fixed top-[10px] right-[150px] z-[150] font-sans text-left">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative h-[56px] bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-2xl pl-2 pr-3 flex items-center gap-2 shadow-xl transition-all"
        title="Open profile and account control"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-950 text-yellow-400 flex items-center justify-center overflow-hidden font-black text-xs border border-slate-700">
          {avatar ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" /> : initials}
        </div>
        <div className="hidden xl:block leading-tight text-right min-w-[110px]">
          <p className="text-xs font-black text-white truncate max-w-[130px]">{currentUser.name}</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-yellow-400">{currentUser.role.replace('_', ' ')}</p>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(92vw,480px)] max-h-[86vh] overflow-y-auto apple-card rounded-[2rem] p-4 animate-slide-up shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 text-yellow-400 flex items-center justify-center overflow-hidden font-black">
                {avatar ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" /> : <User size={24} />}
              </div>
              <div>
                <h3 className="font-black text-slate-950 text-sm">Profile & Access Control</h3>
                <p className="text-[11px] text-slate-500">{isAdmin ? 'Edit profile and manage gate officers' : 'Gate officer profile settings'}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X size={15} /></button>
          </div>

          {message && <div className="mt-4 text-[11px] font-semibold bg-slate-950 text-white rounded-2xl p-3">{message}</div>}

          <div className="mt-4 space-y-4">
            <section className="bg-white/70 rounded-3xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2"><ShieldCheck size={14} /> My Account</h4>
                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-2 flex items-center gap-1"><Camera size={12} /> Photo</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
              </div>
              <p className="text-[10px] text-slate-400 font-semibold">Profile photos require the Supabase users.profileImage column for cross-device persistence.</p>
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Full name" />
              <input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Login email" />
              <input type="password" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="New password optional" />
              <button onClick={() => updateProfile()} disabled={saving} className="w-full bg-slate-950 hover:bg-slate-800 disabled:opacity-60 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><Save size={14} /> {saving ? 'Saving...' : 'Save Profile'}</button>
            </section>

            {isAdmin && (
              <section className="bg-white/70 rounded-3xl border border-slate-100 p-4 space-y-3">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2"><UserPlus size={14} /> Gate Officer Accounts</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">Create separate accounts for gate men/gate officers. Each gate validates against the same cloud pass state.</p>
                <div className="grid gap-2">
                  <input value={gateName} onChange={(e) => setGateName(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Gate officer name" />
                  <input value={gateEmail} onChange={(e) => setGateEmail(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Gate login email" />
                  <input type="password" value={gatePassword} onChange={(e) => setGatePassword(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Temporary password" />
                  <button onClick={createGateOfficer} className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><UserPlus size={14} /> Create Gate Account</button>
                </div>

                <div className="space-y-2 pt-2">
                  {gateUsers.map((gate) => (
                    <div key={gate.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-2xl border border-slate-100 p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 text-yellow-400 flex items-center justify-center overflow-hidden text-[10px] font-black">
                          {gate.profileImage || gate.avatarUrl ? <img src={gate.profileImage || gate.avatarUrl} className="w-full h-full object-cover" alt="Gate" /> : gate.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">{gate.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{gate.email}</p>
                        </div>
                      </div>
                      <button onClick={() => deleteGateOfficer(gate.id)} className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {gateUsers.length === 0 && <p className="text-[11px] text-slate-400 text-center py-3">No gate officer account found.</p>}
                </div>
              </section>
            )}

            <button onClick={logout} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><LogOut size={14} /> Logout</button>
            <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex gap-2"><CheckCircle2 size={14} /> Account control restored in the top header area.</div>
          </div>
        </div>
      )}
    </div>
  );
}
