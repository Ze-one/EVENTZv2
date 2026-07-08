/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Participant, EventDetails, PassStatus } from '../types.js';
import { Search, Filter, MoreVertical, ShieldAlert, CheckCircle2, UserCheck, Trash2, ArrowUpRight, Award, User, RotateCcw, X } from 'lucide-react';
import EventPassCard from './EventPassCard.tsx';

interface ParticipantsListViewProps {
  participants: Participant[];
  event: EventDetails;
  onUpdateParticipant: (id: string, updates: Partial<Participant>) => Promise<void>;
  onDeleteParticipant: (id: string) => Promise<void>;
  onDeleteParticipants?: (ids: string[]) => Promise<void>;
  onResetCheckIn: (id: string) => Promise<void>;
  onAddParticipant: (p: { fullName: string; phone: string; email: string; organization: string; category: string }) => Promise<void>;
}

export default function ParticipantsListView({
  participants,
  event,
  onUpdateParticipant,
  onDeleteParticipant,
  onDeleteParticipants,
  onResetCheckIn,
  onAddParticipant
}: ParticipantsListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | PassStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  
  // New single participant form modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartPhone, setNewPartPhone] = useState('');
  const [newPartEmail, setNewPartEmail] = useState('');
  const [newPartOrg, setNewPartOrg] = useState('');
  const [newPartCat, setNewPartCat] = useState('Attendee');

  // Preview single pass modal state
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  // Hidden multi-pass print state
  const [isPrintingAll, setIsPrintingAll] = useState(false);

  // Custom non-blocking delete confirmation modal state
  const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    participantId?: string;
    fullName?: string;
    ids?: string[];
  } | null>(null);

  // Unique categories list
  const categories = ['All', ...Array.from(new Set(participants.map(p => p.category).filter(Boolean)))];

  // Filter logic
  const filteredList = participants.filter(p => {
    const matchesSearch = 
      p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.passId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.organization.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleCreateParticipantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim()) return;

    await onAddParticipant({
      fullName: newPartName.trim(),
      phone: newPartPhone.trim(),
      email: newPartEmail.trim(),
      organization: newPartOrg.trim(),
      category: newPartCat
    });

    // Reset
    setNewPartName('');
    setNewPartPhone('');
    setNewPartEmail('');
    setNewPartOrg('');
    setNewPartCat('Attendee');
    setShowAddModal(false);
  };

  const handlePrintAllPasses = () => {
    setIsPrintingAll(true);
    // Give react time to mount the print layout
    setTimeout(() => {
      const printContainer = document.getElementById('print-all-container');
      if (printContainer) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>Bulk Print Passes - ${event.eventName}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                  @media print {
                    body { margin: 0; background-color: white; -webkit-print-color-adjust: exact; }
                    .pass-page { page-break-after: always; display: flex; justify-content: center; align-items: center; height: 100vh; }
                  }
                </style>
              </head>
              <body class="bg-white">
                ${printContainer.innerHTML}
                <script>
                  window.onload = function() {
                    window.print();
                    window.close();
                  }
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
        }
      }
      setIsPrintingAll(false);
    }, 500);
  };

  const isAllSelected = filteredList.length > 0 && filteredList.every(p => selectedParticipantIds.includes(p.id));

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      setSelectedParticipantIds(prev => prev.filter(id => !filteredList.some(p => p.id === id)));
    } else {
      setSelectedParticipantIds(prev => {
        const otherSelected = prev.filter(id => !filteredList.some(p => p.id === id));
        return [...otherSelected, ...filteredList.map(p => p.id)];
      });
    }
  };

  const handleSelectRowToggle = (id: string) => {
    setSelectedParticipantIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    const visibleSelectedIds = selectedParticipantIds.filter(id => filteredList.some(p => p.id === id));
    if (visibleSelectedIds.length === 0) return;
    setDeleteConfirmInfo({
      isOpen: true,
      type: 'bulk',
      ids: visibleSelectedIds
    });
  };

  return (
    <div className="space-y-6 w-full text-left">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">Participants & Credentials Roster</h2>
          <p className="text-slate-400 text-xs">Search credentials, grant/reset access, and bulk print delegate passes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedParticipantIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              Delete Selected ({selectedParticipantIds.length})
            </button>
          )}
          <button
            onClick={handlePrintAllPasses}
            disabled={filteredList.length === 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-950 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow border border-slate-700"
          >
            Bulk Print Passes ({filteredList.length})
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow"
          >
            + Add Attendee
          </button>
        </div>
      </div>

      {/* Roster Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1 text-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Search size={14} />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search roster by attendee name, email, organization or pass ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Category</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-xs font-semibold text-slate-700"
          >
            {categories.map((cat, idx) => (
              <option key={idx} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Status</span>
          <div className="flex gap-1 border border-slate-200 p-1 bg-slate-50 rounded-xl">
            {['All', PassStatus.NOT_USED, PassStatus.USED, PassStatus.CANCELLED].map((status, idx) => (
              <button
                key={idx}
                onClick={() => setStatusFilter(status as any)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all ${
                  statusFilter === status
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-100'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {status === PassStatus.NOT_USED ? 'Ready' : status === PassStatus.USED ? 'Checked-in' : status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid count summary */}
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
        Showing {filteredList.length} of {participants.length} total registrants
      </div>

      {/* Roster Grid/Table */}
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAllToggle}
                    className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 h-4 w-4 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Roster Info</th>
                <th className="py-3 px-4">Pass ID</th>
                <th className="py-3 px-4">Access Status</th>
                <th className="py-3 px-4">Gates logs</th>
                <th className="py-3 px-4 text-right">Row Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
                        <Search size={16} />
                      </div>
                      <p className="font-bold text-slate-700">No attendees match filters</p>
                      <p className="text-[10px]">Try adjusting your queries or upload a new roster.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredList.map((p) => {
                  const checkInTime = p.checkedInAt 
                    ? new Date(p.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    : '';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/30 transition-colors">
                      {/* Selection Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedParticipantIds.includes(p.id)}
                          onChange={() => handleSelectRowToggle(p.id)}
                          className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 h-4 w-4 cursor-pointer"
                        />
                      </td>
                      {/* Name Column */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 text-sm leading-tight">
                          {p.fullName}
                        </div>
                        {p.organization && (
                          <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                            💼 {p.organization}
                          </span>
                        )}
                      </td>

                      {/* Contact & Category */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="space-y-0.5 font-mono text-[10px]">
                          {p.category && (
                            <span className="font-bold text-[9px] uppercase tracking-wider text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full inline-block border border-slate-200">
                              {p.category}
                            </span>
                          )}
                          {p.email && <p className="truncate max-w-[180px]">✉️ {p.email}</p>}
                          {p.phone && <p>📞 {p.phone}</p>}
                        </div>
                      </td>

                      {/* Pass ID */}
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700">
                        {p.passId}
                      </td>

                      {/* Status column */}
                      <td className="py-3.5 px-4">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full inline-block border ${
                          p.status === PassStatus.NOT_USED ? 'bg-emerald-50 text-emerald-800 border-emerald-100' :
                          p.status === PassStatus.USED ? 'bg-amber-50 text-amber-800 border-amber-200' :
                          'bg-rose-50 text-rose-800 border-rose-100'
                        }`}>
                          {p.status === PassStatus.NOT_USED ? 'Ready' : p.status}
                        </span>
                      </td>

                      {/* Gates logs column */}
                      <td className="py-3.5 px-4 text-slate-500">
                        {p.status === PassStatus.USED ? (
                          <div className="space-y-0.5">
                            <p className="font-semibold text-slate-700 font-mono text-[10px]">✓ {checkInTime}</p>
                            <p className="text-[9px] font-medium text-slate-400">By {p.checkedInBy || 'Gate'}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-mono">—</span>
                        )}
                      </td>

                      {/* Control row operations */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setSelectedParticipant(p)}
                            className="px-2 py-1 text-slate-700 hover:text-slate-900 font-bold rounded hover:bg-slate-50 border border-slate-200 transition-all"
                            title="View / Print Card"
                          >
                            View Card
                          </button>

                          {p.status === PassStatus.USED ? (
                            <button
                              onClick={() => onResetCheckIn(p.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                              title="Reset Entrance Check"
                            >
                              <RotateCcw size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => onUpdateParticipant(p.id, { status: PassStatus.USED, checkedInAt: new Date().toISOString(), checkedInBy: 'Admin Board' })}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-all"
                              title="Mark manual check-in"
                            >
                              <UserCheck size={14} />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setDeleteConfirmInfo({
                                isOpen: true,
                                type: 'single',
                                participantId: p.id,
                                fullName: p.fullName
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-all"
                            title="Delete Attendee"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SINGLE PASS CARD VIEW MODAL OVERLAY */}
      {selectedParticipant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-md max-h-[90vh] overflow-y-auto no-scrollbar border border-slate-100 text-left space-y-4">
            <button
              onClick={() => setSelectedParticipant(null)}
              className="absolute top-4 right-4 p-1.5 bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-all"
            >
              <X size={15} />
            </button>
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-800 text-sm">Attendee Pass Preview</h3>
              <p className="text-[10px] text-slate-400">Generate, test, print, or download individual participant credential</p>
            </div>
            <div className="border-t border-slate-50 pt-3">
              <EventPassCard participant={selectedParticipant} event={event} />
            </div>
          </div>
        </div>
      )}

      {/* SINGLE NEW ATTENDEE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCreateParticipantSubmit} className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-md border border-slate-100 text-left space-y-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1.5 bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-all"
            >
              <X size={15} />
            </button>
            
            <div className="space-y-1 border-b border-slate-50 pb-2">
              <h3 className="font-extrabold text-slate-800 text-sm">Add New Registrant</h3>
              <p className="text-[10px] text-slate-400">Add an individual participant directly to the roster</p>
            </div>

            <div className="grid grid-cols-1 gap-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Full Name (Required)</label>
                <input
                  type="text"
                  value={newPartName}
                  onChange={(e) => setNewPartName(e.target.value)}
                  placeholder="e.g. Patrick Mboa"
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Email Address</label>
                <input
                  type="email"
                  value={newPartEmail}
                  onChange={(e) => setNewPartEmail(e.target.value)}
                  placeholder="e.g. patrick@mboa.com"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Phone Number</label>
                <input
                  type="text"
                  value={newPartPhone}
                  onChange={(e) => setNewPartPhone(e.target.value)}
                  placeholder="e.g. +234 812 345 6789"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Organization</label>
                <input
                  type="text"
                  value={newPartOrg}
                  onChange={(e) => setNewPartOrg(e.target.value)}
                  placeholder="e.g. Greenfield Corp"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Category</label>
                <input
                  type="text"
                  value={newPartCat}
                  onChange={(e) => setNewPartCat(e.target.value)}
                  placeholder="Attendee, VIP, Speaker, Exhibitor"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow"
              >
                Add and Generate Pass
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CUSTOM NON-BLOCKING DELETE CONFIRMATION MODAL */}
      {deleteConfirmInfo?.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-sm border border-slate-100 text-left space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center border border-rose-100">
                <Trash2 size={18} />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">Confirm Deletion</h3>
            </div>
            <div className="text-xs text-slate-500 leading-relaxed">
              {deleteConfirmInfo.type === 'single' ? (
                <p>Are you sure you want to delete <strong>{deleteConfirmInfo.fullName}</strong> from the participants roster? This action cannot be undone.</p>
              ) : (
                <p>Are you sure you want to delete <strong>{deleteConfirmInfo.ids?.length}</strong> selected participant(s) from the roster? This action cannot be undone.</p>
              )}
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmInfo(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (deleteConfirmInfo.type === 'single' && deleteConfirmInfo.participantId) {
                    await onDeleteParticipant(deleteConfirmInfo.participantId);
                  } else if (deleteConfirmInfo.type === 'bulk' && deleteConfirmInfo.ids) {
                    if (onDeleteParticipants) {
                      await onDeleteParticipants(deleteConfirmInfo.ids);
                    } else {
                      for (const id of deleteConfirmInfo.ids) {
                        await onDeleteParticipant(id);
                      }
                    }
                    setSelectedParticipantIds(prev => prev.filter(id => !deleteConfirmInfo.ids!.includes(id)));
                  }
                  setDeleteConfirmInfo(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow"
              >
                Delete Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN PRINT CONTAINER FOR BULK MULTI-PAGE PRINTING */}
      <div id="print-all-container" className="hidden">
        {filteredList.map((p, idx) => (
          <div key={p.id} className="pass-page">
            <div className="w-[450px] border border-neutral-300 rounded-3xl overflow-hidden shadow-2xl p-6 bg-white my-10">
              {/* Manual Pass Card rendering style suitable for print-all snapshot */}
              <div className="text-white p-6 rounded-t-2xl relative" style={{ backgroundColor: event.primaryColor }}>
                <h3 className="text-xl font-bold uppercase tracking-wider">{event.organizerName}</h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md mt-1 inline-block" style={{ backgroundColor: `${event.accentColor}25`, color: event.accentColor }}>{event.passTitle}</span>
                <p className="text-xs text-slate-300 font-bold mt-2">{event.eventName}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">📍 {event.venue} | ⏰ {event.eventDate}</p>
                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: event.accentColor }}></div>
              </div>
              <div className="p-6 space-y-6 bg-slate-50 text-left">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 tracking-wider block">ATTENDEE</span>
                  <h2 className="text-2xl font-black text-slate-900">{p.fullName}</h2>
                  <span className="font-mono text-xs font-bold bg-white border border-slate-200 px-2 py-1 rounded inline-block mt-1" style={{ color: event.accentColor }}>{p.passId}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-[10px] bg-white p-3 rounded-xl border">
                  {event.showCategory && p.category && <div><span className="text-slate-400 block">Category</span><span className="font-bold text-slate-800">{p.category}</span></div>}
                  {event.showOrganization && p.organization && <div><span className="text-slate-400 block">Organization</span><span className="font-bold text-slate-800">{p.organization}</span></div>}
                  {event.showEmail && p.email && <div className="col-span-2"><span className="text-slate-400 block">Email</span><span className="font-bold text-slate-800">{p.email}</span></div>}
                  {event.showPhone && p.phone && <div className="col-span-2"><span className="text-slate-400 block">Phone</span><span className="font-bold text-slate-800">{p.phone}</span></div>}
                </div>

                <div className="text-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {event.accessInstruction}
                  <p className="text-[8px] text-slate-400 mt-1">{event.footerNote}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
