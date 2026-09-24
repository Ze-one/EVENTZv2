/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { User, EventDetails, Participant, ScanLog, UserRole, PassStatus, ScanResult, EmailLog } from './types.js';
import Logo from './components/Logo.tsx';
import DashboardView from './components/DashboardView.tsx';
import EventSettingsView from './components/EventSettingsView.tsx';
import UploadParticipants from './components/UploadParticipants.tsx';
import ParticipantsListView from './components/ParticipantsListView.tsx';
import ReportsView from './components/ReportsView.tsx';
import ScannerComponent from './components/ScannerComponent.tsx';
import PublicRegistrationView from './components/PublicRegistrationView.tsx';
import RegistrationManagementView from './components/RegistrationManagementView.tsx';
import RsvpResponseView from './components/RsvpResponseView.tsx';
import AppHeader from './components/AppHeader.tsx';
import { GateDirection, parseEventzScanValue, queueOfflineClaim, verifyOfflineScan } from './utils/offlineGate.js';
import { EVENTZ_SESSION_TOKEN_KEY, eventzAuthHeaders } from './utils/auth.js';
import { 
  Users, Calendar, CheckSquare, BarChart2, LogOut, Camera, ShieldAlert, 
  CheckCircle2, Menu, X, ArrowLeft, Key, UserCheck, ShieldCheck, Eye, EyeOff, UserX, Trash2, RefreshCw, Sparkles
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Omit<User, 'passwordHash'> | null>(null);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const knownRegistrationIdsRef = useRef<Set<string>>(new Set());
  const registrationFeedReadyRef = useRef(false);
  
  // Navigation
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [rsvpToken, setRsvpToken] = useState('');

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

  // Authentication states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Active scanning / QR verify states
  const [selectedPassId, setSelectedPassId] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [selectedScanRaw, setSelectedScanRaw] = useState('');
  const [selectedScanToken, setSelectedScanToken] = useState('');
  const [selectedGateDirection, setSelectedGateDirection] = useState<GateDirection>('entry');

  // Custom non-blocking toaster alert notification state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch core settings and state from backend Express
  const fetchAllData = async () => {
    try {
      // 1. Event
      const resEv = await fetch('/api/event');
      if (resEv.ok) {
        const ev = await resEv.json();
        setEventDetails(ev);
      }

      // 2. Participants
      const resPart = await fetch('/api/participants');
      if (resPart.ok) {
        const pList = await resPart.json();
        setParticipants(pList);
      }

      // 3. Scan logs
      const resLogs = await fetch('/api/scan-logs');
      if (resLogs.ok) {
        const logsList = await resLogs.json();
        setScanLogs(logsList);
      }

      // 4. Email logs
      const resEmailLogs = await fetch('/api/email-logs');
      if (resEmailLogs.ok) {
        const emailLogsList = await resEmailLogs.json();
        setEmailLogs(emailLogsList);
      }
    } catch (err) {
      console.error('Error fetching backend core state:', err);
    }
  };

  // Mount logic
  useEffect(() => {
    // Sync session login on load
    const storedUser = localStorage.getItem('etsn_user');
    const storedSession = localStorage.getItem(EVENTZ_SESSION_TOKEN_KEY);
    if (storedUser && storedSession) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('etsn_user');
        localStorage.removeItem(EVENTZ_SESSION_TOKEN_KEY);
      }
    } else if (storedUser && !storedSession) {
      // Sessions created before signed server sessions were introduced must sign in again.
      localStorage.removeItem('etsn_user');
    }

    fetchAllData();

    // Direct url scanning verify checker
    const checkPathnameVerify = async () => {
      const path = window.location.pathname;
      if (path === '/register' || path.startsWith('/register/')) {
        setCurrentPage('public-registration');
        return;
      }
      if (path.startsWith('/rsvp/')) {
        const token = path.split('/rsvp/')[1];
        if (token) {
          setRsvpToken(token);
          setCurrentPage('rsvp');
          return;
        }
      }
      if (path.startsWith('/verify/')) {
        const passId = path.split('/verify/')[1];
        if (passId) {
          const rawScanValue = window.location.href;
          setSelectedPassId(decodeURIComponent(passId).toUpperCase());
          setCurrentPage('verify');
          handleVerifyQuery(rawScanValue, 'entry');
        }
      }
    };

    checkPathnameVerify();

    // Keep live feeds up to date automatically (responsive and updatable)
    const interval = setInterval(() => {
      fetchAllData();
    }, 4000);

    // Listen for back/forward browser button state
    window.addEventListener('popstate', checkPathnameVerify);
    return () => {
      window.removeEventListener('popstate', checkPathnameVerify);
      clearInterval(interval);
    };
  }, []);

  // Registration notification feed for administrators.
  // First poll establishes a baseline; later polls surface only genuinely new submissions.
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.ADMIN) {
      registrationFeedReadyRef.current = false;
      knownRegistrationIdsRef.current = new Set();
      setPendingRegistrations(0);
      return;
    }

    let cancelled = false;

    const pollRegistrations = async () => {
      try {
        const res = await fetch('/api/attendee-requests?mode=registrations', { cache: 'no-store' });
        if (!res.ok) return;
        const registrations = await res.json();
        if (cancelled || !Array.isArray(registrations)) return;

        const actionable = registrations.filter((item: any) => item.status === 'pending' || item.status === 'waitlisted');
        setPendingRegistrations(actionable.length);

        const currentIds = new Set<string>(registrations.map((item: any) => String(item.id)));
        if (!registrationFeedReadyRef.current) {
          knownRegistrationIdsRef.current = currentIds;
          registrationFeedReadyRef.current = true;
          return;
        }

        const newItems = registrations.filter((item: any) => !knownRegistrationIdsRef.current.has(String(item.id)));
        knownRegistrationIdsRef.current = currentIds;

        if (newItems.length > 0) {
          const newest = newItems[0];
          const label = newItems.length === 1
            ? `New registration from ${newest.fullName || 'a participant'}.`
            : `${newItems.length} new event registrations received.`;
          showToast(label, 'info');

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('EVENTZ · New registration', {
              body: newItems.length === 1
                ? `${newest.fullName || 'New participant'} · ${newest.categoryName || 'Attendee'}`
                : `${newItems.length} new registrations are waiting for review.`
            });
          }
        }
      } catch (error) {
        console.error('Registration notification polling failed:', error);
      }
    };

    pollRegistrations();
    const timer = window.setInterval(pollRegistrations, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser?.id, currentUser?.role]);

  // API: Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('etsn_user', JSON.stringify(data.user));
        if (data.sessionToken) localStorage.setItem(EVENTZ_SESSION_TOKEN_KEY, data.sessionToken);
        
        // Redirect gate officer to scanner page instantly, admin to dashboard
        if (data.user.role === UserRole.GATE_OFFICER) {
          setCurrentPage('scanner');
        } else {
          setCurrentPage('dashboard');
        }
      } else {
        const err = await res.json();
        setLoginError(err.error || 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      setLoginError('Server connection failure. Is database offline?');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('etsn_user');
    localStorage.removeItem(EVENTZ_SESSION_TOKEN_KEY);
    setCurrentPage('dashboard');
    // Clear URL if we were on a verification route
    if (window.location.pathname.includes('/verify/')) {
      window.history.pushState({}, '', '/');
    }
  };

  // API: Save settings
  const handleSaveEventSettings = async (updated: EventDetails) => {
    try {
      const res = await fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const saved = await res.json();
        setEventDetails(saved);
      }
    } catch (err) {
      console.error('Error saving event details:', err);
    }
  };

  // API: Upload batch participants
  const handleConfirmBatchUpload = async (list: any[]) => {
    try {
      const res = await fetch('/api/participants/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: list })
      });

      if (res.ok) {
        await fetchAllData();
        setCurrentPage('participants');
        showToast(`${list.length} passes generated and stored successfully!`, 'success');
      }
    } catch (err) {
      showToast('Failed to save attendee batch to database.', 'error');
    }
  };

  // API: Add individual participant
  const handleAddParticipant = async (p: { fullName: string; phone: string; email: string; organization: string; category: string }) => {
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // API: Update single participant state
  const handleUpdateParticipant = async (id: string, updates: Partial<Participant>) => {
    try {
      const res = await fetch(`/api/participants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // API: Delete participant
  const handleDeleteParticipant = async (id: string) => {
    try {
      const res = await fetch(`/api/participants/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAllData();
        showToast('Participant deleted successfully.', 'success');
      } else {
        showToast('Failed to delete participant.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error. Failed to delete.', 'error');
    }
  };

  // API: Bulk Delete participants
  const handleDeleteParticipants = async (ids: string[]) => {
    try {
      const res = await fetch('/api/participants/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        await fetchAllData();
        showToast(`Successfully deleted ${ids.length} participant(s).`, 'success');
      } else {
        showToast('Failed to delete selected participants.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error. Failed bulk delete.', 'error');
    }
  };

  // API: Reset single check-in
  const handleResetCheckIn = async (id: string) => {
    try {
      const res = await fetch(`/api/participants/${id}/reset`, { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // API: Wipe logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/scan-logs/clear', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // API: Share pass to participant email
  const handleSendEmail = async (id: string, email?: string, customMessage?: string) => {
    try {
      const res = await fetch(`/api/participants/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, customMessage })
      });
      if (res.ok) {
        showToast('Pass dispatch email initiated!', 'success');
        await fetchAllData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to dispatch pass email.', 'error');
      }
    } catch (err) {
      showToast('Server connection broken.', 'error');
    }
  };

  // API: Bulk share passes to participant emails
  const handleSendEmailsBulk = async (ids: string[], customMessage?: string) => {
    try {
      const res = await fetch('/api/participants/bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, customMessage })
      });
      if (res.ok) {
        showToast(`Pass dispatch initiated for ${ids.length} recipients!`, 'success');
        await fetchAllData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed bulk pass email dispatch.', 'error');
      }
    } catch (err) {
      showToast('Server connection broken.', 'error');
    }
  };

  // API: Wipe email dispatch logs
  const handleClearEmailLogs = async () => {
    try {
      const res = await fetch('/api/email-logs/clear', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
        showToast('Email dispatch history cleared.', 'success');
      }
    } catch (err) {
      showToast('Failed to clear dispatch history.', 'error');
    }
  };

  // API: Query gate verification. Signed QR values preserve the signature token;
  // manual Pass IDs remain an online fallback.
  const handleVerifyQuery = async (scanValue: string, direction: GateDirection = 'entry') => {
    const parsed = parseEventzScanValue(scanValue);
    const passId = parsed.passId;
    if (!passId) return;

    setVerifyLoading(true);
    setVerifyResult(null);
    setClaimSuccess(false);
    setSelectedPassId(passId);
    setSelectedScanRaw(scanValue);
    setSelectedScanToken(parsed.token);
    setSelectedGateDirection(direction);

    const localDate = new Date().toLocaleDateString('en-CA');
    window.history.pushState({}, '', `/verify/${encodeURIComponent(passId)}${parsed.token ? `?t=${encodeURIComponent(parsed.token)}` : ''}`);

    try {
      if (!navigator.onLine) throw new Error('offline');

      const scannedBy = currentUser ? currentUser.name : 'Web Scanner';
      const params = new URLSearchParams({
        scannedBy,
        direction,
        localDate
      });
      if (parsed.token) params.set('token', parsed.token);

      const res = await fetch(`/api/verify/${encodeURIComponent(passId)}?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      setVerifyResult(data?.status ? data : { status: 'Invalid', error: data?.error || 'Pass verification failed.' });
    } catch (err) {
      const offlineResult = verifyOfflineScan(scanValue, direction, localDate);
      setVerifyResult(offlineResult);
    } finally {
      setVerifyLoading(false);
    }
  };

  // API: Mark entry/exit. If venue connectivity drops after offline verification,
  // queue the signed transaction locally and reconcile when connectivity returns.
  const handleClaimPass = async (passId: string) => {
    setClaimLoading(true);
    setClaimSuccess(false);

    const checkedInBy = currentUser ? currentUser.name : 'Gate Officer';
    const localDate = new Date().toLocaleDateString('en-CA');

    try {
      if (!navigator.onLine || verifyResult?.offline) {
        if (!selectedScanToken) throw new Error('Offline gate claims require a signed QR scan.');
        queueOfflineClaim({
          rawValue: selectedScanRaw,
          direction: selectedGateDirection,
          checkedInBy,
          localDate
        });
        setClaimSuccess(true);
        showToast(`${selectedGateDirection === 'exit' ? 'Exit' : 'Entry'} recorded offline and queued for synchronization.`, 'success');
        setTimeout(() => handleReturnToScanner(), 1500);
        return;
      }

      const res = await fetch(`/api/verify/${encodeURIComponent(passId)}/claim`, {
        method: 'POST',
        headers: eventzAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          checkedInBy,
          token: selectedScanToken || undefined,
          direction: selectedGateDirection,
          localDate
        })
      });
      const data = await res.json();

      if (res.ok) {
        setClaimSuccess(true);
        if (data.risk?.reason) showToast(`Access recorded with security alert: ${data.risk.reason}`, 'info');
        await fetchAllData();
        setTimeout(() => handleReturnToScanner(), 1800);
      } else {
        setVerifyResult(data?.status ? data : verifyResult);
        showToast(data.error || 'Access transaction was denied.', 'error');
      }
    } catch (err: any) {
      if (selectedScanToken) {
        try {
          queueOfflineClaim({
            rawValue: selectedScanRaw,
            direction: selectedGateDirection,
            checkedInBy,
            localDate
          });
          setClaimSuccess(true);
          showToast('Connection dropped. Scan stored securely for later synchronization.', 'info');
          setTimeout(() => handleReturnToScanner(), 1500);
        } catch (offlineError: any) {
          showToast(offlineError?.message || err?.message || 'Unable to process access transaction.', 'error');
        }
      } else {
        showToast(err?.message || 'Network failure processing access transaction.', 'error');
      }
    } finally {
      setClaimLoading(false);
    }
  };

  const handleReturnToScanner = () => {
    setSelectedPassId('');
    setVerifyResult(null);
    setClaimSuccess(false);
    setSelectedScanRaw('');
    setSelectedScanToken('');
    setSelectedGateDirection('entry');
    setCurrentPage(currentUser?.role === UserRole.GATE_OFFICER ? 'scanner' : 'dashboard');
    window.history.pushState({}, '', '/');
  };

  const handlePageChange = (page: string) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    // Clear verification URL parameter context if navigating away
    if (page !== 'verify') {
      window.history.pushState({}, '', '/');
    }
  };

  const pageMeta: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Dashboard', subtitle: 'Live event access intelligence and operations.' },
    'event-settings': { title: 'Pass Designer', subtitle: 'Configure the event and credential experience.' },
    upload: { title: 'Upload Roster', subtitle: 'Import participants and organize them by category.' },
    registrations: { title: 'Registrations', subtitle: 'Review applications and manage RSVP activity.' },
    participants: { title: 'Manage Passes', subtitle: 'Search, communicate with, and control participant passes.' },
    reports: { title: 'Analytics & Audit', subtitle: 'Review attendance, email delivery, and gate activity.' },
    scanner: { title: 'Gate Scanner', subtitle: 'Verify credentials and process participant entry.' },
    verify: { title: 'Pass Verification', subtitle: 'Review the current credential verification result.' }
  };

  const activePageMeta = pageMeta[currentPage] || { title: 'EVENTZ', subtitle: 'Event access command center.' };

  // Loading Splash Screen
  if (!eventDetails) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 text-white font-sans">
        <Logo size="lg" variant="light" className="animate-pulse" />
        <div className="flex items-center gap-2 text-slate-400 font-mono text-xs">
          <RefreshCw className="animate-spin text-yellow-500" size={14} />
          Initialising secure database node...
        </div>
      </div>
    );
  }

  // PUBLIC REGISTRATION ROUTE — deliberately available without staff authentication.
  if (currentPage === 'public-registration') {
    return (
      <PublicRegistrationView
        event={eventDetails}
        onBack={() => {
          window.history.pushState({}, '', '/');
          setCurrentPage('dashboard');
        }}
      />
    );
  }

  // SECURE RSVP ROUTE — tokenized link sent only after approval.
  if (currentPage === 'rsvp' && rsvpToken) {
    return (
      <RsvpResponseView
        token={rsvpToken}
        onStaffLogin={() => {
          window.history.pushState({}, '', '/');
          setRsvpToken('');
          setCurrentPage('dashboard');
        }}
      />
    );
  }

  // LOGIN SCREEN GUARD
  if (!currentUser) {
    return (
      <div className="eventz-auth-page min-h-screen flex flex-col justify-between p-6 text-slate-900 font-sans relative overflow-hidden">
        {/* Top bar logo */}
        <div className="w-full flex justify-center py-4">
          <Logo size="md" variant="dark" />
        </div>

        {/* Login Central Card */}
        <div className="eventz-card w-full max-w-md mx-auto bg-white/95 border border-white rounded-[32px] p-6 md:p-8 relative z-10 space-y-6 text-left">
          <div className="text-center space-y-1.5">
            <h2 className="text-xl md:text-2xl font-black tracking-tight">Access Control Login</h2>
            <p className="text-slate-400 text-xs leading-relaxed">
              Authenticate via the secure gateway to manage digital passes and operate gates scanners.
            </p>
          </div>

          {loginError && (
            <div className="bg-rose-500/10 text-rose-300 border border-rose-500/20 p-3.5 rounded-2xl flex gap-2 text-xs">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-semibold">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Secure Email / ID</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-yellow-500 text-slate-900 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">System Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Key size={14} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-yellow-500 text-slate-900 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-950 font-black py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 mt-2"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="animate-spin text-slate-950" size={14} />
                  Verifying Cryptographic Credentials...
                </>
              ) : (
                'Open Secure Connection'
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Attending the event?</p>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, '', '/register');
                setCurrentPage('public-registration');
              }}
              className="w-full py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-[#0b1f4d] text-xs font-black transition-all hover:shadow-md"
            >
              Open Public Registration
            </button>
          </div>

        </div>

        {/* Footer info */}
        <div className="text-slate-500 text-[10px] text-center font-mono py-4 relative z-10">
          ETSNTECH Event Access System v1.4.2 • Protected Client Node
        </div>

        {/* Backdrops decorative */}
        <div className="absolute right-0 bottom-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-40 -mb-40"></div>
        <div className="absolute left-0 top-0 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none -ml-40 -mt-40"></div>
      </div>
    );
  }

  return (
    <div className="eventz-shell min-h-screen flex flex-col font-sans text-slate-800">
      
      <AppHeader
        currentUser={currentUser}
        participants={participants}
        onNavigate={handlePageChange}
        onMessage={showToast}
        menuOpen={mobileMenuOpen}
        onMenuToggle={() => setMobileMenuOpen((open) => !open)}
      />

      {/* Desktop sidebar navigation */}
      <header className="eventz-sidebar z-40">
        <div className="eventz-sidebar-inner">
          <nav className="eventz-nav hidden lg:flex text-xs font-bold">
            <button
              onClick={() => handlePageChange('dashboard')}
              data-active={currentPage === 'dashboard'}
              className={`px-4 py-2 rounded-xl transition-all ${
                currentPage === 'dashboard' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <BarChart2 size={13} /> <span>Dashboard</span>
            </button>

            {currentUser.role === UserRole.ADMIN && (
              <>
                <button
                  onClick={() => handlePageChange('event-settings')}
                  data-active={currentPage === 'event-settings'}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'event-settings' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <Calendar size={13} /> <span>Pass Designer</span>
                </button>
                <button
                  onClick={() => handlePageChange('upload')}
                  data-active={currentPage === 'upload'}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'upload' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <Users size={13} /> <span>Upload roster</span>
                </button>
                <button
                  onClick={() => handlePageChange('registrations')}
                  data-active={currentPage === 'registrations'}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                    currentPage === 'registrations' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <CheckSquare size={13} /> <span>Registrations</span>
                  {pendingRegistrations > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-yellow-400 text-slate-950 text-[9px] font-black flex items-center justify-center">
                      {pendingRegistrations > 99 ? '99+' : pendingRegistrations}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handlePageChange('participants')}
                  data-active={currentPage === 'participants'}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'participants' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <Users size={13} /> <span>Manage Passes</span>
                </button>
                <button
                  onClick={() => handlePageChange('reports')}
                  data-active={currentPage === 'reports'}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'reports' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <BarChart2 size={13} /> <span>Scan Audit Logs</span>
                </button>
              </>
            )}

            <button
              onClick={() => handlePageChange('scanner')}
              data-active={currentPage === 'scanner'}
              className={`px-4 py-2 rounded-xl transition-all ${
                currentPage === 'scanner' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <Camera size={13} /> <span>Gates Scanner</span>
            </button>
          </nav>

          <div className="eventz-sidebar-account hidden lg:block text-xs">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-slate-500 hover:text-slate-900 rounded-xl transition-all"
              title="Terminate Secure Session"
            >
              <LogOut size={14} />
              <span className="text-[10px] font-black">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation lives in a true overlay drawer, never in the page flow. */}
      {mobileMenuOpen && (
        <div className="eventz-mobile-nav-overlay lg:hidden">
          <button
            type="button"
            className="eventz-mobile-nav-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation"
          />

          <aside className="eventz-mobile-nav-drawer">
            <div className="eventz-mobile-nav-head">
              <button type="button" onClick={() => handlePageChange('dashboard')} className="eventz-mobile-nav-logo">
                <Logo size="sm" variant="dark" />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="eventz-mobile-nav-close"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="eventz-mobile-nav-user">
              <div className="w-10 h-10 rounded-2xl bg-[#0b1f4d] text-white flex items-center justify-center font-black text-xs">
                {currentUser.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900 truncate">{currentUser.name}</p>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 mt-0.5">
                  {currentUser.role.replace('_', ' ')}
                </p>
              </div>
            </div>

            <nav className="eventz-mobile-nav-list">
              <button onClick={() => handlePageChange('dashboard')} data-active={currentPage === 'dashboard'}>
                <BarChart2 size={17} /><span>Dashboard</span>
              </button>

              {currentUser.role === UserRole.ADMIN && (
                <>
                  <button onClick={() => handlePageChange('event-settings')} data-active={currentPage === 'event-settings'}>
                    <Calendar size={17} /><span>Pass Designer</span>
                  </button>
                  <button onClick={() => handlePageChange('upload')} data-active={currentPage === 'upload'}>
                    <Users size={17} /><span>Upload roster</span>
                  </button>
                  <button onClick={() => handlePageChange('registrations')} data-active={currentPage === 'registrations'}>
                    <CheckSquare size={17} /><span>Registrations</span>
                    {pendingRegistrations > 0 && (
                      <span className="eventz-mobile-nav-badge">{pendingRegistrations > 99 ? '99+' : pendingRegistrations}</span>
                    )}
                  </button>
                  <button onClick={() => handlePageChange('participants')} data-active={currentPage === 'participants'}>
                    <Users size={17} /><span>Manage Passes</span>
                  </button>
                  <button onClick={() => handlePageChange('reports')} data-active={currentPage === 'reports'}>
                    <BarChart2 size={17} /><span>Analytics & Audit</span>
                  </button>
                </>
              )}

              <button onClick={() => handlePageChange('scanner')} data-active={currentPage === 'scanner'} className="eventz-mobile-nav-scanner">
                <Camera size={17} /><span>Gate Scanner</span>
              </button>
            </nav>

            <div className="eventz-mobile-nav-footer">
              <button type="button" onClick={handleLogout}>
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 2. MAIN APPLICATION CONTENT PORTAL */}
      <main className="eventz-main flex-1 pb-20">
        <div className="eventz-topbar">
          <div className="eventz-topbar-copy">
            <div className="flex items-center gap-2">
              <h1>{activePageMeta.title}</h1>
              <span className="eventz-chip bg-emerald-50 text-emerald-700 border-emerald-100">LIVE</span>
            </div>
            <p>{activePageMeta.subtitle}</p>
          </div>

          <div className="eventz-date-pill hidden lg:flex items-center gap-2 rounded-full bg-white/80 border border-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm">
            <Sparkles size={12} className="text-yellow-500" />
            <span>{eventDetails.eventDate || 'Current event'}</span>
          </div>
        </div>

        <div key={currentPage} className="eventz-page-transition">

        {/* TAB PATH: ACTIVE DELEGATE QR VERIFICATION SCREEN */}
        {currentPage === 'verify' && (
          <div className="space-y-6 w-full max-w-lg mx-auto text-left">
            <button
              onClick={handleReturnToScanner}
              className="px-4 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all w-fit"
            >
              <ArrowLeft size={14} />
              Return to Gates Scanner
            </button>

            {verifyLoading ? (
              <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-xl flex flex-col items-center justify-center text-center gap-4">
                <RefreshCw className="animate-spin text-yellow-500" size={24} />
                <div className="space-y-1">
                  <p className="font-extrabold text-slate-800 text-sm">Validating pass code...</p>
                  <p className="text-slate-400 text-xs">Syncing logs with the cloud ledger</p>
                </div>
              </div>
            ) : verifyResult ? (
              <div className="space-y-6 animate-fade-in">
                {/* Result Type 1: VALID PASS */}
                {verifyResult.status === 'Valid' && verifyResult.participant && (
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
                    <div className="bg-emerald-600 text-white p-6 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
                        <ShieldCheck size={24} />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-emerald-200 tracking-wider uppercase">VERIFICATION PASSED</span>
                        <h2 className="text-xl font-black">VALID PASS</h2>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div className="space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">PARTICIPANT NAME</span>
                        <p className="text-xl font-extrabold text-slate-900">{verifyResult.participant.fullName}</p>
                        <p className="font-mono text-xs font-bold text-emerald-600 pt-1">🎫 ID: {verifyResult.participant.passId}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded-2xl border p-3 ${verifyResult.qrVerified ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Credential proof</span>
                          <p className={`text-[10px] font-black mt-1 ${verifyResult.qrVerified ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {verifyResult.qrVerified ? '✓ Signed QR verified' : 'Manual lookup — QR signature not proven'}
                          </p>
                        </div>
                        <div className={`rounded-2xl border p-3 ${verifyResult.offline ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Gate mode</span>
                          <p className="text-[10px] font-black mt-1 text-slate-700">
                            {verifyResult.offline ? 'Offline signed manifest' : 'Live cloud verification'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-700 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/60">
                        <div>
                          <span className="text-slate-400 text-[9px] block">CATEGORY</span>
                          <span className="font-bold text-slate-800">{verifyResult.participant.category || 'Attendee'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[9px] block">ORGANIZATION</span>
                          <span className="font-bold text-slate-800 truncate">{verifyResult.participant.organization || 'N/A'}</span>
                        </div>
                      </div>

                      {/* Prominent Check-in button */}
                      {claimSuccess ? (
                        <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-5 rounded-2xl text-center flex flex-col items-center justify-center gap-2 animate-bounce">
                          <CheckCircle2 size={32} className="text-emerald-600" />
                          <div className="space-y-0.5">
                            <p className="font-extrabold text-sm">{selectedGateDirection === 'exit' ? 'Exit Recorded Successfully!' : 'Access Recorded Successfully!'}</p>
                            <p className="text-[11px] text-emerald-600/80">{verifyResult?.offline ? 'Stored on this gate and queued for cloud synchronization.' : selectedGateDirection === 'exit' ? 'Participant presence is now recorded outside.' : 'Participant access has been recorded.'}</p>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleClaimPass(selectedPassId)}
                          disabled={claimLoading}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-sm transition-all shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-2"
                        >
                          {claimLoading ? (
                            <>
                              <RefreshCw className="animate-spin" size={16} />
                              Processing Claim...
                            </>
                          ) : (
                            <>
                              <UserCheck size={16} />
                              {selectedGateDirection === 'exit' ? 'RECORD EXIT' : verifyResult?.access?.entryMode === 'reentry' ? 'RECORD ENTRY' : 'MARK AS ENTERED'}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Result Type 2: ALREADY USED */}
                {verifyResult.status === 'Used' && verifyResult.participant && (
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
                    <div className="bg-amber-500 text-white p-6 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
                        <ShieldAlert size={24} />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-amber-200 tracking-wider uppercase">DUPLICATE ENTRY DETECTED</span>
                        <h2 className="text-xl font-black">ALREADY USED</h2>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div className="bg-amber-50 text-amber-950 border border-amber-200/50 p-4 rounded-2xl text-xs leading-relaxed">
                        <p className="font-bold text-amber-800 mb-0.5">Duplicate Warning</p>
                        This digital pass has already been scanned and verified. Admittance is denied unless reset by an Administrator.
                      </div>

                      <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                          <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">PARTICIPANT DETAILS</span>
                          <p className="text-base font-extrabold text-slate-800 mt-1">{verifyResult.participant.fullName}</p>
                          <p className="font-mono text-[10px] font-bold text-amber-600">🎫 ID: {verifyResult.participant.passId}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-700 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/60">
                          <div>
                            <span className="text-slate-400 text-[9px] block">FIRST CHECK-IN</span>
                            <span className="font-bold text-slate-800">{verifyResult.participant.checkedInAt ? new Date(verifyResult.participant.checkedInAt).toLocaleTimeString() : 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 text-[9px] block">VERIFIED BY</span>
                            <span className="font-bold text-slate-800 truncate">{verifyResult.participant.checkedInBy || 'System Gate'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {currentUser?.role === UserRole.ADMIN && (
                          <button
                            onClick={async () => {
                              if (confirm('Are you sure you want to override and clear check-in state for this guest?')) {
                                await handleResetCheckIn(verifyResult.participant!.id);
                                handleVerifyQuery(selectedPassId);
                              }
                            }}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs transition-all text-center"
                          >
                            Admin Override (Reset)
                          </button>
                        )}
                        <button
                          onClick={handleReturnToScanner}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition-all text-center"
                        >
                          Dismiss Result
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signed QR / day / access-rule denial */}
                {['InvalidSignature', 'NotAllowedToday', 'RuleDenied'].includes(verifyResult.status) && (
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
                    <div className={`${verifyResult.status === 'InvalidSignature' ? 'bg-rose-700' : 'bg-orange-600'} text-white p-6 flex items-center gap-4`}>
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
                        <ShieldAlert size={24} />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-white/70 tracking-wider uppercase">ACCESS CONTROL BLOCK</span>
                        <h2 className="text-xl font-black">
                          {verifyResult.status === 'InvalidSignature' ? 'QR SIGNATURE REJECTED' : verifyResult.status === 'NotAllowedToday' ? 'PASS NOT VALID TODAY' : 'ACCESS RULE DENIED'}
                        </h2>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-xs text-rose-800 font-semibold leading-relaxed">
                        {verifyResult.error || 'This credential cannot be accepted under its current access rules.'}
                      </div>
                      {verifyResult.participant && (
                        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                          <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Participant</p>
                          <p className="text-sm font-black text-slate-900 mt-1">{verifyResult.participant.fullName}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-1">{verifyResult.participant.passId}</p>
                        </div>
                      )}
                      {verifyResult.allowedDays?.length > 0 && (
                        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-[10px] text-blue-800">
                          Valid day(s): {verifyResult.allowedDays.join(', ')}
                        </div>
                      )}
                      <button onClick={handleReturnToScanner} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs">
                        Dismiss Result
                      </button>
                    </div>
                  </div>
                )}

                {/* Result Type 3: INVALID PASS / NOT FOUND */}
                {verifyResult.status === 'Invalid' && (
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
                    <div className="bg-rose-600 text-white p-6 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
                        <UserX size={24} />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-rose-200 tracking-wider uppercase">LEDGER LOOKUP FAILURE</span>
                        <h2 className="text-xl font-black">INVALID PASS</h2>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div className="bg-rose-50 text-rose-950 border border-rose-200/50 p-4 rounded-2xl text-xs leading-relaxed">
                        <p className="font-bold text-rose-800 mb-0.5">Forgery/Typo Detected</p>
                        The requested Pass ID: <code className="font-mono bg-rose-100 font-bold px-1.5 py-0.5 rounded text-rose-900">{selectedPassId}</code> is non-existent. Deny entrance.
                      </div>

                      <div className="text-slate-400 text-xs py-4 text-center leading-relaxed font-semibold">
                        ⚠️ Please double check the manual characters or request the delegate to present a freshly-generated pass containing the genuine system signature.
                      </div>

                      <button
                        onClick={handleReturnToScanner}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs transition-all shadow text-center"
                      >
                        Dismiss and Re-scan
                      </button>
                    </div>
                  </div>
                )}

                {/* Result Type 4: CANCELLED PASS */}
                {verifyResult.status === 'Cancelled' && verifyResult.participant && (
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
                    <div className="bg-slate-700 text-white p-6 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
                        <UserX size={24} />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">REVOKED ACCESS CREDENTIAL</span>
                        <h2 className="text-xl font-black">CANCELLED PASS</h2>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div className="bg-slate-50 text-slate-900 border p-4 rounded-2xl text-xs leading-relaxed">
                        <p className="font-bold text-slate-700 mb-0.5">Status Blocked</p>
                        This pass ID has been marked as <b>Cancelled</b> by an administrator.
                      </div>

                      <div className="space-y-1 bg-slate-50 p-4 rounded-2xl border text-xs">
                        <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">PARTICIPANT NAME</span>
                        <p className="text-base font-extrabold text-slate-800">{verifyResult.participant.fullName}</p>
                        <p className="font-mono text-[10px] text-slate-400">🎫 ID: {verifyResult.participant.passId}</p>
                      </div>

                      <button
                        onClick={handleReturnToScanner}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs transition-all shadow text-center"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400 text-xs">
                Scan log empty. Try scanning again.
              </div>
            )}
          </div>
        )}

        {/* TAB PATH: DASHBOARD */}
        {currentPage === 'dashboard' && (
          <DashboardView 
            participants={participants} 
            scanLogs={scanLogs} 
            event={eventDetails}
            onNavigate={handlePageChange}
            onRefresh={fetchAllData}
          />
        )}

        {/* TAB PATH: DESIGNER SETTINGS */}
        {currentPage === 'event-settings' && currentUser.role === UserRole.ADMIN && (
          <EventSettingsView 
            event={eventDetails} 
            onSave={handleSaveEventSettings}
          />
        )}

        {/* TAB PATH: UPLOAD ROSTER LIST */}
        {currentPage === 'upload' && currentUser.role === UserRole.ADMIN && (
          <UploadParticipants 
            onConfirm={handleConfirmBatchUpload} 
            onCancel={() => handlePageChange('dashboard')}
          />
        )}

        {/* TAB PATH: REGISTRATION REVIEW */}
        {currentPage === 'registrations' && currentUser.role === UserRole.ADMIN && (
          <RegistrationManagementView
            adminName={currentUser.name}
            onChanged={fetchAllData}
          />
        )}

        {/* TAB PATH: MANAGE PASSES TABLE */}
        {currentPage === 'participants' && currentUser.role === UserRole.ADMIN && (
          <ParticipantsListView 
            participants={participants} 
            event={eventDetails}
            onUpdateParticipant={handleUpdateParticipant}
            onDeleteParticipant={handleDeleteParticipant}
            onDeleteParticipants={handleDeleteParticipants}
            onResetCheckIn={handleResetCheckIn}
            onAddParticipant={handleAddParticipant}
            onSendEmail={handleSendEmail}
            onSendEmailsBulk={handleSendEmailsBulk}
            emailLogs={emailLogs}
          />
        )}

        {/* TAB PATH: SCAN AUDIT LOGS HISTORY */}
        {currentPage === 'reports' && currentUser.role === UserRole.ADMIN && (
          <ReportsView 
            scanLogs={scanLogs} 
            participants={participants} 
            emailLogs={emailLogs}
            onClearLogs={handleClearLogs}
            onClearEmailLogs={handleClearEmailLogs}
            onRefresh={fetchAllData}
          />
        )}

        {/* TAB PATH: GATES SCANNER VIEW */}
        {currentPage === 'scanner' && (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-slate-800">Scan Entrance Pass</h2>
              <p className="text-slate-400 text-xs">Scan the digital/printed credential to verify guest entry validity.</p>
            </div>

            <ScannerComponent 
              onScanResult={handleVerifyQuery} 
              participants={participants}
            />
          </div>
        )}

        </div>
      </main>

      {/* FOOTER BAR */}
      <footer className="eventz-footer text-slate-400 border-t border-slate-100 py-5 text-[10px] text-center font-mono mt-auto bg-white/35">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© 2026 ETS N-TECH. All rights reserved.</p>
          <p className="text-slate-600">Building IT Systems That Solve Societal Problems</p>
        </div>
      </footer>

      {/* CUSTOM TOAST NOTIFICATION OVERLAY */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] max-w-sm bg-white border border-slate-100 rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-slide-up">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
            toast.type === 'success' 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
              : toast.type === 'error' 
                ? 'bg-rose-50 border-rose-100 text-rose-600' 
                : 'bg-blue-50 border-blue-100 text-blue-600'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : toast.type === 'error' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="text-xs font-semibold text-slate-800 leading-relaxed">
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
