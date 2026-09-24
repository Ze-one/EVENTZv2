import React, { useState } from 'react';
import { Check, Image as ImageIcon, LayoutTemplate, LockKeyhole, QrCode, Upload, X } from 'lucide-react';
import {
  PASS_TEMPLATES,
  PassDesign,
  PassOrientation,
  PassTemplateId,
  QrPlacement,
  applyPassTemplate
} from '../pass-design.js';

interface Props {
  design: PassDesign;
  onChange: (next: PassDesign) => void;
}

export default function PassTemplateSelector({ design, onChange }: Props) {
  const [uploadError, setUploadError] = useState('');

  const chooseTemplate = (templateId: PassTemplateId) => {
    onChange(applyPassTemplate(design, templateId));
  };

  const handleTemplateUpload = (file?: File) => {
    setUploadError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Upload a PNG, JPG, WebP or SVG pass artwork.');
      return;
    }
    if (file.size > 1.8 * 1024 * 1024) {
      setUploadError('Template artwork is too large. Use an optimized image below 1.8 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...design,
        templateId: 'uploaded',
        customTemplateDataUrl: String(reader.result || ''),
        showBrandPanel: false,
        showTopNotch: false
      });
    };
    reader.onerror = () => setUploadError('Unable to read this image. Try another template file.');
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-950 text-white flex items-center justify-center shrink-0">
            <LayoutTemplate size={15} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800">Editable Pass Templates</h4>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Choose a built-in layout or upload artwork as the background. Participant details and the secure QR stay live and editable above the artwork.
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-[9px] font-black text-emerald-700">
          <LockKeyhole size={11} /> QR LOCKED ON
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {PASS_TEMPLATES.map((template) => {
          const active = design.templateId === template.id;
          return (
            <button
              type="button"
              key={template.id}
              onClick={() => chooseTemplate(template.id)}
              className={`group rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-1 hover:shadow-lg ${active ? 'border-slate-950 ring-2 ring-slate-950/10 bg-white' : 'border-slate-200 bg-white'}`}
            >
              <div
                className={`relative overflow-hidden border border-black/5 ${template.previewClass} ${template.orientation === 'landscape' ? 'aspect-[1.75/1] rounded-xl' : 'aspect-[.7/1] rounded-xl'}`}
              >
                <div className="absolute inset-0 p-2 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-6 h-6 rounded bg-white/90 border border-white/50"></div>
                    <div className="w-7 h-7 rounded bg-white p-0.5 grid place-items-center">
                      <QrCode size={18} className="text-slate-950" />
                    </div>
                  </div>
                  <div>
                    <div className="w-2/3 h-2 rounded-full bg-white/85"></div>
                    <div className="w-1/2 h-1.5 rounded-full bg-white/55 mt-1"></div>
                  </div>
                </div>
                {active && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-950 text-white flex items-center justify-center shadow">
                    <Check size={12} />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-black text-slate-800 mt-2">{template.name}</p>
              <p className="text-[9px] text-slate-400 leading-relaxed mt-1">{template.subtitle}</p>
            </button>
          );
        })}

        <label className={`group rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer ${design.templateId === 'uploaded' ? 'border-slate-950 ring-2 ring-slate-950/10 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
          <div className="relative overflow-hidden aspect-[.7/1] rounded-xl border border-slate-200 bg-white flex items-center justify-center">
            {design.customTemplateDataUrl ? (
              <img src={design.customTemplateDataUrl} alt="Uploaded pass template" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center px-3">
                <Upload size={20} className="mx-auto text-slate-400" />
                <p className="text-[9px] font-black text-slate-600 mt-2">Upload artwork</p>
              </div>
            )}
            {design.templateId === 'uploaded' && (
              <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-950 text-white flex items-center justify-center shadow">
                <Check size={12} />
              </div>
            )}
          </div>
          <p className="text-[10px] font-black text-slate-800 mt-2">Uploaded Template</p>
          <p className="text-[9px] text-slate-400 mt-1">Use your own badge/ticket artwork while keeping live EVENTZ fields.</p>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => handleTemplateUpload(event.target.files?.[0])} />
        </label>
      </div>

      {uploadError && <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-[10px] font-bold text-rose-700">{uploadError}</div>}

      {design.templateId === 'uploaded' && (
        <div className="rounded-2xl border border-slate-100 bg-[#f7f8fb] p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ImageIcon size={13} className="text-slate-500" />
              <span className="text-[10px] font-black text-slate-700">Uploaded artwork controls</span>
            </div>
            {design.customTemplateDataUrl && (
              <button
                type="button"
                onClick={() => onChange({ ...design, customTemplateDataUrl: '', templateId: 'eventz-classic' })}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-rose-600 flex items-center justify-center"
                title="Remove uploaded template"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Orientation</label>
              <select
                value={design.orientation}
                onChange={(event) => onChange({ ...design, orientation: event.target.value as PassOrientation })}
                className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
              >
                <option value="portrait">Portrait badge/card</option>
                <option value="landscape">Horizontal ticket</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Artwork fit</label>
              <select
                value={design.templateFit}
                onChange={(event) => onChange({ ...design, templateFit: event.target.value })}
                className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Overlay darkness</label>
              <input
                type="range"
                min="0"
                max="70"
                value={design.templateOverlayOpacity}
                onChange={(event) => onChange({ ...design, templateOverlayOpacity: Number(event.target.value) })}
                className="mt-3 w-full"
              />
              <p className="text-[9px] font-mono text-slate-400 mt-1">{design.templateOverlayOpacity}%</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-4 grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">QR position</label>
          <select
            value={design.qrPlacement}
            onChange={(event) => onChange({ ...design, qrPlacement: event.target.value as QrPlacement })}
            className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
          >
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-right">Bottom right</option>
            <option value="right-center">Right center</option>
            <option value="left-bottom">Left bottom</option>
          </select>
        </div>

        <div>
          <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">QR size</label>
          <input
            type="range"
            min="120"
            max="260"
            value={design.qrSize}
            onChange={(event) => onChange({ ...design, qrSize: Number(event.target.value) })}
            className="mt-3 w-full"
          />
          <p className="text-[9px] font-mono text-slate-400 mt-1">{design.qrSize}px</p>
        </div>

        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex gap-2 text-emerald-800">
          <QrCode size={14} className="shrink-0 mt-0.5" />
          <p className="text-[9px] leading-relaxed font-semibold">
            QR is always rendered by EVENTZ as a live secure layer. Uploaded artwork cannot replace or disable it.
          </p>
        </div>
      </div>
    </div>
  );
}
