import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Search, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Participant, UserRole, PassStatus } from '../types.js';

export default function PassRegeneratorControl() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [lastResult, setLastResult] = useState<{ oldPassId: string; newPassId: string; name: string } | null>(null);

  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const loadSession = () => {
    try {
      const raw = localStorage.getItem('etsn_user');
      setCurrentUser(raw ? JSON.parse(raw) : null);
    } catch {
      setCurrentUser(null);
    }
  };

  const loadParticipants = async () => {
    try {
      const res = await fetch('/api/participants');
      if (res.ok) setParticipants(await res.json());
    } catch {}
  };

  useEffect(() => {
    loadSession();
    loadParticipants();
    const onStorage = () => loadSession();
    window.addEventListener('storage', onStorage);
    const interval = window.setInterval(() => {
      loadSession();
      if (open) loadParticipants();
    }, 5000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return participants.slice(0, 25);
    return participants.filter((p) =>
      p.fullName.toLowerCase().includes(needle) ||
      p.email.toLowerCase().includes(needle) ||
      p.passId.toLowerCase().includes(needle) ||
      p.organization.toLowerCase().includes(needle)
    ).slice(0, 25);
  }, [participants, query]);

  const selected = participants.find((p) => p.id === selectedId) || null;

  const regeneratePass = async () => {
    if (!selected) return;
    const confirmText = `Regenerate pass for ${selected.fullName}?\n\nOld Pass ID: ${selected.passId}\n\nThe old QR will immediately become invalid. A new Pass ID and QR will be generated.`;
    if (!confirm(confirmText)) return;
    setLoading(true);
    setMessage('');
    setLastResult(null);
    try {
      const res = await fetch(`/api/participants/${encodeURIComponent(selected.id)}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regeneratedBy: currentUser?.name || 'Admin', resetCheckIn: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pass regeneration failed.');
      setLastResult({ oldPassId: data.oldPassId, newPassId: data.newPassId, name: data.participant?.fullName || selected.fullName });
      setMessage('Pass regenerated successfully. The previous pass ID is no longer valid.');
      setSelectedId('');
      await loadParticipants();
      window.dispatchEvent(new CustomEvent('eventz-refresh-data'));
    } catch (error: any) {
      setMessage(error?.message || 'Pass regeneration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[120] font-sans text-left">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="bg-slate-950 hover:bg-slate-900 text-white shadow-2xl border border-slate-800 rounded-2xl px-4 py-3 text-xs font-black flex items-center gap-2"
      >
        <RefreshCcw size={15} className="text-yellow-400" />
        Regenerate Pass ID
      </button>

      {open && (
        <div className="absolute bottom-14 left-0 w-[min(92vw,430px)] apple-card rounded-[2rem] p-4 animate-slide-up space-y-4">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><ShieldAlert size={15} className="text-yellow-600" /> Admin Pass Regeneration</h3>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">Generate a fresh Pass ID and QR for a real attendee. No mock data is used here.</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X size={15} /></button>
          </div>

          <div className="relative text-xs">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"><Search size={14} /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search attendee by name, email, organization, or Pass ID..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950" />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {filtered.map((p) => (
              <button key={p.id} type="button" onClick={() => setSelectedId(p.id)} className={`w-full text-left p-3 rounded-2xl border transition-all ${selectedId === p.id ? 'bg-slate-950 text-white border-slate-950' : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-800'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">{p.fullName}</p>
                    <p className={`text-[10px] font-mono truncate ${selectedId === p.id ? 'text-yellow-300' : 'text-slate-500'}`}>{p.passId}</p>
                    <p className={`text-[10px] truncate ${selectedId === p.id ? 'text-slate-300' : 'text-slate-400'}`}>{p.email || p.organization || p.category}</p>
                  </div>
                  <span className={`text-[9px] font-black rounded-full px-2 py-1 ${p.status === PassStatus.NOT_USED ? 'bg-emerald-50 text-emerald-700' : p.status === PassStatus.USED ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{p.status}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center text-[11px] text-slate-400 py-8">No attendee found.</p>}
          </div>

          {selected && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-3 text-[11px] text-yellow-900 leading-relaxed">
              <b>Selected:</b> {selected.fullName}<br />
              Current Pass ID: <span className="font-mono font-black">{selected.passId}</span><br />
              Regeneration resets check-in status and makes the old QR invalid.
            </div>
          )}

          {message && <div className="bg-slate-950 text-white rounded-2xl p-3 text-[11px] font-semibold">{message}</div>}
          {lastResult && <div className="bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-2xl p-3 text-[11px] leading-relaxed"><CheckCircle2 size={14} className="inline mr-1" /> {lastResult.name}<br />Old: <span className="font-mono line-through">{lastResult.oldPassId}</span><br />New: <span className="font-mono font-black">{lastResult.newPassId}</span></div>}

          <button onClick={regeneratePass} disabled={!selected || loading} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-slate-950 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2">
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Regenerating...' : 'Regenerate New Pass ID'}
          </button>
        </div>
      )}
    </div>
  );
}
