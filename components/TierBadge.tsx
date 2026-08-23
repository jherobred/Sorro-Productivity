'use client';

import { TIERS, type Tier } from '@/lib/rank';

export function TierBadge({
  tierName = 'Bronze',
  size = 64,
  glow = true,
}: {
  tierName?: string;
  size?: number;
  glow?: boolean;
}) {
  const tier = TIERS.find((t) => t.name.toLowerCase() === tierName.toLowerCase()) ?? TIERS[0];
  const hue = tier.hue;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
      }}
    >
      {/* Ambient glowing backdrop */}
      {glow && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background: `radial-gradient(circle, color-mix(in srgb, ${hue} 35%, transparent) 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}

      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        role="img"
        aria-label={`${tier.name} rank badge`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`grad-${tier.name}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="35%" stopColor={hue} />
            <stop offset="100%" stopColor="#0F111A" />
          </linearGradient>
          <filter id={`glow-${tier.name}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Ring / Base Shield */}
        <path
          d="M32 4 L56 16 V36 C56 48 32 60 32 60 C32 60 8 48 8 36 V16 Z"
          fill="var(--card2)"
          stroke={hue}
          strokeWidth="2"
        />

        {/* Inner Crest by Tier Category */}
        {tier.name === 'Bronze' && (
          <path
            d="M32 12 L48 22 V36 C48 45 32 53 32 53 C32 53 16 45 16 36 V22 Z"
            fill={`url(#grad-${tier.name})`}
            opacity="0.9"
          />
        )}

        {tier.name === 'Silver' && (
          <g>
            <polygon points="32,10 50,28 32,46 14,28" fill={`url(#grad-${tier.name})`} />
            <circle cx="32" cy="28" r="6" fill="#FFFFFF" opacity="0.8" />
          </g>
        )}

        {tier.name === 'Gold' && (
          <g>
            <polygon points="32,8 52,24 44,48 20,48 12,24" fill={`url(#grad-${tier.name})`} />
            <polygon points="32,14 45,26 40,42 24,42 19,26" fill="#FFC24B" />
            <circle cx="32" cy="28" r="5" fill="#FFFFFF" />
          </g>
        )}

        {tier.name === 'Platinum' && (
          <g>
            <polygon points="32,6 54,20 46,50 18,50 10,20" fill={`url(#grad-${tier.name})`} />
            <path d="M32 12 L46 22 L32 44 L18 22 Z" fill="#34D9A0" opacity="0.9" />
          </g>
        )}

        {tier.name === 'Diamond' && (
          <g>
            <polygon points="32,6 56,24 32,56 8,24" fill={`url(#grad-${tier.name})`} />
            <polygon points="32,14 46,26 32,48 18,26" fill="#E0F7FA" opacity="0.9" />
            <line x1="8" y1="24" x2="56" y2="24" stroke="#FFFFFF" strokeWidth="1.5" />
            <line x1="32" y1="6" x2="32" y2="56" stroke="#FFFFFF" strokeWidth="1.5" />
          </g>
        )}

        {tier.name === 'Grandmaster' && (
          <g>
            <path d="M32 6 L56 16 L48 42 L32 56 L16 42 L8 16 Z" fill={`url(#grad-${tier.name})`} />
            <polygon points="32,12 48,24 40,42 24,42 16,24" fill="#FF6B6B" />
            {/* Wing spikes */}
            <path d="M6 14 L14 26 L4 32 Z" fill={hue} />
            <path d="M58 14 L50 26 L60 32 Z" fill={hue} />
          </g>
        )}

        {tier.name === 'Celestial' && (
          <g>
            <circle cx="32" cy="32" r="22" fill={`url(#grad-${tier.name})`} />
            {/* 8-point star */}
            <polygon points="32,10 36,26 52,26 39,36 44,52 32,42 20,52 25,36 12,26 28,26" fill="#FFFFFF" />
            {/* Orbit ring */}
            <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="#FFFFFF" strokeWidth="1.5" transform="rotate(-25 32 32)" />
          </g>
        )}

        {tier.name === 'Eternity' && (
          <g>
            <circle cx="32" cy="32" r="24" fill={`url(#grad-${tier.name})`} />
            {/* Infinity symbol */}
            <path
              d="M24 32 C18 24 12 28 12 32 C12 36 18 40 24 32 C30 24 36 24 42 28 C46 32 46 36 42 36 C36 40 30 40 24 32 Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {tier.name === 'One Above All' && (
          <g>
            <polygon points="32,4 58,18 52,50 32,60 12,50 6,18" fill={`url(#grad-${tier.name})`} />
            <polygon points="32,10 50,22 45,46 32,54 19,46 14,22" fill="#FF6FA8" />
            <polygon points="32,16 44,25 40,40 32,46 24,40 20,25" fill="#FFC24B" />
            {/* Crown / Halo points */}
            <circle cx="32" cy="8" r="3" fill="#FFFFFF" />
            <circle cx="16" cy="14" r="2.5" fill="#FFFFFF" />
            <circle cx="48" cy="14" r="2.5" fill="#FFFFFF" />
          </g>
        )}

        {/* Central Glint */}
        <circle cx="24" cy="20" r="2" fill="#FFFFFF" opacity="0.8" />
      </svg>
    </div>
  );
}
