/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Participant, EventDetails } from '../types.js';
import { Download, Printer, TicketCheck, ShieldCheck, Users, Star, QrCode, Sparkles } from 'lucide-react';

interface EventPassCardProps {
  participant: Participant;
  event: EventDetails;
  onPrint?: () => void;
}

const DEFAULT_DESIGN = {
  designType: 'ticket',
  backgroundColor: '#d8dcdf',
  topBarColor: '#d8dcdf',
  brandPanelColor: '#ffffff',
  textColor: '#020617',
  mutedTextColor: '#475569',
  logoBlockColor: '#0b1f4d',
  qrFrameColor: '#ffffff',
  primaryColor: '#0b1f4d',
  accentColor: '#f2a900',
  logoText: 'eventZ',
  slogan: 'manage your event access by ETS.NTECH',
  icon: 'ticket',
  customLogoDataUrl: '',
  logoFit: 'contain',
  cornerRadius: 32,
  qrSize: 208,
  showTopNotch: true,
  showBrandPanel: true,
  fontStyle: 'modern',
};

type PassDesign = typeof DEFAULT_DESIGN;

function getDesign(event: EventDetails): PassDesign {
  try {
    const parsed = JSON.parse(event.logoPath || '{}');
    if (parsed?.type === 'eventz-pass-design') return { ...DEFAULT_DESIGN, ...parsed };
  } catch {}
  return {
    ...DEFAULT_DESIGN,
    primaryColor: event.primaryColor || DEFAULT_DESIGN.primaryColor,
    accentColor: event.accentColor || DEFAULT_DESIGN.accentColor,
    logoBlockColor: event.primaryColor || DEFAULT_DESIGN.logoBlockColor,
  };
}

const iconMap: Record<string, React.ElementType> = {
  ticket: TicketCheck,
  shield: ShieldCheck,
  users: Users,
  star: Star,
  qr: QrCode,
  sparkles: Sparkles,
};

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function EventzEmblem({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 500 500" className={className} aria-hidden="true">
      <g fill={color}>
        <polygon points="250,170 320,210 320,290 250,330 180,290 180,210" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <path
            key={angle}
            d="M215 42c20-12 48-12 70 0l74 32c21 9 31 33 22 54l-9 22c-8 20-30 31-51 24l-70-24-70 24c-21 7-43-4-51-24l-9-22c-9-21 1-45 22-54l72-32Z"
            transform={`rotate(${angle} 250 250)`}
          />
        ))}
      </g>
    </svg>
  );
}

function drawCanvasEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  const scale = size / 500;
  ctx.scale(scale, scale);
  ctx.translate(-250, -250);
  ctx.fillStyle = color;

  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + (Math.PI * 2 * i) / 6;
    const x = 250 + 78 * Math.cos(angle);
    const y = 250 + 78 * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(250, 250);
    ctx.rotate((Math.PI * 2 * i) / 8);
    ctx.beginPath();
    ctx.roundRect(-42, -222, 84, 125, 22);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export default function EventPassCard({ participant, event, onPrint }: EventPassCardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const cardRef = useRef<HTMLDivElement>(null);
  const design = useMemo(() => getDesign(event), [event]);
  const BrandIcon = iconMap[design.icon] || TicketCheck;

  useEffect(() => {
    const verifyUrl = `${window.location.origin}/verify/${participant.passId}`;
    QRCode.toDataURL(verifyUrl, { width: 420, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrCodeUrl)
      .catch(err => console.error('Error generating QR code:', err));
  }, [participant.passId]);

  const handlePrint = () => {
    if (onPrint) return onPrint();
    const printContent = cardRef.current?.innerHTML;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Print EVENTZ Pass - ${participant.fullName}</title><script src="https://cdn.tailwindcss.com"></script><style>@media print{body{margin:0;padding:20px;-webkit-print-color-adjust:exact}.no-print{display:none}}</style></head>
      <body class="bg-white flex justify-center items-center min-h-screen"><div class="w-[430px]">${printContent}</div><script>window.onload=function(){window.print();window.close();}</script></body></html>
    `);
    printWindow.document.close();
  };

  const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = String(text || '').split(' ');
    let line = '';
    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else line = testLine;
    });
    if (line) ctx.fillText(line, x, y);
  };

  const drawCanvasLogo = async (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = design.logoBlockColor;
    ctx.fillRect(32, 24, 132, 108);

    if (design.customLogoDataUrl) {
      try {
        const logo = await loadCanvasImage(design.customLogoDataUrl);
        const boxX = 42;
        const boxY = 34;
        const boxW = 112;
        const boxH = 88;
        const scale = design.logoFit === 'cover' ? Math.max(boxW / logo.width, boxH / logo.height) : Math.min(boxW / logo.width, boxH / logo.height);
        const drawW = logo.width * scale;
        const drawH = logo.height * scale;
        const drawX = boxX + (boxW - drawW) / 2;
        const drawY = boxY + (boxH - drawH) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(boxX, boxY, boxW, boxH);
        ctx.clip();
        ctx.drawImage(logo, drawX, drawY, drawW, drawH);
        ctx.restore();
        return;
      } catch (err) {
        console.warn('Custom logo could not be drawn on pass image:', err);
      }
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(design.logoText.replace('Z', ''), 48, 82);
    ctx.fillStyle = design.accentColor;
    ctx.fillText('Z', 126, 82);
  };

  const handleDownloadImage = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx || !qrCodeUrl) return;
    canvas.width = 860;
    canvas.height = 1260;

    ctx.fillStyle = design.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = design.brandPanelColor;
    ctx.fillRect(0, 145, canvas.width, 180);
    ctx.fillStyle = design.topBarColor;
    ctx.fillRect(0, 0, canvas.width, 145);

    await drawCanvasLogo(ctx);

    ctx.fillStyle = design.textColor;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('START DATE', canvas.width - 38, 58);
    ctx.font = '26px Arial';
    ctx.fillText(`${event.eventDate || ''}, ${event.eventTime || ''}`, canvas.width - 38, 92);
    ctx.textAlign = 'left';

    drawCanvasEmblem(ctx, 120, 235, 122, design.accentColor);
    ctx.fillStyle = design.primaryColor;
    ctx.font = '900 60px Arial';
    ctx.fillText('EVENT', 292, 220);
    ctx.fillStyle = design.accentColor;
    ctx.fillText('Z', 552, 220);
    ctx.fillStyle = design.mutedTextColor;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(design.slogan, 292, 258);

    ctx.fillStyle = design.textColor;
    ctx.font = 'bold 20px Arial';
    ctx.fillText('EVENT', 36, 382);
    ctx.font = '36px Arial';
    wrapCanvasText(ctx, event.eventName || 'Event', 36, 426, 420, 40);
    ctx.font = 'bold 20px Arial';
    ctx.fillText('ATTENDEE', 520, 382);
    ctx.font = '36px Arial';
    wrapCanvasText(ctx, participant.fullName, 520, 426, 292, 40);
    ctx.font = 'bold 20px Arial';
    ctx.fillText('TICKET', 36, 545);
    ctx.font = '36px Arial';
    ctx.fillText(participant.category || event.passTitle || 'Attendee', 36, 590);
    ctx.font = 'bold 20px Arial';
    ctx.fillText('PASS ID', 36, 665);
    ctx.font = '24px monospace';
    ctx.fillText(participant.passId, 36, 700);

    const qrImg = new Image();
    qrImg.onload = () => {
      const qrSize = Math.max(240, Math.min(340, Number(design.qrSize) + 90));
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 820;
      ctx.fillStyle = design.qrFrameColor;
      ctx.beginPath();
      ctx.roundRect(qrX - 30, qrY - 30, qrSize + 60, qrSize + 92, 10);
      ctx.fill();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = design.textColor;
      ctx.font = '28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(participant.passId, canvas.width / 2, qrY + qrSize + 46);
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = design.mutedTextColor;
      ctx.fillText(event.accessInstruction || 'Present this QR code at the entrance.', canvas.width / 2, 1194);
      const link = document.createElement('a');
      link.download = `EVENTZ_Ticket_Pass_${participant.fullName.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    qrImg.src = qrCodeUrl;
  };

  const radius = `${Number(design.cornerRadius) || 32}px`;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      <div ref={cardRef} className="w-full overflow-hidden shadow-2xl border border-slate-300 text-left relative transition-all duration-300" style={{ fontFamily: design.fontStyle === 'classic' ? 'Georgia, serif' : 'Inter, sans-serif', backgroundColor: design.backgroundColor, borderRadius: radius }}>
        <div className="h-32 relative px-6 pt-4" style={{ backgroundColor: design.topBarColor }}>
          {design.showTopNotch && <div className="absolute left-1/2 -translate-x-1/2 -top-5 w-20 h-20 rounded-full bg-white"></div>}
          <div className="w-24 h-24 flex items-center justify-center relative overflow-hidden p-2" style={{ background: design.logoBlockColor }}>
            {design.customLogoDataUrl ? (
              <img src={design.customLogoDataUrl} alt="Custom pass logo" className="relative z-10 w-full h-full" style={{ objectFit: design.logoFit as any }} />
            ) : (
              <>
                <BrandIcon className="absolute text-white/20 -right-3 -bottom-3" size={54} />
                <div className="text-white font-black text-xl tracking-[-0.08em] relative z-10">{design.logoText.replace('Z', '')}<span style={{ color: design.accentColor }}>Z</span></div>
              </>
            )}
          </div>
          <div className="absolute right-6 top-6 text-right" style={{ color: design.textColor }}>
            <div className="text-xs font-black tracking-wider uppercase">Start Date</div>
            <div className="text-xl font-medium">{event.eventDate || 'Event Date'}</div>
            <div className="text-sm font-semibold" style={{ color: design.mutedTextColor }}>{event.eventTime || 'Event Time'}</div>
          </div>
        </div>

        {design.showBrandPanel && (
          <div className="px-7 py-7 flex items-center gap-5" style={{ backgroundColor: design.brandPanelColor }}>
            <EventzEmblem color={design.accentColor} className="w-24 h-24 shrink-0 drop-shadow-sm" />
            <div>
              <div className="text-5xl font-light tracking-[0.08em] leading-none" style={{ color: design.primaryColor }}>EVENT<span className="font-bold" style={{ color: design.accentColor }}>Z</span></div>
              <div className="text-[11px] font-bold tracking-[0.18em] uppercase mt-2" style={{ color: design.mutedTextColor }}>{design.slogan}</div>
            </div>
          </div>
        )}

        <div className="px-7 py-6 grid grid-cols-2 gap-x-8 gap-y-7 min-h-[320px]" style={{ color: design.textColor }}>
          <div><div className="text-sm font-black uppercase tracking-wider">Event</div><div className="text-2xl font-medium leading-tight mt-1">{event.eventName || 'Event'}</div></div>
          <div><div className="text-sm font-black uppercase tracking-wider">Attendee</div><div className="text-2xl font-medium leading-tight mt-1">{participant.fullName}</div></div>
          <div><div className="text-sm font-black uppercase tracking-wider">Ticket</div><div className="text-2xl font-medium leading-tight mt-1">{participant.category || event.passTitle || 'Attendee'}</div></div>
          <div><div className="text-sm font-black uppercase tracking-wider">Pass ID</div><div className="text-lg font-mono font-bold mt-2 break-all">{participant.passId}</div></div>
        </div>

        <div className="pb-8 flex flex-col items-center gap-2">
          <div className="rounded-lg p-5 shadow-sm" style={{ backgroundColor: design.qrFrameColor }}>
            {qrCodeUrl ? <img src={qrCodeUrl} alt={`QR code for ${participant.fullName}`} style={{ width: Number(design.qrSize), height: Number(design.qrSize) }} className="object-contain" /> : <div className="w-52 h-52 bg-slate-100 animate-pulse rounded-lg" />}
            <div className="font-mono text-center text-xl mt-2 tracking-wide" style={{ color: design.textColor }}>{participant.passId}</div>
          </div>
          <p className="px-8 text-center text-[11px] font-semibold" style={{ color: design.mutedTextColor }}>{event.accessInstruction || 'Present this QR code at the entrance for verification.'}</p>
        </div>
      </div>

      <div className="flex gap-2 w-full no-print">
        <button onClick={handlePrint} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow border border-slate-700"><Printer size={15} />Print Pass</button>
        <button onClick={handleDownloadImage} className="flex-1 bg-white hover:bg-slate-50 text-slate-800 font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 shadow-sm"><Download size={15} />Download Pass</button>
      </div>
    </div>
  );
}
