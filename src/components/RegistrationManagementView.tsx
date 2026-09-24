import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, Search, UserCheck, UserX, Users } from 'lucide-react';

type Registration = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  categoryName: string;
  rsvpStatus: 'yes' | 'maybe';
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted';
  notes?: string;
  participantId?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
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

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/attendee-requests?mode=registrations');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load registrations.');
      setItems(data);
    } catch (err: any) {
      setMessage(err?.message || 'Could not load registrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
      setMessage(data.capacityReached ? 'Category capacity was reached. Registration moved to waitlist.' : `Registration ${decision}.`);
      await load();
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

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-black text-slate-400">Registration desk</p>
          <h2 className="text-xl font-black text-slate-900 mt-1">Registration Requests</h2>
          <p className="text-xs text-slate-500 mt-1">Review public registrations before participant passes are created.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { window.open('/register', '_blank'); }} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50">Open Public Form</button>
          <button onClick={load} disabled={loading} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
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
          <button key={String(key)} onClick={() => setFilter(key as any)} className={`rounded-2xl border p-4 text-left transition-all ${filter === key ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
            <p className={`text-[9px] uppercase font-black tracking-wider ${filter === key ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
            <p className="text-2xl font-black font-mono mt-1">{count}</p>
          </button>
        ))}
      </div>

      {message && <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-700">{message}</div>}

      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, organization, category or registration ID..." className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-slate-900" />
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
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="py-4 px-4">
                    <p className="font-black text-slate-900 text-sm">{item.fullName}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{item.email || 'No email'} · {item.phone || 'No phone'}</p>
                    <p className="text-[10px] text-slate-400">{item.organization || 'Independent'} · <span className="font-mono">{item.id}</span></p>
                    {item.notes && <p className="mt-2 text-[10px] text-slate-600 bg-slate-50 rounded-lg p-2 max-w-sm">{item.notes}</p>}
                  </td>
                  <td className="py-4 px-4"><span className="font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-full">{item.categoryName || 'Attendees'}</span></td>
                  <td className="py-4 px-4">{item.rsvpStatus === 'yes' ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 size={13} /> Attending</span> : <span className="inline-flex items-center gap-1 text-amber-700 font-bold"><Clock3 size={13} /> Maybe</span>}</td>
                  <td className="py-4 px-4 text-slate-500">{new Date(item.submittedAt).toLocaleString()}</td>
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-full border text-[9px] uppercase font-black ${statusClass(item.status)}`}>{item.status}</span>
                    {item.reviewedBy && <p className="text-[9px] text-slate-400 mt-2">Reviewed by {item.reviewedBy}</p>}
                    {item.rejectionReason && <p className="text-[9px] text-rose-500 mt-1">{item.rejectionReason}</p>}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {item.status !== 'approved' ? (
                      <div className="inline-flex gap-1">
                        <button disabled={actingId === item.id} onClick={() => review(item, 'approved')} title="Approve and generate pass" className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"><UserCheck size={14} /></button>
                        <button disabled={actingId === item.id} onClick={() => review(item, 'waitlisted')} title="Waitlist" className="p-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40"><Clock3 size={14} /></button>
                        <button disabled={actingId === item.id} onClick={() => review(item, 'rejected')} title="Reject" className="p-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-40"><UserX size={14} /></button>
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

      <div className="rounded-2xl bg-slate-900 text-slate-300 p-4 text-[11px] leading-relaxed flex gap-3">
        <Users size={16} className="text-yellow-400 shrink-0 mt-0.5" />
        <p>Approving a registration creates the participant and generates a pass. Waitlisted and rejected registrations do not consume participant passes.</p>
      </div>
    </div>
  );
}
