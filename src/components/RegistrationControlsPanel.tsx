import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  KeyRound,
  Link2,
  Plus,
  Save,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { EventDetails } from '../types.js';

type Category = {
  id: string;
  name: string;
  description?: string;
  capacity?: number | null;
  isPublic?: boolean;
  isActive?: boolean;
};

type Invitation = {
  id: string;
  token: string;
  label: string;
  categoryId?: string | null;
  maxUses: number;
  usesCount: number;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
};

interface Props {
  value: EventDetails;
  onChange: (patch: Partial<EventDetails>) => void;
}

const toLocalDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

export default function RegistrationControlsPanel({ value, onChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [participants, setParticipants] = useState<Array<{ category?: string; status?: string }>>([]);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { capacity: string; isPublic: boolean; isActive: boolean }>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [savingCategory, setSavingCategory] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const [inviteForm, setInviteForm] = useState({
    label: 'Private invitation',
    categoryId: '',
    maxUses: '1',
    expiresAt: ''
  });

  const customFields = Array.isArray(value.customRegistrationFields) ? value.customRegistrationFields : [];

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [categoryRes, inviteRes, participantRes] = await Promise.all([
        fetch('/api/attendee-requests?mode=categories-admin', { cache: 'no-store' }),
        fetch('/api/attendee-requests?mode=invitations', { cache: 'no-store' }),
        fetch('/api/participants', { cache: 'no-store' })
      ]);
      const categoryData = await categoryRes.json();
      const inviteData = await inviteRes.json();
      const participantData = await participantRes.json();
      if (!categoryRes.ok) throw new Error(categoryData.error || 'Unable to load categories.');
      if (!inviteRes.ok) throw new Error(inviteData.error || 'Unable to load invitation links.');
      setCategories(categoryData);
      setInvitations(inviteData);
      if (participantRes.ok && Array.isArray(participantData)) setParticipants(participantData);
      const drafts: Record<string, { capacity: string; isPublic: boolean; isActive: boolean }> = {};
      categoryData.forEach((item: Category) => {
        drafts[item.id] = {
          capacity: item.capacity == null ? '' : String(item.capacity),
          isPublic: item.isPublic !== false,
          isActive: item.isActive !== false
        };
      });
      setCategoryDrafts(drafts);
    } catch (err: any) {
      setMessage(err?.message || 'Unable to load registration controls.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (id: string, patch: Record<string, any>) => {
    const next = customFields.map((field) => field.id === id ? { ...field, ...patch } : field);
    onChange({ customRegistrationFields: next });
  };

  const addCustomField = () => {
    const id = 'field-' + Math.random().toString(36).slice(2, 8);
    onChange({
      customRegistrationFields: [
        ...customFields,
        {
          id,
          label: 'New field',
          type: 'text',
          required: false,
          placeholder: '',
          options: []
        }
      ]
    });
  };

  const removeCustomField = (id: string) => {
    onChange({ customRegistrationFields: customFields.filter((field) => field.id !== id) });
  };

  const saveCategory = async (category: Category) => {
    const draft = categoryDrafts[category.id];
    if (!draft) return;
    setSavingCategory(category.id);
    setMessage('');
    try {
      const res = await fetch('/api/attendee-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'category',
          id: category.id,
          capacity: draft.capacity === '' ? null : Number(draft.capacity),
          isPublic: draft.isPublic,
          isActive: draft.isActive
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save category controls.');
      setCategories((items) => items.map((item) => item.id === category.id ? data.category : item));
      setMessage(`${category.name} registration controls saved.`);
    } catch (err: any) {
      setMessage(err?.message || 'Unable to save category controls.');
    } finally {
      setSavingCategory('');
    }
  };

  const createInvitation = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/attendee-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_invitation',
          label: inviteForm.label,
          categoryId: inviteForm.categoryId || null,
          maxUses: Number(inviteForm.maxUses || 1),
          expiresAt: inviteForm.expiresAt ? new Date(inviteForm.expiresAt).toISOString() : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to create invitation.');
      setInvitations((items) => [data.invitation, ...items]);
      setInviteForm({ label: 'Private invitation', categoryId: '', maxUses: '1', expiresAt: '' });
      setMessage('Invitation link created.');
    } catch (err: any) {
      setMessage(err?.message || 'Unable to create invitation.');
    }
  };

  const deleteInvitation = async (id: string) => {
    if (!window.confirm('Delete this invitation link? Existing registrations are not affected.')) return;
    setMessage('');
    try {
      const res = await fetch(`/api/attendee-requests?mode=invitation&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete invitation.');
      setInvitations((items) => items.filter((item) => item.id !== id));
      setMessage('Invitation deleted.');
    } catch (err: any) {
      setMessage(err?.message || 'Unable to delete invitation.');
    }
  };

  const invitationUrl = (token: string) => `${window.location.origin}/register?invite=${encodeURIComponent(token)}`;

  const copyInvitation = async (token: string) => {
    const url = invitationUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(''), 1600);
    } catch {
      window.prompt('Copy invitation link:', url);
    }
  };

  const activeParticipants = useMemo(
    () => participants.filter((participant) => participant.status !== 'Cancelled'),
    [participants]
  );

  const categoryUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    activeParticipants.forEach((participant) => {
      const key = participant.category || 'Attendees';
      usage[key] = (usage[key] || 0) + 1;
    });
    return usage;
  }, [activeParticipants]);

  const registrationStatus = useMemo(() => {
    if (value.registrationEnabled === false) return { label: 'Closed', className: 'bg-rose-50 text-rose-700 border-rose-100' };
    if (value.registrationDeadline && new Date(value.registrationDeadline).getTime() < Date.now()) return { label: 'Deadline passed', className: 'bg-amber-50 text-amber-700 border-amber-100' };
    if (value.registrationMode === 'invitation_only') return { label: 'Invitation only', className: 'bg-blue-50 text-blue-700 border-blue-100' };
    return { label: 'Open', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  }, [value.registrationEnabled, value.registrationDeadline, value.registrationMode]);

  return (
    <div className="apple-card p-6 rounded-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#fff4cc] border border-[#f2a900]/25 flex items-center justify-center text-[#0b1f4d]">
            <Settings2 size={16} />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm">Registration Controls</h3>
            <p className="text-[10px] text-slate-400">Control who can register, when registration closes, and how capacity is enforced.</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${registrationStatus.className}`}>
          {registrationStatus.label}
        </span>
      </div>

      {message && <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-[11px] font-bold text-slate-700">{message}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-xs font-black text-slate-800">Public registration portal</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Turn the registration page on or off without deleting any existing registrations.</p>
          </div>
          <input
            type="checkbox"
            checked={value.registrationEnabled !== false}
            onChange={(event) => onChange({ registrationEnabled: event.target.checked })}
            className="mt-1"
          />
        </label>

        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Registration mode</label>
          <select
            value={value.registrationMode || 'public'}
            onChange={(event) => onChange({ registrationMode: event.target.value as 'public' | 'invitation_only' })}
            className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-bold"
          >
            <option value="public">Public — anyone with the registration URL</option>
            <option value="invitation_only">Invitation only — private invite link required</option>
          </select>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Registration deadline</label>
          <input
            type="datetime-local"
            value={toLocalDateTime(value.registrationDeadline)}
            onChange={(event) => onChange({ registrationDeadline: event.target.value ? new Date(event.target.value).toISOString() : null })}
            className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono"
          />
          <p className="text-[9px] text-slate-400 mt-2">Leave blank to keep registration open until you switch it off manually.</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total event capacity</label>
          <input
            type="number"
            min="1"
            value={value.eventCapacity ?? ''}
            onChange={(event) => onChange({ eventCapacity: event.target.value ? Math.max(1, Number(event.target.value)) : null })}
            placeholder="Unlimited"
            className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono"
          />
          <p className="text-[9px] text-slate-400 mt-2">
            {activeParticipants.length} active pass{activeParticipants.length === 1 ? '' : 'es'} currently count toward capacity{value.eventCapacity ? ` · ${Math.max(0, value.eventCapacity - activeParticipants.length)} remaining` : ' · unlimited'}.
          </p>
        </div>

        <label className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-xs font-black text-slate-800">Waitlist when full</p>
            <p className="text-[10px] text-slate-500 mt-1">New registrations are waitlisted when the event or selected category has no remaining capacity.</p>
          </div>
          <input
            type="checkbox"
            checked={value.waitlistEnabled !== false}
            onChange={(event) => onChange({ waitlistEnabled: event.target.checked })}
            className="mt-1"
          />
        </label>

        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-xs font-black text-slate-800">Plus-one / guest registration</p>
              <p className="text-[10px] text-slate-500 mt-1">Allow a registrant to request additional named guest passes.</p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(value.allowGuests)}
              onChange={(event) => onChange({ allowGuests: event.target.checked })}
              className="mt-1"
            />
          </label>
          {value.allowGuests && (
            <div className="mt-3">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Maximum guests per registration</label>
              <input
                type="number"
                min="0"
                max="10"
                value={value.maxGuestsPerRegistration ?? 1}
                onChange={(event) => onChange({ maxGuestsPerRegistration: Math.max(0, Math.min(10, Number(event.target.value || 0))) })}
                className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono"
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-[#0b1f4d]" />
          <div>
            <h4 className="text-xs font-black text-slate-800">Category capacity & public visibility</h4>
            <p className="text-[9px] text-slate-400 mt-0.5">A category can be hidden from the public form while still remaining available for roster uploads or manual participants.</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loading && <div className="text-xs text-slate-400 py-4">Loading categories...</div>}
          {!loading && categories.map((category) => {
            const draft = categoryDrafts[category.id] || { capacity: '', isPublic: true, isActive: true };
            return (
              <div key={category.id} className="rounded-2xl border border-slate-100 bg-white p-3 grid md:grid-cols-[1fr_130px_110px_100px_auto] gap-3 items-center">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{category.name}</p>
                  <p className="text-[9px] text-slate-400 truncate">{category.description || 'Participant category'} · {categoryUsage[category.name] || 0} active</p>
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={draft.capacity}
                  onChange={(event) => setCategoryDrafts((prev) => ({ ...prev, [category.id]: { ...draft, capacity: event.target.value } }))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                />
                <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.isPublic}
                    onChange={(event) => setCategoryDrafts((prev) => ({ ...prev, [category.id]: { ...draft, isPublic: event.target.checked } }))}
                  />
                  Public
                </label>
                <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(event) => setCategoryDrafts((prev) => ({ ...prev, [category.id]: { ...draft, isActive: event.target.checked } }))}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => saveCategory(category)}
                  disabled={savingCategory === category.id}
                  className="px-3 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={12} /> {savingCategory === category.id ? 'Saving' : 'Save'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus size={14} className="text-[#0b1f4d]" />
            <div>
              <h4 className="text-xs font-black text-slate-800">Custom registration fields</h4>
              <p className="text-[9px] text-slate-400 mt-0.5">Add event-specific questions without changing the participant database schema.</p>
            </div>
          </div>
          <button type="button" onClick={addCustomField} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-700 flex items-center gap-2 hover:bg-slate-50">
            <Plus size={12} /> Add field
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {customFields.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-[10px] text-slate-400">No custom questions yet.</div>}
          {customFields.map((field) => (
            <div key={field.id} className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 grid md:grid-cols-[1.2fr_.7fr_1fr_auto] gap-3 items-start">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Question / label</label>
                <input value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Field type</label>
                <select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value })} className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs">
                  <option value="text">Text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Dropdown</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">{field.type === 'select' ? 'Options (comma-separated)' : 'Placeholder'}</label>
                <input
                  value={field.type === 'select' ? (field.options || []).join(', ') : (field.placeholder || '')}
                  onChange={(event) => updateField(field.id, field.type === 'select'
                    ? { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) }
                    : { placeholder: event.target.value })}
                  className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                />
                <label className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-600">
                  <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(field.id, { required: event.target.checked })} />
                  Required
                </label>
              </div>
              <button type="button" onClick={() => removeCustomField(field.id)} className="mt-5 w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center hover:bg-rose-100" title="Remove field">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2">
          <KeyRound size={14} className="text-[#0b1f4d]" />
          <div>
            <h4 className="text-xs font-black text-slate-800">Invitation-only links</h4>
            <p className="text-[9px] text-slate-400 mt-0.5">Create private links with optional category restrictions, expiry and usage limits.</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 grid md:grid-cols-4 gap-3">
          <input value={inviteForm.label} onChange={(event) => setInviteForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="Invitation label" className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs" />
          <select value={inviteForm.categoryId} onChange={(event) => setInviteForm((prev) => ({ ...prev, categoryId: event.target.value }))} className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs">
            <option value="">Any public category</option>
            {categories.filter((item) => item.isActive !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="1" max="500" value={inviteForm.maxUses} onChange={(event) => setInviteForm((prev) => ({ ...prev, maxUses: event.target.value }))} title="Maximum uses" className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs" />
            <input type="datetime-local" value={inviteForm.expiresAt} onChange={(event) => setInviteForm((prev) => ({ ...prev, expiresAt: event.target.value }))} title="Expiry" className="p-2.5 rounded-xl border border-slate-200 bg-white text-[10px]" />
          </div>
          <button type="button" onClick={createInvitation} className="px-3 py-2.5 rounded-xl bg-[#0b1f4d] text-white text-[10px] font-black flex items-center justify-center gap-2">
            <Link2 size={12} /> Create invite link
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {invitations.length === 0 && <div className="text-[10px] text-slate-400 py-2">No invitation links created yet.</div>}
          {invitations.map((invitation) => {
            const category = categories.find((item) => item.id === invitation.categoryId);
            return (
              <div key={invitation.id} className="rounded-2xl border border-slate-100 bg-white p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-800">{invitation.label}</p>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {category ? category.name : 'Any category'} · {invitation.usesCount}/{invitation.maxUses} used
                    {invitation.expiresAt ? ` · expires ${new Date(invitation.expiresAt).toLocaleString()}` : ' · no expiry'}
                  </p>
                  <p className="text-[9px] font-mono text-slate-400 mt-1 truncate">{invitationUrl(invitation.token)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => copyInvitation(invitation.token)} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-700 flex items-center gap-2">
                    {copiedToken === invitation.token ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copiedToken === invitation.token ? 'Copied' : 'Copy'}
                  </button>
                  <button type="button" onClick={() => deleteInvitation(invitation.id)} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {value.registrationMode !== 'invitation_only' && (
          <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 p-3 text-[10px] text-blue-700">
            Invitation links can already be created, but switch Registration Mode to <strong>Invitation only</strong> and save the event before they become mandatory.
          </div>
        )}
      </div>
    </div>
  );
}
