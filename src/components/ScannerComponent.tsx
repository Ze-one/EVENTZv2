/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Participant, ScanResult } from '../types.js';
import { Camera, RefreshCw, AlertCircle, CheckCircle, Search, HelpCircle, Shield, Sparkles } from 'lucide-react';

interface ScannerComponentProps {
  onScanResult: (passId: string) => void;
  participants: Participant[];
}

export default function ScannerComponent({ onScanResult, participants }: ScannerComponentProps) {
  const [scanError, setScanError] = useState<string>('');
  const [manualId, setManualId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'camera' | 'simulator' | 'manual'>('simulator');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // Initialize camera scanner
  useEffect(() => {
    if (activeTab === 'camera') {
      // Clear previous if any
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          console.error(e);
        }
      }

      const scanner = new Html5QrcodeScanner(
        'reader-container',
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          // Check if decodedText looks like our secure URL or is just a Pass ID
          let passId = decodedText;
          if (decodedText.includes('/verify/')) {
            const parts = decodedText.split('/verify/');
            passId = parts[parts.length - 1];
          }
          onScanResult(passId);
        },
        (error) => {
          // Quietly log scanner frame failure
        }
      );

      scannerRef.current = scanner;
    }

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          console.error('Unmount clear error:', e);
        }
      }
    };
  }, [activeTab, onScanResult]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      onScanResult(manualId.trim().toUpperCase());
    }
  };

  const handleSimulateScan = (passId: string) => {
    onScanResult(passId);
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden w-full max-w-lg mx-auto">
      {/* Header tab controller */}
      <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-1">
        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'simulator'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles size={14} />
          Scan Simulator
        </button>
        <button
          onClick={() => setActiveTab('camera')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'camera'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Camera size={14} />
          Device Camera
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'manual'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Search size={14} />
          Manual ID
        </button>
      </div>

      <div className="p-6">
        {/* TAB 1: SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="space-y-4">
            <div className="bg-yellow-50 text-yellow-800 border border-yellow-100 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed">
              <Shield className="text-yellow-600 shrink-0 mt-0.5" size={16} />
              <div>
                <p className="font-semibold mb-0.5">Iframe Sandbox / Desktop Testing</p>
                <p>Since browser webcams are often blocked inside sandboxed iframe previews, use this <b>Interactive Pass Simulator</b>. Select any participant state below to instantly test gates access control, double check-in prevention, and dashboard logs.</p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                CHOOSE SAMPLE STATE TO SIMULATE
              </span>

              <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
                {participants.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-xl">
                    No participants available to simulate scans. Please add or upload participants first.
                  </div>
                ) : (
                  participants.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSimulateScan(p.passId)}
                      className="w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-200/60 p-3 rounded-2xl flex justify-between items-center transition-all group hover:border-slate-300"
                    >
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <p className="font-bold text-slate-800 text-xs truncate group-hover:text-slate-900">
                          {p.fullName}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {p.passId} {p.category ? `• ${p.category}` : ''}
                        </p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ${
                        p.status === 'Not Used' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : p.status === 'Used' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'bg-rose-100 text-rose-800'
                      }`}>
                        {p.status === 'Not Used' ? 'Ready to Scan' : p.status}
                      </span>
                    </button>
                  ))
                )}

                {/* Simulated Invalid Pass Button */}
                <button
                  onClick={() => handleSimulateScan('ETSN-2026-9999-FAKE')}
                  className="w-full text-left bg-rose-50 hover:bg-rose-100 border border-rose-200/50 p-3 rounded-2xl flex justify-between items-center transition-all group"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-rose-800 text-xs group-hover:text-rose-900">
                      Fake/Forgery Pass ID
                    </p>
                    <p className="font-mono text-[10px] text-rose-400">
                      ETSN-2026-9999-FAKE
                    </p>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-200 text-rose-900 shrink-0">
                    Simulate Forgery
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEVICE CAMERA SCANNER */}
        {activeTab === 'camera' && (
          <div className="space-y-4 flex flex-col items-center">
            <div className="w-full aspect-square max-w-[320px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 relative shadow-inner">
              <div id="reader-container" className="w-full h-full object-cover"></div>
              
              {/* Overlay targeting frame */}
              <div className="absolute inset-0 pointer-events-none border-[30px] border-black/30 flex items-center justify-center">
                <div className="w-full h-full border-2 border-dashed border-yellow-500 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-yellow-500 -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-yellow-500 -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-yellow-500 -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-yellow-500 -mb-1 -mr-1"></div>
                </div>
              </div>
            </div>

            <div className="text-center text-slate-400 text-xs flex items-center gap-1.5 justify-center py-2">
              <Camera size={13} />
              Align the participant's QR code within the targeting lines
            </div>
          </div>
        )}

        {/* TAB 3: MANUAL ID SEARCH */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSearch} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                ENTER PASS ID MANUALLY
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-sm">
                    🎫
                  </span>
                  <input
                    type="text"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="e.g. ETSN-2026-0001-X7K9"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualId.trim()}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-xs transition-all tracking-wide"
                >
                  Verify
                </button>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
              <p className="font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <HelpCircle size={13} className="text-slate-400" />
                Tips for Gate Officers
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Pass IDs are case-insensitive and follow the pattern <code className="bg-slate-200/60 px-1 py-0.5 rounded font-mono text-[10px] text-slate-700">ETSN-2026-XXXX-XXXX</code>.</li>
                <li>Make sure to double check characters like <code className="bg-slate-200/60 px-1 py-0.5 rounded font-mono text-[10px]">O</code> vs <code className="bg-slate-200/60 px-1 py-0.5 rounded font-mono text-[10px]">0</code> if type is manual.</li>
                <li>Manual search is useful if the QR code is smudged or if the camera scanner fails to focus.</li>
              </ul>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
