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

const OFFICIAL_LOGO = '/assets/eventz-official-logo.png';
const LOGO_ASPECT_RATIO = 1663 / 488;

export default function Logo({
  className = '',
  size = 'md',
  onClick,
  iconOnly = false,
  animated = false
}: LogoProps) {
  const scale = { sm: 0.72, md: 0.9, lg: 1.15, xl: 1.55 }[size];
  const height = 64 * scale;
  const width = iconOnly ? height : height * LOGO_ASPECT_RATIO;

  if (iconOnly) {
    return (
      <div
        onClick={onClick}
        className={`eventz-official-logo-icon relative overflow-hidden shrink-0 ${onClick ? 'cursor-pointer' : ''} ${animated ? 'animate-soft-pulse' : ''} ${className}`}
        style={{ width, height }}
        aria-label="EVENTZ"
      >
        <img
          src={OFFICIAL_LOGO}
          alt=""
          aria-hidden="true"
          className="absolute h-full max-w-none select-none pointer-events-none"
          style={{
            width: 'auto',
            left: 0,
            top: 0
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`eventz-official-logo relative select-none ${onClick ? 'cursor-pointer' : ''} ${animated ? 'animate-soft-pulse' : ''} ${className}`}
      onClick={onClick}
      aria-label="EVENTZ - manage your event access by ETS.NTECH"
      style={{ width, height }}
    >
      <img
        src={OFFICIAL_LOGO}
        alt="EVENTZ — manage your event access by ETS.NTECH"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />
    </div>
  );
}
