/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ScanLog, Participant, ScanResult, EmailLog } from '../types.js';
import { BarChart2, ShieldAlert, CheckCircle2, Trash2, Calendar, Search, ShieldCheck, Mail, Send, AlertTriangle, RefreshCw } from 'lucide-react';
import ExportReportMenu from './ExportReportMenu.tsx';
import { eventzAuthHeaders } from '../utils/auth.js';

interface ReportsViewProps {
  scanLogs: ScanLog[];
  participants: Participant[];
  emailLogs: EmailLog[];
  onClearLogs: () => Promise<void>;
  onClearEmailLogs: () => Promise<void>;
  onRefresh: () => void;
}

export default function ReportsView({ scanLogs, participants, emailLogs, onClearLogs, onClearEmailLogs, onRefresh }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'security' | 'email'>(() => (
    sessionStorage.getItem('eventz_reports_tab') === 'email' ? 'email' : 'scan'
  ));
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState<'All' | ScanResult>('All');
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  const [emailSearchTerm, setEmailSearchTerm] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<'All' | 'Queued' | 'Sending' | 'Delivered' | 'Failed'>('All');
  const [showClearEmailLogsConfirm, setShowClearEmailLogsConfirm] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem('eventz_reports_tab');
  }, []);

  const loadSecurityAlerts = async () => {
    setSecurityLoading(true);
    try {
      const res = await fetch('/api/security-alerts', { cache: 'no-store', headers: eventzAuthHeaders() });
      const data = await res.json();
      if (res.ok) setSecurityAlerts(Array.isArray(data) ? data : []);
    } catch {
      // Scan logs remain available even if the alert feed cannot be refreshed.
    } finally {
      setSecurityLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityAlerts();
  }, []);

  const filteredLogs = scanLogs.filter(log => {
    const matchesSearch = log.passId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.participantName && log.participantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      log.scannedBy.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesResult = resultFilter === 'All' || log.scanResult === resultFilter;
    return matchesSearch && matchesResult;
  });

  const filteredEmailLogs = emailLogs.filter(log => {
    const matchesSearch = log.participantName.toLowerCase().includes(emailSearchTerm.toLowerCase()) ||
      log.recipientEmail.toLowerCase().includes(emailSearchTerm.toLowerCase()) ||
      log.subject.toLowerCase().includes(emailSearchTerm.toLowerCase());
    const matchesStatus = emailStatusFilter === 'All' || log.status === emailStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 w-full text-left animate-fade-in">
      <div className="eventz-dashboard-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">Operational Auditing & Reports</h2>
          <p className="text-slate-400 text-xs">Download branded EVENTZ CSV, Excel, and PDF reports for attendance, scan history, and email delivery.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'scan' && scanLogs.length > 0 && (
            <button onClick={() => setShowClearLogsConfirm(true)} className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 rounded-xl text-xs font-bold text-rose-700 transition-all flex items-center gap-1.5">
              <Trash2 size={14} /> Wipe Log History
            </button>
          )}
          {activeTab === 'email' && emailLogs.length > 0 && (
            <button onClick={() => setShowClearEmailLogsConfirm(true)} className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 rounded-xl text-xs font-bold text-rose-700 transition-all flex items-center gap-1.5">
              <Trash2 size={14} /> Wipe Email History
            </button>
          )}
          <button onClick={() => { onRefresh(); loadSecurityAlerts(); }} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all">Refresh Logs</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="eventz-dashboard-panel flex flex-col justify-between gap-4">
          <div className="space-y-1"><h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Attendance Registry</h4><p className="text-slate-400 text-[10px] leading-relaxed">Export checked-in participants with timestamps and gate officer details.</p></div>
          <ExportReportMenu kind="checked-in" label="Export Checked-In" disabled={participants.filter(p => p.status === 'Used').length === 0} />
        </div>
        <div className="eventz-dashboard-panel flex flex-col justify-between gap-4">
          <div className="space-y-1"><h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Complete Event Roster</h4><p className="text-slate-400 text-[10px] leading-relaxed">Export the full master registry with pass IDs, contacts, and access status.</p></div>
          <ExportReportMenu kind="roster" label="Export Roster" disabled={participants.length === 0} />
        </div>
        <div className="eventz-dashboard-panel flex flex-col justify-between gap-4">
          <div className="space-y-1"><h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Entrance Scans History</h4><p className="text-slate-400 text-[10px] leading-relaxed">Export all scan attempts, duplicates, invalid passes, devices, and IPs.</p></div>
          <ExportReportMenu kind="scan-logs" label="Export Scan Logs" disabled={scanLogs.length === 0} />
        </div>
        <div className="eventz-dashboard-panel flex flex-col justify-between gap-4">
          <div className="space-y-1"><h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Email Dispatch Logs</h4><p className="text-slate-400 text-[10px] leading-relaxed">Export pass email delivery history, status, recipients, and diagnostics.</p></div>
          <ExportReportMenu kind="email-logs" label="Export Email Logs" disabled={emailLogs.length === 0} />
        </div>
      </div>

      <div className="inline-flex p-1.5 rounded-2xl bg-white border border-slate-100 shadow-sm gap-1">
        <button onClick={() => setActiveTab('scan')} className={`py-3 px-6 font-bold text-xs flex items-center gap-2 border-b-2 transition-all ${activeTab === 'scan' ? 'border-slate-900 text-slate-900 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><BarChart2 size={14} />Gate Scans ({scanLogs.length})</button>
        <button onClick={() => setActiveTab('security')} className={`py-3 px-6 font-bold text-xs flex items-center gap-2 border-b-2 transition-all ${activeTab === 'security' ? 'border-rose-600 text-rose-700 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><ShieldAlert size={14} />Security Alerts ({securityAlerts.filter((item) => !item.resolved).length})</button>
        <button onClick={() => setActiveTab('email')} className={`py-3 px-6 font-bold text-xs flex items-center gap-2 border-b-2 transition-all ${activeTab === 'email' ? 'border-slate-900 text-slate-900 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Mail size={14} />Email Delivery ({emailLogs.length})</button>
      </div>

      {activeTab === 'scan' ? (
        <div className="space-y-3">
          <div className="eventz-dashboard-panel flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 text-xs"><span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"><Search size={14} /></span><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search audit trail by code, target name, or checking device..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all" /></div>
            <div className="flex items-center gap-2 text-xs"><span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Result</span><div className="flex gap-1 border border-slate-200 p-1 bg-slate-50 rounded-xl">{['All', ScanResult.VALID, ScanResult.USED, ScanResult.INVALID, ScanResult.CANCELLED].map((result, idx) => (<button key={idx} onClick={() => setResultFilter(result as any)} className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all ${resultFilter === result ? 'bg-white text-slate-950 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>{result}</button>))}</div></div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Showing {filteredLogs.length} of {scanLogs.length} logged scans</div>
          <div className="eventz-dashboard-panel !p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-xs text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100"><tr><th className="py-3 px-4">Timestamp</th><th className="py-3 px-4">Pass ID</th><th className="py-3 px-4">Target Attendee</th><th className="py-3 px-4">Scan Outcome</th><th className="py-3 px-4">Logged By</th><th className="py-3 px-4">Device & IP</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredLogs.length === 0 ? (<tr><td colSpan={6} className="py-20 text-center"><div className="flex flex-col items-center justify-center gap-2 text-slate-400"><div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center"><BarChart2 size={16} /></div><p className="font-bold text-slate-700">No logs found</p><p className="text-[10px]">No scan actions match filters or historical list is empty.</p></div></td></tr>) : (filteredLogs.map((log) => { const date = new Date(log.createdAt); const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-100'; let label = 'Checked-in'; if (log.scanResult === ScanResult.USED) { badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200'; label = 'Rejected (Duplicate)'; } else if (log.scanResult === ScanResult.INVALID) { badgeStyle = 'bg-rose-50 text-rose-800 border-rose-100'; label = 'Rejected (Invalid)'; } else if (log.scanResult === ScanResult.CANCELLED) { badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200'; label = 'Rejected (Cancelled)'; } return (<tr key={log.id} className="hover:bg-slate-50/30 transition-colors"><td className="py-3 px-4 font-mono text-[10px] text-slate-500">{formattedDate}</td><td className="py-3 px-4 font-mono font-bold text-slate-700">{log.passId}</td><td className="py-3 px-4 font-bold text-slate-800">{log.scanResult === ScanResult.INVALID ? 'UNKNOWN/FORGED' : log.participantName}</td><td className="py-3 px-4"><span className={`text-[8px] font-extrabold uppercase border px-2 py-0.5 rounded-full tracking-wider ${badgeStyle}`}>{label}</span></td><td className="py-3 px-4 text-slate-700 font-semibold">{log.scannedBy}</td><td className="py-3 px-4 text-[10px] text-slate-400 font-mono"><p className="truncate max-w-[200px]" title={log.deviceInfo}>{log.deviceInfo}</p><p className="text-[9px] font-bold text-slate-500">IP: {log.ipAddress}</p></td></tr>); }))}</tbody></table></div>
          </div>
        </div>
      ) : activeTab === 'security' ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="eventz-dashboard-panel">
              <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Open alerts</p>
              <p className="text-3xl font-black text-rose-700 mt-2">{securityAlerts.filter((item) => !item.resolved).length}</p>
            </div>
            <div className="eventz-dashboard-panel">
              <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">High severity</p>
              <p className="text-3xl font-black text-amber-700 mt-2">{securityAlerts.filter((item) => !item.resolved && item.severity === 'high').length}</p>
            </div>
            <div className="eventz-dashboard-panel">
              <p className="text-[9px] uppercase font-black tracking-wider text-slate-400">Risk-marked scans</p>
              <p className="text-3xl font-black text-slate-900 mt-2">{scanLogs.filter((log) => Boolean(log.riskLevel)).length}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 flex gap-3">
            <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-900">Screenshot / pass-sharing monitoring</p>
              <p className="text-[10px] text-amber-800 mt-1 leading-relaxed">EVENTZ flags rapid scans of the same pass across different gates, invalid signatures, revoked credentials and duplicate-entry attempts. An alert is evidence for review, not automatic proof of fraud.</p>
            </div>
          </div>

          <div className="eventz-dashboard-panel !p-0 overflow-hidden">
            {securityLoading ? (
              <div className="py-16 text-center text-xs text-slate-400"><RefreshCw size={16} className="animate-spin mx-auto mb-2" />Loading security alerts...</div>
            ) : securityAlerts.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                <ShieldCheck size={22} className="mx-auto mb-2 text-emerald-600" />
                <p className="font-black text-slate-700">No security alerts recorded</p>
                <p className="text-[10px] mt-1">Duplicate/cross-gate anomalies will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {securityAlerts.map((alert) => (
                  <div key={alert.id} className={`p-4 flex flex-col lg:flex-row lg:items-center gap-4 ${alert.resolved ? 'bg-slate-50/60 opacity-70' : 'bg-white'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${alert.severity === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                      <ShieldAlert size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-[8px] uppercase font-black border ${alert.severity === 'high' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{alert.severity}</span>
                        <span className="text-[9px] uppercase font-black tracking-wider text-slate-500">{String(alert.type || '').replace(/_/g, ' ')}</span>
                        {alert.resolved && <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[8px] font-black text-emerald-700">RESOLVED</span>}
                      </div>
                      <p className="text-xs font-bold text-slate-800 mt-2">{alert.message}</p>
                      <div className="mt-1 text-[9px] text-slate-400 font-mono flex flex-wrap gap-x-3 gap-y-1">
                        <span>{alert.passId}</span>
                        <span>{new Date(alert.createdAt).toLocaleString()}</span>
                        {Array.isArray(alert.gates) && alert.gates.length > 0 && <span>Gates: {alert.gates.join(' → ')}</span>}
                      </div>
                    </div>
                    {!alert.resolved && (
                      <button
                        type="button"
                        onClick={async () => {
                          const rawUser = localStorage.getItem('etsn_user');
                          const user = rawUser ? JSON.parse(rawUser) : null;
                          const res = await fetch(`/api/security-alerts/${encodeURIComponent(alert.id)}/resolve`, {
                            method: 'POST',
                            headers: eventzAuthHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ resolvedBy: user?.name || 'Admin' })
                          });
                          if (res.ok) await loadSecurityAlerts();
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[9px] font-black shrink-0"
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="eventz-dashboard-panel flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 text-xs"><span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"><Search size={14} /></span><input type="text" value={emailSearchTerm} onChange={(e) => setEmailSearchTerm(e.target.value)} placeholder="Search dispatch log by attendee name, email address, or subject..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all" /></div>
            <div className="flex items-center gap-2 text-xs"><span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Delivery</span><div className="flex gap-1 border border-slate-200 p-1 bg-slate-50 rounded-xl">{['All', 'Queued', 'Sending', 'Delivered', 'Failed'].map((status, idx) => (<button key={idx} onClick={() => setEmailStatusFilter(status as any)} className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all ${emailStatusFilter === status ? 'bg-white text-slate-950 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>{status}</button>))}</div></div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 flex items-center justify-between"><span>Showing {filteredEmailLogs.length} of {emailLogs.length} dispatched passes</span><span className="text-[9px] text-yellow-600 font-mono">⚡ Brevo-ready transactional delivery pipeline</span></div>
          <div className="eventz-dashboard-panel !p-0 overflow-hidden"><div className="overflow-x-auto max-h-[500px]"><table className="w-full text-xs text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100"><tr><th className="py-3 px-4">Timestamp</th><th className="py-3 px-4">Recipient</th><th className="py-3 px-4">Subject Line</th><th className="py-3 px-4">Transport Security</th><th className="py-3 px-4">Delivery Status</th><th className="py-3 px-4">Diagnostics</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredEmailLogs.length === 0 ? (<tr><td colSpan={6} className="py-20 text-center"><div className="flex flex-col items-center justify-center gap-2 text-slate-400"><div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center"><Mail size={16} /></div><p className="font-bold text-slate-700">No email logs found</p><p className="text-[10px]">No pass sharing actions match filters or dispatch queue is empty.</p></div></td></tr>) : (filteredEmailLogs.map((log) => { const date = new Date(log.sentAt); const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-100'; if (log.status === 'Queued') badgeStyle = 'bg-blue-50 text-blue-800 border-blue-100'; else if (log.status === 'Sending') badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'; else if (log.status === 'Failed') badgeStyle = 'bg-rose-50 text-rose-800 border-rose-100'; return (<tr key={log.id} className="hover:bg-slate-50/30 transition-colors"><td className="py-3 px-4 font-mono text-[10px] text-slate-500">{formattedDate}</td><td className="py-3 px-4"><div className="font-bold text-slate-800">{log.participantName}</div><div className="text-[10px] text-slate-400 font-mono">{log.recipientEmail}</div></td><td className="py-3 px-4 text-slate-600 truncate max-w-[200px]" title={log.subject}>{log.subject}</td><td className="py-3 px-4 text-[10px] text-slate-400 font-mono"><span className="text-emerald-600 font-semibold">TLS v1.3</span></td><td className="py-3 px-4"><span className={`text-[8px] font-extrabold uppercase border px-2.5 py-1 rounded-full tracking-wider flex items-center gap-1 w-fit ${badgeStyle}`}>{log.status === 'Sending' && <RefreshCw size={8} className="animate-spin text-amber-600" />}{log.status}</span></td><td className="py-3 px-4 text-[10px] font-medium text-slate-500 font-mono max-w-[200px] truncate" title={log.errorMessage || 'Delivered successfully.'}>{log.status === 'Failed'
  ? <span className="text-rose-600 font-semibold">{log.errorMessage}</span>
  : log.status === 'Queued'
    ? <span className="text-blue-600 font-semibold">Accepted by provider; awaiting delivery event.</span>
    : log.status === 'Sending'
      ? <span className="text-amber-600 font-semibold">Relaying envelope...</span>
      : <span className="text-emerald-600 font-bold">✓ Delivery confirmed</span>}</td></tr>); }))}</tbody></table></div></div>
        </div>
      )}

      {showClearLogsConfirm && (
        <div className="eventz-overlay fixed inset-0 bg-slate-950/45 backdrop-blur-xl flex items-center justify-center p-4 z-[100]"><div className="eventz-modal bg-white/95 rounded-[30px] p-6 shadow-2xl relative w-full max-w-sm border border-slate-100 text-left space-y-4"><div className="flex items-center gap-3 text-rose-600"><div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center border border-rose-100"><Trash2 size={18} /></div><h3 className="font-extrabold text-slate-800 text-base">Wipe Scan History</h3></div><p className="text-xs text-slate-500 leading-relaxed">Are you sure you want to wipe all scan logs history? This is irreversible and cannot be undone.</p><div className="flex gap-2.5 pt-2"><button type="button" onClick={() => setShowClearLogsConfirm(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200">Cancel</button><button type="button" onClick={async () => { await onClearLogs(); setShowClearLogsConfirm(false); }} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow">Wipe History</button></div></div></div>
      )}

      {showClearEmailLogsConfirm && (
        <div className="eventz-overlay fixed inset-0 bg-slate-950/45 backdrop-blur-xl flex items-center justify-center p-4 z-[100]"><div className="eventz-modal bg-white/95 rounded-[30px] p-6 shadow-2xl relative w-full max-w-sm border border-slate-100 text-left space-y-4"><div className="flex items-center gap-3 text-rose-600"><div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center border border-rose-100"><Trash2 size={18} /></div><h3 className="font-extrabold text-slate-800 text-base">Wipe Email Dispatch History</h3></div><p className="text-xs text-slate-500 leading-relaxed">Are you sure you want to wipe all pass email sharing histories? This is irreversible and cannot be undone.</p><div className="flex gap-2.5 pt-2"><button type="button" onClick={() => setShowClearEmailLogsConfirm(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200">Cancel</button><button type="button" onClick={async () => { await onClearEmailLogs(); setShowClearEmailLogsConfirm(false); }} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow">Wipe History</button></div></div></div>
      )}
    </div>
  );
}
