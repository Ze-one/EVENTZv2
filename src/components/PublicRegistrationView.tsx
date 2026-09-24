import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { EventDetails } from '../types.js';
import Logo from './Logo.tsx';

type Category = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  accessLevel?: string;
  instructions?: string;
  capacity?: number | null;
};

type CustomField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

type RegistrationConfig = {
  registrationEnabled: boolean;
  registrationMode: 'public' | 'invitation_only';
  registrationDeadline?: string | null;
  eventCapacity?: number | null;
  waitlistEnabled: boolean;
  allowGuests: boolean;
  maxGuestsPerRegistration: number;
  customRegistrationFields: CustomField[];
  deadlinePassed: boolean;
  invitationRequired: boolean;
  invitationValid: boolean;
  invitationLabel?: string | null;
  invitationCategoryId?: string | null;
  categories: Category[];
};

type Guest = {
  fullName: string;
  email: string;
  phone: string;
};

interface Props {
  event: EventDetails;
  onBack: () => void;
}

export default function PublicRegistrationView({ event, onBack }: Props) {
  const inviteToken = useMemo(() => new URLSearchParams(window.location.search).get('invite') || '', []);
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successRef, setSuccessRef] = useState('');
  const [successStatus, setSuccessStatus] = useState<'pending' | 'waitlisted'>('pending');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({});
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    organization: '',
    categoryId: '',
    rsvpStatus: 'yes',
    notes: ''
  });

  useEffect(() => {
    const url = '/api/attendee-requests?mode=registration-config' + (inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : '');
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load registration settings.');
        setConfig(data);
        setCategories(data.categories || []);
        if (data.categories?.length) {
          setForm((prev) => ({ ...prev, categoryId: prev.categoryId || data.categories[0].id }));
        }
      })
      .catch((err) => setError(err.message || 'Unable to load registration settings.'))
      .finally(() => setLoadingConfig(false));
  }, [inviteToken]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.categoryId),
    [categories, form.categoryId]
  );

  const registrationClosed =
    !loadingConfig &&
    config &&
    (!config.registrationEnabled || config.deadlinePassed || (config.invitationRequired && !config.invitationValid));

  const closedReason = (() => {
    if (!config) return '';
    if (!config.registrationEnabled) return 'Public registration is currently closed by the event organizer.';
    if (config.deadlinePassed) return 'The registration deadline for this event has passed.';
    if (config.invitationRequired && !config.invitationValid) return 'This is a private event. A valid invitation link is required to register.';
    return '';
  })();

  const addGuest = () => {
    if (!config?.allowGuests) return;
    if (guests.length >= config.maxGuestsPerRegistration) return;
    setGuests((items) => [...items, { fullName: '', email: '', phone: '' }]);
  };

  const updateGuest = (index: number, patch: Partial<Guest>) => {
    setGuests((items) => items.map((guest, guestIndex) => guestIndex === index ? { ...guest, ...patch } : guest));
  };

  const removeGuest = (index: number) => {
    setGuests((items) => items.filter((_, guestIndex) => guestIndex !== index));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/attendee-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'public_registration',
          ...form,
          inviteToken,
          guests,
          customAnswers
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration could not be submitted.');
      setSuccessRef(data.registration?.id || 'Submitted');
      setSuccessStatus(data.registration?.status === 'waitlisted' ? 'waitlisted' : 'pending');
    } catch (err: any) {
      setError(err?.message || 'Registration could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successRef) {
    const waitlisted = successStatus === 'waitlisted';
    return (
      <div className="eventz-public-page min-h-screen text-slate-900 flex flex-col">
        <header className="max-w-5xl w-full mx-auto px-5 py-6 flex items-center justify-between">
          <Logo size="md" variant="dark" />
          <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-900">Staff login</button>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 pb-16">
          <div className="eventz-card w-full max-w-xl bg-white/95 text-slate-900 rounded-[32px] p-8 text-center space-y-6">
            <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center border ${waitlisted ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              {waitlisted ? <Clock3 size={30} /> : <CheckCircle2 size={30} />}
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-[0.22em] font-black ${waitlisted ? 'text-amber-600' : 'text-emerald-600'}`}>
                {waitlisted ? 'Added to waitlist' : 'Registration received'}
              </p>
              <h1 className="text-2xl font-black mt-2">{waitlisted ? 'Your registration is on the waitlist' : 'Your request is awaiting review'}</h1>
              <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                {waitlisted
                  ? `The current event/category capacity is full. The event team can promote your request when space becomes available for ${event.eventName}.`
                  : `Your information has been submitted for ${event.eventName}. A pass is not created until the event team approves your registration.`}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Registration reference</span>
              <p className="font-mono font-black text-slate-900 mt-1">{successRef}</p>
              <p className="text-[10px] font-bold text-amber-700 mt-2">Tracking reference only — this is not an entry pass.</p>
            </div>
            {guests.length > 0 && (
              <p className="text-xs text-slate-500">{guests.length} guest request{guests.length === 1 ? '' : 's'} included. Guest passes are only created after approval.</p>
            )}
            <button onClick={() => window.location.reload()} className="w-full py-3 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800">
              Submit another registration
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="eventz-public-page min-h-screen text-slate-900">
      <header className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-between">
        <Logo size="md" variant="dark" />
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900">
          <ArrowLeft size={14} /> Staff login
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-5 pb-16 grid lg:grid-cols-[0.85fr_1.15fr] gap-5 items-start">
        <section className="eventz-card rounded-[30px] p-6 md:p-8 space-y-6">
          <div>
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#0b1f4d] bg-[#fff4cc] border border-[#f2a900]/30 rounded-full px-3 py-1.5">
              <ShieldCheck size={13} /> Official registration
            </span>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mt-5 leading-tight">{event.eventName}</h1>
            <p className="text-slate-500 text-sm leading-relaxed mt-4 max-w-xl">
              Register your interest for this event. Submissions are reviewed before an EVENTZ access pass is issued.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 flex gap-3">
              <Calendar size={17} className="text-yellow-500 shrink-0" />
              <div><p className="text-[10px] uppercase font-bold text-slate-500">Date & time</p><p className="text-xs font-bold mt-1">{event.eventDate} · {event.eventTime}</p></div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 flex gap-3">
              <MapPin size={17} className="text-yellow-500 shrink-0" />
              <div><p className="text-[10px] uppercase font-bold text-slate-500">Venue</p><p className="text-xs font-bold mt-1">{event.venue}</p></div>
            </div>
          </div>

          {config?.registrationMode === 'invitation_only' && config.invitationValid && (
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 flex gap-3 text-blue-800">
              <LockKeyhole size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black">Private invitation verified</p>
                <p className="text-[10px] mt-1">{config.invitationLabel || 'This link grants access to the registration form.'}</p>
              </div>
            </div>
          )}

          {config?.registrationDeadline && !config.deadlinePassed && (
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Registration closes</p>
              <p className="text-xs font-black mt-1">{new Date(config.registrationDeadline).toLocaleString()}</p>
            </div>
          )}

          <div className="rounded-3xl border border-slate-100 bg-[#f7f8fb] p-5">
            <h2 className="font-black text-sm">How registration works</h2>
            <div className="mt-4 space-y-4">
              {[
                ['1', 'Submit', 'Provide your details, category, guest information if permitted, and any event-specific questions.'],
                ['2', 'Review', 'The event team reviews your request against event and category capacity.'],
                ['3', 'Pass issued', 'Approved registrations become EVENTZ participant passes. If full, your request can be placed on the waitlist.']
              ].map(([n, title, body]) => (
                <div key={n} className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-yellow-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">{n}</div>
                  <div><p className="text-xs font-black">{title}</p><p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="eventz-card bg-white/95 text-slate-900 rounded-[30px] p-6 md:p-8">
          <div className="border-b border-slate-100 pb-5">
            <p className="text-[10px] uppercase tracking-[0.18em] font-black text-slate-400">Participant registration</p>
            <h2 className="text-xl font-black mt-1">Request event access</h2>
            <p className="text-xs text-slate-500 mt-2">Fields marked required are used to review and communicate your registration.</p>
          </div>

          {error && <div className="mt-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 p-4 text-xs font-semibold">{error}</div>}

          {loadingConfig ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading registration controls...</div>
          ) : registrationClosed ? (
            <div className="mt-6 rounded-3xl bg-slate-50 border border-slate-100 p-8 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-slate-100 text-slate-500 flex items-center justify-center">
                <AlertCircle size={20} />
              </div>
              <h3 className="text-lg font-black mt-4">Registration unavailable</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">{closedReason}</p>
              {config?.invitationRequired && !config.invitationValid && (
                <p className="text-[10px] text-slate-400 mt-3">Please open the private invitation link shared by the organizer.</p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-5">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">Full name *</label>
                <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-slate-900" placeholder="Your full name" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900" placeholder="name@example.com" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900" placeholder="+237..." />
                </div>
              </div>
              <p className="-mt-3 text-[10px] text-slate-400">At least one contact method — email or phone — is required.</p>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">Organization</label>
                <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900" placeholder="Company, school, community or independent" />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">Participant category *</label>
                <select required disabled={categories.length === 0} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-slate-900">
                  {categories.length === 0 && <option>No public categories available</option>}
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                {selectedCategory && (
                  <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-500 leading-relaxed">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: selectedCategory.color || '#0f172a' }} />
                      <span className="font-black text-slate-700">{selectedCategory.accessLevel || selectedCategory.name}</span>
                    </div>
                    {selectedCategory.description || 'Registration category selected.'}
                    {selectedCategory.capacity != null && <div className="mt-1 text-[9px] font-bold text-amber-700">Capacity-managed category</div>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">RSVP *</label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <button type="button" onClick={() => setForm({ ...form, rsvpStatus: 'yes' })} className={`rounded-xl border p-3 text-left transition-all ${form.rsvpStatus === 'yes' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                    <CheckCircle2 size={16} className={form.rsvpStatus === 'yes' ? 'text-emerald-600' : 'text-slate-400'} />
                    <p className="text-xs font-black mt-2">Yes, I plan to attend</p>
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, rsvpStatus: 'maybe' })} className={`rounded-xl border p-3 text-left transition-all ${form.rsvpStatus === 'maybe' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
                    <Clock3 size={16} className={form.rsvpStatus === 'maybe' ? 'text-amber-600' : 'text-slate-400'} />
                    <p className="text-xs font-black mt-2">Maybe / not yet sure</p>
                  </button>
                </div>
              </div>

              {config?.allowGuests && (
                <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-800">Plus-one / guests</p>
                      <p className="text-[10px] text-slate-500 mt-1">You may request up to {config.maxGuestsPerRegistration} guest pass{config.maxGuestsPerRegistration === 1 ? '' : 'es'}.</p>
                    </div>
                    <button type="button" onClick={addGuest} disabled={guests.length >= config.maxGuestsPerRegistration} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black text-slate-700 flex items-center gap-2 disabled:opacity-40">
                      <UserPlus size={12} /> Add guest
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {guests.map((guest, index) => (
                      <div key={index} className="rounded-2xl bg-white border border-slate-100 p-3 relative">
                        <button type="button" onClick={() => removeGuest(index)} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><X size={12} /></button>
                        <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Guest {index + 1}</p>
                        <div className="grid sm:grid-cols-3 gap-2 mt-2 pr-8">
                          <input required value={guest.fullName} onChange={(e) => updateGuest(index, { fullName: e.target.value })} placeholder="Full name *" className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs" />
                          <input type="email" value={guest.email} onChange={(e) => updateGuest(index, { email: e.target.value })} placeholder="Email" className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs" />
                          <input value={guest.phone} onChange={(e) => updateGuest(index, { phone: e.target.value })} placeholder="Phone" className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs" />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-2">If an email is provided, the guest receives their own pass and RSVP link after approval.</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(config?.customRegistrationFields || []).map((field) => (
                <div key={field.id}>
                  <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">{field.label}{field.required ? ' *' : ''}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      required={field.required}
                      value={String(customAnswers[field.id] || '')}
                      onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      rows={3}
                      placeholder={field.placeholder || ''}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900 resize-none"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      required={field.required}
                      value={String(customAnswers[field.id] || '')}
                      onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">Select...</option>
                      {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <label className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        required={field.required}
                        checked={Boolean(customAnswers[field.id])}
                        onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                      />
                      {field.placeholder || 'Yes'}
                    </label>
                  ) : (
                    <input
                      required={field.required}
                      value={String(customAnswers[field.id] || '')}
                      onChange={(e) => setCustomAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      placeholder={field.placeholder || ''}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900"
                    />
                  )}
                </div>
              ))}

              <div>
                <label className="text-[10px] uppercase tracking-wider font-black text-slate-500">Additional note</label>
                <textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900 resize-none" placeholder="Optional information for the event team" />
              </div>

              <button disabled={submitting || !form.categoryId} type="submit" className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white py-3.5 text-xs font-black flex items-center justify-center gap-2">
                <Users size={15} /> {submitting ? 'Submitting registration...' : 'Submit registration'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
