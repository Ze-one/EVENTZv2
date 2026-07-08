/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ETSNTECH_LOGO_DATA_URL } from '../assets/etsntech-logo.js';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  onClick?: () => void;
}

export default function Logo({ className = '', size = 'md', onClick }: LogoProps) {
  const sizes = {
    sm: { boxWidth: 150, boxHeight: 46, imageWidth: 124 },
    md: { boxWidth: 210, boxHeight: 64, imageWidth: 176 },
    lg: { boxWidth: 270, boxHeight: 82, imageWidth: 230 },
    xl: { boxWidth: 360, boxHeight: 110, imageWidth: 310 },
  };

  const currentSize = sizes[size];

  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden select-none shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      aria-label="ETS N-TECH"
      style={{
        width: `${currentSize.boxWidth}px`,
        height: `${currentSize.boxHeight}px`,
        padding: '8px 14px',
      }}
    >
      <img
        src={ETSNTECH_LOGO_DATA_URL}
        alt="ETS N-TECH logo"
        style={{
          width: `${currentSize.imageWidth}px`,
          height: 'auto',
          maxHeight: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
          display: 'block',
        }}
        draggable={false}
      />
    </div>
  );
}
