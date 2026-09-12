'use client';

import type { ReactNode } from 'react';

/**
 * A ring that empties as the run goes on: full at the start, closed at zero.
 * The arc is drawn with one dash on a circle, so moving it is a single
 * attribute change the browser can transition between seconds.
 */
export function FocusRing({ share, size, stroke, tone = 'study', smooth = true, children, className = '' }: {
  share: number;
  size: number;
  stroke: number;
  tone?: 'study' | 'break' | 'done';
  smooth?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const middle = size / 2;
  return (
    <div className={`focus-ring is-${tone} ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle className="focus-ring-track" cx={middle} cy={middle} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className={'focus-ring-fill' + (smooth ? ' is-smooth' : '')}
          cx={middle} cy={middle} r={radius} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={length} strokeDashoffset={length * (1 - share)} opacity={share > 0 ? 1 : 0}
          transform={`rotate(-90 ${middle} ${middle})`}
        />
      </svg>
      {children !== undefined && <div className="focus-ring-center">{children}</div>}
    </div>
  );
}
