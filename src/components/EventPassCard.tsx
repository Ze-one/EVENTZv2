/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Participant, EventDetails } from '../types.js';
import Logo from './Logo.tsx';
import { Download, Printer, Mail, Phone, Briefcase, Award } from 'lucide-react';

interface EventPassCardProps {
  participant: Participant;
  event: EventDetails;
  onPrint?: () => void;
}

const BRAND = {
  name: 'EVENTZ',
  slogan: 'manage your event access by ETS.NTECH',
  navy: '#0b1f4d',
  gold: '#f2a900'
};

export default function EventPassCard({ participant, event, onPrint }: EventPassCardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const origin = window.location.origin;
    const verifyUrl = `${origin}/verify/${participant.passId}`;
    QRCode.toDataURL(verifyUrl, {
      width: 300,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error('Error generating QR code:', err));
  }, [participant.passId]);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }

    const printContent = cardRef.current?.innerHTML;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print EVENTZ Pass - ${participant.fullName}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @media print { body { margin: 0; padding: 20px; -webkit-print-color-adjust: exact; } .no-print { display: none; } }
            </style>
          </head>
          <body class="bg-white flex justify-center items-center h-full">
            <div class="w-[450px] border border-neutral-300 rounded-3xl overflow-hidden shadow-2xl">${printContent}</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const drawCenteredText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
    words.forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);
    lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  };

  const handleDownloadImage = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 900;
    canvas.height = 1250;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = event.primaryColor || BRAND.navy;
    ctx.fillRect(0, 0, canvas.width, 360);
    ctx.fillStyle = event.accentColor || BRAND.gold;
    ctx.fillRect(0, 350, canvas.width, 10);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(55, 45, 390, 132);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(55, 45, 390, 132);

    ctx.fillStyle = BRAND.navy;
    ctx.font = '900 58px Arial';
    ctx.fillText('EVENT', 82, 105);
    ctx.fillStyle = BRAND.gold;
    ctx.fillText('Z', 295, 105);
    ctx.strokeStyle = BRAND.navy;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(82, 124);
    ctx.lineTo(410, 124);
    ctx.stroke();
    ctx.fillStyle = BRAND.navy;
    ctx.font = 'bold 15px Arial';
    ctx.fillText('manage your event access by ETS.NTECH', 82, 153);

    ctx.fillStyle = event.accentColor || BRAND.gold;
    ctx.font = 'bold 28px Arial';
    ctx.fillText((event.passTitle || 'EVENT PASS').toUpperCase(), 55, 225);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px Arial';
    drawCenteredText(ctx, event.eventName || 'Event', 55, 275, 760, 38);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '18px Arial';
    ctx.fillText(`Venue: ${event.venue || ''}`, 55, 326);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(55, 405, 790, 690);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(55, 405, 790, 690);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('PARTICIPANT DETAILS', 85, 460);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 44px Arial';
    drawCenteredText(ctx, participant.fullName, 85, 525, 730, 48);

    ctx.fillStyle = event.accentColor || BRAND.gold;
    ctx.font = 'bold 26px monospace';
    ctx.fillText(participant.passId, 85, 610);

    let currentY = 675;
    ctx.fillStyle = '#334155';
    ctx.font = '20px Arial';
    if (event.showCategory && participant.category) { ctx.fillText(`Category: ${participant.category}`, 85, currentY); currentY += 38; }
    if (event.showOrganization && participant.organization) { ctx.fillText(`Organization: ${participant.organization}`, 85, currentY); currentY += 38; }
    if (event.showEmail && participant.email) { ctx.fillText(`Email: ${participant.email}`, 85, currentY); currentY += 38; }
    if (event.showPhone && participant.phone) { ctx.fillText(`Phone: ${participant.phone}`, 85, currentY); currentY += 38; }

    if (qrCodeUrl) {
      const qrImg = new Image();
      qrImg.onload = () => {
        const qrSize = 270;
        const qrX = (canvas.width - qrSize) / 2;
        const qrY = 820;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(event.accessInstruction || 'Scan this pass at the entrance gate.', canvas.width / 2, 1138);
        ctx.fillStyle = BRAND.navy;
        ctx.font = 'bold 15px Arial';
        ctx.fillText(`${BRAND.name} • ${BRAND.slogan}`, canvas.width / 2, 1172);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px Arial';
        ctx.fillText(event.footerNote || 'Valid for single entry only.', canvas.width / 2, 1198);

        const link = document.createElement('a');
        link.download = `EVENTZ_Pass_${participant.fullName.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      qrImg.src = qrCodeUrl;
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      <div
        id={`pass-${participant.id}`}
        ref={cardRef}
        className="w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 transition-all duration-300 hover:shadow-2xl text-left"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <div className="p-6 relative text-white" style={{ backgroundColor: event.primaryColor }}>
          <div className="mb-4"><Logo size="sm" variant="light" /></div>
          <div className="mt-4 space-y-1">
            <span className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded" style={{ color: event.accentColor, backgroundColor: `${event.accentColor}15` }}>{event.passTitle || 'EVENT PASS'}</span>
            <h3 className="text-lg font-bold tracking-tight text-white mt-2 truncate">{event.eventName}</h3>
            <div className="text-xs text-slate-300 space-y-1 pt-2 font-mono">
              <p className="truncate">📍 {event.venue}</p>
              <div className="flex items-center gap-3"><p>📅 {event.eventDate}</p><p>⏰ {event.eventTime}</p></div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: event.accentColor }} />
        </div>

        <div className="p-6 space-y-6 bg-slate-50/50">
          <div>
            <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1">PARTICIPANT</span>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">{participant.fullName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-sm" style={{ color: event.accentColor }}>{participant.passId}</span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${participant.status === 'Not Used' ? 'bg-emerald-100 text-emerald-800' : participant.status === 'Used' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{participant.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            {event.showCategory && participant.category && <div className="space-y-1"><span className="text-slate-400 font-medium block">Category</span><span className="font-semibold text-slate-800 flex items-center gap-1"><Award size={13} className="text-slate-400" />{participant.category}</span></div>}
            {event.showOrganization && participant.organization && <div className="space-y-1"><span className="text-slate-400 font-medium block">Organization</span><span className="font-semibold text-slate-800 flex items-center gap-1 truncate"><Briefcase size={13} className="text-slate-400" />{participant.organization}</span></div>}
            {event.showEmail && participant.email && <div className="space-y-1 col-span-2 border-t border-slate-50 pt-2 mt-1"><span className="text-slate-400 font-medium block">Email Address</span><span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate"><Mail size={13} className="text-slate-400" />{participant.email}</span></div>}
            {event.showPhone && participant.phone && <div className="space-y-1 pt-2 mt-1 border-t border-slate-50 col-span-2"><span className="text-slate-400 font-medium block">Phone Number</span><span className="font-semibold text-slate-800 flex items-center gap-1.5"><Phone size={13} className="text-slate-400" />{participant.phone}</span></div>}
          </div>

          <div className="flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm gap-2">
            {qrCodeUrl ? <img src={qrCodeUrl} alt={`QR code for ${participant.fullName}`} className="w-44 h-44 object-contain shadow-sm border border-slate-50 p-1 bg-white rounded-lg" /> : <div className="w-44 h-44 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-400">Generating QR...</div>}
            <span className="text-[10px] text-slate-400 font-mono tracking-widest mt-1">SECURE EVENTZ ACCESS PASS</span>
          </div>

          <div className="text-center space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500 leading-snug">{event.accessInstruction || 'Present this QR code at the entrance for quick scanning.'}</p>
            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">EVENTZ • manage your event access by ETS.NTECH</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 w-full no-print">
        <button onClick={handlePrint} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow border border-slate-700"><Printer size={15} />Print Pass</button>
        <button onClick={handleDownloadImage} className="flex-1 bg-white hover:bg-slate-50 text-slate-800 font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 shadow-sm"><Download size={15} />Download Pass</button>
      </div>
    </div>
  );
}
