/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { User, EventDetails, Participant, ScanLog, UserRole, PassStatus, ScanResult, EmailLog } from './types.js';
import Logo from './components/Logo.tsx';
import DashboardView from './components/DashboardView.tsx';
import EventSettingsView from './components/EventSettingsView.tsx';
import UploadParticipants from './components/UploadParticipants.tsx';
import ParticipantsListView from './components/ParticipantsListView.tsx';
import ReportsView from './components/ReportsView.tsx';
import ScannerComponent from './components/ScannerComponent.tsx';
import { 
  Users, Calendar, CheckSquare, BarChart2, LogOut, Camera, ShieldAlert, 
  CheckCircle2, Menu, X, ArrowLeft, Key, UserCheck, ShieldCheck, Eye, EyeOff, UserX, Trash2, RefreshCw
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Omit<User, 'passwordHash'> | null>(null);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  
  // Navigation
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authentication states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Active scanning / QR verify states
  const [selectedPassId, setSelectedPassId] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<{
    status: 'Valid' | 'Used' | 'Invalid' | 'Cancelled';
    participant?: Participant;
    error?: string;
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);

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
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('etsn_user');
      }
    }

    fetchAllData();

    // Direct url scanning verify checker
    const checkPathnameVerify = async () => {
      const path = window.location.pathname;
      if (path.startsWith('/verify/')) {
        const passId = path.split('/verify/')[1];
        if (passId) {
          setSelectedPassId(passId);
          setCurrentPage('verify');
          handleVerifyQuery(passId);
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

  // API: Query gate verification
  const handleVerifyQuery = async (passId: string) => {
    setVerifyLoading(true);
    setVerifyResult(null);
    setClaimSuccess(false);
    
    // Set url route context to support audit copies
    window.history.pushState({}, '', `/verify/${passId}`);

    try {
      const scannedBy = currentUser ? currentUser.name : 'Web Scanner';
      const res = await fetch(`/api/verify/${passId}?scannedBy=${encodeURIComponent(scannedBy)}`);
      const data = await res.json();
      
      if (res.ok) {
        setVerifyResult(data);
      } else {
        setVerifyResult({ status: 'Invalid', error: data.error });
      }
    } catch (err) {
      setVerifyResult({ status: 'Invalid', error: 'Server connection broken.' });
    } finally {
      setVerifyLoading(false);
    }
  };

  // API: Mark as checked-in (Claim QR)
  const handleClaimPass = async (passId: string) => {
    setClaimLoading(true);
    setClaimSuccess(false);

    try {
      const checkedInBy = currentUser ? currentUser.name : 'Gate Officer';
      const res = await fetch(`/api/verify/${passId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkedInBy })
      });

      if (res.ok) {
        setClaimSuccess(true);
        await fetchAllData();
        // Automatically close query and return to scanner view after successful verification
        setTimeout(() => {
          handleReturnToScanner();
        }, 1800);
      } else {
        alert('Check-in claiming transaction failed. Pass may already be used.');
      }
    } catch (err) {
      alert('Network failure processing entrance claim.');
    } finally {
      setClaimLoading(false);
    }
  };

  const handleReturnToScanner = () => {
    setSelectedPassId('');
    setVerifyResult(null);
    setClaimSuccess(false);
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

  // LOGIN SCREEN GUARD
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-between p-6 text-white font-sans relative overflow-hidden">
        {/* Top bar logo */}
        <div className="w-full flex justify-center py-4">
          <Logo size="md" variant="light" />
        </div>

        {/* Login Central Card */}
        <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 space-y-6 text-left">
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
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-yellow-500 text-white transition-all"
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
                  className="w-full pl-10 pr-10 p-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-yellow-500 text-white transition-all"
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

        </div>

        {/* Footer info */}
        <div className="text-slate-500 text-[10px] text-center font-mono py-4">
          ETSNTECH Event Access System v1.4.2 • Protected Client Node
        </div>

        {/* Backdrops decorative */}
        <div className="absolute right-0 bottom-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-40 -mb-40"></div>
        <div className="absolute left-0 top-0 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none -ml-40 -mt-40"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans text-slate-800">
      
      {/* 1. APP HEADER BAR */}
      <header className="sticky top-0 bg-slate-900 text-white border-b border-slate-800 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo size="md" variant="light" className="cursor-pointer" onClick={() => handlePageChange('dashboard')} />

          {/* Nav Links Desktop */}
          <nav className="hidden lg:flex items-center gap-1.5 text-xs font-bold">
            <button
              onClick={() => handlePageChange('dashboard')}
              className={`px-4 py-2 rounded-xl transition-all ${
                currentPage === 'dashboard' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              Dashboard
            </button>
            
            {currentUser.role === UserRole.ADMIN && (
              <>
                <button
                  onClick={() => handlePageChange('event-settings')}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'event-settings' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  Pass Designer
                </button>
                <button
                  onClick={() => handlePageChange('upload')}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'upload' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  Upload roster
                </button>
                <button
                  onClick={() => handlePageChange('participants')}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'participants' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  Manage Passes
                </button>
                <button
                  onClick={() => handlePageChange('reports')}
                  className={`px-4 py-2 rounded-xl transition-all ${
                    currentPage === 'reports' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  Scan Audit Logs
                </button>
              </>
            )}

            <button
              onClick={() => handlePageChange('scanner')}
              className={`px-4 py-2 rounded-xl transition-all ${
                currentPage === 'scanner' ? 'bg-slate-800 text-yellow-400' : 'text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              Gates Scanner
            </button>
          </nav>

          {/* User Profile & Logout Desktop */}
          <div className="hidden lg:flex items-center gap-4 border-l border-slate-800 pl-4 text-xs">
            <div className="space-y-0.5 text-right">
              <p className="font-extrabold text-white">{currentUser.name}</p>
              <p className="text-[10px] text-yellow-500 font-mono uppercase tracking-wider">{currentUser.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all shadow"
              title="Terminate Secure Session"
            >
              <LogOut size={14} />
            </button>
          </div>

          {/* Mobile hamburger menu trigger */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => handlePageChange('scanner')}
              className="p-2 bg-slate-800 text-yellow-400 rounded-xl"
              title="Camera Scanner"
            >
              <Camera size={16} />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 bg-slate-800 text-slate-300 hover:text-white rounded-xl"
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        {/* MOBILE NAV DRAWER MENU */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-900 border-t border-slate-800 p-4 space-y-3 text-xs font-bold text-left animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="space-y-0.5">
                <p className="font-extrabold text-white text-sm">{currentUser.name}</p>
                <p className="text-[9px] text-yellow-500 font-mono uppercase tracking-wider">{currentUser.role.replace('_', ' ')}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px]"
              >
                <LogOut size={13} />
                Logout
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-2">
              <button
                onClick={() => handlePageChange('dashboard')}
                className={`p-3 rounded-xl border ${
                  currentPage === 'dashboard' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-slate-950/40 text-slate-300 border-slate-800'
                }`}
              >
                Dashboard
              </button>

              <button
                onClick={() => handlePageChange('scanner')}
                className={`p-3 rounded-xl border ${
                  currentPage === 'scanner' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-slate-950/40 text-slate-300 border-slate-800'
                }`}
              >
                Gates Scanner
              </button>

              {currentUser.role === UserRole.ADMIN && (
                <>
                  <button
                    onClick={() => handlePageChange('event-settings')}
                    className={`p-3 rounded-xl border ${
                      currentPage === 'event-settings' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-slate-950/40 text-slate-300 border-slate-800'
                    }`}
                  >
                    Pass Designer
                  </button>

                  <button
                    onClick={() => handlePageChange('upload')}
                    className={`p-3 rounded-xl border ${
                      currentPage === 'upload' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-slate-950/40 text-slate-300 border-slate-800'
                    }`}
                  >
                    Upload roster
                  </button>

                  <button
                    onClick={() => handlePageChange('participants')}
                    className={`p-3 rounded-xl border ${
                      currentPage === 'participants' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-slate-950/40 text-slate-300 border-slate-800'
                    }`}
                  >
                    Manage Passes
                  </button>

                  <button
                    onClick={() => handlePageChange('reports')}
                    className={`p-3 rounded-xl border ${
                      currentPage === 'reports' ? 'bg-slate-800 text-yellow-400 border-slate-700' : 'bg-slate-950/40 text-slate-300 border-slate-800'
                    }`}
                  >
                    Scan Audit Logs
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 2. MAIN APPLICATION CONTENT PORTAL */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 pb-20">

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
                            <p className="font-extrabold text-sm">Checked In Successfully!</p>
                            <p className="text-[11px] text-emerald-600/80">Guest has been granted event admittance.</p>
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
                              MARK AS ENTERED
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

      </main>

      {/* FOOTER BAR */}
      <footer className="bg-slate-950 text-slate-500 border-t border-slate-900 py-6 text-xs text-center font-mono mt-auto">
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
