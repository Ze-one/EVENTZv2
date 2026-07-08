/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, RefreshCw, AlertCircle, Search, HelpCircle } from 'lucide-react';

interface ScannerComponentProps {
  onScanResult: (passId: string) => void;
  participants?: unknown[];
}

interface CameraDeviceInfo {
  id: string;
  label: string;
}

export default function ScannerComponent({ onScanResult }: ScannerComponentProps) {
  const [manualId, setManualId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [scanError, setScanError] = useState<string>('');
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(true);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const lastScanRef = useRef<{ value: string; time: number }>({ value: '', time: 0 });

  const normalizePassId = (decodedText: string) => {
    let passId = decodedText.trim();
    if (passId.includes('/verify/')) {
      const parts = passId.split('/verify/');
      passId = parts[parts.length - 1];
    }
    return decodeURIComponent(passId).trim().toUpperCase();
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      const state = (scanner as any).getState?.();
      if (state === 2) {
        await scanner.stop();
      }
    } catch (err) {
      console.warn('Camera scanner stop warning:', err);
    }

    try {
      await scanner.clear();
    } catch (err) {
      console.warn('Camera scanner clear warning:', err);
    }

    scannerRef.current = null;
  };

  const choosePreferredCamera = (deviceList: CameraDeviceInfo[]) => {
    if (deviceList.length === 0) return '';

    const backCamera = deviceList.find((cam) =>
      /back|rear|environment|arrière/i.test(cam.label || '')
    );

    return backCamera?.id || deviceList[0].id;
  };

  const loadCameras = async () => {
    setIsCameraLoading(true);
    setScanError('');

    try {
      const devices = await Html5Qrcode.getCameras();
      const mapped = devices.map((camera, index) => ({
        id: camera.id,
        label: camera.label || `Camera ${index + 1}`
      }));

      setCameras(mapped);

      if (mapped.length === 0) {
        setScanError('No camera was detected on this device. You can still verify the pass using Manual ID.');
        setActiveTab('manual');
        return;
      }

      setSelectedCameraId((current) => current || choosePreferredCamera(mapped));
    } catch (err: any) {
      console.error('Camera detection failed:', err);
      setScanError('Camera permission is not available or no camera could be accessed. Allow camera permission in the browser, or use Manual ID.');
      setActiveTab('manual');
    } finally {
      setIsCameraLoading(false);
    }
  };

  const startScanner = async (cameraId: string) => {
    if (!cameraId || activeTab !== 'camera' || isStartingRef.current) return;

    isStartingRef.current = true;
    setScanError('');

    try {
      await stopScanner();

      const scanner = new Html5Qrcode('reader-container');
      scannerRef.current = scanner;

      await scanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          const passId = normalizePassId(decodedText);
          const now = Date.now();

          if (lastScanRef.current.value === passId && now - lastScanRef.current.time < 2500) {
            return;
          }

          lastScanRef.current = { value: passId, time: now };
          onScanResult(passId);
        },
        () => {
          // Silent frame-level scan failures are normal while camera is searching for a QR code.
        }
      );
    } catch (err: any) {
      console.error('Camera scanner start failed:', err);
      setScanError(err?.message || 'Unable to start this camera. Select another camera or use Manual ID.');
    } finally {
      isStartingRef.current = false;
    }
  };

  useEffect(() => {
    loadCameras();

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'camera' && selectedCameraId) {
      startScanner(selectedCameraId);
    } else {
      stopScanner();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedCameraId]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualId.trim()) {
      onScanResult(manualId.trim().toUpperCase());
    }
  };

  const getCameraDisplayName = (camera: CameraDeviceInfo, index: number) => {
    const label = camera.label || `Camera ${index + 1}`;
    if (/back|rear|environment|arrière/i.test(label)) return `Back Camera - ${label}`;
    if (/front|user|facetime|avant/i.test(label)) return `Front Camera - ${label}`;
    return label;
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden w-full max-w-lg mx-auto">
      <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-1">
        <button
          onClick={() => setActiveTab('camera')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'camera'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Camera size={14} />
          Camera Scanner
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
        {activeTab === 'camera' && (
          <div className="space-y-4 flex flex-col items-center">
            {scanError && (
              <div className="w-full bg-rose-50 text-rose-800 border border-rose-100 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed">
                <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="font-bold">Camera access issue</p>
                  <p>{scanError}</p>
                </div>
              </div>
            )}

            {cameras.length > 1 && (
              <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2">
                <label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                  Select Camera
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {cameras.map((camera, index) => (
                    <option key={camera.id} value={camera.id}>
                      {getCameraDisplayName(camera, index)}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  On phones, choose the back camera for scanning participant QR codes. You can switch to the front camera when needed.
                </p>
              </div>
            )}

            <div className="w-full aspect-square max-w-[340px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 relative shadow-inner">
              <div id="reader-container" className="w-full h-full"></div>

              {isCameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-slate-950">
                  <RefreshCw size={22} className="animate-spin" />
                  <span className="text-xs font-semibold">Detecting camera...</span>
                </div>
              )}

              <div className="absolute inset-0 pointer-events-none border-[30px] border-black/30 flex items-center justify-center">
                <div className="w-full h-full border-2 border-dashed border-yellow-500 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-yellow-500 -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-yellow-500 -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-yellow-500 -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-yellow-500 -mb-1 -mr-1"></div>
                </div>
              </div>
            </div>

            <div className="text-center text-slate-500 text-xs flex flex-col items-center gap-2 justify-center py-2">
              <div className="flex items-center gap-1.5">
                <Camera size={13} />
                <span>Point the camera at the participant's QR code.</span>
              </div>
              <button
                onClick={loadCameras}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:text-slate-950 flex items-center gap-1"
              >
                <RefreshCw size={12} />
                Refresh Cameras
              </button>
            </div>
          </div>
        )}

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
                Manual verification fallback
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Use this only if the QR code is hard to read, the participant's phone brightness is too low, or camera permission fails.</li>
                <li>Pass IDs are case-insensitive and can be typed exactly as seen on the pass.</li>
                <li>Double-check characters like <code className="bg-slate-200/60 px-1 py-0.5 rounded font-mono text-[10px] text-slate-700">O</code> and <code className="bg-slate-200/60 px-1 py-0.5 rounded font-mono text-[10px] text-slate-700">0</code>.</li>
              </ul>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
