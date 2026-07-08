/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Participant, EventDetails } from '../types.js';
import Logo from './Logo.tsx';
import { Download, Printer, User, Mail, Phone, Briefcase, Award } from 'lucide-react';

interface EventPassCardProps {
  participant: Participant;
  event: EventDetails;
  onPrint?: () => void;
}

export default function EventPassCard({ participant, event, onPrint }: EventPassCardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Generate QR Code URL on mount/update
  useEffect(() => {
    // Generate secure verification URL based on current host
    const origin = window.location.origin;
    const verifyUrl = `${origin}/verify/${participant.passId}`;
    
    QRCode.toDataURL(verifyUrl, {
      width: 300,
      margin: 1,
      color: {
        dark: '#000000', // Black modules
        light: '#ffffff' // White background
      }
    })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error('Error generating QR code:', err));
  }, [participant.passId]);

  // Handle single card print
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    
    const printContent = cardRef.current?.innerHTML;
    const originalContent = document.body.innerHTML;
    
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Print Pass - ${participant.fullName}</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                @media print {
                  body { margin: 0; padding: 20px; -webkit-print-color-adjust: exact; }
                  .no-print { display: none; }
                }
              </style>
            </head>
            <body class="bg-white flex justify-center items-center h-full">
              <div class="w-[450px] border border-neutral-300 rounded-3xl overflow-hidden shadow-2xl">
                ${printContent}
              </div>
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
  };

  // Download pass as image using high-quality HTML5 Canvas drawing
  const handleDownloadImage = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dimensions for high-res printable card
    canvas.width = 800;
    canvas.height = 1100;

    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header Background (Dark slate)
    ctx.fillStyle = event.primaryColor || '#0f172a';
    ctx.fillRect(0, 0, canvas.width, 320);

    // Accent line (Gold)
    ctx.fillStyle = event.accentColor || '#eab308';
    ctx.fillRect(0, 314, canvas.width, 6);

    // Load logo and draw it
    const logoImg = new Image();
    logoImg.onload = () => {
      // Draw Header Text & Logo
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(event.organizerName.toUpperCase(), 50, 90);

      ctx.fillStyle = event.accentColor || '#eab308';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(event.passTitle.toUpperCase(), 50, 140);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px sans-serif';
      ctx.fillText(event.eventName, 50, 195);
      ctx.fillText(`Venue: ${event.venue}`, 50, 230);
      ctx.fillText(`Date: ${event.eventDate} | Time: ${event.eventTime}`, 50, 265);

      // Body Section
      ctx.fillStyle = '#1e293b';
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('PARTICIPANT DETAILS', 50, 390);

      // Name
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText(participant.fullName, 50, 445);

      // Pass ID
      ctx.fillStyle = event.accentColor || '#eab308';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(participant.passId, 50, 495);

      // Metadata elements
      let currentY = 560;
      ctx.fillStyle = '#334155';
      ctx.font = '18px sans-serif';

      if (event.showCategory && participant.category) {
        ctx.fillText(`Category: ${participant.category}`, 50, currentY);
        currentY += 40;
      }
      if (event.showOrganization && participant.organization) {
        ctx.fillText(`Organization: ${participant.organization}`, 50, currentY);
        currentY += 40;
      }
      if (event.showEmail && participant.email) {
        ctx.fillText(`Email: ${participant.email}`, 50, currentY);
        currentY += 40;
      }
      if (event.showPhone && participant.phone) {
        ctx.fillText(`Phone: ${participant.phone}`, 50, currentY);
        currentY += 40;
      }

      // Load and Draw QR code
      if (qrCodeUrl) {
        const qrImg = new Image();
        qrImg.onload = () => {
          // Center the QR Code in the lower section
          const qrSize = 240;
          const qrX = (canvas.width - qrSize) / 2;
          const qrY = 740;
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

          // Footer info
          ctx.fillStyle = '#94a3b8';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(event.footerNote || 'Valid for single entry only.', canvas.width / 2, 1020);
          ctx.fillText(event.accessInstruction || 'Scan at entry gate.', canvas.width / 2, 1045);

          // Trigger download
          const link = document.createElement('a');
          link.download = `ETS_Pass_${participant.fullName.replace(/\s+/g, '_')}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        };
        qrImg.src = qrCodeUrl;
      }
    };
    // Simple placeholder drawing to fetch the custom logo rendering
    logoImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="48"></svg>';
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
      {/* Visual Digital Pass Container */}
      <div 
        id={`pass-${participant.id}`}
        ref={cardRef}
        className="w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 transition-all duration-300 hover:shadow-2xl text-left"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        {/* Pass Header - Dark Slate / Brand Primary */}
        <div 
          className="p-6 relative text-white"
          style={{ backgroundColor: event.primaryColor }}
        >
          {/* Logo overlay */}
          <div className="mb-4">
            <Logo size="sm" variant="light" />
          </div>

          <div className="mt-4 space-y-1">
            <span 
              className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded"
              style={{ color: event.accentColor, backgroundColor: `${event.accentColor}15` }}
            >
              {event.passTitle || 'EVENT PASS'}
            </span>
            <h3 className="text-lg font-bold tracking-tight text-white mt-2 truncate">
              {event.eventName}
            </h3>
            
            <div className="text-xs text-slate-300 space-y-1 pt-2 font-mono">
              <p className="truncate">📍 {event.venue}</p>
              <div className="flex items-center gap-3">
                <p>📅 {event.eventDate}</p>
                <p>⏰ {event.eventTime}</p>
              </div>
            </div>
          </div>

          {/* Golden accent bar */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ backgroundColor: event.accentColor }}
          />
        </div>

        {/* Pass Body - Crisp Clean Light Grid */}
        <div className="p-6 space-y-6 bg-slate-50/50">
          <div>
            <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1">
              PARTICIPANT
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {participant.fullName}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-sm" style={{ color: event.accentColor }}>
                {participant.passId}
              </span>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                participant.status === 'Not Used' ? 'bg-emerald-100 text-emerald-800' :
                participant.status === 'Used' ? 'bg-amber-100 text-amber-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {participant.status}
              </span>
            </div>
          </div>

          {/* Meta Details Toggled by Admin */}
          <div className="grid grid-cols-2 gap-4 text-xs bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            {event.showCategory && participant.category && (
              <div className="space-y-1">
                <span className="text-slate-400 font-medium block">Category</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <Award size={13} className="text-slate-400" />
                  {participant.category}
                </span>
              </div>
            )}

            {event.showOrganization && participant.organization && (
              <div className="space-y-1">
                <span className="text-slate-400 font-medium block">Organization</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                  <Briefcase size={13} className="text-slate-400" />
                  {participant.organization}
                </span>
              </div>
            )}

            {event.showEmail && participant.email && (
              <div className="space-y-1 col-span-2 border-t border-slate-50 pt-2 mt-1">
                <span className="text-slate-400 font-medium block">Email Address</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                  <Mail size={13} className="text-slate-400" />
                  {participant.email}
                </span>
              </div>
            )}

            {event.showPhone && participant.phone && (
              <div className={`space-y-1 pt-2 mt-1 border-t border-slate-50 ${(!event.showEmail || !participant.email) ? 'col-span-2' : 'col-span-2'}`}>
                <span className="text-slate-400 font-medium block">Phone Number</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-400" />
                  {participant.phone}
                </span>
              </div>
            )}
          </div>

          {/* Large Traceable QR Code */}
          <div className="flex flex-col items-center justify-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm gap-2">
            {qrCodeUrl ? (
              <img 
                src={qrCodeUrl} 
                alt={`QR code for ${participant.fullName}`} 
                className="w-44 h-44 object-contain shadow-sm border border-slate-50 p-1 bg-white rounded-lg"
              />
            ) : (
              <div className="w-44 h-44 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-400">
                Generating QR...
              </div>
            )}
            <span className="text-[10px] text-slate-400 font-mono tracking-widest mt-1">
              SECURE ACCESS PASS
            </span>
          </div>

          {/* Instructions and Slogan */}
          <div className="text-center space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500 leading-snug">
              {event.accessInstruction || 'Present this QR code at the entrance for quick scanning.'}
            </p>
            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">
              {event.footerNote || 'Powered by ETSNTECH'}
            </p>
          </div>
        </div>
      </div>

      {/* Control Buttons (Will not print) */}
      <div className="flex gap-2 w-full no-print">
        <button
          onClick={handlePrint}
          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow border border-slate-700"
        >
          <Printer size={15} />
          Print Pass
        </button>
        <button
          onClick={handleDownloadImage}
          className="flex-1 bg-white hover:bg-slate-50 text-slate-800 font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 shadow-sm"
        >
          <Download size={15} />
          Download Pass
        </button>
      </div>
    </div>
  );
}
