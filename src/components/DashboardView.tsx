/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Participant, ScanLog, EventDetails, UserRole } from '../types.js';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Users,
  Zap
} from 'lucide-react';
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
  const checkedIn = participants.filter((p) => p.status === 'Used').length;
  const notCheckedIn = participants.filter((p) => p.status === 'Not Used').length;
  const cancelled = participants.filter((p) => p.status === 'Cancelled').length;
  const percentCheckedIn = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  const duplicateAttempts = scanLogs.filter((log) => log.scanResult === 'Used').length;
  const invalidAttempts = scanLogs.filter((log) => log.scanResult === 'Invalid').length;
  const cancelledAttempts = scanLogs.filter((log) => log.scanResult === 'Cancelled').length;
  const recentScans = [...scanLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('etsn_user') || 'null');
    } catch {
      return null;
    }
  })();
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    participants.forEach((participant) => {
      const name = participant.category?.trim() || 'Attendees';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, percent: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [participants, total]);

  const todayLabel = (() => {
    try {
      return new Date(event.eventDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return event.eventDate;
    }
  })();

  return (
    <div className="space-y-4 w-full text-left">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 px-1">
        <div>
          <div className="eventz-kicker flex items-center gap-2">
            <Sparkles size={11} className="text-yellow-500" />
            EVENT COMMAND CENTER
          </div>
          <h2 className="text-2xl md:text-[30px] leading-tight font-black tracking-[-0.045em] text-slate-950 mt-2">
            {event.eventName}
          </h2>
          <p className="text-xs text-slate-500 mt-1.5">
            {event.venue} · {todayLabel} · {event.eventTime}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="eventz-icon-button" title="Refresh live event data">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => onNavigate('scanner')}
            className="rounded-full bg-[#0b1f4d] hover:bg-[#122b63] text-white px-4 py-2.5 text-[10px] font-black flex items-center gap-2 shadow-lg shadow-slate-900/10"
          >
            <ScanLine size={14} />
            Open Scanner
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <MetricCard
          tone="navy"
          eyebrow={todayLabel}
          label="Total Participants"
          value={String(total)}
          supporting="Generated event passes"
          icon={<Users size={18} />}
          people={participants.slice(0, 3).map((p) => p.fullName)}
        />
        <MetricCard
          tone="teal"
          eyebrow={todayLabel}
          label="Average Attendance Rate"
          value={`${percentCheckedIn}%`}
          supporting={`${checkedIn} of ${total || 0} checked in`}
          icon={<CheckCircle2 size={18} />}
          people={participants.filter((p) => p.status === 'Used').slice(0, 3).map((p) => p.fullName)}
        />
        <MetricCard
          tone="blue"
          eyebrow={todayLabel}
          label="Active Access Passes"
          value={String(notCheckedIn)}
          supporting={cancelled ? `${cancelled} cancelled / blocked` : 'Ready for gate verification'}
          icon={<TicketCheck size={18} />}
          people={participants.filter((p) => p.status === 'Not Used').slice(0, 3).map((p) => p.fullName)}
        />
      </div>

      <div className="grid xl:grid-cols-[1.38fr_.92fr] gap-3">
        <section className="eventz-dashboard-panel min-h-[310px]">
          <PanelHeader
            title="Attendance Analytics"
            action={<button onClick={() => onNavigate('reports')} className="eventz-icon-button !w-8 !h-8"><ArrowUpRight size={13} /></button>}
          />

          <div className="mt-6 grid md:grid-cols-[1fr_160px] gap-6 items-end">
            <div>
              <div className="flex items-center justify-center gap-5 text-[9px] font-bold text-slate-400 mb-6">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-[#0b1f4d]" /> Checked in</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-[#f2a900]" /> Pending</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-slate-300" /> Cancelled</span>
              </div>

              <div className="h-[190px] flex items-end gap-3 sm:gap-5 border-b border-slate-100 px-2">
                {[
                  { label: 'Checked in', value: checkedIn, max: total, kind: 'navy' },
                  { label: 'Pending', value: notCheckedIn, max: total, kind: 'gold' },
                  { label: 'Blocked', value: cancelled, max: total, kind: 'soft' },
                  { label: 'Scans', value: scanLogs.length, max: Math.max(scanLogs.length, total), kind: 'teal' }
                ].map((bar) => {
                  const pct = bar.max ? Math.max(8, Math.round((bar.value / bar.max) * 100)) : 8;
                  return (
                    <div key={bar.label} className="flex-1 h-full flex flex-col justify-end items-center group">
                      <span className="text-[10px] font-black text-slate-500 mb-2 opacity-80 group-hover:opacity-100">{bar.value}</span>
                      <div
                        className={`w-full max-w-[74px] rounded-t-[18px] transition-all duration-500 group-hover:-translate-y-1 ${
                          bar.kind === 'navy'
                            ? 'bg-[#0b1f4d]'
                            : bar.kind === 'gold'
                              ? 'bg-[#f2a900]'
                              : bar.kind === 'teal'
                                ? 'bg-[#3a9aa1]'
                                : 'bg-slate-200'
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                      <span className="text-[9px] font-bold text-slate-400 mt-2 mb-1 text-center">{bar.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div
                className="relative w-36 h-36 rounded-full"
                style={{
                  background: `conic-gradient(#0b1f4d 0 ${percentCheckedIn}%, #f2a900 ${percentCheckedIn}% ${Math.min(100, percentCheckedIn + (total ? Math.round((notCheckedIn / total) * 100) : 0))}%, #e5e7eb 0)`
                }}
              >
                <div className="absolute inset-[16px] bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-black text-slate-950">{percentCheckedIn}%</span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">present</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold mt-4 text-center">Live check-in completion</p>
            </div>
          </div>
        </section>

        <section className="eventz-dashboard-panel min-h-[310px]">
          <PanelHeader
            title="Participant Categories"
            action={<button onClick={() => onNavigate('participants')} className="eventz-icon-button !w-8 !h-8"><ArrowUpRight size={13} /></button>}
          />

          <div className="mt-5 space-y-3">
            {categoryData.length === 0 && (
              <div className="py-16 text-center text-slate-400 text-xs">No category data yet.</div>
            )}
            {categoryData.map((category, index) => (
              <div key={category.name} className="rounded-2xl bg-[#f7f8fb] border border-slate-100 p-3.5 hover:bg-white hover:shadow-md transition-all">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-800">{category.name}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{category.count} participant{category.count === 1 ? '' : 's'}</p>
                  </div>
                  <span className="text-sm font-black text-slate-900">{category.percent}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      index % 4 === 0 ? 'bg-[#0b1f4d]' : index % 4 === 1 ? 'bg-[#f2a900]' : index % 4 === 2 ? 'bg-[#3a9aa1]' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.max(5, category.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid xl:grid-cols-[1.08fr_.92fr_.9fr] gap-3">
        <section className="eventz-dashboard-panel">
          <PanelHeader title="Access Operations" />
          <div className="mt-4 space-y-2.5">
            <ActionRow
              icon={<Zap size={14} />}
              label="Launch gate scanner"
              supporting="Verify and claim participant access"
              accent
              onClick={() => onNavigate('scanner')}
            />

            {isAdmin ? (
              <>
                <ActionRow icon={<Users size={14} />} label="Manage participants" supporting="Search, send passes and update access" onClick={() => onNavigate('participants')} />
                <ActionRow icon={<BarChart2 size={14} />} label="Analytics & audit" supporting="Review attendance and security activity" onClick={() => onNavigate('reports')} />
                <ActionRow icon={<ShieldCheck size={14} />} label="Registrations" supporting="Approve, waitlist and review RSVP status" onClick={() => onNavigate('registrations')} />
                <div className="pt-1"><ExportRegistryMenu /></div>
              </>
            ) : (
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-[11px] text-slate-500 flex gap-3">
                <LockKeyhole size={15} className="text-[#f2a900] shrink-0 mt-0.5" />
                Gate access is intentionally limited to scanning and verification.
              </div>
            )}
          </div>
        </section>

        <section className="eventz-dashboard-panel">
          <PanelHeader title="Security Activity" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SecurityTile label="Duplicate" value={duplicateAttempts} tone="amber" />
            <SecurityTile label="Invalid" value={invalidAttempts} tone="rose" />
            <SecurityTile label="Cancelled" value={cancelledAttempts} tone="slate" />
          </div>
          <div className="mt-4 rounded-2xl bg-[#f7f8fb] border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="eventz-kicker">Gate confidence</p>
                <p className="text-2xl font-black text-slate-950 mt-1">
                  {scanLogs.length ? Math.max(0, 100 - Math.round(((duplicateAttempts + invalidAttempts + cancelledAttempts) / scanLogs.length) * 100)) : 100}%
                </p>
              </div>
              <div className="w-14 h-14 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                <ShieldCheck size={22} className="text-[#0b1f4d]" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Share of recent scan activity without a warning condition.</p>
          </div>
        </section>

        <section className="eventz-dashboard-panel">
          <PanelHeader
            title="Recent Gate Activity"
            action={<button onClick={() => onNavigate('reports')} className="eventz-icon-button !w-8 !h-8"><ArrowUpRight size={13} /></button>}
          />
          <div className="mt-3 space-y-1.5">
            {recentScans.length === 0 && <div className="py-12 text-center text-slate-400 text-xs">No scans recorded yet.</div>}
            {recentScans.map((scan) => (
              <div key={scan.id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-all">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  scan.scanResult === 'Valid'
                    ? 'bg-emerald-50 text-emerald-600'
                    : scan.scanResult === 'Used'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-rose-50 text-rose-600'
                }`}>
                  {scan.scanResult === 'Valid' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-slate-800 truncate">{scan.participantName || scan.passId}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{scan.scanResult} · {scan.scannedBy || 'Gate'}</p>
                </div>
                <span className="text-[9px] text-slate-400 shrink-0">
                  {new Date(scan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  tone,
  eyebrow,
  label,
  value,
  supporting,
  icon,
  people
}: {
  tone: 'navy' | 'gold' | 'blue' | 'teal';
  eyebrow: string;
  label: string;
  value: string;
  supporting: string;
  icon: React.ReactNode;
  people: string[];
}) {
  const toneClass =
    tone === 'navy'
      ? 'eventz-metric-navy'
      : tone === 'gold'
        ? 'eventz-metric-gold'
        : tone === 'teal'
          ? 'eventz-metric-teal'
          : 'eventz-metric-blue';

  return (
    <div className={`eventz-metric-card min-w-0 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="eventz-chip">{eyebrow}</span>
        <div className="w-8 h-8 rounded-full border border-white/20 bg-white/10 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-[11px] font-black mt-3 opacity-95 truncate">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[28px] leading-none font-black tracking-[-0.04em]">{value}</p>
          <p className="text-[9px] mt-2 opacity-70 font-semibold line-clamp-2">{supporting}</p>
        </div>
        <div className="flex -space-x-2">
          {people.slice(0, 3).map((name, index) => (
            <div
              key={`${name}-${index}`}
              title={name}
              className="w-8 h-8 rounded-full border-2 border-white/70 bg-white/20 backdrop-blur flex items-center justify-center text-[9px] font-black"
            >
              {name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="eventz-page-title">{title}</h3>
      {action}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  supporting,
  onClick,
  accent
}: {
  icon: React.ReactNode;
  label: string;
  supporting: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border p-3.5 flex items-center gap-3 text-left group ${
        accent
          ? 'bg-[#0b1f4d] border-[#0b1f4d] text-white shadow-lg shadow-slate-900/10'
          : 'bg-[#f7f8fb] border-slate-100 text-slate-800 hover:bg-white hover:shadow-md'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        accent ? 'bg-[#f2a900] text-[#0b1f4d]' : 'bg-white border border-slate-100 text-slate-600'
      }`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black">{label}</p>
        <p className={`text-[9px] mt-0.5 truncate ${accent ? 'text-white/55' : 'text-slate-400'}`}>{supporting}</p>
      </div>
      <ArrowUpRight size={13} className="opacity-45 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </button>
  );
}

function SecurityTile({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'rose' | 'slate' }) {
  const classes =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-700 border-rose-100'
        : 'bg-slate-50 text-slate-700 border-slate-100';

  return (
    <div className={`rounded-2xl border p-3 ${classes}`}>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[8px] font-black uppercase tracking-wider mt-1 opacity-70">{label}</p>
    </div>
  );
}
