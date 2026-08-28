'use client';

import React from 'react';

/**
 * High-fidelity vector symbol graphics matching Merramun from Welcome to the Game II.
 */

export function AnkhSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.8))' }}>
      <defs>
        <linearGradient id="ankhGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF2A8" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
        <radialGradient id="ruby" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FF6B6B" />
          <stop offset="100%" stopColor="#991B1B" />
        </radialGradient>
      </defs>
      {/* Top Oval Loop */}
      <ellipse cx="32" cy="18" rx="11" ry="13" stroke="url(#ankhGold)" strokeWidth="5.5" fill="none" />
      {/* Crossbar */}
      <path d="M 12 33 Q 32 31 52 33 L 52 38 Q 32 36 12 38 Z" fill="url(#ankhGold)" />
      {/* Vertical Stem */}
      <path d="M 28 34 L 28 58 Q 32 60 36 58 L 36 34 Z" fill="url(#ankhGold)" />
      {/* Center Ruby Gem */}
      <circle cx="32" cy="35" r="3.5" fill="url(#ruby)" stroke="#78350F" strokeWidth="1" />
      <circle cx="31" cy="34" r="1" fill="#FFFFFF" />
    </svg>
  );
}

export function CobraSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 0 10px rgba(56,189,248,0.75))' }}>
      <defs>
        <linearGradient id="cobraBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E0F2FE" />
          <stop offset="40%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
      </defs>
      {/* Coiled Body */}
      <path
        d="M 40 16 Q 48 20 44 28 Q 38 36 44 44 Q 48 50 38 54 Q 26 56 22 48 Q 20 40 28 34 Q 34 30 32 24 Q 30 18 36 14 Q 42 10 44 14"
        stroke="url(#cobraBlue)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Hood & Head */}
      <path d="M 32 16 Q 26 12 36 8 Q 46 12 40 16 Q 44 20 36 22 Q 28 20 32 16 Z" fill="url(#cobraBlue)" />
      {/* Glowing Eye */}
      <circle cx="38" cy="11" r="1.5" fill="#FFFFFF" />
      {/* Underbelly Scales */}
      <path d="M 30 40 Q 34 38 38 40" stroke="#7DD3FC" strokeWidth="2" fill="none" />
      <path d="M 28 46 Q 34 44 40 46" stroke="#7DD3FC" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function EyeSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.8))' }}>
      <defs>
        <linearGradient id="eyeBronze" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>
      </defs>
      {/* Eye Outline */}
      <path d="M 12 30 Q 32 14 52 30 Q 32 46 12 30 Z" stroke="url(#eyeBronze)" strokeWidth="4.5" fill="#0A0F1D" />
      {/* Eyeball & Iris */}
      <circle cx="32" cy="30" r="7" fill="url(#eyeBronze)" />
      <circle cx="32" cy="30" r="3.5" fill="#020617" />
      <circle cx="30" cy="28" r="1.2" fill="#FFFFFF" />
      {/* Horus Teardrop / Falcon Markings */}
      <path d="M 32 37 L 32 52 Q 28 54 26 48 L 28 37" fill="url(#eyeBronze)" />
      <path d="M 44 34 Q 48 44 54 44 Q 50 48 42 40" stroke="url(#eyeBronze)" strokeWidth="3" fill="none" />
    </svg>
  );
}

export function SkullSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.75))' }}>
      <defs>
        <linearGradient id="skullRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCA5A5" />
          <stop offset="35%" stopColor="#DC2626" />
          <stop offset="100%" stopColor="#7F1D1D" />
        </linearGradient>
      </defs>
      {/* Cranium */}
      <path d="M 16 28 Q 16 12 32 12 Q 48 12 48 28 Q 48 38 42 42 L 42 50 Q 32 54 22 50 L 22 42 Q 16 38 16 28 Z" fill="url(#skullRed)" />
      {/* Dark Eye Sockets */}
      <ellipse cx="25" cy="28" rx="5" ry="6.5" fill="#0A0000" />
      <ellipse cx="39" cy="28" rx="5" ry="6.5" fill="#0A0000" />
      {/* Nose Cavity */}
      <polygon points="32,34 29,40 35,40" fill="#0A0000" />
      {/* Teeth Lines */}
      <line x1="26" y1="46" x2="26" y2="50" stroke="#0A0000" strokeWidth="2" />
      <line x1="30" y1="46" x2="30" y2="51" stroke="#0A0000" strokeWidth="2" />
      <line x1="34" y1="46" x2="34" y2="51" stroke="#0A0000" strokeWidth="2" />
      <line x1="38" y1="46" x2="38" y2="50" stroke="#0A0000" strokeWidth="2" />
    </svg>
  );
}

export function UrnSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.8))' }}>
      <defs>
        <linearGradient id="urnGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#CA8A04" />
          <stop offset="100%" stopColor="#713F12" />
        </linearGradient>
      </defs>
      {/* Lid & Top Rim */}
      <ellipse cx="32" cy="14" rx="10" ry="3.5" fill="url(#urnGold)" />
      <rect x="26" y="16" width="12" height="4" fill="url(#urnGold)" />
      {/* Main Belly */}
      <path d="M 24 20 Q 14 30 18 42 Q 22 52 32 54 Q 42 52 46 42 Q 50 30 40 20 Z" fill="url(#urnGold)" />
      {/* Handles */}
      <path d="M 20 24 Q 10 32 20 38" stroke="url(#urnGold)" strokeWidth="3" fill="none" />
      <path d="M 44 24 Q 54 32 44 38" stroke="url(#urnGold)" strokeWidth="3" fill="none" />
      {/* Hieroglyph Band */}
      <path d="M 22 34 Q 32 37 42 34" stroke="#713F12" strokeWidth="2" fill="none" />
      <ellipse cx="32" cy="54" rx="8" ry="2.5" fill="url(#urnGold)" />
    </svg>
  );
}

export function ScrollSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.8))' }}>
      <defs>
        <linearGradient id="scrollPaper" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="50%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      {/* Diagonal Rolled Papyrus */}
      <g transform="rotate(-30 32 32)">
        <rect x="18" y="24" width="28" height="16" rx="4" fill="url(#scrollPaper)" />
        <ellipse cx="18" cy="32" rx="3.5" ry="8" fill="#B45309" />
        <ellipse cx="46" cy="32" rx="3.5" ry="8" fill="url(#scrollPaper)" />
        {/* Red Ribbon */}
        <rect x="30" y="24" width="4" height="16" fill="#DC2626" />
      </g>
    </svg>
  );
}

export function BastetSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 0 10px rgba(96,165,250,0.75))' }}>
      <defs>
        <linearGradient id="bastetGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="40%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
      </defs>
      {/* Cat Ears */}
      <polygon points="20,24 24,10 29,20" fill="url(#bastetGlow)" />
      <polygon points="44,24 40,10 35,20" fill="url(#bastetGlow)" />
      {/* Cat Head */}
      <ellipse cx="32" cy="22" rx="10" ry="9" fill="url(#bastetGlow)" />
      {/* Seated Body */}
      <path d="M 26 28 Q 22 42 20 54 Q 32 58 44 54 Q 42 42 38 28 Z" fill="url(#bastetGlow)" />
      {/* Curled Tail */}
      <path d="M 42 52 Q 52 46 50 36 Q 48 30 44 32" stroke="url(#bastetGlow)" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* Golden Collar */}
      <path d="M 26 29 Q 32 32 38 29" stroke="#FDE047" strokeWidth="2.5" fill="none" />
      {/* Cyan Eye Catchlight */}
      <circle cx="28" cy="20" r="1.5" fill="#FFFFFF" />
      <circle cx="36" cy="20" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}

export function AnubisSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 0 12px rgba(129,140,248,0.85))' }}>
      <defs>
        <linearGradient id="anubisDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A5B4FC" />
          <stop offset="40%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#1E1B4B" />
        </linearGradient>
      </defs>
      {/* Tall Jackal Ears */}
      <path d="M 18 24 L 20 6 Q 26 10 28 22 Z" fill="url(#anubisDark)" />
      <path d="M 46 24 L 44 6 Q 38 10 36 22 Z" fill="url(#anubisDark)" />
      {/* Jackal Head Profile / Snout */}
      <path d="M 24 22 L 32 18 L 40 22 L 38 34 L 46 36 L 46 40 L 34 44 L 28 38 Z" fill="url(#anubisDark)" />
      {/* Blue Flame Crown */}
      <path d="M 28 14 Q 32 8 36 14 Q 38 6 42 12" stroke="#38BDF8" strokeWidth="2" fill="none" />
      {/* Golden Headdress Nemes Collar */}
      <path d="M 20 42 Q 32 50 44 42 L 48 54 Q 32 60 16 54 Z" fill="url(#anubisDark)" stroke="#F59E0B" strokeWidth="1.5" />
      {/* Piercing Cyan Eye */}
      <polygon points="34,26 38,28 34,30" fill="#38BDF8" />
      <circle cx="36" cy="28" r="0.8" fill="#FFFFFF" />
    </svg>
  );
}

export function MoonScatterSymbol({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ filter: 'drop-shadow(0 0 14px rgba(253,224,71,0.9))' }}>
      <defs>
        <linearGradient id="moonGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="30%" stopColor="#FEF08A" />
          <stop offset="70%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#854D0E" />
        </linearGradient>
      </defs>
      {/* Outer Halo */}
      <circle cx="32" cy="32" r="26" stroke="#FDE047" strokeWidth="2" strokeDasharray="4 2" opacity="0.7" />
      {/* Crescent Moon */}
      <path
        d="M 34 10 A 22 22 0 1 0 46 46 A 17 17 0 1 1 34 10 Z"
        fill="url(#moonGold)"
        stroke="#CA8A04"
        strokeWidth="1.5"
      />
      {/* Central Star Gem */}
      <polygon points="38,26 40,22 42,26 46,28 42,30 40,34 38,30 34,28" fill="#FFFFFF" />
    </svg>
  );
}

/** Master Symbol Renderer */
export function MerramunIcon({ id, size = 30 }: { id: string; size?: number }) {
  switch (id) {
    case 'scatter':
      return <MoonScatterSymbol size={size} />;
    case 'anubis':
      return <AnubisSymbol size={size} />;
    case 'skull':
      return <SkullSymbol size={size} />;
    case 'cobra':
      return <CobraSymbol size={size} />;
    case 'bastet':
      return <BastetSymbol size={size} />;
    case 'eye':
      return <EyeSymbol size={size} />;
    case 'urn':
      return <UrnSymbol size={size} />;
    case 'scroll':
      return <ScrollSymbol size={size} />;
    case 'ankh':
    default:
      return <AnkhSymbol size={size} />;
  }
}
