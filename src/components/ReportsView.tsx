/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ScanLog, Participant, ScanResult, EmailLog } from '../types.js';
import { BarChart2, ShieldAlert, CheckCircle2, Download, Trash2, Calendar, Search, ShieldCheck, Mail, Send, AlertTriangle, RefreshCw } from 'lucide-react';

interface ReportsViewProps {
  scanLogs: ScanLog[];
  participants: Participant[];
  emailLogs: EmailLog[];
  onClearLogs: () => Promise<void>;
  onClearEmailLogs: () => Promise<void>;
  onRefresh: () => void;
}

export default function ReportsView({ 
  scanLogs, 
  participants, 
  emailLogs, 
  onClearLogs, 
  onClearEmailLogs, 
  onRefresh 
}: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'email'>('scan');
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState<'All' | ScanResult>('All');
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  
  // Email state filters
  const [emailSearchTerm, setEmailSearchTerm] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<'All' | 'Sending' | 'Delivered' | 'Failed'>('All');
  const [showClearEmailLogsConfirm, setShowClearEmailLogsConfirm] = useState(false);

  // Filter logs
  const filteredLogs = scanLogs.filter(log => {
    const matchesSearch = 
      log.passId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.participantName && log.participantName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      log.scannedBy.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesResult = resultFilter === 'All' || log.scanResult === resultFilter;

    return matchesSearch && matchesResult;
  });

  // Export functions
  const handleExportScanLogs = () => {
    if (scanLogs.length === 0) return;

    const headers = ['Scan ID', 'Pass ID', 'Participant Name', 'Scan Result', 'Scanned By', 'Device', 'IP Address', 'Scan Timestamp'];
    const rows = scanLogs.map(log => [
      log.id,
      log.passId,
      log.participantName || 'Unknown',
      log.scanResult,
      log.scannedBy,
      log.deviceInfo,
      log.ipAddress,
      log.createdAt
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ETSNTECH_Access_Scan_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const handleExportAttendance = (checkedInOnly: boolean) => {
    if (participants.length === 0) return;

    const roster = checkedInOnly 
      ? participants.filter(p => p.status === 'Used') 
      : participants;

    if (roster.length === 0) {
      alert('Roster list is empty for this selection.');
      return;
    }

    const headers = ['Participant ID', 'Full Name', 'Phone', 'Email', 'Organization', 'Category', 'Pass ID', 'Status', 'Checked In At', 'Checked In By'];
    const rows = roster.map(p => [
      p.id,
      p.fullName,
      p.phone || '',
      p.email || '',
      p.organization || '',
      p.category || '',
      p.passId,
      p.status,
      p.checkedInAt || 'N/A',
      p.checkedInBy || 'N/A'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ETSNTECH_${checkedInOnly ? 'CheckedIn_Attendance' : 'Full_Roster'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  return (
    <div className="space-y-6 w-full text-left">
      {/* Header operations */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">Operational Auditing & Reports</h2>
          <p className="text-slate-400 text-xs">Download attendance csv, export scan histories, and track device security telemetry.</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'scan' && scanLogs.length > 0 && (
            <button
              onClick={() => setShowClearLogsConfirm(true)}
              className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 rounded-xl text-xs font-bold text-rose-700 transition-all flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Wipe Log History
            </button>
          )}
          {activeTab === 'email' && emailLogs.length > 0 && (
            <button
              onClick={() => setShowClearEmailLogsConfirm(true)}
              className="px-3.5 py-2 border border-rose-200 hover:bg-rose-50 rounded-xl text-xs font-bold text-rose-700 transition-all flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Wipe Email History
            </button>
          )}
          <button
            onClick={onRefresh}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Export Widgets Box */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Widget 1: Attendance List */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Attendance Registry</h4>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              Export a clean, sorted list of all checked-in participants, matching gate-in timestamps and devices.
            </p>
          </div>
          <button
            onClick={() => handleExportAttendance(true)}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow"
          >
            <Download size={13} />
            Export Checked-In Only
          </button>
        </div>

        {/* Widget 2: Full Roster */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Complete Event Roster</h4>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              Download the master registrants list with generated Pass IDs, phone, category, and checking state.
            </p>
          </div>
          <button
            onClick={() => handleExportAttendance(false)}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow"
          >
            <Download size={13} />
            Export Complete Roster
          </button>
        </div>

        {/* Widget 3: Scan Telemetry */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Entrance Scans History</h4>
            <p className="text-slate-400 text-[10px] leading-relaxed">
              Export complete scan attempts logs, including warning duplicate entry and forgery alert incidents.
            </p>
          </div>
          <button
            onClick={handleExportScanLogs}
            disabled={scanLogs.length === 0}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow"
          >
            <Download size={13} />
            Export Scans History
          </button>
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('scan')}
          className={`py-3 px-6 font-bold text-xs flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'scan'
              ? 'border-slate-900 text-slate-900 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <BarChart2 size={14} />
          Gate Entrance Scans ({scanLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('email')}
          className={`py-3 px-6 font-bold text-xs flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'email'
              ? 'border-slate-900 text-slate-900 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Mail size={14} />
          Email Dispatch Delivery Logs ({emailLogs.length})
        </button>
      </div>

      {/* Audit Log Table Section */}
      {activeTab === 'scan' ? (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 text-xs">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search audit trail by code, target name, or checking device..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Result</span>
              <div className="flex gap-1 border border-slate-200 p-1 bg-slate-50 rounded-xl">
                {['All', ScanResult.VALID, ScanResult.USED, ScanResult.INVALID, ScanResult.CANCELLED].map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => setResultFilter(result as any)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all ${
                      resultFilter === result
                        ? 'bg-white text-slate-950 shadow-sm border border-slate-100'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {result}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
            Showing {filteredLogs.length} of {scanLogs.length} logged scans
          </div>

          {/* Tabular Auditing logs */}
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Pass ID</th>
                    <th className="py-3 px-4">Target Attendee</th>
                    <th className="py-3 px-4">Scan Outcome</th>
                    <th className="py-3 px-4">Logged By</th>
                    <th className="py-3 px-4">Device & IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                          <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
                            <BarChart2 size={16} />
                          </div>
                          <p className="font-bold text-slate-700">No logs found</p>
                          <p className="text-[10px]">No scan actions match filters or historical list is empty.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const date = new Date(log.createdAt);
                      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                      let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-100';
                      let label = 'Checked-in';

                      if (log.scanResult === ScanResult.USED) {
                        badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
                        label = 'Rejected (Duplicate)';
                      } else if (log.scanResult === ScanResult.INVALID) {
                        badgeStyle = 'bg-rose-50 text-rose-800 border-rose-100';
                        label = 'Rejected (Invalid)';
                      } else if (log.scanResult === ScanResult.CANCELLED) {
                        badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';
                        label = 'Rejected (Cancelled)';
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-[10px] text-slate-500">
                            {formattedDate}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            {log.passId}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {log.scanResult === ScanResult.INVALID ? 'UNKNOWN/FORGED' : log.participantName}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[8px] font-extrabold uppercase border px-2 py-0.5 rounded-full tracking-wider ${badgeStyle}`}>
                              {label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-semibold">
                            {log.scannedBy}
                          </td>
                          <td className="py-3 px-4 text-[10px] text-slate-400 font-mono">
                            <p className="truncate max-w-[200px]" title={log.deviceInfo}>{log.deviceInfo}</p>
                            <p className="text-[9px] font-bold text-slate-500">IP: {log.ipAddress}</p>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 text-xs">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={emailSearchTerm}
                onChange={(e) => setEmailSearchTerm(e.target.value)}
                placeholder="Search dispatch log by attendee name, email address, or subject..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Delivery</span>
              <div className="flex gap-1 border border-slate-200 p-1 bg-slate-50 rounded-xl">
                {['All', 'Sending', 'Delivered', 'Failed'].map((status, idx) => (
                  <button
                    key={idx}
                    onClick={() => setEmailStatusFilter(status as any)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all ${
                      emailStatusFilter === status
                        ? 'bg-white text-slate-950 shadow-sm border border-slate-100'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 flex items-center justify-between">
            <span>Showing {emailLogs.filter(log => {
              const matchesSearch = log.participantName.toLowerCase().includes(emailSearchTerm.toLowerCase()) || log.recipientEmail.toLowerCase().includes(emailSearchTerm.toLowerCase()) || log.subject.toLowerCase().includes(emailSearchTerm.toLowerCase());
              const matchesStatus = emailStatusFilter === 'All' || log.status === emailStatusFilter;
              return matchesSearch && matchesStatus;
            }).length} of {emailLogs.length} dispatched passes</span>
            <span className="text-[9px] text-yellow-600 font-mono">⚡ Real-time SMTP Outbound Engine Active</span>
          </div>

          {/* Tabular Email logs */}
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Subject Line</th>
                    <th className="py-3 px-4">Transport Security</th>
                    <th className="py-3 px-4">Delivery Status</th>
                    <th className="py-3 px-4">Diagnostics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emailLogs.filter(log => {
                    const matchesSearch = log.participantName.toLowerCase().includes(emailSearchTerm.toLowerCase()) || log.recipientEmail.toLowerCase().includes(emailSearchTerm.toLowerCase()) || log.subject.toLowerCase().includes(emailSearchTerm.toLowerCase());
                    const matchesStatus = emailStatusFilter === 'All' || log.status === emailStatusFilter;
                    return matchesSearch && matchesStatus;
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                          <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
                            <Mail size={16} />
                          </div>
                          <p className="font-bold text-slate-700">No email logs found</p>
                          <p className="text-[10px]">No pass sharing actions match filters or dispatch queue is empty.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    emailLogs.filter(log => {
                      const matchesSearch = log.participantName.toLowerCase().includes(emailSearchTerm.toLowerCase()) || log.recipientEmail.toLowerCase().includes(emailSearchTerm.toLowerCase()) || log.subject.toLowerCase().includes(emailSearchTerm.toLowerCase());
                      const matchesStatus = emailStatusFilter === 'All' || log.status === emailStatusFilter;
                      return matchesSearch && matchesStatus;
                    }).map((log) => {
                      const date = new Date(log.sentAt);
                      const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                      let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-100';
                      if (log.status === 'Sending') {
                        badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse';
                      } else if (log.status === 'Failed') {
                        badgeStyle = 'bg-rose-50 text-rose-800 border-rose-100';
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-[10px] text-slate-500">
                            {formattedDate}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{log.participantName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{log.recipientEmail}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 truncate max-w-[200px]" title={log.subject}>
                            {log.subject}
                          </td>
                          <td className="py-3 px-4 text-[10px] text-slate-400 font-mono">
                            <span className="text-emerald-600 font-semibold">TLS v1.3</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-[8px] font-extrabold uppercase border px-2.5 py-1 rounded-full tracking-wider flex items-center gap-1 w-fit ${badgeStyle}`}>
                              {log.status === 'Sending' && <RefreshCw size={8} className="animate-spin text-amber-600" />}
                              {log.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-[10px] font-medium text-slate-500 font-mono max-w-[200px] truncate" title={log.errorMessage || 'Delivered successfully.'}>
                            {log.status === 'Failed' ? (
                              <span className="text-rose-600 font-semibold">{log.errorMessage}</span>
                            ) : log.status === 'Sending' ? (
                              <span className="text-amber-600 font-semibold">Relaying envelope...</span>
                            ) : (
                              <span className="text-emerald-600 font-bold">✓ Envelope Dispatched</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM NON-BLOCKING WIPE LOGS CONFIRMATION MODAL */}
      {showClearLogsConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-sm border border-slate-100 text-left space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center border border-rose-100">
                <Trash2 size={18} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">Wipe Scan History</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to wipe all scan logs history? This is irreversible and cannot be undone.
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onClearLogs();
                  setShowClearLogsConfirm(false);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow"
              >
                Wipe History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM NON-BLOCKING WIPE EMAIL LOGS CONFIRMATION MODAL */}
      {showClearEmailLogsConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-sm border border-slate-100 text-left space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center border border-rose-100">
                <Trash2 size={18} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">Wipe Email Dispatch History</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to wipe all pass email sharing histories? This is irreversible and cannot be undone.
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearEmailLogsConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onClearEmailLogs();
                  setShowClearEmailLogsConfirm(false);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow"
              >
                Wipe History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
