/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, RefreshCw, AlertCircle, Search, HelpCircle, Play, SwitchCamera, StopCircle } from 'lucide-react';

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
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [cameraStarted, setCameraStarted] = useState<boolean>(false);
  const [useFrontCamera, setUseFrontCamera] = useState<boolean>(false);
  const [scannerInstanceKey, setScannerInstanceKey] = useState(0);

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

  const sendScanResultImmediately = (passId: string) => {
    const normalized = normalizePassId(passId);
    if (!normalized) return;
    onScanResult(normalized);
    setManualId('');
    setTimeout(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, 80);
  };

  const getCameraDisplayName = (camera: CameraDeviceInfo, index: number) => {
    const label = camera.label || `Camera ${index + 1}`;
    if (/back|rear|environment|arrière/i.test(label)) return `Back Camera - ${label}`;
    if (/front|user|facetime|avant/i.test(label)) return `Front Camera - ${label}`;
    return label;
  };

  const choosePreferredCamera = (deviceList: CameraDeviceInfo[], front = false) => {
    if (deviceList.length === 0) return '';
    const frontCam = deviceList.find((cam) => /front|user|facetime|avant/i.test(cam.label || ''));
    const backCam = deviceList.find((cam) => /back|rear|environment|arrière/i.test(cam.label || ''));
    if (front && frontCam) return frontCam.id;
    return backCam?.id || deviceList[0].id;
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        if ((scanner as any).isScanning) await scanner.stop();
      } catch (err) {
        console.warn('Camera scanner stop warning:', err);
      }
      try {
        await scanner.clear();
      } catch (err) {
        console.warn('Camera scanner clear warning:', err);
      }
    }
    scannerRef.current = null;
    setCameraStarted(false);
    setScannerInstanceKey((value) => value + 1);
  };

  const requestBrowserCameraPermission = async (front = false) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access. Use Chrome, Edge, or Safari on the live HTTPS link.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: front ? 'user' : { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    stream.getTracks().forEach((track) => track.stop());
  };

  const refreshCameraList = async (front = useFrontCamera) => {
    try {
      const devices = await Html5Qrcode.getCameras();
      const mapped = devices.map((camera, index) => ({ id: camera.id, label: camera.label || `Camera ${index + 1}` }));
      setCameras(mapped);
      const preferred = choosePreferredCamera(mapped, front);
      if (preferred) setSelectedCameraId((current) => current || preferred);
      return mapped;
    } catch (err) {
      console.warn('Camera listing warning:', err);
      return [];
    }
  };

  const startScannerWithConfig = async (scanner: Html5Qrcode, cameraConfig: any) => {
    await scanner.start(
      cameraConfig,
      {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.max(180, Math.floor(minEdge * 0.72));
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
        disableFlip: false,
      },
      (decodedText) => {
        const passId = normalizePassId(decodedText);
        const now = Date.now();
        if (lastScanRef.current.value === passId && now - lastScanRef.current.time < 2500) return;
        lastScanRef.current = { value: passId, time: now };
        sendScanResultImmediately(passId);
      },
      () => {}
    );
  };

  const startScanner = async (cameraId?: string, preferFront = useFrontCamera) => {
    if (activeTab !== 'camera' || isStartingRef.current) return;
    isStartingRef.current = true;
    setIsCameraLoading(true);
    setScanError('');
    try {
      await stopScanner();
      await new Promise((resolve) => setTimeout(resolve, 120));
      await requestBrowserCameraPermission(preferFront);
      const detectedCameras = await refreshCameraList(preferFront);
      const selectedId = cameraId || selectedCameraId || choosePreferredCamera(detectedCameras, preferFront);
      const scanner = new Html5Qrcode('reader-container', { verbose: false });
      scannerRef.current = scanner;
      const attempts = selectedId
        ? [{ deviceId: { exact: selectedId } }, selectedId, { facingMode: preferFront ? 'user' : 'environment' }, { facingMode: preferFront ? 'user' : { ideal: 'environment' } }]
        : [{ facingMode: preferFront ? 'user' : 'environment' }, { facingMode: preferFront ? 'user' : { ideal: 'environment' } }];
      let lastError: any = null;
      for (const config of attempts) {
        try {
          await startScannerWithConfig(scanner, config);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          try { if ((scanner as any).isScanning) await scanner.stop(); } catch {}
        }
      }
      if (lastError) throw lastError;
      setCameraStarted(true);
      if (selectedId) setSelectedCameraId(selectedId);
    } catch (err: any) {
      console.error('Camera scanner start failed:', err);
      setCameraStarted(false);
      const name = err?.name ? `${err.name}: ` : '';
      const message = err?.message || 'Unable to start camera.';
      setScanError(`${name}${message} Make sure the app is opened on the live HTTPS Vercel URL, camera permission is allowed, and no other app is already using the camera.`);
    } finally {
      isStartingRef.current = false;
      setIsCameraLoading(false);
    }
  };

  const handleStartCamera = () => startScanner(selectedCameraId || undefined, useFrontCamera);
  const handleCameraSwitch = async () => {
    const nextUseFront = !useFrontCamera;
    setUseFrontCamera(nextUseFront);
    const cameraId = choosePreferredCamera(cameras, nextUseFront);
    setSelectedCameraId(cameraId);
    await startScanner(cameraId || undefined, nextUseFront);
  };

  useEffect(() => () => { stopScanner(); }, []);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = manualId.trim().toUpperCase();
    if (normalized) sendScanResultImmediately(normalized);
  };

  return (
    <div className="apple-card rounded-3xl overflow-hidden w-full max-w-lg mx-auto animate-fade-in">
      <div className="flex border-b border-slate-100/80 bg-white/60 p-2 gap-1">
        <button onClick={() => setActiveTab('camera')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold ${activeTab === 'camera' ? 'bg-slate-950 text-white shadow' : 'text-slate-600 hover:bg-white'}`}><Camera size={14} />Camera Scanner</button>
        <button onClick={() => { setActiveTab('manual'); stopScanner(); }} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold ${activeTab === 'manual' ? 'bg-slate-950 text-white shadow' : 'text-slate-600 hover:bg-white'}`}><Search size={14} />Manual ID</button>
      </div>
      <div className="p-6">
        {activeTab === 'camera' && (
          <div className="space-y-4 flex flex-col items-center">
            {scanError && <div className="w-full bg-rose-50 text-rose-800 border border-rose-100 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed"><AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={16} /><div><p className="font-bold">Camera access issue</p><p>{scanError}</p></div></div>}
            {cameras.length > 1 && <div className="w-full bg-slate-50/80 border border-slate-100 rounded-2xl p-3 space-y-2"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Select Camera</label><select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900">{cameras.map((camera, index) => <option key={camera.id} value={camera.id}>{getCameraDisplayName(camera, index)}</option>)}</select></div>}
            <div className="w-full aspect-square max-w-[340px] bg-slate-950 rounded-[2rem] overflow-hidden border border-slate-800 relative shadow-2xl">
              <div key={scannerInstanceKey} id="reader-container" className="w-full h-full"></div>
              {!cameraStarted && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white bg-slate-950/95 p-6 text-center"><div className="w-16 h-16 rounded-3xl bg-yellow-400 text-slate-950 flex items-center justify-center shadow-lg animate-soft-pulse"><Camera size={28} /></div><div><p className="font-black text-sm">Ready to scan real passes</p><p className="text-slate-400 text-xs mt-1 leading-relaxed">Tap start once and allow camera permission. On phones, the back camera is preferred.</p></div><button onClick={handleStartCamera} disabled={isCameraLoading} className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60 text-slate-950 font-black px-5 py-3 rounded-2xl text-xs flex items-center gap-2">{isCameraLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}Start Camera Scanner</button></div>}
              {cameraStarted && <div className="absolute inset-0 pointer-events-none border-[30px] border-black/30 flex items-center justify-center"><div className="w-full h-full border-2 border-dashed border-yellow-500 rounded-lg relative"><div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-yellow-500 -mt-1 -ml-1"></div><div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-yellow-500 -mt-1 -mr-1"></div><div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-yellow-500 -mb-1 -ml-1"></div><div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-yellow-500 -mb-1 -mr-1"></div></div></div>}
            </div>
            <div className="w-full grid grid-cols-3 gap-2"><button onClick={handleCameraSwitch} disabled={isCameraLoading} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><SwitchCamera size={14} />Flip</button><button onClick={() => refreshCameraList()} disabled={isCameraLoading} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><RefreshCw size={14} />Detect</button><button onClick={stopScanner} disabled={!cameraStarted} className="bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2"><StopCircle size={14} />Stop</button></div>
          </div>
        )}
        {activeTab === 'manual' && <form onSubmit={handleManualSearch} className="space-y-4 animate-fade-in"><div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">ENTER PASS ID MANUALLY</label><div className="flex gap-2"><input type="text" value={manualId} onChange={(e) => setManualId(e.target.value.toUpperCase())} placeholder="e.g. ETSN-2026-0001-X7K9" className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 uppercase" /><button type="submit" disabled={!manualId.trim()} className="bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-xs">Verify</button></div></div><div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[11px] text-slate-500 leading-relaxed"><p className="font-semibold text-slate-700 mb-1 flex items-center gap-1.5"><HelpCircle size={13} className="text-slate-400" /> Reliable manual fallback</p><ul className="list-disc pl-4 space-y-1"><li>Manual ID uses the same backend verification and duplicate-entry protection as QR scanning.</li><li>Type the pass ID exactly as shown. It is automatically converted to uppercase.</li><li>The verification result should appear immediately without refreshing the browser tab.</li></ul></div></form>}
      </div>
    </div>
  );
}
