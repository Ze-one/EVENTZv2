/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Logo from './Logo.tsx';

interface EventzLoaderProps {
  message?: string;
  fullScreen?: boolean;
  compact?: boolean;
}

export default function EventzLoader({ message = 'Loading EVENTZ secure access system...', fullScreen = false, compact = false }: EventzLoaderProps) {
  const body = (
    <div className={`relative flex flex-col items-center justify-center text-center overflow-hidden ${compact ? 'p-6' : 'p-10'}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(242,169,0,0.16),transparent_34%),radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.14),transparent_30%)] pointer-events-none" />
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute w-32 h-32 rounded-full border border-yellow-400/20 animate-ping" />
        <div className="absolute w-24 h-24 rounded-full border-2 border-dashed border-yellow-400/40 animate-spin" style={{ animationDuration: '8s' }} />
        <Logo size={compact ? 'md' : 'lg'} iconOnly animated className="relative z-10" />
      </div>
      <div className="relative z-10 space-y-2">
        <div className="font-black text-white tracking-[0.32em] text-xs uppercase">EVENTZ</div>
        <div className="text-slate-400 text-xs font-semibold max-w-xs mx-auto leading-relaxed">{message}</div>
        <div className="flex justify-center gap-1.5 pt-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" />
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce [animation-delay:120ms]" />
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );

  if (!fullScreen) return <div className="bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl">{body}</div>;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-sans">
      {body}
    </div>
  );
}
