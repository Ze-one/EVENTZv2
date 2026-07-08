/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TicketCheck } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  onClick?: () => void;
}

export default function Logo({ className = '', size = 'md', variant = 'light', onClick }: LogoProps) {
  const sizes = {
    sm: { icon: 30, title: 'text-xl', slogan: 'text-[8px]', gap: 'gap-2' },
    md: { icon: 42, title: 'text-3xl', slogan: 'text-[10px]', gap: 'gap-3' },
    lg: { icon: 54, title: 'text-4xl', slogan: 'text-xs', gap: 'gap-4' },
    xl: { icon: 72, title: 'text-6xl', slogan: 'text-sm', gap: 'gap-5' },
  };

  const currentSize = sizes[size];
  const isLight = variant === 'light';

  return (
    <div
      className={`group inline-flex items-center ${currentSize.gap} select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      aria-label="EVENTZ - manage your event access by ETS.NTECH"
    >
      <div
        className="relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 shadow-lg ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.03]"
        style={{ width: currentSize.icon, height: currentSize.icon }}
      >
        <TicketCheck className="text-yellow-400" size={Math.round(currentSize.icon * 0.55)} strokeWidth={2.5} />
        <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-yellow-400 ring-2 ring-white/80" />
      </div>

      <div className="flex flex-col leading-none">
        <div className={`font-black tracking-[-0.08em] ${currentSize.title} ${isLight ? 'text-white' : 'text-slate-950'}`}>
          EVENT<span className="text-yellow-400 tracking-[-0.1em]">Z</span>
        </div>
        <div className={`mt-1 font-bold uppercase tracking-[0.18em] ${currentSize.slogan} ${isLight ? 'text-slate-300' : 'text-slate-500'}`}>
          manage your event access by <span className="text-yellow-500">ETS.NTECH</span>
        </div>
      </div>
    </div>
  );
}
