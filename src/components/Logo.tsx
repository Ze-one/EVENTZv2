/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  onClick?: () => void;
  iconOnly?: boolean;
  animated?: boolean;
}

export default function Logo({ className = '', size = 'md', variant = 'light', onClick, iconOnly = false, animated = false }: LogoProps) {
  const scale = { sm: 0.72, md: 0.9, lg: 1.15, xl: 1.55 }[size];
  const width = iconOnly ? 64 * scale : 210 * scale;
  const height = 64 * scale;
  const textColor = variant === 'dark' ? '#0b1f4d' : '#ffffff';
  const darkText = variant === 'dark' ? '#0b1f4d' : '#0b1f4d';

  if (iconOnly) {
    return (
      <div
        onClick={onClick}
        className={`relative flex items-center justify-center rounded-2xl bg-white shadow-lg border border-slate-100 overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${animated ? 'animate-soft-pulse' : ''} ${className}`}
        style={{ width, height }}
        aria-label="EVENTZ"
      >
        <svg viewBox="0 0 128 128" className="w-full h-full p-1.5" aria-hidden="true">
          <rect width="128" height="128" rx="28" fill="#0b1f4d" />
          <path d="M30 82V46h46v13H46v9h28v13H46v1h31v14H30Z" fill="#fff" />
          <path d="M82 46h26L91 82h18v14H76l17-36H82V46Z" fill="#f2a900" />
          <path d="M24 101c24 13 60 11 85-4" fill="none" stroke="#f2a900" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`group inline-flex items-center gap-3 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      aria-label="EVENTZ - manage your event access by ETS.NTECH"
      style={{ height }}
    >
      <div className={`relative rounded-2xl bg-white shadow-lg border border-slate-100 overflow-hidden ${animated ? 'animate-soft-pulse' : ''}`} style={{ width: height, height }}>
        <svg viewBox="0 0 128 128" className="w-full h-full p-1.5" aria-hidden="true">
          <rect width="128" height="128" rx="28" fill="#0b1f4d" />
          <path d="M30 82V46h46v13H46v9h28v13H46v1h31v14H30Z" fill="#fff" />
          <path d="M82 46h26L91 82h18v14H76l17-36H82V46Z" fill="#f2a900" />
          <path d="M24 101c24 13 60 11 85-4" fill="none" stroke="#f2a900" strokeWidth="8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="leading-none">
        <div className="font-black tracking-[0.18em]" style={{ color: variant === 'dark' ? darkText : textColor, fontSize: 26 * scale }}>
          EVENT<span style={{ color: '#f2a900' }}>Z</span>
        </div>
        <div className="mt-1 font-black uppercase tracking-[0.18em]" style={{ color: variant === 'dark' ? '#64748b' : '#cbd5e1', fontSize: 7.5 * scale }}>
          manage your event access by ETS.NTECH
        </div>
      </div>
    </div>
  );
}
