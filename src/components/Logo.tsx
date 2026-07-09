/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EVENTZ_FULL_LOGO_DATA_URL } from '../assets/eventz-brand-logo.ts';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  onClick?: () => void;
  iconOnly?: boolean;
  animated?: boolean;
}

export default function Logo({ className = '', size = 'md', variant = 'light', onClick, iconOnly = false, animated = false }: LogoProps) {
  const sizes = {
    sm: { box: 'h-10 w-24', icon: 'h-10 w-10', text: 'h-10 w-32' },
    md: { box: 'h-12 w-32', icon: 'h-12 w-12', text: 'h-12 w-40' },
    lg: { box: 'h-16 w-44', icon: 'h-16 w-16', text: 'h-16 w-56' },
    xl: { box: 'h-24 w-64', icon: 'h-24 w-24', text: 'h-24 w-80' },
  };
  const currentSize = sizes[size];

  if (iconOnly) {
    return (
      <div
        onClick={onClick}
        className={`relative flex items-center justify-center rounded-2xl bg-white shadow-lg border border-slate-100 overflow-hidden ${currentSize.icon} ${onClick ? 'cursor-pointer' : ''} ${animated ? 'animate-soft-pulse' : ''} ${className}`}
        aria-label="EVENTZ"
      >
        <img src={EVENTZ_FULL_LOGO_DATA_URL} alt="EVENTZ" className="w-full h-full object-contain p-1.5" />
      </div>
    );
  }

  return (
    <div
      className={`group inline-flex items-center select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      aria-label="EVENTZ - manage your event access by ETS.NTECH"
    >
      <div className={`relative ${currentSize.box} ${animated ? 'animate-soft-pulse' : ''}`}>
        <img
          src={EVENTZ_FULL_LOGO_DATA_URL}
          alt="EVENTZ - manage your event access by ETS.NTECH"
          className="w-full h-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {variant === 'light' && <div className="absolute inset-0 rounded-2xl ring-1 ring-white/5 pointer-events-none" />}
      </div>
    </div>
  );
}
