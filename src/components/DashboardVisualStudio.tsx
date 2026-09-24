import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Layers3,
  PlayCircle,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react';
import { EventDetails } from '../types.js';
import { eventzAuthHeaders } from '../utils/auth.js';

interface Props {
  event: EventDetails;
  onChange: (patch: Partial<EventDetails>) => void;
  onPersistMedia: (patch: Partial<EventDetails>) => Promise<void>;
}

const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm'
]);

function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This video could not be inspected. Try MP4 or WebM.'));
    };
    video.src = url;
  });
}

export default function DashboardVisualStudio({ event, onChange, onPersistMedia }: Props) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const uploadMedia = async (file?: File) => {
    setError('');
    setMessage('');
    if (!file) return;

    if (!ACCEPTED_TYPES.has(file.type)) {
      setError('Use PNG, JPG, WebP, GIF, MP4, or WebM.');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setError('Dashboard visual must be 12 MB or smaller.');
      return;
    }

    if (file.type.startsWith('video/')) {
      try {
        const duration = await readVideoDuration(file);
        if (duration > 30.5) {
          setError('Keep dashboard videos short — 30 seconds maximum.');
          return;
        }
      } catch (videoError: any) {
        setError(videoError?.message || 'Unable to inspect this video.');
        return;
      }
    }

    setUploading(true);
    try {
      const ticketResponse = await fetch('/api/dashboard-media/upload-ticket', {
        method: 'POST',
        headers: eventzAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size
        })
      });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) throw new Error(ticket.error || 'Unable to prepare dashboard visual upload.');

      const storage = createClient(ticket.supabaseUrl, ticket.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const { error: storageError } = await storage.storage
        .from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, {
          contentType: file.type,
          cacheControl: '3600'
        });

      if (storageError) throw new Error(storageError.message || 'Supabase Storage upload failed.');

      const mediaType = file.type === 'image/gif' ? 'gif' : file.type.startsWith('video/') ? 'video' : 'image';
      const activateResponse = await fetch('/api/dashboard-media/activate', {
        method: 'POST',
        headers: eventzAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          path: ticket.path,
          mediaType,
          name: file.name
        })
      });
      const data = await activateResponse.json();
      if (!activateResponse.ok) throw new Error(data.error || 'Dashboard visual uploaded but could not be activated.');

      const patch: Partial<EventDetails> = {
        dashboardMediaUrl: data.url,
        dashboardMediaPath: data.path,
        dashboardMediaType: data.mediaType,
        dashboardMediaName: data.name,
        dashboardMediaEnabled: true,
        dashboardMediaFit: event.dashboardMediaFit || 'cover',
        dashboardMediaPosition: event.dashboardMediaPosition || 'center',
        dashboardMediaOverlay: event.dashboardMediaOverlay ?? 28,
        dashboardMediaAutoplay: event.dashboardMediaAutoplay !== false,
        dashboardMediaLoop: event.dashboardMediaLoop !== false
      };

      onChange(patch);
      await onPersistMedia(patch);
      setMessage('Dashboard visual uploaded directly to Supabase Storage and activated.');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Dashboard visual upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = async () => {
    if (!event.dashboardMediaPath) {
      const patch: Partial<EventDetails> = {
        dashboardMediaUrl: null,
        dashboardMediaPath: null,
        dashboardMediaType: null,
        dashboardMediaName: null,
        dashboardMediaEnabled: false
      };
      onChange(patch);
      await onPersistMedia(patch);
      return;
    }

    if (!window.confirm('Remove the dashboard hero visual for this event?')) return;

    setRemoving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/dashboard-media', {
        method: 'DELETE',
        headers: eventzAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path: event.dashboardMediaPath })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to remove dashboard visual.');

      const patch: Partial<EventDetails> = {
        dashboardMediaUrl: null,
        dashboardMediaPath: null,
        dashboardMediaType: null,
        dashboardMediaName: null,
        dashboardMediaEnabled: false
      };
      onChange(patch);
      await onPersistMedia(patch);
      setMessage('Dashboard visual removed.');
    } catch (removeError: any) {
      setError(removeError?.message || 'Unable to remove dashboard visual.');
    } finally {
      setRemoving(false);
    }
  };

  const hasMedia = Boolean(event.dashboardMediaUrl);
  const mediaType = event.dashboardMediaType || 'image';

  return (
    <div className="rounded-[26px] border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0b1f4d] text-[#f2a900] flex items-center justify-center shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900">Dashboard Hero Visual</h4>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed max-w-xl">
              Upload an image, animated GIF, or short video. EVENTZ blends it into the command-center header with the immersive fade/overlap treatment used by modern gaming and media dashboards.
            </p>
          </div>
        </div>

        <label className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white px-4 py-2.5 text-[10px] font-black cursor-pointer disabled:opacity-50">
          <Upload size={13} />
          {uploading ? 'Uploading...' : hasMedia ? 'Replace Visual' : 'Upload Visual'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            className="hidden"
            disabled={uploading}
            onChange={(event) => uploadMedia(event.target.files?.[0])}
          />
        </label>
      </div>

      <div className="p-5 space-y-5">
        {error && <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-[10px] font-bold text-rose-700">{error}</div>}
        {message && <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-[10px] font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 size={12} />{message}</div>}

        {!hasMedia ? (
          <label className="group min-h-[190px] rounded-[24px] border-2 border-dashed border-slate-200 bg-[#f7f8fb] hover:bg-white hover:border-slate-300 flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-all">
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-white border border-slate-100 shadow-sm text-slate-600 flex items-center justify-center"><ImageIcon size={18} /></div>
              <div className="w-11 h-11 rounded-2xl bg-white border border-slate-100 shadow-sm text-slate-600 flex items-center justify-center"><Film size={18} /></div>
            </div>
            <p className="text-xs font-black text-slate-800 mt-4">Add the dashboard’s event visual</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-sm leading-relaxed">PNG/JPG/WebP/GIF or MP4/WebM · up to 12 MB · videos up to 30 seconds.</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
              className="hidden"
              disabled={uploading}
              onChange={(event) => uploadMedia(event.target.files?.[0])}
            />
          </label>
        ) : (
          <>
            <div className="relative min-h-[220px] overflow-hidden rounded-[24px] bg-[#08142f] border border-slate-200">
              <div className="absolute inset-0">
                {mediaType === 'video' ? (
                  <video
                    src={event.dashboardMediaUrl || ''}
                    autoPlay={event.dashboardMediaAutoplay !== false}
                    loop={event.dashboardMediaLoop !== false}
                    muted
                    playsInline
                    className="w-full h-full"
                    style={{
                      objectFit: event.dashboardMediaFit || 'cover',
                      objectPosition: event.dashboardMediaPosition || 'center'
                    }}
                  />
                ) : (
                  <img
                    src={event.dashboardMediaUrl || ''}
                    alt="Dashboard hero visual preview"
                    className="w-full h-full"
                    style={{
                      objectFit: event.dashboardMediaFit || 'cover',
                      objectPosition: event.dashboardMediaPosition || 'center'
                    }}
                  />
                )}
              </div>

              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, rgba(8,20,47,.98) 0%, rgba(8,20,47,.82) 26%, rgba(8,20,47,${Math.min(.72, Number(event.dashboardMediaOverlay ?? 28) / 100)}) 52%, rgba(8,20,47,.08) 100%)`
                }}
              />
              <div className="absolute inset-y-0 left-0 w-[62%] bg-[radial-gradient(circle_at_18%_35%,rgba(242,169,0,.18),transparent_36%)]" />

              <div className="relative z-10 h-full min-h-[220px] p-6 flex flex-col justify-center max-w-[55%]">
                <span className="text-[9px] font-black tracking-[0.18em] uppercase text-[#f2a900]">Preview</span>
                <h5 className="text-xl md:text-2xl font-black text-white mt-2 leading-tight">{event.eventName}</h5>
                <p className="text-[10px] text-white/55 mt-2">{event.venue}</p>
              </div>

              <div className="absolute bottom-3 right-3 rounded-full bg-black/35 border border-white/10 backdrop-blur px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                {mediaType === 'video' ? <PlayCircle size={10} /> : mediaType === 'gif' ? <Sparkles size={10} /> : <ImageIcon size={10} />}
                {mediaType}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Media fit</label>
                <select
                  value={event.dashboardMediaFit || 'cover'}
                  onChange={(e) => onChange({ dashboardMediaFit: e.target.value as 'cover' | 'contain' })}
                  className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                >
                  <option value="cover">Cover — immersive crop</option>
                  <option value="contain">Contain — show entire visual</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Focal position</label>
                <select
                  value={event.dashboardMediaPosition || 'center'}
                  onChange={(e) => onChange({ dashboardMediaPosition: e.target.value as EventDetails['dashboardMediaPosition'] })}
                  className="mt-1.5 w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Blend / overlay</label>
                <input
                  type="range"
                  min="0"
                  max="70"
                  value={event.dashboardMediaOverlay ?? 28}
                  onChange={(e) => onChange({ dashboardMediaOverlay: Number(e.target.value) })}
                  className="mt-3 w-full"
                />
                <p className="text-[9px] font-mono text-slate-400 mt-1">{event.dashboardMediaOverlay ?? 28}%</p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl bg-[#f7f8fb] border border-slate-100 p-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-800 truncate">{event.dashboardMediaName || 'Dashboard event visual'}</p>
                <p className="text-[9px] text-slate-400 mt-1">The visual fades into the EVENTZ command-center surface; it is not shown as a separate rectangular card.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={event.dashboardMediaEnabled !== false}
                    onChange={(e) => onChange({ dashboardMediaEnabled: e.target.checked })}
                  />
                  Show on dashboard
                </label>

                {mediaType === 'video' && (
                  <>
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={event.dashboardMediaAutoplay !== false}
                        onChange={(e) => onChange({ dashboardMediaAutoplay: e.target.checked })}
                      />
                      Autoplay
                    </label>
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={event.dashboardMediaLoop !== false}
                        onChange={(e) => onChange({ dashboardMediaLoop: e.target.checked })}
                      />
                      Loop
                    </label>
                  </>
                )}

                <button
                  type="button"
                  disabled={removing}
                  onClick={removeMedia}
                  className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[9px] font-black flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 size={11} /> {removing ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 flex gap-3">
          <Layers3 size={14} className="text-blue-700 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-800 leading-relaxed">
            The dashboard effect is responsive: the media occupies the right side on desktop, fades beneath the event information, and becomes a contained cinematic strip on tablets/phones so it never pushes analytics outside the main EVENTZ card.
          </p>
        </div>
      </div>
    </div>
  );
}
