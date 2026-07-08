/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Upload, FileText, Trash2, Edit2, CheckCircle2, AlertCircle, Sparkles, Clipboard } from 'lucide-react';
import { Participant } from '../types.js';

interface RawParticipant {
  fullName: string;
  phone: string;
  email: string;
  organization: string;
  category: string;
}

interface UploadParticipantsProps {
  onConfirm: (participants: RawParticipant[]) => void;
  onCancel: () => void;
}

export default function UploadParticipants({ onConfirm, onCancel }: UploadParticipantsProps) {
  const [previewList, setPreviewList] = useState<RawParticipant[]>([]);
  const [error, setError] = useState<string>('');
  const [pasteMode, setPasteMode] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse custom text format line by line
  const parseLines = (lines: string[]) => {
    const list: RawParticipant[] = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Check if it's structured format containing pipes or tabs
      if (line.includes('|')) {
        const parts = line.split('|').map(s => s.trim());
        list.push({
          fullName: parts[0] || 'Anonymous',
          phone: parts[1] || '',
          email: parts[2] || '',
          organization: parts[3] || '',
          category: parts[4] || ''
        });
      } else if (line.includes('\t')) {
        const parts = line.split('\t').map(s => s.trim());
        list.push({
          fullName: parts[0] || 'Anonymous',
          phone: parts[1] || '',
          email: parts[2] || '',
          organization: parts[3] || '',
          category: parts[4] || ''
        });
      } else if (line.includes(',')) {
        // Simple fallback comma separation if not fully CSV
        const parts = line.split(',').map(s => s.trim());
        list.push({
          fullName: parts[0] || 'Anonymous',
          phone: parts[1] || '',
          email: parts[2] || '',
          organization: parts[3] || '',
          category: parts[4] || ''
        });
      } else {
        // Simple name-only format
        list.push({
          fullName: line,
          phone: '',
          email: '',
          organization: '',
          category: 'Attendee'
        });
      }
    }
    return list;
  };

  // Handle excel parse
  const handleExcelParse = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Raw rows
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rawRows.length === 0) {
          setError('The uploaded Excel sheet is empty.');
          return;
        }

        const parsed: RawParticipant[] = [];
        // Detect headers
        const firstRow = rawRows[0].map((h: any) => String(h).toLowerCase().replace(/\s+/g, ''));
        
        const fullNameIdx = firstRow.findIndex((h: string) => h.includes('name') || h.includes('full'));
        const phoneIdx = firstRow.findIndex((h: string) => h.includes('phone') || h.includes('tel') || h.includes('mobile'));
        const emailIdx = firstRow.findIndex((h: string) => h.includes('email') || h.includes('mail'));
        const orgIdx = firstRow.findIndex((h: string) => h.includes('org') || h.includes('company'));
        const catIdx = firstRow.findIndex((h: string) => h.includes('cat') || h.includes('type') || h.includes('role'));

        // Skip header row if we found named columns, or if first row is headers
        const startIdx = (fullNameIdx !== -1 || emailIdx !== -1) ? 1 : 0;

        for (let i = startIdx; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          let fullName = '';
          let phone = '';
          let email = '';
          let org = '';
          let cat = 'Attendee';

          if (fullNameIdx !== -1) {
            fullName = String(row[fullNameIdx] || '').trim();
          } else {
            fullName = String(row[0] || '').trim(); // Default first col
          }

          if (phoneIdx !== -1) phone = String(row[phoneIdx] || '').trim();
          if (emailIdx !== -1) email = String(row[emailIdx] || '').trim();
          if (orgIdx !== -1) org = String(row[orgIdx] || '').trim();
          if (catIdx !== -1) cat = String(row[catIdx] || 'Attendee').trim();

          if (fullName) {
            parsed.push({
              fullName,
              phone,
              email,
              organization: org,
              category: cat
            });
          }
        }

        if (parsed.length === 0) {
          setError('Could not extract any participant names from Excel.');
        } else {
          setPreviewList(parsed);
          setError('');
        }
      } catch (err) {
        console.error(err);
        setError('Error reading Excel file. Please try a standard CSV or TXT file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Handle CSV parse
  const handleCSVParse = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = results.data as any[];
          if (data.length === 0) {
            setError('The uploaded CSV file is empty.');
            return;
          }

          const parsed = data.map(row => {
            // Find key values by checking keys loosely
            const keys = Object.keys(row);
            const nameKey = keys.find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('full')) || keys[0];
            const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('tel') || k.toLowerCase().includes('mobile'));
            const emailKey = keys.find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('mail'));
            const orgKey = keys.find(k => k.toLowerCase().includes('org') || k.toLowerCase().includes('company'));
            const catKey = keys.find(k => k.toLowerCase().includes('cat') || k.toLowerCase().includes('type'));

            return {
              fullName: String(row[nameKey] || '').trim(),
              phone: phoneKey ? String(row[phoneKey] || '').trim() : '',
              email: emailKey ? String(row[emailKey] || '').trim() : '',
              organization: orgKey ? String(row[orgKey] || '').trim() : '',
              category: catKey ? String(row[catKey] || 'Attendee').trim() : 'Attendee'
            };
          }).filter(p => p.fullName);

          if (parsed.length === 0) {
            setError('No valid participant names found in CSV.');
          } else {
            setPreviewList(parsed);
            setError('');
          }
        } catch (err) {
          setError('Error parsing CSV headers. Check file formatting.');
        }
      },
      error: () => {
        setError('Failed to read CSV file.');
      }
    });
  };

  // Handle TXT/Plaintext Parse
  const handleTextParse = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const parsed = parseLines(lines);
      
      if (parsed.length === 0) {
        setError('No valid participant names found in text file.');
      } else {
        setPreviewList(parsed);
        setError('');
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'xlsx' || extension === 'xls') {
      handleExcelParse(file);
    } else if (extension === 'csv') {
      handleCSVParse(file);
    } else if (extension === 'txt') {
      handleTextParse(file);
    } else {
      setError(`Unsupported file extension: .${extension}. We support CSV, Excel, TXT, or copy-pasting standard text.`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setError('');
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'xlsx' || extension === 'xls') {
      handleExcelParse(file);
    } else if (extension === 'csv') {
      handleCSVParse(file);
    } else if (extension === 'txt') {
      handleTextParse(file);
    } else {
      setError(`Unsupported file format: .${extension}. Please drop a CSV, Excel, or TXT file.`);
    }
  };

  const handlePasteSubmit = () => {
    if (!rawText.trim()) {
      setError('Please paste some text first.');
      return;
    }
    const lines = rawText.split('\n');
    const parsed = parseLines(lines);
    if (parsed.length === 0) {
      setError('Could not extract any participant names.');
    } else {
      setPreviewList(parsed);
      setError('');
    }
  };

  const handleEditField = (index: number, field: keyof RawParticipant, value: string) => {
    const updated = [...previewList];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setPreviewList(updated);
  };

  const handleDeleteItem = (index: number) => {
    const updated = [...previewList];
    updated.splice(index, 1);
    setPreviewList(updated);
  };

  const handleConfirmUpload = () => {
    if (previewList.length === 0) return;
    onConfirm(previewList);
  };

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-2 text-yellow-500 font-bold text-xs tracking-wider uppercase">
            <Sparkles size={14} />
            Data Extraction Suite
          </div>
          <h2 className="text-xl font-black">Upload Registered Participants</h2>
          <p className="text-slate-400 text-xs max-w-lg leading-relaxed">
            Extract, verify, and clean attendee lists from multiple file formats before bulk generating branded, secure digital passes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPasteMode(!pasteMode);
              setPreviewList([]);
              setError('');
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            {pasteMode ? <FileText size={14} /> : <Clipboard size={14} />}
            {pasteMode ? 'Upload File instead' : 'Copy-Paste Text Mode'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            Cancel
          </button>
        </div>
      </div>

      {previewList.length === 0 ? (
        <div className="space-y-4">
          {error && (
            <div className="bg-rose-50 text-rose-800 border border-rose-200/60 p-4 rounded-2xl flex gap-3 text-xs">
              <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="font-bold">Parsing Error</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* TAB 1: FILE DRAG DROP UPLOADER */}
          {!pasteMode ? (
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50 py-16 px-6 rounded-3xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv, .xlsx, .xls, .txt"
                className="hidden"
              />
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500 border border-slate-100 group-hover:scale-105 transition-all">
                <Upload size={24} className="text-slate-600" />
              </div>
              <div className="space-y-1">
                <p className="font-extrabold text-slate-800 text-sm">Drag and drop your roster file here</p>
                <p className="text-slate-400 text-xs">or click to browse local files (.csv, .xlsx, .xls, .txt)</p>
              </div>
              <div className="flex gap-4 pt-4 text-[10px] font-bold text-slate-400 tracking-wider uppercase border-t border-slate-100 w-full max-w-sm justify-center">
                <span>Excel Rows</span>
                <span>•</span>
                <span>Comma CSV</span>
                <span>•</span>
                <span>Plain Roster</span>
              </div>
            </div>
          ) : (
            /* TAB 2: COPIED TEXT WRITING BOX */
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                  PASTE PARTICIPANTS ROSTER (TXT/CSV/WORD EXTRAPOLATION)
                </label>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Paste rows directly from PDF, Word, or Emails. We support standard plain name lists, or pipe-separated columns: <code className="bg-slate-100 font-mono p-0.5 rounded text-slate-800">Full Name | Phone | Email | Organization | Category</code>.
                </p>
              </div>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="John Doe&#10;Mary Claire | +234801112222 | mary@claire.com | Greenfield Corp | Speaker&#10;Patrick Mboa | +234803334444 | patrick@mboa.org | UniAbuja | Delegate"
                className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all focus:border-slate-900"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRawText('')}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  Clear Box
                </button>
                <button
                  onClick={handlePasteSubmit}
                  disabled={!rawText.trim()}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow"
                >
                  <Clipboard size={14} />
                  Analyze and Import
                </button>
              </div>
            </div>
          )}

          {/* Quick instructions on formats */}
          <div className="grid md:grid-cols-2 gap-4 text-left">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/50">
              <h4 className="font-bold text-slate-800 text-xs mb-1.5">Simple Roster Format</h4>
              <p className="text-slate-500 text-[11px] leading-relaxed mb-3">
                List each attendee name on a separate line. The system automatically structures them as attendees and sets all optional fields to empty.
              </p>
              <pre className="bg-slate-200/40 p-3 rounded-lg text-[10px] font-mono text-slate-700 leading-snug">
                John Doe{"\n"}
                Mary Claire{"\n"}
                Patrick Mboa
              </pre>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/50">
              <h4 className="font-bold text-slate-800 text-xs mb-1.5">Structured Table Format</h4>
              <p className="text-slate-500 text-[11px] leading-relaxed mb-3">
                Separated by pipes, commas, or tabs. Excel/CSV columns should match standard keywords like Full Name, Phone, Email, Organization, and Category.
              </p>
              <pre className="bg-slate-200/40 p-3 rounded-lg text-[10px] font-mono text-slate-700 leading-snug">
                John Doe | +234 812 345 | VIP{"\n"}
                Mary Claire | mary@claire.com | speaker{"\n"}
                Patrick Mboa | patrick@mboa.com | Student
              </pre>
            </div>
          </div>
        </div>
      ) : (
        /* SPREADSHEET-LIKE PREVIEW TABLE */
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col text-left">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                <CheckCircle2 size={13} /> Extraction Completed
              </span>
              <p className="font-bold text-slate-800 text-sm">
                Found <span className="text-slate-900 font-extrabold">{previewList.length}</span> parsed attendees
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPreviewList([])}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 transition-all"
              >
                Reset Upload
              </button>
              <button
                onClick={handleConfirmUpload}
                className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 transition-all"
              >
                Confirm & Generate Passes
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[450px]">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Full Name (Required)</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewList.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-400 font-bold">{idx + 1}</td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={item.fullName}
                        onChange={(e) => handleEditField(idx, 'fullName', e.target.value)}
                        className={`w-full px-2 py-1 bg-transparent border-b focus:border-slate-800 focus:outline-none transition-all font-semibold text-slate-800 ${
                          !item.fullName ? 'border-b-rose-300 bg-rose-50' : 'border-b-transparent'
                        }`}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={item.phone}
                        onChange={(e) => handleEditField(idx, 'phone', e.target.value)}
                        className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600 transition-all font-mono"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="email"
                        value={item.email}
                        onChange={(e) => handleEditField(idx, 'email', e.target.value)}
                        className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600 transition-all"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={item.organization}
                        onChange={(e) => handleEditField(idx, 'organization', e.target.value)}
                        className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600 transition-all"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={item.category}
                        onChange={(e) => handleEditField(idx, 'category', e.target.value)}
                        className="w-full px-2 py-1 bg-transparent border-b border-b-transparent focus:border-slate-800 focus:outline-none text-slate-600 transition-all font-bold"
                      />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <button
                        onClick={() => handleDeleteItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-all"
                        title="Delete Name"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex justify-between items-center">
            <span>Verify cells directly to modify any parsed field on-the-fly.</span>
            <span>Roster Check OK</span>
          </div>
        </div>
      )}
    </div>
  );
}
