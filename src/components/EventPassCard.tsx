/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, LockKeyhole, Printer, QrCode } from 'lucide-react';
import { EventDetails, Participant } from '../types.js';
import { getPassDesign } from '../pass-design.js';

interface EventPassCardProps {
  participant: Participant;
  event: EventDetails;
  onPrint?: () => void;
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: string
) {
  const scale = fit === 'contain'
    ? Math.min(width / img.width, height / img.height)
    : Math.max(width / img.width, height / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, x + (width - drawW) / 2, y + (height - drawH) / 2, drawW, drawH);
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y);
}

export default function EventPassCard({ participant, event, onPrint }: EventPassCardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const design = useMemo(() => getPassDesign(event), [event]);
  const isPreview = participant.id === 'part-mock';
  const landscape = design.orientation === 'landscape';

  useEffect(() => {
    let cancelled = false;
    setQrCodeUrl('');
    setQrError('');

    const loadQr = async () => {
      try {
        if (isPreview) {
          const previewPayload = `${window.location.origin}/verify/${encodeURIComponent(participant.passId)}?preview=1`;
          const url = await QRCode.toDataURL(previewPayload, {
            width: 420,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' }
          });
          if (!cancelled) setQrCodeUrl(url);
          return;
        }

        const response = await fetch(`/api/pass-qr/${encodeURIComponent(participant.passId)}`, { cache: 'no-store' });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Secure QR could not be generated.');
        }
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelled) setQrCodeUrl(String(reader.result || ''));
        };
        reader.onerror = () => {
          if (!cancelled) setQrError('Secure QR image could not be read.');
        };
        reader.readAsDataURL(blob);
      } catch (error: any) {
        if (!cancelled) setQrError(error?.message || 'Secure QR unavailable.');
      }
    };

    loadQr();
    return () => { cancelled = true; };
  }, [participant.passId, participant.id, participant.passVersion, isPreview]);

  const handlePrint = () => {
    if (onPrint) return onPrint();
    const printContent = cardRef.current?.outerHTML;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print EVENTZ Pass - ${participant.fullName}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            html,body{margin:0;padding:0;background:#fff}
            body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
            @media print{body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
          </style>
        </head>
        <body>${printContent}<script>window.onload=function(){setTimeout(function(){window.print();window.close();},250);}</script></body>
      </html>
    `);
    printWindow.document.close();
  };

  const drawBuiltInBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const template = design.templateId;

    ctx.fillStyle = design.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (template === 'industrial-badge') {
      const split = Math.floor(height * 0.72);
      ctx.fillStyle = design.primaryColor;
      ctx.fillRect(0, 0, width, split);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, split, width, height - split);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = design.accentColor;
      ctx.fillRect(width * 0.62, height * 0.12, width * 0.38, height * 0.6);
      ctx.globalAlpha = 1;
      return;
    }

    if (template === 'premium-ticket') {
      ctx.fillStyle = design.backgroundColor;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = design.accentColor;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, width - 10, height - 10);
      ctx.setLineDash([12, 10]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(width * 0.72, 20);
      ctx.lineTo(width * 0.72, height - 20);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }

    if (template === 'volunteer-card') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = design.primaryColor;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(width * 0.78, 0);
      ctx.lineTo(width * 0.24, height * 0.57);
      ctx.lineTo(0, height * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = design.accentColor;
      ctx.beginPath();
      ctx.moveTo(width * 0.78, 0);
      ctx.lineTo(width, 0);
      ctx.lineTo(width, height * 0.68);
      ctx.lineTo(width * 0.24, height * 0.57);
      ctx.closePath();
      ctx.fill();
      return;
    }

    ctx.fillStyle = design.topBarColor;
    ctx.fillRect(0, 0, width, Math.floor(height * 0.16));
    if (design.showBrandPanel) {
      ctx.fillStyle = design.brandPanelColor;
      ctx.fillRect(0, Math.floor(height * 0.16), width, Math.floor(height * 0.18));
    }
  };

  const drawQr = async (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    qrImage: HTMLImageElement
  ) => {
    const base = landscape ? Math.min(250, height * 0.42) : Math.min(300, width * 0.38);
    const qrSize = Math.max(180, Math.round(base));
    let x = (width - qrSize) / 2;
    let y = height - qrSize - 90;

    if (design.qrPlacement === 'bottom-right') {
      x = width - qrSize - 45;
      y = height - qrSize - 45;
    } else if (design.qrPlacement === 'right-center') {
      x = width - qrSize - 55;
      y = (height - qrSize) / 2;
    } else if (design.qrPlacement === 'left-bottom') {
      x = 45;
      y = height - qrSize - 45;
    }

    ctx.fillStyle = design.qrFrameColor;
    ctx.beginPath();
    ctx.roundRect(x - 18, y - 18, qrSize + 36, qrSize + 36, 18);
    ctx.fill();
    ctx.drawImage(qrImage, x, y, qrSize, qrSize);

    return { x, y, qrSize };
  };

  const handleDownloadImage = async () => {
    if (!qrCodeUrl) return;

    const canvas = document.createElement('canvas');
    canvas.width = landscape ? 1400 : 860;
    canvas.height = landscape ? 800 : 1260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (design.templateId === 'uploaded' && design.customTemplateDataUrl) {
      ctx.fillStyle = design.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        const artwork = await loadCanvasImage(design.customTemplateDataUrl);
        drawImageFit(ctx, artwork, 0, 0, canvas.width, canvas.height, design.templateFit);
      } catch {}
      if (design.templateOverlayOpacity > 0) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, Math.max(0, Number(design.templateOverlayOpacity) / 100))})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      drawBuiltInBackground(ctx, canvas.width, canvas.height);
    }

    if (design.customLogoDataUrl) {
      try {
        const logo = await loadCanvasImage(design.customLogoDataUrl);
        drawImageFit(ctx, logo, 45, 38, landscape ? 150 : 140, landscape ? 90 : 110, design.logoFit);
      } catch {}
    } else {
      ctx.fillStyle = design.templateId === 'premium-ticket' || design.templateId === 'industrial-badge' || design.templateId === 'volunteer-card' ? '#ffffff' : design.primaryColor;
      ctx.font = `900 ${landscape ? 38 : 34}px Arial`;
      ctx.fillText(design.logoText || 'EVENTZ', 48, 82);
    }

    const darkTemplate = design.templateId === 'premium-ticket' || design.templateId === 'industrial-badge' || design.templateId === 'volunteer-card' || design.templateId === 'uploaded';
    const primaryText = darkTemplate ? '#ffffff' : design.textColor;
    const mutedText = darkTemplate ? 'rgba(255,255,255,.72)' : design.mutedTextColor;

    ctx.textAlign = 'left';
    ctx.fillStyle = primaryText;
    ctx.font = `900 ${landscape ? 52 : 48}px Arial`;

    const titleX = 50;
    const titleY = landscape ? 190 : 250;
    const titleWidth = landscape ? canvas.width * 0.58 : canvas.width - 100;
    if (design.showEventName) wrapCanvasText(ctx, event.eventName || event.passTitle || 'EVENT PASS', titleX, titleY, titleWidth, 58, 3);

    ctx.font = `900 ${landscape ? 44 : 46}px Arial`;
    const participantY = landscape ? 380 : 520;
    if (design.showParticipantName) wrapCanvasText(ctx, participant.fullName, titleX, participantY, titleWidth, 52, 2);

    ctx.fillStyle = mutedText;
    ctx.font = '700 20px Arial';
    let infoY = participantY + 75;
    if (event.showCategory && participant.category) {
      ctx.fillText(participant.category.toUpperCase(), titleX, infoY);
      infoY += 34;
    }
    if (event.showOrganization && participant.organization) {
      ctx.fillText(participant.organization, titleX, infoY);
      infoY += 34;
    }
    if (design.showVenue && event.venue) {
      wrapCanvasText(ctx, event.venue, titleX, infoY, titleWidth, 28, 2);
      infoY += 62;
    }
    if (design.showDate) {
      ctx.fillText(`${event.eventDate || ''} ${event.eventTime || ''}`.trim(), titleX, infoY);
    }

    const qrImage = await loadCanvasImage(qrCodeUrl);
    const qr = await drawQr(ctx, canvas.width, canvas.height, qrImage);

    ctx.fillStyle = design.qrPlacement === 'bottom-right' && design.templateId === 'industrial-badge' ? '#0f172a' : primaryText;
    ctx.font = '700 18px monospace';
    ctx.textAlign = design.qrPlacement === 'bottom-right' ? 'right' : 'center';
    if (design.showPassId) {
      ctx.fillText(
        participant.passId,
        design.qrPlacement === 'bottom-right' ? canvas.width - 45 : qr.x + qr.qrSize / 2,
        Math.min(canvas.height - 22, qr.y + qr.qrSize + 48)
      );
    }

    const link = document.createElement('a');
    link.download = `EVENTZ_Pass_${participant.fullName.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png', 1);
    link.click();
  };

  const radius = `${Number(design.cornerRadius) || 0}px`;
  const uploadedStyle = design.templateId === 'uploaded' && design.customTemplateDataUrl
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,${Number(design.templateOverlayOpacity || 0) / 100}),rgba(0,0,0,${Number(design.templateOverlayOpacity || 0) / 100})),url("${design.customTemplateDataUrl}")`,
        backgroundSize: design.templateFit,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }
    : undefined;

  const qrPositionClass =
    design.qrPlacement === 'right-center'
      ? 'lg:absolute lg:right-6 lg:top-1/2 lg:-translate-y-1/2'
      : design.qrPlacement === 'bottom-right'
        ? 'self-end'
        : design.qrPlacement === 'left-bottom'
          ? 'self-start'
          : 'self-center';

  const renderTemplateBackground = () => {
    if (design.templateId === 'uploaded') return null;
    if (design.templateId === 'premium-ticket') {
      return <>
        <div className="absolute inset-0" style={{ background: design.backgroundColor }} />
        <div className="absolute inset-[5px] border-2" style={{ borderColor: design.accentColor }} />
        <div className="absolute top-5 bottom-5 left-[72%] border-l border-dashed opacity-60" style={{ borderColor: design.accentColor }} />
      </>;
    }
    if (design.templateId === 'industrial-badge') {
      return <>
        <div className="absolute inset-0 bg-white" />
        <div className="absolute inset-x-0 top-0 h-[72%]" style={{ background: design.primaryColor }} />
        <div className="absolute right-0 top-[12%] w-[38%] h-[55%] opacity-10" style={{ background: design.accentColor }} />
      </>;
    }
    if (design.templateId === 'volunteer-card') {
      return <>
        <div className="absolute inset-0 bg-white" />
        <div className="absolute -top-[8%] -left-[32%] w-[110%] h-[68%] rotate-[-18deg]" style={{ background: design.primaryColor }} />
        <div className="absolute -top-[10%] right-[-35%] w-[105%] h-[66%] rotate-[18deg]" style={{ background: design.accentColor }} />
      </>;
    }
    return <>
      <div className="absolute inset-0" style={{ background: design.backgroundColor }} />
      <div className="absolute inset-x-0 top-0 h-[16%]" style={{ background: design.topBarColor }} />
      {design.showBrandPanel && <div className="absolute inset-x-0 top-[16%] h-[18%]" style={{ background: design.brandPanelColor }} />}
    </>;
  };

  const darkText = design.templateId === 'eventz-classic';
  const liveTextColor = darkText ? design.textColor : '#ffffff';
  const liveMutedColor = darkText ? design.mutedTextColor : 'rgba(255,255,255,.74)';

  return (
    <div className={`flex flex-col items-center gap-4 w-full mx-auto ${landscape ? 'max-w-3xl' : 'max-w-md'}`}>
      <div
        ref={cardRef}
        className={`relative w-full overflow-hidden shadow-2xl border border-slate-300 transition-all duration-300 ${landscape ? 'aspect-[1.75/1]' : 'aspect-[.69/1]'}`}
        style={{
          borderRadius: radius,
          fontFamily: design.fontStyle === 'classic' ? 'Georgia, serif' : 'Inter, sans-serif',
          ...uploadedStyle
        }}
      >
        {renderTemplateBackground()}

        {design.showTopNotch && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-5 w-14 h-14 rounded-full bg-white z-10" />
        )}

        <div className={`relative z-20 h-full p-5 md:p-6 flex ${landscape ? 'flex-row gap-7' : 'flex-col'}`}>
          <div className={`min-w-0 flex-1 flex flex-col ${landscape ? 'pr-[30%]' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="w-20 h-14 rounded-xl flex items-center justify-center overflow-hidden p-2 border border-white/10" style={{ background: design.logoBlockColor }}>
                {design.customLogoDataUrl ? (
                  <img src={design.customLogoDataUrl} alt="Pass logo" className="w-full h-full" style={{ objectFit: design.logoFit as any }} />
                ) : (
                  <span className="text-white font-black text-base tracking-tight">{design.logoText || 'EVENTZ'}</span>
                )}
              </div>

              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-black/20 border border-white/15 backdrop-blur px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-white">
                  <LockKeyhole size={9} /> {isPreview ? 'QR Preview' : 'Signed QR'}
                </div>
                {design.showDate && <p className="text-[9px] font-bold mt-2" style={{ color: liveMutedColor }}>{event.eventDate} · {event.eventTime}</p>}
              </div>
            </div>

            <div className={`${landscape ? 'mt-auto mb-auto' : design.templateId === 'industrial-badge' ? 'mt-10' : 'mt-8'}`}>
              <p className="text-[9px] uppercase tracking-[0.2em] font-black" style={{ color: design.accentColor }}>
                {event.passTitle || participant.category || 'EVENT PASS'}
              </p>
              {design.showEventName && (
                <h2 className={`font-black leading-[.96] tracking-tight mt-2 ${landscape ? 'text-3xl md:text-4xl' : 'text-3xl'}`} style={{ color: liveTextColor }}>
                  {event.eventName}
                </h2>
              )}

              {design.showParticipantName && (
                <div className={`${landscape ? 'mt-8' : 'mt-10'}`}>
                  <p className="text-[8px] uppercase tracking-[0.18em] font-black" style={{ color: liveMutedColor }}>Credential holder</p>
                  <p className={`font-black mt-1 leading-tight ${landscape ? 'text-2xl' : 'text-2xl'}`} style={{ color: liveTextColor }}>{participant.fullName}</p>
                </div>
              )}

              <div className="mt-4 space-y-1">
                {event.showCategory && participant.category && <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: liveMutedColor }}>{participant.category}</p>}
                {event.showOrganization && participant.organization && <p className="text-[10px] font-semibold truncate" style={{ color: liveMutedColor }}>{participant.organization}</p>}
                {design.showVenue && event.venue && <p className="text-[9px] font-semibold line-clamp-2 max-w-[90%]" style={{ color: liveMutedColor }}>{event.venue}</p>}
              </div>
            </div>

            {design.showPassId && (
              <p className={`font-mono font-black text-[9px] tracking-wider ${landscape ? 'mt-auto' : 'mt-auto'}`} style={{ color: liveMutedColor }}>
                {participant.passId} · V{participant.passVersion || 1}
              </p>
            )}
          </div>

          <div className={`relative z-30 flex flex-col gap-1.5 ${landscape ? 'absolute right-6 top-1/2 -translate-y-1/2' : 'mt-auto'} ${qrPositionClass}`}>
            <div className="rounded-xl p-2 shadow-xl border border-black/5" style={{ background: design.qrFrameColor }}>
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt={`Secure QR code for ${participant.fullName}`}
                  style={{
                    width: landscape ? Math.min(Number(design.qrSize), 180) : Number(design.qrSize),
                    height: landscape ? Math.min(Number(design.qrSize), 180) : Number(design.qrSize)
                  }}
                  className="object-contain max-w-full"
                />
              ) : qrError ? (
                <div className="w-36 h-36 bg-rose-50 text-rose-700 rounded-lg flex flex-col items-center justify-center text-center p-3">
                  <QrCode size={24} />
                  <p className="text-[8px] font-black mt-2 leading-tight">Secure QR unavailable</p>
                </div>
              ) : (
                <div className="w-36 h-36 bg-slate-100 animate-pulse rounded-lg" />
              )}
            </div>
            {!isPreview && <p className="text-[7px] text-center font-black uppercase tracking-[0.16em]" style={{ color: liveMutedColor }}>Cryptographically signed</p>}
          </div>
        </div>
      </div>

      {qrError && !isPreview && (
        <div className="w-full rounded-xl bg-rose-50 border border-rose-100 p-3 text-[10px] font-bold text-rose-700">
          {qrError}
        </div>
      )}

      <div className="flex gap-2 w-full no-print">
        <button onClick={handlePrint} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow border border-slate-700"><Printer size={15} />Print Pass</button>
        <button disabled={!qrCodeUrl} onClick={handleDownloadImage} className="flex-1 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 shadow-sm"><Download size={15} />Download Pass</button>
      </div>
    </div>
  );
}
