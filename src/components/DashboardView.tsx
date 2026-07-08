/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Participant, ScanLog, EventDetails, UserRole } from '../types.js';
import { Users, CheckCircle, Clock, AlertTriangle, RefreshCw, BarChart2, Zap, ArrowRight, LockKeyhole } from 'lucide-react';
import ExportRegistryMenu from './ExportRegistryMenu.tsx';

interface DashboardViewProps {
  participants: Participant[];
  scanLogs: ScanLog[];
  event: EventDetails;
  onNavigate: (page: string) => void;
  onRefresh: () => void;
}

export default function DashboardView({ participants, scanLogs, event, onNavigate, onRefresh }: DashboardViewProps) {
  const total = participants.length;
  const checkedIn = participants.filter(p => p.status === 'Used').length;
  const notCheckedIn = participants.filter(p => p.status === 'Not Used').length;
  const cancelled = participants.filter(p => p.status === 'Cancelled').length;

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('etsn_user') || 'null');
    } catch {
      return null;
    }
  })();
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const percentCheckedIn = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
  const duplicateAttempts = scanLogs.filter(log => log.scanResult === 'Used').length;
  const invalidAttempts = scanLogs.filter(log => log.scanResult === 'Invalid').length;
  const recentScans = [...scanLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 w-full text-left animate-fade-in">
      <div className="bg-[#111827] text-white p-6 md:p-8 rounded-3xl relative overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 z-10">
          <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider bg-[#D4AF37]/10 px-3 py-1 rounded-full border border-[#D4AF37]/20">
            {isAdmin ? 'Admin Control Live' : 'Gate Operations Live'}
          </span>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">{event.eventName}</h1>
          <p className="text-gray-400 text-xs md:text-sm max-w-xl">
            {isAdmin
              ? 'Manage rosters, customize credentials, supervise gate officers, and audit all access attempts in real time.'
              : 'Gate officer mode: scan participant passes, verify access, and report attendee change requests for admin approval.'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 pt-1 font-mono">
            <span>📍 {event.venue}</span>
            <span className="hidden sm:inline">•</span>
            <span>📅 {event.eventDate} @ {event.eventTime}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-[#0A0A0B]/50 px-6 py-4 rounded-2xl border border-white/5 shrink-0 z-10">
          <div className="relative w-16 h-16">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-white/10" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className="text-[#D4AF37] transition-all duration-1000 ease-out" strokeDasharray={`${percentCheckedIn}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-sm font-mono text-white">{percentCheckedIn}%</div>
          </div>
          <div className="space-y-0.5">
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Attendance Rate</p>
            <p className="font-extrabold text-lg text-white font-mono">{checkedIn} / {total}</p>
          </div>
        </div>

        <div className="absolute right-0 bottom-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mb-20"></div>
        <div className="absolute left-1/3 top-0 w-40 h-40 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none -mt-10"></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] p-5 rounded-3xl border border-white/5 shadow-sm flex items-center justify-between group hover:border-white/10 hover:shadow-lg transition-all">
          <div className="space-y-1"><span className="text-gray-400 text-[10px] font-extrabold uppercase tracking-wider block">Total Participants</span><span className="text-2xl font-black text-white font-mono tracking-tight block">{total}</span><span className="text-gray-500 text-[10px] block">Roster count generated</span></div>
          <div className="w-12 h-12 bg-white/5 text-gray-200 rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-105 transition-all"><Users size={20} /></div>
        </div>
        <div className="bg-[#111827] p-5 rounded-3xl border border-white/5 shadow-sm flex items-center justify-between group hover:border-white/10 hover:shadow-lg transition-all">
          <div className="space-y-1"><span className="text-green-400 text-[10px] font-extrabold uppercase tracking-wider block">Checked In</span><span className="text-2xl font-black text-green-400 font-mono tracking-tight block">{checkedIn}</span><span className="text-green-500/80 text-[10px] block font-semibold">{percentCheckedIn}% present at gate</span></div>
          <div className="w-12 h-12 bg-green-500/10 text-green-400 rounded-2xl flex items-center justify-center border border-green-500/20 group-hover:scale-105 transition-all"><CheckCircle size={20} /></div>
        </div>
        <div className="bg-[#111827] p-5 rounded-3xl border border-white/5 shadow-sm flex items-center justify-between group hover:border-white/10 hover:shadow-lg transition-all">
          <div className="space-y-1"><span className="text-yellow-400 text-[10px] font-extrabold uppercase tracking-wider block">Not Checked In</span><span className="text-2xl font-black text-white/80 font-mono tracking-tight block">{notCheckedIn}</span><span className="text-gray-500 text-[10px] block">{total - checkedIn - cancelled} expected passes</span></div>
          <div className="w-12 h-12 bg-yellow-500/10 text-yellow-400 rounded-2xl flex items-center justify-center border border-yellow-500/20 group-hover:scale-105 transition-all"><Clock size={20} /></div>
        </div>
        <div className="bg-[#111827] p-5 rounded-3xl border border-white/5 shadow-sm flex items-center justify-between group hover:border-white/10 hover:shadow-lg transition-all">
          <div className="space-y-1"><span className="text-red-400 text-[10px] font-extrabold uppercase tracking-wider block">Gate Warning Logs</span><div className="flex gap-3 items-center"><div><span className="text-xl font-black text-red-400 font-mono tracking-tight">{duplicateAttempts}</span><span className="text-[9px] text-red-500 font-bold block uppercase tracking-wider">Duplicate</span></div><div className="h-6 w-px bg-white/10"></div><div><span className="text-xl font-black text-red-400 font-mono tracking-tight">{invalidAttempts}</span><span className="text-[9px] text-red-500 font-bold block uppercase tracking-wider">Forgery</span></div></div><span className="text-gray-500 text-[10px] block">Security alerts tracked</span></div>
          <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center border border-red-500/20 group-hover:scale-105 transition-all"><AlertTriangle size={20} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-[#111827] text-white rounded-3xl border border-white/5 shadow-sm p-6 space-y-4">
            <h3 className="font-extrabold text-white text-sm tracking-tight border-b border-white/10 pb-3">Entrance Operations</h3>
            <div className="grid grid-cols-1 gap-2.5">
              <button onClick={() => onNavigate('scanner')} className="w-full bg-[#D4AF37] hover:brightness-110 text-black font-black p-3.5 rounded-2xl text-xs flex items-center justify-between transition-all shadow-lg shadow-[#D4AF37]/10 group"><div className="flex items-center gap-2"><Zap size={14} className="text-black fill-current" /><span>Launch Gates Scanner</span></div><ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /></button>

              {isAdmin ? (
                <>
                  <button onClick={() => onNavigate('upload')} className="w-full bg-transparent hover:bg-white/5 text-white border border-white/10 font-bold p-3.5 rounded-2xl text-xs flex items-center justify-between transition-all group"><span>Upload Participants list</span><ArrowRight size={14} className="text-gray-500 group-hover:translate-x-1 transition-transform" /></button>
                  <button onClick={() => onNavigate('participants')} className="w-full bg-transparent hover:bg-white/5 text-white border border-white/10 font-bold p-3.5 rounded-2xl text-xs flex items-center justify-between transition-all group"><span>Search / Manage Attendees</span><ArrowRight size={14} className="text-gray-500 group-hover:translate-x-1 transition-transform" /></button>
                  <button onClick={() => onNavigate('event-settings')} className="w-full bg-transparent hover:bg-white/5 text-white border border-white/10 font-bold p-3.5 rounded-2xl text-xs flex items-center justify-between transition-all group"><span>Customize Passes Theme</span><ArrowRight size={14} className="text-gray-500 group-hover:translate-x-1 transition-transform" /></button>
                  <div className="pt-1"><ExportRegistryMenu /></div>
                </>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed flex gap-3">
                  <LockKeyhole size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p>Gate officer access is limited to scanning and verification. Uploading participants and pass design are admin-only functions.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#111827] text-white rounded-3xl border border-white/5 shadow-sm p-6 space-y-4">
            <h3 className="font-extrabold text-white text-sm tracking-tight border-b border-white/10 pb-3 flex justify-between items-center"><span>Roster Overview</span><RefreshCw size={13} className="text-gray-400 cursor-pointer hover:rotate-180 transition-all" onClick={onRefresh} /></h3>
            <div className="space-y-3 text-xs">
              {[['Checked In', checkedIn, 'green'], ['Unused Passes', notCheckedIn, 'yellow'], ['Cancelled/Blocked', cancelled, 'red']].map(([label, count, color]) => (
                <div className="space-y-1.5" key={String(label)}>
                  <div className="flex justify-between font-semibold text-gray-300"><span>{label}</span><span className={`font-mono ${color === 'green' ? 'text-green-400' : color === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>{String(count)} / {total}</span></div>
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden"><div className={`${color === 'green' ? 'bg-green-500' : color === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'} h-full transition-all`} style={{ width: `${total > 0 ? (Number(count) / total) * 100 : 0}%` }}></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#111827] text-white rounded-3xl border border-white/5 shadow-sm p-6 flex flex-col h-full">
            <div className="border-b border-white/10 pb-4 flex justify-between items-center">
              <div><h3 className="font-extrabold text-white text-sm tracking-tight">Recent Scan Logs Feed</h3><p className="text-gray-400 text-[11px] mt-0.5">Live checking attempts captured at entrance</p></div>
              {isAdmin && <button onClick={() => onNavigate('reports')} className="text-[#D4AF37] hover:brightness-110 font-bold text-xs flex items-center gap-1.5 transition-all"><BarChart2 size={13} />View Full Logs</button>}
            </div>
            <div className="flex-1 divide-y divide-white/5 overflow-y-auto max-h-[360px] pr-1">
              {recentScans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-2"><div className="w-10 h-10 bg-white/5 text-gray-400 border border-white/10 rounded-xl flex items-center justify-center"><Clock size={16} /></div><div className="space-y-0.5"><p className="font-bold text-gray-300 text-xs">No scan records yet</p><p className="text-[10px] text-gray-500">Launch the scanner to verify participant passes.</p></div></div>
              ) : (
                recentScans.map((log) => {
                  const date = new Date(log.createdAt);
                  const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  let badgeClass = 'bg-green-500/20 text-green-400 border-green-500/30';
                  let message = 'Checked in successfully.';
                  let nameColor = 'text-white';
                  if (log.scanResult === 'Used') { badgeClass = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'; message = 'REJECTED: Duplicate entry attempt.'; nameColor = 'text-yellow-400'; }
                  else if (log.scanResult === 'Invalid') { badgeClass = 'bg-red-500/20 text-red-400 border-red-500/30'; message = `REJECTED: Non-existent pass code: ${log.passId}`; nameColor = 'text-red-400'; }
                  else if (log.scanResult === 'Cancelled') { badgeClass = 'bg-white/10 text-gray-300 border-white/10'; message = 'REJECTED: Account cancelled/revoked.'; }
                  return (
                    <div key={log.id} className="py-4 flex justify-between items-start gap-4 hover:bg-white/[0.02] transition-all">
                      <div className="space-y-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className={`font-bold text-xs truncate ${nameColor}`}>{log.scanResult === 'Invalid' ? 'FORGERY/UNKNOWN' : log.participantName}</span><span className="font-mono text-[9px] text-[#D4AF37] bg-white/5 px-1.5 py-0.5 rounded">{log.passId}</span><span className={`text-[8px] font-extrabold uppercase border px-1.5 py-0.5 rounded-full tracking-wider ${badgeClass}`}>{log.scanResult}</span></div><p className="text-[10px] text-gray-400 leading-relaxed truncate">{message}</p><p className="text-[9px] text-gray-500 font-mono">Device: {log.deviceInfo.slice(0, 45)}... | IP: {log.ipAddress}</p></div>
                      <div className="text-right shrink-0 text-xs"><p className="font-bold text-gray-300 font-mono">{formattedTime}</p><p className="text-[9px] text-gray-500">By {log.scannedBy}</p></div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
