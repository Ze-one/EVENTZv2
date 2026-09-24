import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Ticket,
  UserX
} from 'lucide-react';
import Logo from './Logo.tsx';

type RsvpState = {
  registration: {
    id: string;
    fullName: string;
    categoryName: string;
    rsvpStatus: 'yes' | 'maybe' | 'declined';
    rsvpUpdatedAt?: string | null;
    submittedAt: string;
    status: string;
  };
  participant: {
    id: string;
    passId: string;
    status: string;
  } | null;
  event: {
    eventName: string;
    eventDate: string;
    eventTime: string;
    venue: string;
    organizerName: string;
  } | null;
};

interface Props {
  token: string;
  onStaffLogin: () => void;
}

export default function RsvpResponseView({ token, onStaffLogin }: Props) {
  const [state, setState] = useState<RsvpState | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<'yes' | 'declined' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/attendee-requests?mode=rsvp&token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load this RSVP.');
      setState(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load this RSVP.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const update = async (response: 'yes' | 'declined') => {
    if (response === 'declined') {
      const ok = window.confirm('Decline attendance? Your EVENTZ pass will be deactivated until you confirm attendance again.');
      if (!ok) return;
    }

    setUpdating(response);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/attendee-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'rsvp', token, response })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to update your RSVP.');
      setState(data);
      setMessage(response === 'yes'
        ? 'Your attendance is confirmed. Your pass is active.'
        : 'Your attendance has been marked as declined and your pass has been deactivated.');
    } catch (err: any) {
      setError(err?.message || 'Unable to update your RSVP.');
    } finally {
      setUpdating('');
    }
  };

  const rsvpStatus = state?.registration.rsvpStatus;
  const declined = rsvpStatus === 'declined';
  const event = state?.event;

  return (
    <div className="eventz-public-page min-h-screen text-slate-900 flex flex-col overflow-hidden relative">
      <style>{`
        @keyframes rsvpRise {
          from { opacity: 0; transform: translateY(24px) scale(.98); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .eventz-rsvp-rise { animation: rsvpRise 560ms cubic-bezier(.16,1,.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .eventz-rsvp-rise { animation: none !important; } }
      `}</style>

      <div className="pointer-events-none absolute -top-40 -right-32 w-[440px] h-[440px] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-24 w-[420px] h-[420px] rounded-full bg-yellow-400/10 blur-3xl" />

      <header className="relative z-10 max-w-5xl w-full mx-auto px-5 py-6 flex items-center justify-between">
        <Logo size="md" variant="dark" />
        <button onClick={onStaffLogin} className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
          Staff login
        </button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 pb-16">
        <div className="w-full max-w-3xl eventz-rsvp-rise">
          {loading ? (
            <div className="eventz-card rounded-[32px] border border-white bg-white/92 backdrop-blur-xl p-12 text-center">
              <RefreshCw size={24} className="animate-spin mx-auto text-yellow-400" />
              <p className="mt-4 text-sm font-black">Loading your RSVP...</p>
            </div>
          ) : error && !state ? (
            <div className="rounded-[32px] bg-white text-slate-900 p-8 text-center shadow-2xl">
              <UserX size={34} className="mx-auto text-rose-600" />
              <h1 className="text-2xl font-black mt-4">RSVP link unavailable</h1>
              <p className="text-sm text-slate-500 mt-3">{error}</p>
            </div>
          ) : state ? (
            <div className="eventz-card rounded-[34px] bg-white/95 text-slate-900 backdrop-blur-2xl border border-white/70 overflow-hidden">
              <div className={`px-6 md:px-8 py-6 border-b ${declined ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.18em] ${declined ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {declined ? <UserX size={12} /> : <ShieldCheck size={12} />}
                      {declined ? 'Attendance declined' : 'Approved participant'}
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-3">{state.registration.fullName}</h1>
                    <p className="text-xs text-slate-500 mt-1">{state.registration.categoryName}</p>
                  </div>
                  {state.participant && (
                    <div className="rounded-2xl bg-white/80 border border-white px-4 py-3 shadow-sm">
                      <p className="text-[9px] uppercase tracking-wider font-black text-slate-400">Pass ID</p>
                      <p className="font-mono font-black text-sm mt-1">{state.participant.passId}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-black text-slate-400">RSVP confirmation</p>
                  <h2 className="text-xl font-black mt-2">Will you attend {event?.eventName || 'this event'}?</h2>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                    You can update your attendance here if your plans change. Declining deactivates your pass so the organizer has an accurate expected-attendance count.
                  </p>
                </div>

                {event && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 flex gap-3">
                      <Calendar size={16} className="text-slate-500 shrink-0" />
                      <div>
                        <p className="text-[9px] uppercase font-black text-slate-400">Date & time</p>
                        <p className="text-xs font-black mt-1">{event.eventDate} · {event.eventTime}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 flex gap-3">
                      <MapPin size={16} className="text-slate-500 shrink-0" />
                      <div>
                        <p className="text-[9px] uppercase font-black text-slate-400">Venue</p>
                        <p className="text-xs font-black mt-1">{event.venue}</p>
                      </div>
                    </div>
                  </div>
                )}

                {message && (
                  <div className="rounded-2xl bg-blue-50 border border-blue-100 text-blue-800 p-4 text-xs font-bold">
                    {message}
                  </div>
                )}
                {error && (
                  <div className="rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 p-4 text-xs font-bold">
                    {error}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => update('yes')}
                    disabled={updating !== '' || state.participant?.status === 'Used'}
                    className={`rounded-2xl p-5 border text-left transition-all duration-300 disabled:opacity-50 ${
                      rsvpStatus === 'yes'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-600/10'
                        : 'bg-white border-slate-200 hover:border-emerald-300 hover:-translate-y-1 hover:shadow-lg'
                    }`}
                  >
                    <CheckCircle2 size={20} className={rsvpStatus === 'yes' ? 'text-white' : 'text-emerald-600'} />
                    <p className="font-black text-sm mt-3">{updating === 'yes' ? 'Updating...' : 'I am attending'}</p>
                    <p className={`text-[11px] mt-1 leading-relaxed ${rsvpStatus === 'yes' ? 'text-emerald-100' : 'text-slate-500'}`}>
                      Confirm your attendance and keep your pass active.
                    </p>
                  </button>

                  <button
                    onClick={() => update('declined')}
                    disabled={updating !== '' || state.participant?.status === 'Used'}
                    className={`rounded-2xl p-5 border text-left transition-all duration-300 disabled:opacity-50 ${
                      rsvpStatus === 'declined'
                        ? 'bg-rose-600 border-rose-600 text-white shadow-xl shadow-rose-600/10'
                        : 'bg-white border-slate-200 hover:border-rose-300 hover:-translate-y-1 hover:shadow-lg'
                    }`}
                  >
                    <UserX size={20} className={rsvpStatus === 'declined' ? 'text-white' : 'text-rose-600'} />
                    <p className="font-black text-sm mt-3">{updating === 'declined' ? 'Updating...' : 'I can no longer attend'}</p>
                    <p className={`text-[11px] mt-1 leading-relaxed ${rsvpStatus === 'declined' ? 'text-rose-100' : 'text-slate-500'}`}>
                      Tell the organizer and temporarily deactivate your pass.
                    </p>
                  </button>
                </div>

                {state.participant?.status === 'Used' && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 flex gap-3 text-amber-800">
                    <Clock3 size={16} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold">This pass has already been checked in, so the RSVP can no longer be changed.</p>
                  </div>
                )}

                <div className="rounded-2xl bg-slate-950 text-slate-300 p-4 flex gap-3">
                  <Ticket size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Your RSVP link is tied to this approved registration. Keep it private; it can be used to change the attendance status associated with your pass.
                  </p>
                </div>

                {state.registration.rsvpUpdatedAt && (
                  <p className="text-[10px] text-center text-slate-400">
                    Last RSVP update: {new Date(state.registration.rsvpUpdatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
