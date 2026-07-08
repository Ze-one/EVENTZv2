/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EventDetails, Participant, PassStatus } from '../types.js';
import EventPassCard from './EventPassCard.tsx';
import { Save, Settings, Sliders, Palette, Calendar, MapPin, Info, CheckCircle2 } from 'lucide-react';

interface EventSettingsViewProps {
  event: EventDetails;
  onSave: (updatedEvent: EventDetails) => Promise<void>;
}

const mockPreviewParticipant: Participant = {
  id: 'part-mock',
  eventId: 'event-1',
  fullName: 'Alex Morgan',
  phone: '+234 812 000 4160',
  email: 'alex.morgan@example.com',
  organization: 'ETS N-TECH Corp',
  category: 'SPECIAL DELEGATE',
  passId: 'ETSN-2026-0416-X9Z8',
  status: PassStatus.NOT_USED,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// Preset palette colors
const BRAND_PRESETS = [
  { name: 'ETSNTECH Signature', primary: '#0f172a', accent: '#eab308' }, // Slate & Gold
  { name: 'Ocean Tech', primary: '#0284c7', accent: '#06b6d4' }, // Blue & Cyan
  { name: 'Forest Innovation', primary: '#14532d', accent: '#22c55e' }, // Green & Light Green
  { name: 'Brutal Dark', primary: '#171717', accent: '#f43f5e' }, // Charcoal & Rose
  { name: 'Corporate Blue', primary: '#1e3a8a', accent: '#3b82f6' } // Navy & Royal Blue
];

export default function EventSettingsView({ event, onSave }: EventSettingsViewProps) {
  const [formData, setFormData] = useState<EventDetails>({ ...event });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handlePresetSelect = (preset: typeof BRAND_PRESETS[0]) => {
    setFormData(prev => ({
      ...prev,
      primaryColor: preset.primary,
      accentColor: preset.accent
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await onSave(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
      {/* Left Form Panel */}
      <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
        {/* Panel 1: Event Information */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
              <Calendar size={15} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">Event Configuration</h3>
              <p className="text-[10px] text-slate-400">Configure logistics, venue, and description</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Name</label>
              <input
                type="text"
                name="eventName"
                value={formData.eventName}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Date</label>
              <input
                type="date"
                name="eventDate"
                value={formData.eventDate}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Time</label>
              <input
                type="time"
                name="eventTime"
                value={formData.eventTime}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-mono"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Venue Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <MapPin size={14} />
                </span>
                <input
                  type="text"
                  name="venue"
                  value={formData.venue}
                  onChange={handleInputChange}
                  required
                  className="w-full pl-10 pr-4 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Organizer / Brand Name</label>
              <input
                type="text"
                name="organizerName"
                value={formData.organizerName}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Event Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Panel 2: Pass Card Customization & Styling */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
              <Sliders size={15} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">Pass Layout Customizer</h3>
              <p className="text-[10px] text-slate-400">Define colors, toggles, and footers</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Credential Header Title</label>
              <input
                type="text"
                name="passTitle"
                value={formData.passTitle}
                onChange={handleInputChange}
                placeholder="e.g. DELEGATE PASS, VIP ACCESS"
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-bold"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Access Instruction Line</label>
              <input
                type="text"
                name="accessInstruction"
                value={formData.accessInstruction}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Footer Copyright Note</label>
              <input
                type="text"
                name="footerNote"
                value={formData.footerNote}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
              />
            </div>

            {/* Colors Pickers and Preset Palettes */}
            <div className="space-y-4 md:col-span-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                <Palette size={13} />
                <span>Primary & Accent Branding</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Primary Theme Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      name="primaryColor"
                      value={formData.primaryColor}
                      onChange={handleInputChange}
                      className="w-10 h-10 rounded border border-slate-200 p-0.5 cursor-pointer bg-white shrink-0"
                    />
                    <input
                      type="text"
                      name="primaryColor"
                      value={formData.primaryColor}
                      onChange={handleInputChange}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Accent Color (Borders/Gold Lines)</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      name="accentColor"
                      value={formData.accentColor}
                      onChange={handleInputChange}
                      className="w-10 h-10 rounded border border-slate-200 p-0.5 cursor-pointer bg-white shrink-0"
                    />
                    <input
                      type="text"
                      name="accentColor"
                      value={formData.accentColor}
                      onChange={handleInputChange}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Branding Quick Presets */}
              <div className="space-y-1.5 border-t border-slate-200/60 pt-3">
                <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">Quick Presets</label>
                <div className="flex flex-wrap gap-2">
                  {BRAND_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className="px-3 py-1.5 bg-white border border-slate-200/70 hover:border-slate-300 rounded-xl text-[10px] flex items-center gap-1.5 transition-all text-slate-600 font-medium"
                    >
                      <span className="flex gap-1 shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: preset.primary }}></span>
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: preset.accent }}></span>
                      </span>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Fields Visibility Toggles */}
            <div className="space-y-3 md:col-span-2 pt-2">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                Fields Visibility on Generated Passes
              </span>

              <div className="grid grid-cols-2 gap-3 bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
                <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    name="showPhone"
                    checked={formData.showPhone}
                    onChange={handleInputChange}
                    className="w-4.5 h-4.5 rounded text-slate-900 border-slate-300 focus:ring-slate-900 transition-all cursor-pointer"
                  />
                  Show Phone Number
                </label>

                <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    name="showEmail"
                    checked={formData.showEmail}
                    onChange={handleInputChange}
                    className="w-4.5 h-4.5 rounded text-slate-900 border-slate-300 focus:ring-slate-900 transition-all cursor-pointer"
                  />
                  Show Email Address
                </label>

                <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    name="showOrganization"
                    checked={formData.showOrganization}
                    onChange={handleInputChange}
                    className="w-4.5 h-4.5 rounded text-slate-900 border-slate-300 focus:ring-slate-900 transition-all cursor-pointer"
                  />
                  Show Organization
                </label>

                <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    name="showCategory"
                    checked={formData.showCategory}
                    onChange={handleInputChange}
                    className="w-4.5 h-4.5 rounded text-slate-900 border-slate-300 focus:ring-slate-900 transition-all cursor-pointer"
                  />
                  Show Participant Category
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Form controls */}
        <div className="flex items-center justify-end gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
          {saveSuccess && (
            <span className="text-emerald-600 font-bold text-xs flex items-center gap-1.5 animate-bounce">
              <CheckCircle2 size={14} />
              Branding Saved successfully!
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 shadow"
          >
            <Save size={14} />
            {saving ? 'Saving changes...' : 'Save and Apply Theme'}
          </button>
        </div>
      </form>

      {/* Right Real-time Live Design Preview Panel */}
      <div className="lg:col-span-5 space-y-4">
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow shadow-inner">
          <div className="flex items-center gap-1.5 font-extrabold text-sm border-b border-slate-800 pb-3">
            <Palette size={14} className="text-yellow-500 animate-pulse" />
            <span>Interactive Live Designer Canvas</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed mt-2 text-left">
            This viewport renders an interactive pass preview of a dummy delegate. Adjust the hex codes, custom header text, footers, or hide metadata checkboxes on the left—the pass elements, QR, and layout styles adapt <b>instantly</b> in real-time.
          </p>
        </div>

        {/* Live pass card container */}
        <div className="border border-slate-200 p-6 rounded-3xl bg-slate-50 flex items-center justify-center shadow-sm">
          <EventPassCard 
            participant={mockPreviewParticipant} 
            event={formData} 
            onPrint={() => alert('Print preview is mocked. Save settings first to print actual roster passes.')}
          />
        </div>
      </div>
    </div>
  );
}
