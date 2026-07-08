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
    sm: { width: 140, height: 62 },
    md: { width: 190, height: 84 },
    lg: { width: 250, height: 111 },
    xl: { width: 340, height: 150 },
  };

  const currentSize = sizes[size];

  return (
    <div
      className={`inline-flex items-center select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      aria-label="ETS N-TECH"
    >
      <img
        src={ETSNTECH_LOGO_DATA_URL}
        alt="ETS N-TECH logo"
        style={{
          width: `${currentSize.width}px`,
          height: `${currentSize.height}px`,
          objectFit: 'contain',
          display: 'block',
        }}
        draggable={false}
      />
    </div>
  );
}
