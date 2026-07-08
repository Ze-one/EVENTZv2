import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, LogOut, ShieldCheck, User, UserPlus, Trash2, Save, LockKeyhole, X } from 'lucide-react';
import { UserRole } from '../types.js';

type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
};

export default function ProfileControl() {
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [avatar, setAvatar] = useState('');
  const [gateName, setGateName] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gatePassword, setGatePassword] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const gateUsers = useMemo(() => users.filter((u) => u.role === UserRole.GATE_OFFICER), [users]);

  const loadSession = () => {
    const raw = localStorage.getItem('etsn_user');
    if (!raw) {
      setCurrentUser(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setCurrentUser(parsed);
      setProfileName(parsed.name || '');
      setProfileEmail(parsed.email || '');
      setAvatar(localStorage.getItem(`eventz_avatar_${parsed.id}`) || '');
    } catch {
      setCurrentUser(null);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/account-management');
      if (res.ok) setUsers(await res.json());
    } catch {
      // Keep profile panel usable even if the network is down.
    }
  };

  useEffect(() => {
    loadSession();
    loadUsers();
    const interval = window.setInterval(loadSession, 1500);
    return () => window.clearInterval(interval);
  }, []);

  const persistSessionUser = (user: SafeUser) => {
    localStorage.setItem('etsn_user', JSON.stringify(user));
    setCurrentUser(user);
    window.dispatchEvent(new StorageEvent('storage', { key: 'etsn_user', newValue: JSON.stringify(user) }));
  };

  const updateProfile = async () => {
    if (!currentUser) return;
    setMessage('');
    try {
      const res = await fetch('/api/account-management', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentUser.id, name: profileName, email: profileEmail, password: profilePassword || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile update failed.');
      persistSessionUser(data);
      setProfilePassword('');
      setMessage('Profile updated successfully. Use the new email/password at next login.');
      await loadUsers();
    } catch (error: any) {
      setMessage(error?.message || 'Profile update failed.');
    }
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
      if (!res.ok) throw new Error(data.error || 'Unable to create gate account.');
      setGateName('');
      setGateEmail('');
      setGatePassword('');
      setMessage('Gate officer account created.');
      await loadUsers();
    } catch (error: any) {
      setMessage(error?.message || 'Unable to create gate account.');
    }
  };

  const deleteGateOfficer = async (id: string) => {
    if (!confirm('Delete this gate officer account?')) return;
    setMessage('');
    try {
      const res = await fetch(`/api/account-management?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete gate account.');
      setMessage('Gate officer account deleted.');
      await loadUsers();
    } catch (error: any) {
      setMessage(error?.message || 'Unable to delete gate account.');
    }
  };

  const handleAvatarUpload = (file?: File) => {
    if (!file || !currentUser) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      localStorage.setItem(`eventz_avatar_${currentUser.id}`, dataUrl);
      setAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const logout = () => {
    localStorage.removeItem('etsn_user');
    setCurrentUser(null);
    window.location.href = '/';
  };

  if (!currentUser) return null;

  return (
    <div className="fixed top-4 right-4 z-[120] font-sans text-left">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="bg-white/90 backdrop-blur-xl border border-white/70 shadow-2xl rounded-2xl pl-2 pr-3 py-2 flex items-center gap-2 hover:scale-[1.02]"
      >
        <div className="w-9 h-9 rounded-xl bg-slate-950 text-yellow-400 flex items-center justify-center overflow-hidden font-black text-xs">
          {avatar ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" /> : currentUser.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="hidden sm:block leading-tight">
          <p className="text-xs font-black text-slate-900 max-w-[120px] truncate">{currentUser.name}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{currentUser.role.replace('_', ' ')}</p>
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(92vw,420px)] max-h-[86vh] overflow-y-auto apple-card rounded-[2rem] p-4 animate-slide-up">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-950 text-yellow-400 flex items-center justify-center overflow-hidden font-black">
                {avatar ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" /> : <User size={24} />}
              </div>
              <div>
                <h3 className="font-black text-slate-950 text-sm">Profile & Access Control</h3>
                <p className="text-[11px] text-slate-500">{isAdmin ? 'Administrator privileges' : 'Gate officer profile'}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X size={15} /></button>
          </div>

          {message && <div className="mt-4 text-[11px] font-semibold bg-slate-950 text-white rounded-2xl p-3">{message}</div>}

          <div className="mt-4 space-y-4">
            <section className="bg-white/70 rounded-3xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2"><ShieldCheck size={14} /> My Account</h4>
                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-2 flex items-center gap-1">
                  <Camera size={12} /> Photo
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
              </div>
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Full name" />
              <input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Login email" />
              <input type="password" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="New password optional" />
              <button onClick={updateProfile} className="w-full bg-slate-950 hover:bg-slate-800 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><Save size={14} /> Save Profile</button>
            </section>

            {isAdmin && (
              <section className="bg-white/70 rounded-3xl border border-slate-100 p-4 space-y-3">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2"><UserPlus size={14} /> Gate Officer Accounts</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">Create separate gate accounts for multiple entry points. All gates validate against the same cloud pass state, so a pass already marked as entered cannot be validated again.</p>
                <div className="grid gap-2">
                  <input value={gateName} onChange={(e) => setGateName(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Gate officer name" />
                  <input value={gateEmail} onChange={(e) => setGateEmail(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Gate login email" />
                  <input type="password" value={gatePassword} onChange={(e) => setGatePassword(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-950" placeholder="Temporary password" />
                  <button onClick={createGateOfficer} className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><UserPlus size={14} /> Create Gate Account</button>
                </div>

                <div className="space-y-2 pt-2">
                  {gateUsers.map((gate) => (
                    <div key={gate.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-2xl border border-slate-100 p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{gate.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{gate.email}</p>
                      </div>
                      <button onClick={() => deleteGateOfficer(gate.id)} className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {gateUsers.length === 0 && <p className="text-[11px] text-slate-400 text-center py-3">No gate officer account found.</p>}
                </div>
              </section>
            )}

            {!isAdmin && (
              <section className="bg-slate-50 rounded-3xl border border-slate-100 p-4 text-[11px] text-slate-500 leading-relaxed">
                <p className="font-bold text-slate-700 flex items-center gap-2 mb-1"><LockKeyhole size={13} /> Limited gate profile</p>
                Gate officers can update their own profile and photo. Admin-only actions such as creating/deleting gate accounts remain hidden.
              </section>
            )}

            <button onClick={logout} className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><LogOut size={14} /> Logout</button>
          </div>
        </div>
      )}
    </div>
  );
}
