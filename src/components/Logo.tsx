/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark'; // light is for dark backgrounds (white text), dark is for light backgrounds (black text)
  onClick?: () => void;
}

export default function Logo({ className = '', size = 'md', variant = 'light', onClick }: LogoProps) {
  const sizes = {
    sm: { height: 32, textClass: 'text-sm', subClass: 'hidden' },
    md: { height: 48, textClass: 'text-lg', subClass: 'text-[7px]' },
    lg: { height: 64, textClass: 'text-2xl', subClass: 'text-[10px]' },
    xl: { height: 96, textClass: 'text-4xl', subClass: 'text-[14px]' },
  };

  const currentSize = sizes[size];
  const isLight = variant === 'light';

  return (
    <div className={`flex flex-col items-start select-none ${className}`} onClick={onClick}>
      <div className="flex items-center gap-3">
        {/* Rounded Black Square containing ETS N */}
        <div 
          className="bg-black text-white font-sans flex items-center justify-between px-2 py-1 rounded-xl border border-neutral-800 shadow-lg"
          style={{ 
            height: `${currentSize.height}px`,
            aspectRatio: '1.3 / 1',
          }}
        >
          <span className="text-[10px] font-semibold tracking-wider opacity-90 pr-1 select-none" style={{ fontSize: `${currentSize.height * 0.2}px` }}>
            ETS
          </span>
          <div className="flex-1 flex justify-center items-center h-full">
            <svg 
              viewBox="0 0 100 100" 
              className="h-full w-full fill-white"
              style={{ maxHeight: '80%' }}
            >
              {/* Sharp, stylized white 'N' */}
              <polygon points="10,90 10,10 32,10 72,70 72,10 90,10 90,90 68,90 28,30 28,90" />
            </svg>
          </div>
        </div>

        {/* -TECH Text with custom yellow/gold icon */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center">
            <span 
              className={`font-black tracking-tighter ${isLight ? 'text-white' : 'text-slate-900'}`}
              style={{ fontSize: `${currentSize.height * 0.65}px`, lineHeight: 1 }}
            >
              -T
            </span>
            {/* The 'E' in TECH contains a warm yellow gear icon */}
            <span 
              className={`font-black tracking-tighter flex items-center ${isLight ? 'text-white' : 'text-slate-900'}`}
              style={{ fontSize: `${currentSize.height * 0.65}px`, lineHeight: 1 }}
            >
              E
              <span className="inline-block mx-0.5" style={{ width: `${currentSize.height * 0.3}px` }}>
                <svg viewBox="0 0 100 100" className="w-full h-full text-yellow-500 fill-current animate-spin-slow">
                  {/* Gold gear/flower symbol */}
                  <path d="M50,0 C55,15 65,15 70,5 C75,18 85,15 85,25 C95,25 90,38 98,45 C98,55 85,58 88,70 C78,75 80,88 70,90 C60,100 55,85 50,95 C45,85 40,100 30,90 C20,88 22,75 12,70 C15,58 2,55 2,45 C10,38 5,25 15,25 C15,15 25,18 30,5 C35,15 45,15 50,0 Z M50,30 C39,30 30,39 30,50 C30,61 39,70 50,70 C61,70 70,61 70,50 C70,39 61,30 50,30 Z M50,42 C54.4,42 58,45.6 58,50 C58,54.4 54.4,58 50,58 C45.6,58 42,54.4 42,50 C42,45.6 45.6,42 50,42 Z" />
                </svg>
              </span>
              CH
            </span>
          </div>
        </div>
      </div>

      {/* Slogan subtitle */}
      <div 
        className={`font-bold tracking-widest mt-1 opacity-80 uppercase leading-none select-none ${isLight ? 'text-slate-400' : 'text-slate-500'} ${currentSize.subClass}`}
        style={{ fontSize: `${currentSize.height * 0.14}px` }}
      >
        Building IT Systems That Solve Societal Problems
      </div>
    </div>
  );
}
