'use client';

import React from 'react';

export interface PixelIconDef {
  id: string;
  name: string;
  category: string;
  mainColor: string;
  accentColor: string;
  glowColor: string;
}

export const PIXEL_FOLDER_ICONS: PixelIconDef[] = [
  { id: '8bit:gold', name: 'Golden Quest', category: 'Precious', mainColor: '#F59E0B', accentColor: '#FEF08A', glowColor: '#FDE047' },
  { id: '8bit:cyber', name: 'Cyber Matrix', category: 'Tech', mainColor: '#06B6D4', accentColor: '#A5F3FC', glowColor: '#22D3EE' },
  { id: '8bit:emerald', name: 'Emerald Relic', category: 'Precious', mainColor: '#10B981', accentColor: '#A7F3D0', glowColor: '#34D399' },
  { id: '8bit:ruby', name: 'Ruby Flame', category: 'Precious', mainColor: '#EF4444', accentColor: '#FECACA', glowColor: '#F87171' },
  { id: '8bit:amethyst', name: 'Arcane Amethyst', category: 'Magic', mainColor: '#8B5CF6', accentColor: '#DDD6FE', glowColor: '#A78BFA' },
  { id: '8bit:diamond', name: 'Diamond Prism', category: 'Precious', mainColor: '#0284C7', accentColor: '#E0F2FE', glowColor: '#38BDF8' },
  { id: '8bit:obsidian', name: 'Stealth Obsidian', category: 'Dark', mainColor: '#334155', accentColor: '#F1F5F9', glowColor: '#94A3B8' },
  { id: '8bit:floppy', name: 'Retro Floppy', category: 'Retro', mainColor: '#475569', accentColor: '#E2E8F0', glowColor: '#60A5FA' },
  { id: '8bit:arcade', name: 'Arcade Star', category: 'Arcade', mainColor: '#EAB308', accentColor: '#FFFBEB', glowColor: '#FBBF24' },
  { id: '8bit:sakura', name: 'Sakura Blossom', category: 'Nature', mainColor: '#F43F5E', accentColor: '#FFE4E6', glowColor: '#FB7185' },
  { id: '8bit:dungeon', name: 'Dungeon Vault', category: 'Fantasy', mainColor: '#92400E', accentColor: '#FEF3C7', glowColor: '#D97706' },
  { id: '8bit:matrix', name: 'Terminal Green', category: 'Tech', mainColor: '#16A34A', accentColor: '#DCFCE7', glowColor: '#4ADE80' },
];

export function isPixelIcon(icon?: string): boolean {
  return !!icon && icon.startsWith('8bit:');
}

export function PixelFolderIcon({
  iconId,
  size = 56,
  className = '',
}: {
  iconId: string;
  size?: number;
  className?: string;
}) {
  const def = PIXEL_FOLDER_ICONS.find((i) => i.id === iconId) || PIXEL_FOLDER_ICONS[0];
  const h = Math.round(size * 0.85);

  return (
    <div
      className={`pixel-folder-wrapper ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: h,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        imageRendering: 'pixelated',
      }}
    >
      <svg
        viewBox="0 0 32 26"
        width={size}
        height={h}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          {/* Animated specular shine diagonal gradient (normal graceful speed) */}
          <linearGradient id={`shine-${def.id.replace(':', '-')}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Glint clip path */}
          <clipPath id={`clip-${def.id.replace(':', '-')}`}>
            <rect x="2" y="2" width="28" height="22" rx="1" />
          </clipPath>
        </defs>

        <style>{`
          @keyframes pxShineSweep {
            0%, 25% { transform: translateX(-38px) translateY(-38px); opacity: 0; }
            45%, 65% { transform: translateX(38px) translateY(38px); opacity: 0.9; }
            80%, 100% { transform: translateX(38px) translateY(38px); opacity: 0; }
          }
          @keyframes pxGlintStar {
            0%, 20%, 75%, 100% { transform: scale(0); opacity: 0; }
            40%, 55% { transform: scale(1.1); opacity: 1; }
          }
          .px-shine-${def.id.replace(':', '-')} {
            animation: pxShineSweep 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
          .px-glint-${def.id.replace(':', '-')} {
            transform-origin: center;
            animation: pxGlintStar 2.8s ease-in-out infinite;
          }
        `}</style>

        {/* 8-Bit Pixel Outer Dark Outline */}
        <path
          d="M2 3H12V5H28V7H30V23H28V25H4V23H2V3Z"
          fill="#0D0E15"
        />

        {/* 8-Bit Back Folder Tab */}
        <path
          d="M3 4H11V6H3V4Z"
          fill={def.mainColor}
        />
        <path
          d="M4 4H10V5H4V4Z"
          fill={def.accentColor}
          opacity="0.85"
        />

        {/* Paper insert inside folder */}
        <path
          d="M5 6H26V11H5V6Z"
          fill="#F8FAFC"
        />
        <path
          d="M7 8H20V9H7V8ZM7 10H16V11H7V10Z"
          fill="#94A3B8"
        />

        {/* Folder Front Flap Body */}
        <path
          d="M3 10H29V22H27V24H5V22H3V10Z"
          fill={def.mainColor}
        />

        {/* 8-Bit Pixel Inner Shading & Highlights */}
        {/* Top edge highlight */}
        <path
          d="M4 11H28V12H4V11Z"
          fill={def.accentColor}
          opacity="0.9"
        />
        {/* Left edge highlight */}
        <path
          d="M4 12H5V21H4V12Z"
          fill={def.accentColor}
          opacity="0.6"
        />
        {/* Bottom shadow */}
        <path
          d="M6 23H26V24H6V23ZM27 21H28V23H27V21Z"
          fill="#05060A"
          opacity="0.45"
        />

        {/* 8-Bit Badge/Symbol in center */}
        {def.id === '8bit:gold' && (
          <g>
            <rect x="14" y="15" width="4" height="4" fill="#FEF08A" />
            <rect x="15" y="16" width="2" height="2" fill="#854D0E" />
          </g>
        )}
        {def.id === '8bit:cyber' && (
          <g>
            <rect x="13" y="16" width="6" height="2" fill="#E0F2FE" />
            <rect x="15" y="14" width="2" height="6" fill="#E0F2FE" />
            <rect x="15" y="16" width="2" height="2" fill="#0369A1" />
          </g>
        )}
        {def.id === '8bit:emerald' && (
          <g>
            <polygon points="16,14 19,17 16,20 13,17" fill="#D1FAE5" />
            <rect x="15" y="16" width="2" height="2" fill="#047857" />
          </g>
        )}
        {def.id === '8bit:ruby' && (
          <g>
            <polygon points="16,14 19,17 16,20 13,17" fill="#FFE4E6" />
            <rect x="15" y="16" width="2" height="2" fill="#991B1B" />
          </g>
        )}
        {def.id === '8bit:amethyst' && (
          <g>
            <rect x="14" y="14" width="4" height="4" fill="#EDE9FE" />
            <rect x="13" y="15" width="6" height="2" fill="#A78BFA" />
            <rect x="15" y="13" width="2" height="6" fill="#A78BFA" />
          </g>
        )}
        {def.id === '8bit:diamond' && (
          <g>
            <polygon points="16,13 20,17 16,21 12,17" fill="#F0F9FF" />
            <rect x="15" y="16" width="2" height="2" fill="#0284C7" />
          </g>
        )}
        {def.id === '8bit:floppy' && (
          <g>
            <rect x="12" y="13" width="8" height="7" fill="#E2E8F0" />
            <rect x="14" y="14" width="4" height="3" fill="#334155" />
            <rect x="17" y="18" width="1" height="1" fill="#EF4444" />
          </g>
        )}
        {def.id === '8bit:arcade' && (
          <g>
            <rect x="15" y="13" width="2" height="8" fill="#FEF08A" />
            <rect x="12" y="16" width="8" height="2" fill="#FEF08A" />
            <rect x="14" y="15" width="4" height="4" fill="#FBBF24" />
          </g>
        )}
        {(!['8bit:gold', '8bit:cyber', '8bit:emerald', '8bit:ruby', '8bit:amethyst', '8bit:diamond', '8bit:floppy', '8bit:arcade'].includes(def.id)) && (
          <g>
            <rect x="14" y="15" width="4" height="3" fill={def.accentColor} />
            <rect x="15" y="16" width="2" height="1" fill="#0F172A" />
          </g>
        )}

        {/* Animated Light Specular Sheen Stripe */}
        <g clipPath={`url(#clip-${def.id.replace(':', '-')})`}>
          <rect
            x="0"
            y="0"
            width="32"
            height="26"
            fill={`url(#shine-${def.id.replace(':', '-')})`}
            className={`px-shine-${def.id.replace(':', '-')}`}
          />
        </g>

        {/* 8-Bit Twinkling Pixel Glint Star on Top-Right Corner */}
        <g className={`px-glint-${def.id.replace(':', '-')}`} style={{ transformBox: 'fill-box' }}>
          <rect x="23" y="11" width="3" height="1" fill="#FFFFFF" />
          <rect x="24" y="10" width="1" height="3" fill="#FFFFFF" />
          <rect x="24" y="11" width="1" height="1" fill={def.glowColor} />
        </g>
      </svg>
    </div>
  );
}
