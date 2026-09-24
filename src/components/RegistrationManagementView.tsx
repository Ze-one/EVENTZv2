import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X
} from 'lucide-react';

type Registration = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  categoryName: string;
  rsvpStatus: 'yes' | 'maybe' | 'declined';
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted';
  notes?: string;
  participantId?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  rsvpUpdatedAt?: string | null;
  approvalEmailStatus?: string | null;
  approvalEmailSentAt?: string | null;
  approvalEmailError?: string | null;
};

interface Props {
  adminName: string;
  onChanged?: () => void;
}

export default function RegistrationManagementView({ adminName, onChanged }: Props) {
  const [items, setItems] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState('');
  const [filter, setFilter] = useState<'all' | Registration['status']>('pending');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Registration | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  const registrationUrl = typeof window === 'undefined' ? '/register' : `${window.location.origin}/register`;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setMessage('');
    try {
      const res = await fetch('/api/attendee-requests?mode=registrations', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load registrations.');
      setItems(data);
      if (selected) {
        const refreshed = data.find((item: Registration) => item.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (err: any) {
      if (!silent) setMessage(err?.message || 'Could not load registrations.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]);

  const counts = useMemo(() => ({
    all: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    approved: items.filter((i) => i.status === 'approved').length,
    waitlisted: items.filter((i) => i.status === 'waitlisted').length,
    rejected: items.filter((i) => i.status === 'rejected').length
  }), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const statusOk = filter === 'all' || item.status === filter;
      const searchOk = !q || [item.fullName, item.email, item.phone, item.organization, item.categoryName, item.id]
        .some((value) => String(value || '').toLowerCase().includes(q));
      return statusOk && searchOk;
    });
  }, [items, filter, search]);

  const review = async (item: Registration, decision: 'approved' | 'rejected' | 'waitlisted') => {
    let rejectionReason = '';
    if (decision === 'rejected') {
      rejectionReason = window.prompt('Reason for rejection (optional):', '') || '';
      if (!window.confirm(`Reject registration for ${item.fullName}?`)) return;
    } else if (decision === 'approved') {
      if (!window.confirm(`Approve ${item.fullName}? This will generate an EVENTZ participant pass.`)) return;
    } else if (!window.confirm(`Move ${item.fullName} to the waitlist?`)) {
      return;
    }

    setActingId(item.id);
    setMessage('');
    try {
      const res = await fetch('/api/attendee-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'registration', id: item.id, decision, reviewedBy: adminName, rejectionReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review action failed.');
      if (data.capacityReached) {
        setMessage('Category capacity was reached. Registration moved to waitlist.');
      } else if (decision === 'approved') {
        const emailStatus = data.registration?.approvalEmailStatus;
        setMessage(
          emailStatus === 'sent'
            ? 'Registration approved, pass created, and approval email sent.'
            : emailStatus === 'skipped'
              ? 'Registration approved and pass created. No approval email was sent because no valid email address is available.'
              : emailStatus === 'failed'
                ? `Registration approved and pass created, but the approval email failed: ${data.registration?.approvalEmailError || 'delivery error'}`
                : 'Registration approved and pass created.'
        );
      } else {
        setMessage(`Registration ${decision}.`);
      }
      await load(true);
      onChanged?.();
    } catch (err: any) {
      setMessage(err?.message || 'Review action failed.');
    } finally {
      setActingId('');
    }
  };

  const statusClass = (status: Registration['status']) => {
    if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (status === 'waitlisted') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const copyRegistrationLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch {
      window.prompt('Copy registration link:', registrationUrl);
    }
  };

  const shareRegistrationLink = async () => {
    const shareData = {
      title: 'EVENTZ Registration',
      text: 'Register for this event using the official EVENTZ registration portal.',
      url: registrationUrl
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyRegistrationLink();
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      new Notification('EVENTZ notifications enabled', {
        body: 'You will receive a desktop notification when a new registration arrives while EVENTZ is open.'
      });
    }
  };

  const clearRegistrationList = async () => {
    setClearing(true);
    setMessage('');
    try {
      const res = await fetch('/api/attendee-requests?mode=registrations', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not clear registration history.');
      setSelected(null);
      setItems([]);
      setFilter('pending');
      setSearch('');
      setShowClearConfirm(false);
      setMessage(`Registration list cleared (${data.cleared || 0} records). Existing participant passes were preserved.`);
      onChanged?.();
    } catch (err: any) {
      setMessage(err?.message || 'Could not clear registration history.');
    } finally {
      setClearing(false);
    }
  };


  return (
    <div className="space-y-6 text-left">
      <style>{`
        @keyframes eventzModalBackdropIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(18px); }
        }
        @keyframes eventzModalCardIn {
          0% { opacity: 0; transform: translateY(28px) scale(.965); filter: blur(8px); }
          58% { opacity: 1; transform: translateY(-2px) scale(1.004); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .eventz-reg-backdrop { animation: eventzModalBackdropIn 240ms ease-out both; }
        .eventz-reg-card { animation: eventzModalCardIn 520ms cubic-bezier(.16,1,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .eventz-reg-backdrop, .eventz-reg-card { animation: none !important; }
        }
      `}</style>

      <div className="rounded-[28px] border border-slate-200/70 bg-white/80 backdrop-blur-xl shadow-[0_18px_60px_rgba(15,23,42,0.06)] p-5 md:p-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 text-white px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] font-black">
              <Sparkles size={11} className="text-yellow-400" /> Registration command desk
            </div>
            <h2 className="text-2xl font-black text-slate-950 mt-3 tracking-tight">Registration Requests</h2>
            <p className="text-xs text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
              Review incoming registrations, inspect complete registrant information, and control when a real participant pass is created.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={enableNotifications}
              className={`px-4 py-2.5 rounded-xl border text-xs font-black flex items-center gap-2 transition-all duration-300 hover:-translate-y-0.5 ${
                notificationPermission === 'granted'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:shadow-md'
              }`}
              title="Enable desktop notifications for new registrations"
            >
              <Bell size={14} />
              {notificationPermission === 'granted' ? 'Notifications On' : 'Enable Notifications'}
            </button>

            <button
              onClick={copyRegistrationLink}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 flex items-center gap-2"
            >
              {shareCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {shareCopied ? 'Copied' : 'Copy Link'}
            </button>

            <button
              onClick={shareRegistrationLink}
              className="px-4 py-2.5 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 flex items-center gap-2"
            >
              <Share2 size={14} /> Share Registration
            </button>

            <button
              onClick={() => window.open('/register', '_blank')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2"
            >
              <ExternalLink size={14} /> Open Portal
            </button>

            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={items.length === 0 || clearing}
              className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-40 transition-all flex items-center gap-2"
              title="Clear registration request history"
            >
              <Trash2 size={14} /> Clear List
            </button>

            <button
              onClick={() => load()}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all disabled:opacity-50"
              title="Refresh registrations"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Public registration portal</p>
            <p className="text-xs font-mono font-bold text-slate-700 mt-1 break-all">{registrationUrl}</p>
          </div>
          <p className="text-[10px] text-slate-400 max-w-sm leading-relaxed">
            Share this URL by WhatsApp, email, SMS, social media, or any other platform. The Share button uses your device's native share sheet where supported.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['all', 'All', counts.all],
          ['pending', 'Pending', counts.pending],
          ['approved', 'Approved', counts.approved],
          ['waitlisted', 'Waitlisted', counts.waitlisted],
          ['rejected', 'Rejected', counts.rejected]
        ].map(([key, label, count]) => (
          <button
            key={String(key)}
            onClick={() => setFilter(key as any)}
            className={`rounded-2xl border p-4 text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg ${
              filter === key
                ? 'bg-slate-950 border-slate-950 text-white shadow-xl'
                : 'bg-white border-slate-100 hover:border-slate-300'
            }`}
          >
            <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">{label}</p>
            <p className="text-2xl font-black font-mono mt-1">{count}</p>
          </button>
        ))}
      </div>

      {message && <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-700 shadow-sm">{message}</div>}

      <div className="bg-white border border-slate-100 rounded-[28px] shadow-[0_18px_50px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, organization, category or registration ID..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-slate-900 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 text-left">Registrant</th>
                <th className="py-3 px-4 text-left">Category</th>
                <th className="py-3 px-4 text-left">RSVP</th>
                <th className="py-3 px-4 text-left">Submitted</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && visible.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-400">No registration requests match this view.</td></tr>}
              {visible.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="group cursor-pointer hover:bg-slate-50/70 transition-all duration-300"
                >
                  <td className="py-4 px-4">
                    <div className="transition-transform duration-300 group-hover:translate-x-1">
                      <p className="font-black text-slate-900 text-sm">{item.fullName}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{item.email || 'No email'} · {item.phone || 'No phone'}</p>
                      <p className="text-[10px] text-slate-400">{item.organization || 'Independent'} · <span className="font-mono">{item.id}</span></p>
                    </div>
                  </td>
                  <td className="py-4 px-4"><span className="font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-full">{item.categoryName || 'Attendees'}</span></td>
                  <td className="py-4 px-4">
                    {item.rsvpStatus === 'yes' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 size={13} /> Attending</span>
                    ) : item.rsvpStatus === 'declined' ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-bold"><UserX size={13} /> Declined</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-bold"><Clock3 size={13} /> Maybe</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-slate-500">{new Date(item.submittedAt).toLocaleString()}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-full border text-[9px] uppercase font-black ${statusClass(item.status)}`}>{item.status}</span>
                    {item.reviewedBy && <p className="text-[9px] text-slate-400 mt-2">Reviewed by {item.reviewedBy}</p>}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {item.status !== 'approved' ? (
                      <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button disabled={actingId === item.id} onClick={() => review(item, 'approved')} title="Approve and generate pass" className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-all hover:scale-105"><UserCheck size={14} /></button>
                        <button disabled={actingId === item.id} onClick={() => review(item, 'waitlisted')} title="Waitlist" className="p-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition-all hover:scale-105"><Clock3 size={14} /></button>
                        <button disabled={actingId === item.id} onClick={() => review(item, 'rejected')} title="Reject" className="p-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 transition-all hover:scale-105"><UserX size={14} /></button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 size={14} /> Pass created</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-950 text-slate-300 p-4 text-[11px] leading-relaxed flex gap-3">
        <Users size={16} className="text-yellow-400 shrink-0 mt-0.5" />
        <p>Click any registrant row to open the full registration card. Approving creates the participant and pass; waitlisted and rejected requests do not consume participant passes.</p>
      </div>

      {showClearConfirm && (
        <div
          className="eventz-overlay fixed inset-0 z-[130] bg-slate-950/45 backdrop-blur-xl flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !clearing) setShowClearConfirm(false);
          }}
        >
          <div className="eventz-modal w-full max-w-md rounded-[30px] bg-white/95 border border-white shadow-2xl p-6">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
              <Trash2 size={18} />
            </div>
            <h3 className="text-lg font-black text-slate-950 mt-4">Clear registration list?</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-2">
              This deletes the registration-request history for the current event. Approved participants and their generated passes remain in Manage Passes.
            </p>
            <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-100 p-3 text-[10px] text-amber-800 font-semibold">
              {items.length} registration record{items.length === 1 ? '' : 's'} will be removed from this list.
            </div>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                type="button"
                disabled={clearing}
                onClick={() => setShowClearConfirm(false)}
                className="py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-black hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={clearRegistrationList}
                className="py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {clearing ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {clearing ? 'Clearing...' : 'Clear List'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="eventz-reg-backdrop fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-xl flex items-center justify-center p-4 md:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="eventz-reg-card w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-[32px] bg-white/95 backdrop-blur-2xl border border-white/70 shadow-[0_40px_120px_rgba(15,23,42,0.35)]">
            <div className="sticky top-0 z-10 bg-white/85 backdrop-blur-2xl border-b border-slate-100 px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full border text-[9px] uppercase font-black ${statusClass(selected.status)}`}>{selected.status}</span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[9px] font-black uppercase">{selected.categoryName || 'Attendees'}</span>
                </div>
                <h3 className="text-2xl font-black text-slate-950 mt-3 tracking-tight">{selected.fullName}</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-1">{selected.id}</p>
              </div>
              <button onClick={() => setSelected(null)} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all hover:rotate-90 duration-300">
                <X size={17} />
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-7">
              <div className="grid md:grid-cols-2 gap-4">
                <InfoCard icon={<Mail size={15} />} label="Email" value={selected.email || 'Not provided'} />
                <InfoCard icon={<Phone size={15} />} label="Phone" value={selected.phone || 'Not provided'} />
                <InfoCard icon={<Users size={15} />} label="Organization" value={selected.organization || 'Independent'} />
                <InfoCard icon={<MapPin size={15} />} label="Category / access request" value={selected.categoryName || 'Attendees'} />
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">RSVP</p>
                  <p className={`text-sm font-black mt-2 ${selected.rsvpStatus === 'declined' ? 'text-rose-700' : 'text-slate-900'}`}>
                    {selected.rsvpStatus === 'yes' ? 'Attending' : selected.rsvpStatus === 'declined' ? 'Declined' : 'Maybe / undecided'}
                  </p>
                  {selected.rsvpUpdatedAt && <p className="text-[9px] text-slate-400 mt-1">{new Date(selected.rsvpUpdatedAt).toLocaleString()}</p>}
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Approval email</p>
                  <p className={`text-sm font-black mt-2 ${selected.approvalEmailStatus === 'failed' ? 'text-rose-700' : selected.approvalEmailStatus === 'sent' ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {selected.approvalEmailStatus === 'sent' ? 'Sent' : selected.approvalEmailStatus === 'failed' ? 'Failed' : selected.approvalEmailStatus === 'skipped' ? 'Skipped' : 'Not sent'}
                  </p>
                  {selected.approvalEmailSentAt && <p className="text-[9px] text-slate-400 mt-1">{new Date(selected.approvalEmailSentAt).toLocaleString()}</p>}
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Submitted</p>
                  <p className="text-sm font-black text-slate-900 mt-2">{new Date(selected.submittedAt).toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Participant record</p>
                  <p className="text-sm font-black text-slate-900 mt-2 break-all">{selected.participantId || 'Not created yet'}</p>
                </div>
              </div>

              {selected.approvalEmailError && (
                <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
                  <p className="text-[9px] uppercase font-black tracking-wider text-rose-500">Approval email delivery issue</p>
                  <p className="text-xs text-rose-700 mt-2 leading-relaxed">{selected.approvalEmailError}</p>
                </div>
              )}

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Registrant note</p>
                <p className="text-sm text-slate-700 leading-relaxed mt-2 whitespace-pre-wrap">{selected.notes || 'No additional information was submitted.'}</p>
              </div>

              {(selected.reviewedAt || selected.reviewedBy || selected.rejectionReason) && (
                <div className="rounded-2xl border border-slate-100 p-5">
                  <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Review history</p>
                  <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                    <div><span className="text-slate-400">Reviewed by</span><p className="font-bold text-slate-800 mt-1">{selected.reviewedBy || '—'}</p></div>
                    <div><span className="text-slate-400">Reviewed at</span><p className="font-bold text-slate-800 mt-1">{selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString() : '—'}</p></div>
                  </div>
                  {selected.rejectionReason && <p className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3">{selected.rejectionReason}</p>}
                </div>
              )}

              {selected.status !== 'approved' && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button disabled={actingId === selected.id} onClick={() => review(selected, 'approved')} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"><UserCheck size={14} /> Approve & Create Pass</button>
                  <button disabled={actingId === selected.id} onClick={() => review(selected, 'waitlisted')} className="flex-1 py-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black flex items-center justify-center gap-2 transition-all"><Clock3 size={14} /> Waitlist</button>
                  <button disabled={actingId === selected.id} onClick={() => review(selected, 'rejected')} className="flex-1 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black flex items-center justify-center gap-2 transition-all"><UserX size={14} /> Reject</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 transition-all duration-300 hover:bg-white hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[9px] uppercase font-black tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-slate-900 mt-2 break-words">{value}</p>
    </div>
  );
}
