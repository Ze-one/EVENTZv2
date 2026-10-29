import { workspaceFetch } from '../utils/auth.js';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  X
} from 'lucide-react';
import { EventDetails } from '../types.js';

type Category = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  accessLevel?: string;
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
};

type RegistrationSummary = {
  id: string;
  categoryName: string;
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted';
  requestedSlots?: number;
};

type CustomRegistrationField = NonNullable<EventDetails['customRegistrationFields']>[number];

interface Props {
  value: EventDetails;
  onChange: (patch: Partial<EventDetails>) => void;
  onSaveSettings?: (value: EventDetails) => Promise<void>;
  settingsDirty?: boolean;
  savingSettings?: boolean;
  registrations?: RegistrationSummary[];
  onChanged?: () => void;
}

const toLocalDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

export default function RegistrationControlsPanel({
  value,
  onChange,
  onSaveSettings,
  settingsDirty = true,
  savingSettings = false,
  registrations = [],
  onChanged
}: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [savingCategoryId, setSavingCategoryId] = useState('');
  const [message, setMessage] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const [inviteForm, setInviteForm] = useState({
    label: 'Private invitation',
    categoryId: '',
    maxUses: '1',
    expiresAt: ''
  });

  const registrationState = useMemo(() => {
    if (value.registrationEnabled === false) return { label: 'Closed', tone: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (value.registrationDeadline && new Date(value.registrationDeadline).getTime() < Date.now()) {
      return { label: 'Deadline passed', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    if (value.registrationMode === 'invitation_only') {
      return { label: 'Private link', tone: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
    return { label: 'Public', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }, [value.registrationEnabled, value.registrationDeadline, value.registrationMode]);

  const customFields = Array.isArray(value.customRegistrationFields) ? value.customRegistrationFields : [];

  const categoryUsage = useMemo(() => {
    const usage = new Map<string, number>();
    registrations.forEach((registration) => {
      if (registration.status !== 'approved') return;
      const key = registration.categoryName || 'Attendees';
      usage.set(key, (usage.get(key) || 0) + Number(registration.requestedSlots || 1));
    });
    return usage;
  }, [registrations]);

  const loadInvitations = async () => {
    setLoadingInvites(true);
    try {
      const [categoryRes, inviteRes] = await Promise.all([
        workspaceFetch('/api/attendee-requests?mode=categories-admin', { cache: 'no-store' }),
        workspaceFetch('/api/attendee-requests?mode=invitations', { cache: 'no-store' })
      ]);
      const categoryData = await categoryRes.json();
      const inviteData = await inviteRes.json();
      if (categoryRes.ok && Array.isArray(categoryData)) setCategories(categoryData);
      if (!inviteRes.ok) throw new Error(inviteData.error || 'Unable to load invitation links.');
      setInvitations(Array.isArray(inviteData) ? inviteData : []);
    } catch (err: any) {
      setMessage(err?.message || 'Unable to load invitation links.');
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const saveRegistrationSettings = async () => {
    if (!onSaveSettings) return;
    setMessage('');
    try {
      await onSaveSettings(value);
      setMessage('Registration setup saved.');
    } catch (err: any) {
      setMessage(err?.message || 'Unable to save registration setup.');
    }
  };

  const patchCategory = (id: string, patch: Partial<Category>) => {
    setCategories((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const saveCategory = async (category: Category) => {
    setSavingCategoryId(category.id);
    setMessage('');
    try {
      const res = await workspaceFetch('/api/attendee-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'category',
          id: category.id,
          capacity: category.capacity ?? null,
          isPublic: category.isPublic !== false,
          isActive: category.isActive !== false
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save category.');
      setCategories((items) => items.map((item) => item.id === category.id ? { ...item, ...data.category } : item));
      setMessage(`${category.name} category updated.`);
      onChanged?.();
    } catch (err: any) {
      setMessage(err?.message || 'Unable to save category.');
    } finally {
      setSavingCategoryId('');
    }
  };

  const createInvitation = async () => {
    setMessage('');
    try {
      const res = await workspaceFetch('/api/attendee-requests', {
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
      setMessage('Private invitation link created.');
      onChanged?.();
    } catch (err: any) {
      setMessage(err?.message || 'Unable to create invitation.');
    }
  };

  const updateCustomField = (index: number, patch: Partial<CustomRegistrationField>) => {
    const next = customFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field);
    onChange({ customRegistrationFields: next });
  };

  const addCustomField = () => {
    const next: CustomRegistrationField = {
      id: `field-${Date.now().toString(36)}`,
      label: 'New question',
      type: 'text',
      required: false,
      placeholder: ''
    };
    onChange({ customRegistrationFields: [...customFields, next] });
  };

  const deleteCustomField = (index: number) => {
    onChange({ customRegistrationFields: customFields.filter((_, fieldIndex) => fieldIndex !== index) });
  };

  const deleteInvitation = async (id: string) => {
    if (!window.confirm('Delete this invitation link? Existing registrations are not affected.')) return;
    setMessage('');
    try {
      const res = await workspaceFetch(`/api/attendee-requests?mode=invitation&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to delete invitation.');
      setInvitations((items) => items.filter((item) => item.id !== id));
      setMessage('Invitation link deleted.');
      onChanged?.();
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

  return (
    <section className="apple-card rounded-3xl p-5 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#fff4cc] border border-[#f2a900]/25 flex items-center justify-center text-[#0b1f4d] shrink-0">
            <ShieldCheck size={17} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-base">Registration setup</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
              Control how people register, which categories are available, what questions they answer and which private links can be used.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${registrationState.tone}`}>
            {registrationState.label}
          </span>
          {onSaveSettings && (
            <button
              type="button"
              onClick={saveRegistrationSettings}
              disabled={savingSettings || !settingsDirty}
              className="px-3 py-2 rounded-xl bg-[#0b1f4d] text-white text-[10px] font-black flex items-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Save size={12} /> {savingSettings ? 'Saving...' : settingsDirty ? 'Save Registration Settings' : 'Settings Saved'}
            </button>
          )}
        </div>
      </div>

      {message && <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-[11px] font-bold text-slate-700">{message}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <label className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-xs font-black text-slate-800">Public/self-registration page</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Participants can submit their own request from the event registration link.</p>
          </div>
          <input
            type="checkbox"
            checked={value.registrationEnabled !== false}
            onChange={(event) => onChange({ registrationEnabled: event.target.checked })}
            className="mt-1"
          />
        </label>

        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Registration access</label>
          <select
            value={value.registrationMode || 'public'}
            onChange={(event) => onChange({ registrationMode: event.target.value as 'public' | 'invitation_only' })}
            className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-bold"
          >
            <option value="public">Public link plus staff approval</option>
            <option value="invitation_only">Private invitation link plus staff approval</option>
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
          <p className="text-[9px] text-slate-400 mt-2">Leave blank when registration should stay open until manually closed.</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4">
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total capacity</label>
          <input
            type="number"
            min="1"
            value={value.eventCapacity ?? ''}
            onChange={(event) => onChange({ eventCapacity: event.target.value ? Math.max(1, Number(event.target.value)) : null })}
            placeholder="Unlimited"
            className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-mono"
          />
          <p className="text-[9px] text-slate-400 mt-2">When full, new requests can be blocked or waitlisted.</p>
        </div>

        <label className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 flex items-start justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-xs font-black text-slate-800">Waitlist when full</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Use Waitlisted instead of rejecting requests automatically when capacity is exhausted.</p>
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
              <p className="text-xs font-black text-slate-800">Guest/plus-one requests</p>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Allow a registrant to request additional named guest passes.</p>
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
        <div>
          <h4 className="text-xs font-black text-slate-800">Categories</h4>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            Capacity, visibility and active state apply to the public registration portal and backend availability checks.
          </p>
        </div>

        <div className="mt-4 grid xl:grid-cols-2 gap-3">
          {categories.map((category) => {
            const used = categoryUsage.get(category.name) || 0;
            const capacity = category.capacity ?? null;
            const remaining = capacity == null ? 'Unlimited' : Math.max(0, Number(capacity) - used);
            return (
              <div key={category.id} className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: category.color || '#0b1f4d' }} />
                      <p className="text-xs font-black text-slate-900 truncate">{category.name}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{category.description || category.accessLevel || 'Registration category'}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase border ${category.isActive === false ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                    {category.isActive === false ? 'Inactive' : 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MetricTile label="Used" value={String(used)} />
                  <MetricTile label="Capacity" value={capacity == null ? 'Unlimited' : String(capacity)} />
                  <MetricTile label="Remaining" value={String(remaining)} />
                </div>

                <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    value={capacity ?? ''}
                    onChange={(event) => patchCategory(category.id, { capacity: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })}
                    placeholder="Unlimited"
                    className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono"
                    title="Category capacity"
                  />
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={category.isPublic !== false} onChange={(event) => patchCategory(category.id, { isPublic: event.target.checked })} />
                    {category.isPublic !== false ? <Eye size={12} /> : <EyeOff size={12} />} Public
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={category.isActive !== false} onChange={(event) => patchCategory(category.id, { isActive: event.target.checked })} />
                    Active
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => saveCategory(category)}
                  disabled={savingCategoryId === category.id}
                  className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingCategoryId === category.id ? 'Saving category...' : 'Save Category'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-black text-slate-800">Form Builder</h4>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Custom questions are saved with Registration Settings and rendered on the public registration form.
            </p>
          </div>
          <button type="button" onClick={addCustomField} className="px-3 py-2 rounded-xl bg-slate-950 text-white text-[10px] font-black flex items-center justify-center gap-2">
            <Plus size={12} /> Add Field
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {customFields.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-[10px] text-slate-400">
              No custom registration questions yet. The default public form still collects name, contact, organization, category, RSVP and notes.
            </div>
          )}
          {customFields.map((field, index) => (
            <div key={field.id || index} className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 space-y-3">
              <div className="grid lg:grid-cols-[1fr_150px_auto_auto] gap-2">
                <input
                  value={field.label}
                  onChange={(event) => updateCustomField(index, { label: event.target.value })}
                  placeholder="Question label"
                  className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold"
                />
                <select
                  value={field.type}
                  onChange={(event) => updateCustomField(index, { type: event.target.value as CustomRegistrationField['type'] })}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                >
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Select</option>
                  <option value="checkbox">Checkbox</option>
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateCustomField(index, { required: event.target.checked })} />
                  Required
                </label>
                <button type="button" onClick={() => deleteCustomField(index)} className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center" title="Delete field">
                  <X size={13} />
                </button>
              </div>
              {field.type !== 'checkbox' && (
                <input
                  value={field.placeholder || ''}
                  onChange={(event) => updateCustomField(index, { placeholder: event.target.value })}
                  placeholder="Placeholder text"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                />
              )}
              {field.type === 'select' && (
                <input
                  value={(field.options || []).join(', ')}
                  onChange={(event) => updateCustomField(index, { options: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                  placeholder="Options separated by commas"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <KeyRound size={15} className="text-[#0b1f4d] mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-slate-800">Private invitation links</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                Needed only when registration access is set to private invitation link.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 grid lg:grid-cols-[1fr_160px_170px_auto] gap-3">
          <input
            value={inviteForm.label}
            onChange={(event) => setInviteForm((prev) => ({ ...prev, label: event.target.value }))}
            placeholder="Invitation label"
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
          />
          <select
            value={inviteForm.categoryId}
            onChange={(event) => setInviteForm((prev) => ({ ...prev, categoryId: event.target.value }))}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
          >
            <option value="">Any category</option>
            {categories.filter((item) => item.isActive !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              max="500"
              value={inviteForm.maxUses}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, maxUses: event.target.value }))}
              title="Maximum uses"
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
            />
            <input
              type="datetime-local"
              value={inviteForm.expiresAt}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
              title="Expiry"
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-[10px]"
            />
          </div>
          <button type="button" onClick={createInvitation} className="px-3 py-2.5 rounded-xl bg-[#0b1f4d] text-white text-[10px] font-black flex items-center justify-center gap-2">
            <Link2 size={12} /> Create link
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {loadingInvites && <div className="text-[10px] text-slate-400 py-2">Loading invitation links...</div>}
          {!loadingInvites && invitations.length === 0 && <div className="text-[10px] text-slate-400 py-2">No private invitation links yet.</div>}
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
                  <button type="button" onClick={() => deleteInvitation(invitation.id)} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center" title="Delete invitation link">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {value.registrationMode !== 'invitation_only' && (
          <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 p-3 text-[10px] text-blue-700 flex gap-2">
            <UserPlus size={13} className="shrink-0 mt-0.5" />
            <span>Private links can be prepared now, but they are only required after Registration Access is set to private invitation link.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border border-slate-100 p-2.5">
      <p className="text-[8px] uppercase font-black tracking-wider text-slate-400">{label}</p>
      <p className="text-xs font-black text-slate-900 mt-1 truncate">{value}</p>
    </div>
  );
}
