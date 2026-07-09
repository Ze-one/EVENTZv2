import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, CheckCircle2, ShieldAlert, ShieldX, X, AlertTriangle, Clock, MailWarning } from 'lucide-react';
import { ScanLog, ScanResult, UserRole } from '../types.js';

type NoticeTone = 'success' | 'warning' | 'danger' | 'info';

interface Notice {
  id: string;
  title: string;
  body: string;
  tone: NoticeTone;
  createdAt: string;
  read: boolean;
}

const STORAGE_KEY = 'eventz_notifications_v1';
const LAST_SCAN_KEY = 'eventz_last_seen_scan_log_time';

function loadSessionUser() {
  try {
    const raw = localStorage.getItem('etsn_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadStoredNotices(): Notice[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function storeNotices(notices: Notice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notices.slice(0, 80)));
}

function requestBrowserPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
}

function showBrowserNotification(notice: Notice) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(notice.title, { body: notice.body, tag: notice.id, icon: '/favicon.svg' });
  } catch {}
}

function noticeFromScanLog(log: ScanLog): Notice {
  const name = log.participantName || 'Unknown attendee';
  const pass = log.passId || 'Unknown pass';
  const scanner = log.scannedBy || 'Gate';

  if (log.scanResult === ScanResult.VALID) {
    return {
      id: `scan-${log.id}`,
      title: 'Successful check-in',
      body: `${name} checked in successfully with pass ${pass}. Scanned by ${scanner}.`,
      tone: 'success',
      createdAt: log.createdAt,
      read: false
    };
  }

  if (log.scanResult === ScanResult.USED) {
    return {
      id: `scan-${log.id}`,
      title: 'Duplicate entry attempt',
      body: `Pass ${pass} was scanned again. This may be a reused or shared pass. Scanned by ${scanner}.`,
      tone: 'warning',
      createdAt: log.createdAt,
      read: false
    };
  }

  if (log.scanResult === ScanResult.CANCELLED) {
    return {
      id: `scan-${log.id}`,
      title: 'Cancelled pass detected',
      body: `Cancelled pass ${pass} was presented at the gate. Scanned by ${scanner}.`,
      tone: 'danger',
      createdAt: log.createdAt,
      read: false
    };
  }

  return {
    id: `scan-${log.id}`,
    title: 'Forgery / invalid pass alert',
    body: `Invalid pass ${pass} was scanned. This may be a forged or unknown pass. Scanned by ${scanner}.`,
    tone: 'danger',
    createdAt: log.createdAt,
    read: false
  };
}

function toneClasses(tone: NoticeTone) {
  if (tone === 'success') return 'bg-emerald-50 text-emerald-800 border-emerald-100';
  if (tone === 'warning') return 'bg-amber-50 text-amber-900 border-amber-100';
  if (tone === 'danger') return 'bg-rose-50 text-rose-900 border-rose-100';
  return 'bg-blue-50 text-blue-900 border-blue-100';
}

function toneIcon(tone: NoticeTone) {
  if (tone === 'success') return <CheckCircle2 size={15} />;
  if (tone === 'warning') return <ShieldAlert size={15} />;
  if (tone === 'danger') return <ShieldX size={15} />;
  return <MailWarning size={15} />;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationCenter() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>(() => loadStoredNotices());
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const initialized = useRef(false);

  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const unreadCount = useMemo(() => notices.filter((n) => !n.read).length, [notices]);

  const addNotices = (incoming: Notice[], sendBrowser = true) => {
    if (incoming.length === 0) return;
    setNotices((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      const unique = incoming.filter((item) => !seen.has(item.id));
      if (unique.length === 0) return prev;
      const merged = [...unique, ...prev].slice(0, 80);
      storeNotices(merged);
      if (sendBrowser) unique.slice(0, 4).forEach(showBrowserNotification);
      return merged;
    });
  };

  const pollScanLogs = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/scan-logs');
      if (!res.ok) return;
      const logs: ScanLog[] = await res.json();
      const sorted = [...logs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const storedLast = Number(localStorage.getItem(LAST_SCAN_KEY) || '0');
      const newestTime = sorted.reduce((max, log) => Math.max(max, new Date(log.createdAt).getTime() || 0), storedLast);

      if (!initialized.current) {
        initialized.current = true;
        localStorage.setItem(LAST_SCAN_KEY, String(newestTime));
        return;
      }

      const freshLogs = sorted.filter((log) => (new Date(log.createdAt).getTime() || 0) > storedLast);
      if (freshLogs.length > 0) {
        addNotices(freshLogs.map(noticeFromScanLog));
        localStorage.setItem(LAST_SCAN_KEY, String(newestTime));
      }
    } catch {}
  };

  useEffect(() => {
    const syncUser = () => setCurrentUser(loadSessionUser());
    syncUser();
    const interval = window.setInterval(syncUser, 4000);
    window.addEventListener('storage', syncUser);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    pollScanLogs();
    const interval = window.setInterval(pollScanLogs, 3500);
    return () => window.clearInterval(interval);
  }, [isAdmin]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const detail = custom.detail || {};
      const notice: Notice = {
        id: detail.id || `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: detail.title || 'EVENTZ activity',
        body: detail.body || 'An action was completed in the app.',
        tone: detail.tone || 'info',
        createdAt: new Date().toISOString(),
        read: false
      };
      addNotices([notice]);
    };
    window.addEventListener('eventz-notification', handler as EventListener);
    return () => window.removeEventListener('eventz-notification', handler as EventListener);
  }, []);

  const enableBrowserNotifications = () => {
    requestBrowserPermission();
    setBrowserEnabled(true);
  };

  const markAllRead = () => {
    setNotices((prev) => {
      const updated = prev.map((item) => ({ ...item, read: true }));
      storeNotices(updated);
      return updated;
    });
  };

  const clearAll = () => {
    setNotices([]);
    storeNotices([]);
  };

  if (!isAdmin) return null;

  return (
    <div className="fixed top-5 right-5 z-[130] font-sans text-left">
      <button
        onClick={() => { setOpen((prev) => !prev); if (!open) markAllRead(); }}
        className="relative bg-white/95 hover:bg-white text-slate-950 shadow-2xl border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black flex items-center gap-2 backdrop-blur"
      >
        {unreadCount > 0 ? <BellRing size={15} className="text-yellow-500 animate-pulse" /> : <Bell size={15} className="text-slate-600" />}
        Alerts
        {unreadCount > 0 && <span className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] min-w-5 h-5 px-1 rounded-full flex items-center justify-center shadow-lg">{unreadCount}</span>}
      </button>

      {open && (
        <div className="absolute top-14 right-0 w-[min(92vw,430px)] apple-card rounded-[2rem] p-4 animate-slide-up space-y-4">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><BellRing size={15} className="text-yellow-500" /> EVENTZ Push Alerts</h3>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">Live alerts for check-ins, duplicate use, cancelled passes, and possible forgeries.</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X size={15} /></button>
          </div>

          <div className="flex gap-2">
            <button onClick={enableBrowserNotifications} className="flex-1 bg-slate-950 hover:bg-slate-800 text-white text-[10px] font-black py-2.5 rounded-2xl">{browserEnabled ? 'Browser Alerts Enabled' : 'Enable Browser Alerts'}</button>
            <button onClick={markAllRead} className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded-2xl">Mark Read</button>
            <button onClick={clearAll} className="px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black rounded-2xl">Clear</button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {notices.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <AlertTriangle size={22} className="mx-auto mb-2 opacity-60" />
                <p className="text-xs font-bold">No alerts yet.</p>
                <p className="text-[10px] mt-1">New gate activity will appear here automatically.</p>
              </div>
            )}
            {notices.map((notice) => (
              <div key={notice.id} className={`border rounded-2xl p-3 ${toneClasses(notice.tone)} ${notice.read ? 'opacity-75' : 'shadow-sm'}`}>
                <div className="flex gap-3">
                  <div className="mt-0.5 shrink-0">{toneIcon(notice.tone)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black truncate">{notice.title}</p>
                      <span className="text-[9px] font-bold opacity-70 flex items-center gap-1"><Clock size={10} />{timeLabel(notice.createdAt)}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed mt-1 opacity-90">{notice.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
