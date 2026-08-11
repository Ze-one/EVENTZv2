/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, FileText, Trash2, CheckCircle2, AlertCircle, Sparkles, Clipboard, PlusCircle, Tags, Users } from 'lucide-react';

interface RawParticipant {
  fullName: string;
  phone: string;
  email: string;
  organization: string;
  category: string;
}

interface LocalCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  accessLevel: string;
  instructions: string;
  capacity: string;
  isActive: boolean;
  createdAt: string;
}

interface UploadParticipantsProps {
  onConfirm: (participants: RawParticipant[]) => void;
  onCancel: () => void;
  existingCategories?: string[];
}

const CATEGORY_STORAGE_KEY = 'eventz_participant_categories';
const DEFAULT_CATEGORIES: LocalCategory[] = [
  { id: 'cat-attendee', name: 'Attendees', description: 'General event participants', color: '#2563eb', accessLevel: 'General Access', instructions: 'Present pass at the main entrance.', capacity: '', isActive: true, createdAt: new Date().toISOString() },
  { id: 'cat-volunteer', name: 'Volunteers', description: 'Operational support team', color: '#16a34a', accessLevel: 'Operations Access', instructions: 'Report to the coordination desk before deployment.', capacity: '', isActive: true, createdAt: new Date().toISOString() },
  { id: 'cat-vip', name: 'VIP', description: 'Special guests and invited dignitaries', color: '#f59e0b', accessLevel: 'Priority Access', instructions: 'Use the VIP reception point.', capacity: '', isActive: true, createdAt: new Date().toISOString() },
  { id: 'cat-staff', name: 'Staff', description: 'Internal event staff', color: '#64748b', accessLevel: 'Staff Access', instructions: 'Carry staff identification if requested.', capacity: '', isActive: true, createdAt: new Date().toISOString() }
];

function loadStoredCategories(): LocalCategory[] {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
    return parsed.length ? parsed : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

function saveStoredCategories(categories: LocalCategory[]) {
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
}

export default function UploadParticipants({ onConfirm, onCancel, existingCategories = [] }: UploadParticipantsProps) {
  const [previewList, setPreviewList] = useState<RawParticipant[]>([]);
  const [error, setError] = useState<string>('');
  const [pasteMode, setPasteMode] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string>('');
  const [categories, setCategories] = useState<LocalCategory[]>(loadStoredCategories);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>(categories.find(c => c.isActive)?.name || 'Attendees');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryAccessLevel, setNewCategoryAccessLevel] = useState('General Access');
  const [newCategoryInstructions, setNewCategoryInstructions] = useState('Present this pass at the entrance for verification.');
  const [newCategoryCapacity, setNewCategoryCapacity] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#2563eb');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mergedCategories = useMemo(() => {
    const byName = new Map<string, LocalCategory>();
    for (const item of categories) byName.set(item.name.toLowerCase(), item);
    for (const name of existingCategories.filter(Boolean)) {
      if (!byName.has(name.toLowerCase())) {
        byName.set(name.toLowerCase(), { id: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, description: 'Existing participant category', color: '#64748b', accessLevel: 'Existing Access', instructions: '', capacity: '', isActive: true, createdAt: new Date().toISOString() });
      }
    }
    return Array.from(byName.values()).filter(c => c.isActive);
  }, [categories, existingCategories]);

  const selectedCategory = mergedCategories.find(c => c.name === selectedCategoryName) || mergedCategories[0];

  const applySelectedCategory = (list: RawParticipant[]) => list.map(item => ({ ...item, category: selectedCategory?.name || item.category || 'Attendees' }));

  const persistCategories = (next: LocalCategory[]) => {
    setCategories(next);
    saveStoredCategories(next);
  };

  const handleCreateCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      setError('Enter a category name before creating it.');
      return;
    }
    const exists = categories.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setSelectedCategoryName(categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.name || name);
      setError('');
      return;
    }
    const created: LocalCategory = {
      id: 'cat-' + Math.random().toString(36).substring(2, 9),
      name,
      description: newCategoryDescription.trim(),
      color: newCategoryColor,
      accessLevel: newCategoryAccessLevel.trim() || 'General Access',
      instructions: newCategoryInstructions.trim(),
      capacity: newCategoryCapacity.trim(),
      isActive: true,
      createdAt: new Date().toISOString()
    };
    const next = [...categories, created];
    persistCategories(next);
    setSelectedCategoryName(created.name);
    setNewCategoryName('');
    setNewCategoryDescription('');
    setNewCategoryAccessLevel('General Access');
    setNewCategoryInstructions('Present this pass at the entrance for verification.');
    setNewCategoryCapacity('');
    setNewCategoryColor('#2563eb');
    if (previewList.length) setPreviewList(prev => prev.map(p => ({ ...p, category: created.name })));
    setError('');
  };

  const handleCategoryChange = (name: string) => {
    setSelectedCategoryName(name);
    if (previewList.length) setPreviewList(prev => prev.map(p => ({ ...p, category: name })));
  };

  const parseLines = (lines: string[]) => {
    const list: RawParticipant[] = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.includes('|')) {
        const parts = line.split('|').map(s => s.trim());
        list.push({ fullName: parts[0] || 'Anonymous', phone: parts[1] || '', email: parts[2] || '', organization: parts[3] || '', category: selectedCategory?.name || parts[4] || 'Attendees' });
      } else if (line.includes('\t')) {
        const parts = line.split('\t').map(s => s.trim());
        list.push({ fullName: parts[0] || 'Anonymous', phone: parts[1] || '', email: parts[2] || '', organization: parts[3] || '', category: selectedCategory?.name || parts[4] || 'Attendees' });
      } else if (line.includes(',')) {
        const parts = line.split(',').map(s => s.trim());
        list.push({ fullName: parts[0] || 'Anonymous', phone: parts[1] || '', email: parts[2] || '', organization: parts[3] || '', category: selectedCategory?.name || parts[4] || 'Attendees' });
      } else {
        list.push({ fullName: line, phone: '', email: '', organization: '', category: selectedCategory?.name || 'Attendees' });
      }
    }
    return applySelectedCategory(list);
  };

  const handleExcelParse = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rawRows.length === 0) return setError('The uploaded Excel sheet is empty.');
        const firstRow = rawRows[0].map((h: any) => String(h).toLowerCase().replace(/\s+/g, ''));
        const fullNameIdx = firstRow.findIndex((h: string) => h.includes('name') || h.includes('full'));
        const phoneIdx = firstRow.findIndex((h: string) => h.includes('phone') || h.includes('tel') || h.includes('mobile'));
        const emailIdx = firstRow.findIndex((h: string) => h.includes('email') || h.includes('mail'));
        const orgIdx = firstRow.findIndex((h: string) => h.includes('org') || h.includes('company') || h.includes('school'));
        const startIdx = (fullNameIdx !== -1 || emailIdx !== -1) ? 1 : 0;
        const parsed: RawParticipant[] = [];
        for (let i = startIdx; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;
          const fullName = String(fullNameIdx !== -1 ? row[fullNameIdx] || '' : row[0] || '').trim();
          if (!fullName) continue;
          parsed.push({
            fullName,
            phone: phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '',
            email: emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '',
            organization: orgIdx !== -1 ? String(row[orgIdx] || '').trim() : '',
            category: selectedCategory?.name || 'Attendees'
          });
        }
        if (!parsed.length) setError('Could not extract any participant names from Excel.');
        else { setPreviewList(applySelectedCategory(parsed)); setError(''); }
      } catch {
        setError('Error reading Excel file. Please try a standard CSV or TXT file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCSVParse = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = results.data as any[];
          if (data.length === 0) return setError('The uploaded CSV file is empty.');
          const parsed = data.map(row => {
            const keys = Object.keys(row);
            const nameKey = keys.find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('full')) || keys[0];
            const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('tel') || k.toLowerCase().includes('mobile'));
            const emailKey = keys.find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('mail'));
            const orgKey = keys.find(k => k.toLowerCase().includes('org') || k.toLowerCase().includes('company') || k.toLowerCase().includes('school'));
            return { fullName: String(row[nameKey] || '').trim(), phone: phoneKey ? String(row[phoneKey] || '').trim() : '', email: emailKey ? String(row[emailKey] || '').trim() : '', organization: orgKey ? String(row[orgKey] || '').trim() : '', category: selectedCategory?.name || 'Attendees' };
          }).filter(p => p.fullName);
          if (!parsed.length) setError('No valid participant names found in CSV.');
          else { setPreviewList(applySelectedCategory(parsed)); setError(''); }
        } catch {
          setError('Error parsing CSV headers. Check file formatting.');
        }
      },
      error: () => setError('Failed to read CSV file.')
    });
  };

  const handleTextParse = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseLines(String(e.target?.result || '').split('\n'));
      if (!parsed.length) setError('No valid participant names found in text file.');
      else { setPreviewList(parsed); setError(''); }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'xlsx' || extension === 'xls') handleExcelParse(file);
    else if (extension === 'csv') handleCSVParse(file);
    else if (extension === 'txt') handleTextParse(file);
    else setError(`Unsupported file extension: .${extension}. We support CSV, Excel, TXT, or copy-pasting standard text.`);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleFileUpload(fakeEvent);
  };

  const handlePasteSubmit = () => {
    if (!rawText.trim()) return setError('Please paste some text first.');
    const parsed = parseLines(rawText.split('\n'));
    if (!parsed.length) setError('Could not extract any participant names.');
    else { setPreviewList(parsed); setError(''); }
  };

  const handleEditField = (index: number, field: keyof RawParticipant, value: string) => {
    const updated = [...previewList];
    updated[index] = { ...updated[index], [field]: value };
    setPreviewList(updated);
  };

  const handleDeleteItem = (index: number) => setPreviewList(prev => prev.filter((_, idx) => idx !== index));
  const handleConfirmUpload = () => { if (previewList.length) onConfirm(applySelectedCategory(previewList)); };

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-2 text-yellow-500 font-bold text-xs tracking-wider uppercase"><Sparkles size={14} /> Category-Based Roster Upload</div>
          <h2 className="text-xl font-black">Upload Registered Participants</h2>
          <p className="text-slate-400 text-xs max-w-lg leading-relaxed">Create or select a participant category first, then browse and upload the roster for that category. Every imported participant will inherit the selected category.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setPasteMode(!pasteMode); setPreviewList([]); setError(''); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all">{pasteMode ? <FileText size={14} /> : <Clipboard size={14} />}{pasteMode ? 'Upload File instead' : 'Copy-Paste Text Mode'}</button>
          <button onClick={onCancel} className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all">Cancel</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 text-left">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-slate-900"><Tags size={16} /><h3 className="font-black text-sm">1. Select Category</h3></div>
          <select value={selectedCategoryName} onChange={(e) => handleCategoryChange(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900">
            {mergedCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
          </select>
          {selectedCategory && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs space-y-2"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedCategory.color }}></span><span className="font-black text-slate-800">{selectedCategory.name}</span></div><p className="text-slate-500 leading-relaxed">{selectedCategory.description || 'No description yet.'}</p><div className="grid grid-cols-2 gap-2 text-[10px]"><span className="bg-white border border-slate-100 rounded-lg p-2"><b>Access:</b><br />{selectedCategory.accessLevel || 'General'}</span><span className="bg-white border border-slate-100 rounded-lg p-2"><b>Capacity:</b><br />{selectedCategory.capacity || 'Open'}</span></div>{selectedCategory.instructions && <p className="text-[10px] text-slate-500"><b>Instruction:</b> {selectedCategory.instructions}</p>}</div>}
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2 text-slate-900"><PlusCircle size={16} /><h3 className="font-black text-sm">Create New Category</h3></div>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Category name, e.g. Volunteers" className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-slate-900" />
            <input value={newCategoryAccessLevel} onChange={(e) => setNewCategoryAccessLevel(e.target.value)} placeholder="Access level" className="p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900" />
            <input value={newCategoryCapacity} onChange={(e) => setNewCategoryCapacity(e.target.value)} placeholder="Capacity / limit optional" className="p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900" />
            <input type="color" value={newCategoryColor} onChange={(e) => setNewCategoryColor(e.target.value)} className="h-[42px] p-1 bg-slate-50 border border-slate-200 rounded-xl" />
            <input value={newCategoryDescription} onChange={(e) => setNewCategoryDescription(e.target.value)} placeholder="Description / role specification" className="md:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900" />
            <textarea value={newCategoryInstructions} onChange={(e) => setNewCategoryInstructions(e.target.value)} placeholder="Check-in instructions for this category" rows={2} className="md:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none" />
          </div>
          <button onClick={handleCreateCategory} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1.5"><PlusCircle size={14} /> Save Category and Use It</button>
        </div>
      </div>

      {error && <div className="bg-rose-50 text-rose-800 border border-rose-200/60 p-4 rounded-2xl flex gap-3 text-xs text-left"><AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={16} /><div><p className="font-bold">Attention</p><p>{error}</p></div></div>}

      {previewList.length === 0 ? (
        <div className="space-y-4">
          {!pasteMode ? (
            <div onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50 py-16 px-6 rounded-3xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-4 group">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv, .xlsx, .xls, .txt" className="hidden" />
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500 border border-slate-100 group-hover:scale-105 transition-all"><Upload size={24} className="text-slate-600" /></div>
              <div className="space-y-1"><p className="font-extrabold text-slate-800 text-sm">2. Browse roster for {selectedCategoryName}</p><p className="text-slate-400 text-xs">Drag and drop or click to upload CSV, Excel, or TXT. Imported rows will be assigned to <b>{selectedCategoryName}</b>.</p></div>
              <div className="flex gap-4 pt-4 text-[10px] font-bold text-slate-400 tracking-wider uppercase border-t border-slate-100 w-full max-w-sm justify-center"><span>Excel</span><span>•</span><span>CSV</span><span>•</span><span>TXT</span></div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 text-left">
              <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Paste roster for {selectedCategoryName}</label><p className="text-slate-400 text-[11px] leading-relaxed">One name per line, or columns: Full Name | Phone | Email | Organization. Category is applied automatically from the selected category.</p></div>
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="John Doe&#10;Mary Claire | +2376XXXXXXX | mary@example.com | ETSNTECH" className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all focus:border-slate-900" />
              <div className="flex justify-end gap-2"><button onClick={() => setRawText('')} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Clear Box</button><button onClick={handlePasteSubmit} disabled={!rawText.trim()} className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow"><Clipboard size={14} /> Analyze and Import</button></div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col text-left">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="space-y-0.5"><span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1"><CheckCircle2 size={13} /> Extraction Completed</span><p className="font-bold text-slate-800 text-sm">Found <span className="text-slate-900 font-extrabold">{previewList.length}</span> parsed participants for <span className="text-emerald-700">{selectedCategoryName}</span></p></div>
            <div className="flex gap-2"><button onClick={() => setPreviewList([])} className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 transition-all">Reset Upload</button><button onClick={handleConfirmUpload} className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 transition-all"><Users size={13} /> Confirm & Generate Passes</button></div>
          </div>
          <div className="overflow-x-auto max-h-[450px]"><table className="w-full text-xs text-left"><thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100"><tr><th className="py-3 px-4">#</th><th className="py-3 px-4">Full Name</th><th className="py-3 px-4">Phone</th><th className="py-3 px-4">Email</th><th className="py-3 px-4">Organization</th><th className="py-3 px-4">Category</th><th className="py-3 px-4 text-center">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{previewList.map((item, idx) => (<tr key={idx} className="hover:bg-slate-50/40 transition-colors"><td className="py-2.5 px-4 font-mono text-slate-400 font-bold">{idx + 1}</td><td className="py-2 px-3"><input type="text" value={item.fullName} onChange={(e) => handleEditField(idx, 'fullName', e.target.value)} className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none font-semibold text-slate-800" /></td><td className="py-2 px-3"><input type="text" value={item.phone} onChange={(e) => handleEditField(idx, 'phone', e.target.value)} className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600 font-mono" /></td><td className="py-2 px-3"><input type="email" value={item.email} onChange={(e) => handleEditField(idx, 'email', e.target.value)} className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600" /></td><td className="py-2 px-3"><input type="text" value={item.organization} onChange={(e) => handleEditField(idx, 'organization', e.target.value)} className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600" /></td><td className="py-2 px-3"><select value={item.category} onChange={(e) => handleEditField(idx, 'category', e.target.value)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700">{mergedCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}</select></td><td className="py-2 px-4 text-center"><button onClick={() => handleDeleteItem(idx)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-all" title="Delete Name"><Trash2 size={14} /></button></td></tr>))}</tbody></table></div>
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between items-center"><span>All rows are category-aware and can still be edited before confirmation.</span><span>Category: {selectedCategoryName}</span></div>
        </div>
      )}
    </div>
  );
}
