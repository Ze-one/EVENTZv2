/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { EventDetails, Participant, PassStatus } from '../types.js';
import EventPassCard from './EventPassCard.tsx';
import { Save, Palette, Calendar, MapPin, CheckCircle2, TicketCheck, ShieldCheck, Users, Star, QrCode, Sparkles, Paintbrush, LayoutTemplate, Type, Eye, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import { EVENTZ_FULL_LOGO_DATA_URL } from '../assets/eventz-brand-logo.ts';

interface EventSettingsViewProps {
  event: EventDetails;
  onSave: (updatedEvent: EventDetails) => Promise<void>;
}

const mockPreviewParticipant: Participant = {
  id: 'part-mock', eventId: 'event-1', fullName: 'Alex Morgan', phone: '+237 6 75 00 00 00', email: 'alex.morgan@example.com', organization: 'ETS N-TECH Corp', category: 'VIP ACCESS', passId: 'EVTZ-2026-0416-X9Z8', status: PassStatus.NOT_USED, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
};

const DEFAULT_DESIGN = {
  type: 'eventz-pass-design', designType: 'ticket', backgroundColor: '#d8dcdf', topBarColor: '#d8dcdf', brandPanelColor: '#ffffff', textColor: '#020617', mutedTextColor: '#475569', logoBlockColor: '#ffffff', qrFrameColor: '#ffffff', primaryColor: '#0b1f4d', accentColor: '#f2a900', logoText: 'eventZ', slogan: 'manage your event access by ETS.NTECH', icon: 'eventz-logo', customLogoDataUrl: EVENTZ_FULL_LOGO_DATA_URL, logoFit: 'contain', cornerRadius: 32, qrSize: 208, showTopNotch: true, showBrandPanel: true, fontStyle: 'modern'
};

type PassDesign = typeof DEFAULT_DESIGN;

const BRAND_PRESETS = [
  { name: 'EVENTZ Classic', primary: '#0b1f4d', accent: '#f2a900', bg: '#d8dcdf', panel: '#ffffff' },
  { name: 'Executive Black', primary: '#020617', accent: '#facc15', bg: '#e5e7eb', panel: '#ffffff' },
  { name: 'Ocean Access', primary: '#075985', accent: '#06b6d4', bg: '#dbeafe', panel: '#f8fafc' },
  { name: 'Emerald Gate', primary: '#064e3b', accent: '#22c55e', bg: '#d1fae5', panel: '#ffffff' },
  { name: 'Royal Purple', primary: '#3b0764', accent: '#c084fc', bg: '#ede9fe', panel: '#ffffff' },
  { name: 'Red Carpet', primary: '#7f1d1d', accent: '#f59e0b', bg: '#fee2e2', panel: '#fff7ed' }
];

const ICONS = [
  { id: 'eventz-logo', label: 'EVENTZ Logo', Icon: ImageIcon },
  { id: 'ticket', label: 'Ticket', Icon: TicketCheck },
  { id: 'shield', label: 'Security', Icon: ShieldCheck },
  { id: 'users', label: 'People', Icon: Users },
  { id: 'star', label: 'VIP', Icon: Star },
  { id: 'qr', label: 'QR', Icon: QrCode },
  { id: 'sparkles', label: 'Premium', Icon: Sparkles }
];

function getDesign(event: EventDetails): PassDesign {
  try {
    const parsed = JSON.parse(event.logoPath || '{}');
    if (parsed?.type === 'eventz-pass-design') return { ...DEFAULT_DESIGN, ...parsed };
  } catch {}
  return { ...DEFAULT_DESIGN, primaryColor: event.primaryColor || DEFAULT_DESIGN.primaryColor, accentColor: event.accentColor || DEFAULT_DESIGN.accentColor };
}

export default function EventSettingsView({ event, onSave }: EventSettingsViewProps) {
  const [formData, setFormData] = useState<EventDetails>({ ...event });
  const [design, setDesign] = useState<PassDesign>(getDesign(event));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState('');

  const previewEvent = useMemo<EventDetails>(() => ({ ...formData, primaryColor: design.primaryColor, accentColor: design.accentColor, logoPath: JSON.stringify(design) }), [formData, design]);
  const updateDesign = (key: keyof PassDesign, value: any) => setDesign(prev => ({ ...prev, [key]: value }));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  };

  const useOfficialLogo = () => {
    setLogoUploadError('');
    setDesign(prev => ({ ...prev, icon: 'eventz-logo', customLogoDataUrl: EVENTZ_FULL_LOGO_DATA_URL, logoFit: 'contain', logoBlockColor: '#ffffff' }));
  };

  const handleLogoUpload = (file?: File) => {
    setLogoUploadError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setLogoUploadError('Please upload a valid image file for the pass logo.');
    if (file.size > 900 * 1024) return setLogoUploadError('Logo file is too large. Use an image below 900 KB so it can be saved with the pass design.');
    const reader = new FileReader();
    reader.onload = () => setDesign(prev => ({ ...prev, icon: 'custom-logo', customLogoDataUrl: String(reader.result || '') }));
    reader.onerror = () => setLogoUploadError('Unable to read this logo file. Try another PNG/JPG/WebP image.');
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (preset: typeof BRAND_PRESETS[0]) => {
    setDesign(prev => ({ ...prev, primaryColor: preset.primary, accentColor: preset.accent, backgroundColor: preset.bg, topBarColor: preset.bg, brandPanelColor: preset.panel }));
    setFormData(prev => ({ ...prev, primaryColor: preset.primary, accentColor: preset.accent }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setSaveSuccess(false);
    try {
      await onSave({ ...formData, primaryColor: design.primaryColor, accentColor: design.accentColor, logoPath: JSON.stringify(design) });
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
    } finally { setSaving(false); }
  };

  const colorInput = (label: string, key: keyof PassDesign) => (
    <div className="space-y-1.5"><label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">{label}</label><div className="flex gap-2"><input type="color" value={String(design[key])} onChange={(e) => updateDesign(key, e.target.value)} className="w-10 h-10 rounded border border-slate-200 p-0.5 cursor-pointer bg-white shrink-0" /><input type="text" value={String(design[key])} onChange={(e) => updateDesign(key, e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase" /></div></div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
      <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
        <div className="apple-card p-6 rounded-3xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600"><Calendar size={15} /></div><div><h3 className="font-extrabold text-slate-800 text-sm">Event Configuration</h3><p className="text-[10px] text-slate-400">Basic event details printed on the pass</p></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Name</label><input type="text" name="eventName" value={formData.eventName} onChange={handleInputChange} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Date</label><input type="date" name="eventDate" value={formData.eventDate} onChange={handleInputChange} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-mono" /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Time</label><input type="time" name="eventTime" value={formData.eventTime} onChange={handleInputChange} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-mono" /></div>
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Venue Address</label><div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"><MapPin size={14} /></span><input type="text" name="venue" value={formData.venue} onChange={handleInputChange} required className="w-full pl-10 pr-4 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div></div>
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Organizer / Brand Name</label><input type="text" name="organizerName" value={formData.organizerName} onChange={handleInputChange} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div>
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Description</label><textarea name="description" value={formData.description} onChange={handleInputChange} rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div>
          </div>
        </div>

        <div className="apple-card p-6 rounded-3xl space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600"><Paintbrush size={15} /></div><div><h3 className="font-extrabold text-slate-800 text-sm">Mini Pass Design Studio</h3><p className="text-[10px] text-slate-400">Customize background, official logo, icon, QR size, and ticket shape</p></div></div>

          <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs"><ImageIcon size={13} /><span>Top-Left Logo Block / Icon Library</span></div>
            <div className="grid grid-cols-1 md:grid-cols-[150px_1fr] gap-4 items-center">
              <div className="w-36 h-24 rounded-2xl border border-slate-200 flex items-center justify-center overflow-hidden p-2" style={{ backgroundColor: design.logoBlockColor }}>
                {design.customLogoDataUrl ? <img src={design.customLogoDataUrl} alt="Uploaded logo preview" className="w-full h-full" style={{ objectFit: design.logoFit as any }} /> : <div className="text-white font-black text-xl">{design.logoText.replace('Z', '')}<span style={{ color: design.accentColor }}>Z</span></div>}
              </div>
              <div className="space-y-3">
                <button type="button" onClick={useOfficialLogo} className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black px-4 py-3 rounded-2xl text-xs"><ImageIcon size={14} /> Use Official EVENTZ Logo</button>
                <label className="inline-flex ml-2 items-center gap-2 bg-slate-950 hover:bg-slate-800 text-white font-black px-4 py-3 rounded-2xl text-xs cursor-pointer"><Upload size={14} /> Upload Custom Logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => handleLogoUpload(e.target.files?.[0])} /></label>
                {design.customLogoDataUrl && <button type="button" onClick={() => updateDesign('customLogoDataUrl', '')} className="inline-flex ml-2 items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black px-4 py-3 rounded-2xl text-xs"><Trash2 size={14} /> Remove Logo</button>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Logo Fit</label><select value={design.logoFit} onChange={(e) => updateDesign('logoFit', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"><option value="contain">Contain - show full logo</option><option value="cover">Cover - fill the block</option></select></div><div>{colorInput('Logo Block Color', 'logoBlockColor')}</div></div>
                <p className="text-[10px] text-slate-400 leading-relaxed">The official EVENTZ logo has been added as an icon/logo option. It appears in the preview, generated passes, printed pass, and downloaded pass.</p>
                {logoUploadError && <p className="text-[10px] font-bold text-rose-600">{logoUploadError}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Credential Header Title</label><input type="text" name="passTitle" value={formData.passTitle} onChange={handleInputChange} placeholder="e.g. DELEGATE PASS, VIP ACCESS" required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-bold" /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Fallback Logo Text</label><input type="text" value={design.logoText} onChange={(e) => updateDesign('logoText', e.target.value)} placeholder="eventZ" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-bold" /></div>
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Slogan</label><input type="text" value={design.slogan} onChange={(e) => updateDesign('slogan', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div>
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Access Instruction Line</label><input type="text" name="accessInstruction" value={formData.accessInstruction} onChange={handleInputChange} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div>
            <div className="space-y-1 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Footer Note</label><input type="text" name="footerNote" value={formData.footerNote} onChange={handleInputChange} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all" /></div>
          </div>

          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs"><Palette size={13} /><span>Color Studio</span></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{colorInput('Main Brand Color', 'primaryColor')}{colorInput('Accent / Highlight Color', 'accentColor')}{colorInput('Ticket Background', 'backgroundColor')}{colorInput('Top Strip Background', 'topBarColor')}{colorInput('Brand Panel Background', 'brandPanelColor')}{colorInput('Main Text Color', 'textColor')}{colorInput('Muted Text Color', 'mutedTextColor')}{colorInput('QR Frame Background', 'qrFrameColor')}</div>
            <div className="space-y-1.5 border-t border-slate-200/60 pt-3"><label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Quick Themes</label><div className="flex flex-wrap gap-2">{BRAND_PRESETS.map((preset, idx) => <button key={idx} type="button" onClick={() => handlePresetSelect(preset)} className="px-3 py-1.5 bg-white border border-slate-200/70 hover:border-slate-300 rounded-xl text-[10px] flex items-center gap-1.5 transition-all text-slate-600 font-medium"><span className="flex gap-1 shrink-0"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: preset.primary }}></span><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: preset.accent }}></span><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: preset.bg }}></span></span>{preset.name}</button>)}</div></div>
          </div>

          <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs"><LayoutTemplate size={13} /><span>Layout & Icon Library</span></div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{ICONS.map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => id === 'eventz-logo' ? useOfficialLogo() : updateDesign('icon', id)} className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1 ${design.icon === id ? 'bg-slate-950 text-white border-slate-950' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}>{id === 'eventz-logo' ? <img src={EVENTZ_FULL_LOGO_DATA_URL} className="w-16 h-8 object-contain" /> : <Icon size={18} />}<span>{label}</span></button>)}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs"><div><label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">QR Size</label><input type="range" min="150" max="260" value={design.qrSize} onChange={(e) => updateDesign('qrSize', Number(e.target.value))} className="w-full" /><span className="font-mono text-slate-500">{design.qrSize}px</span></div><div><label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Corner Radius</label><input type="range" min="0" max="48" value={design.cornerRadius} onChange={(e) => updateDesign('cornerRadius', Number(e.target.value))} className="w-full" /><span className="font-mono text-slate-500">{design.cornerRadius}px</span></div><div><label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Font Style</label><select value={design.fontStyle} onChange={(e) => updateDesign('fontStyle', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"><option value="modern">Modern</option><option value="classic">Classic</option></select></div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700"><input type="checkbox" checked={design.showTopNotch} onChange={(e) => updateDesign('showTopNotch', e.target.checked)} /> Show ticket notch</label><label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700"><input type="checkbox" checked={design.showBrandPanel} onChange={(e) => updateDesign('showBrandPanel', e.target.checked)} /> Show central brand panel</label></div>
          </div>

          <div className="space-y-3 pt-2"><span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Fields Visibility on Generated Passes</span><div className="grid grid-cols-2 gap-3 bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">{[['showPhone', 'Show Phone Number'], ['showEmail', 'Show Email Address'], ['showOrganization', 'Show Organization'], ['showCategory', 'Show Category']].map(([name, label]) => <label key={name} className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700 select-none"><input type="checkbox" name={name} checked={(formData as any)[name]} onChange={handleInputChange} className="w-4.5 h-4.5 rounded text-slate-900 border-slate-300 focus:ring-slate-900 transition-all cursor-pointer" />{label}</label>)}</div></div>
        </div>

        <div className="flex items-center justify-end gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/50">{saveSuccess && <span className="text-emerald-600 font-bold text-xs flex items-center gap-1.5 animate-bounce"><CheckCircle2 size={14} /> Design saved</span>}<button type="submit" disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded-xl text-sm flex items-center gap-2 transition-all shadow disabled:opacity-50"><Save size={16} />{saving ? 'Saving Studio...' : 'Save Pass Design'}</button></div>
      </form>

      <div className="lg:col-span-5 lg:sticky lg:top-6 h-fit space-y-4"><div className="bg-slate-900 text-white p-4 rounded-3xl shadow-xl border border-slate-800"><div className="flex items-center gap-2 mb-4"><Eye size={16} className="text-yellow-400" /><div><h3 className="font-extrabold text-sm">Live Pass Preview</h3><p className="text-[10px] text-slate-400">Every design studio change appears here before saving.</p></div></div><EventPassCard participant={mockPreviewParticipant} event={previewEvent} /></div><div className="apple-card p-4 rounded-3xl text-xs text-slate-500 leading-relaxed"><div className="flex items-center gap-2 font-black text-slate-800 mb-1"><Type size={14} /> Design persistence</div>The official EVENTZ logo and all studio settings are saved into the event configuration and reused by previewed, generated, downloaded, printed, and emailed passes.</div></div>
    </div>
  );
}
