'use client';

import React from 'react';

export interface PixelIconDef {
  id: string;
  name: string;
  category: string;
  description: string;
  mainColor: string;
  accentColor: string;
  glowColor: string;
}

export const PIXEL_FOLDER_ICONS: PixelIconDef[] = [
  { id: '8bit:core', name: 'Core Project', category: 'Precious', description: 'Golden leather binder with keyhole lock and layered pages', mainColor: '#B45309', accentColor: '#FDE047', glowColor: '#FBBF24' },
  { id: '8bit:emerald', name: 'Emerald Crystal', category: 'Precious', description: 'Faceted emerald gem folder with crystal clusters', mainColor: '#047857', accentColor: '#6EE7B7', glowColor: '#10B981' },
  { id: '8bit:ruby', name: 'Ruby Flame', category: 'Precious', description: 'Crimson binder with fire crest and golden rivets', mainColor: '#B91C1C', accentColor: '#FCA5A5', glowColor: '#EF4444' },
  { id: '8bit:amethyst', name: 'Amethyst Aura', category: 'Magic', description: 'Mystical tome with 3D crystal cluster and purple glow', mainColor: '#6D28D9', accentColor: '#DDD6FE', glowColor: '#A855F7' },
  { id: '8bit:cyber', name: 'Cyber Circuit', category: 'Tech', description: 'Titanium shell with glowing cyan PCB traces', mainColor: '#0E7490', accentColor: '#A5F3FC', glowColor: '#06B6D4' },
  { id: '8bit:tech', name: 'Advanced Tech', category: 'Tech', description: 'Industrial motherboard deck with IC chips and padlock', mainColor: '#334155', accentColor: '#4ADE80', glowColor: '#22C55E' },
  { id: '8bit:glint', name: 'Golden Glint', category: 'Precious', description: 'Triple beam specular gold folder with star shines', mainColor: '#D97706', accentColor: '#FEF08A', glowColor: '#F59E0B' },
  { id: '8bit:obsidian', name: 'Stealth Obsidian', category: 'Dark', description: 'Carbon black plating with silver bevels and platinum shine', mainColor: '#1E293B', accentColor: '#F1F5F9', glowColor: '#94A3B8' },
  { id: '8bit:diamond', name: 'Diamond Prism', category: 'Precious', description: 'Glacier ice crystal folder with diamond refraction', mainColor: '#0284C7', accentColor: '#E0F2FE', glowColor: '#38BDF8' },
  { id: '8bit:floppy', name: 'Retro Floppy', category: 'Retro', description: 'Classic 3.5" floppy diskette with metal sliding shutter', mainColor: '#475569', accentColor: '#E2E8F0', glowColor: '#60A5FA' },
  { id: '8bit:arcade', name: 'Arcade Star', category: 'Arcade', description: 'Retro arcade cabinet yellow with flashing super star', mainColor: '#EAB308', accentColor: '#FFFBEB', glowColor: '#FACC15' },
  { id: '8bit:sakura', name: 'Sakura Blossom', category: 'Nature', description: 'Rose petal binder with cherry blossom crest and pearl shine', mainColor: '#BE185D', accentColor: '#FCE7F3', glowColor: '#EC4899' },
];

export function isPixelIcon(icon?: string): boolean {
  return !!icon && (icon.startsWith('8bit:') || icon === '8bit:gold');
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
  // Map legacy 8bit:gold or others to 8bit:core if matched
  const resolvedId = iconId === '8bit:gold' ? '8bit:core' : iconId;
  const def = PIXEL_FOLDER_ICONS.find((i) => i.id === resolvedId) || PIXEL_FOLDER_ICONS[0];
  const h = Math.round(size * 0.88);
  const uid = def.id.replace(':', '-');

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
        viewBox="0 0 36 32"
        width={size}
        height={h}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          {/* Animated specular shine diagonal gradient (graceful 2.8s speed) */}
          <linearGradient id={`shine-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="42%" stopColor="#FFFFFF" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.88" />
            <stop offset="58%" stopColor="#FFFFFF" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Glint clip path */}
          <clipPath id={`clip-${uid}`}>
            <rect x="2" y="2" width="32" height="28" rx="1" />
          </clipPath>
        </defs>

        <style>{`
          @keyframes pxShineSweep {
            0%, 22% { transform: translateX(-48px) translateY(-48px); opacity: 0; }
            44%, 62% { transform: translateX(48px) translateY(48px); opacity: 0.95; }
            80%, 100% { transform: translateX(48px) translateY(48px); opacity: 0; }
          }
          @keyframes pxGlintStar {
            0%, 18%, 78%, 100% { transform: scale(0); opacity: 0; }
            42%, 58% { transform: scale(1.15); opacity: 1; }
          }
          @keyframes pxPulseAura {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 0.95; }
          }
          .px-shine-${uid} {
            animation: pxShineSweep 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
          .px-glint-${uid} {
            transform-origin: center;
            animation: pxGlintStar 2.8s ease-in-out infinite;
          }
          .px-aura-${uid} {
            animation: pxPulseAura 2.4s ease-in-out infinite;
          }
        `}</style>

        {/* ----------------- 1. CORE PROJECT FOLDER (Golden Book / Clasp) ----------------- */}
        {def.id === '8bit:core' && (
          <g>
            {/* Outer dark outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#0F0D15" />
            {/* Book Spine / Shadow left */}
            <path d="M5 6H8V28H5V6Z" fill="#78350F" />
            {/* Isometric page lines */}
            <path d="M8 6H29V10H8V6Z" fill="#F8FAFC" />
            <path d="M9 7H28V8H9V7ZM9 9H24V10H9V9Z" fill="#CBD5E1" />
            {/* Front Cover Brown Leather */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#B45309" />
            {/* Inner Gold Borders */}
            <path d="M9 12H31V13H9V12ZM9 13H10V26H9V13ZM30 13H31V26H30V13ZM9 26H31V27H9V26Z" fill="#FDE047" opacity="0.85" />
            {/* Diagonal Gold Accent Inlays */}
            <path d="M12 15L23 26H20L10 16V15H12ZM18 13L30 25V23L20 13H18Z" fill="#FCD34D" opacity="0.45" />
            {/* Golden Buckle Clasp */}
            <rect x="16" y="16" width="6" height="8" rx="1" fill="#FEF08A" />
            <rect x="17" y="17" width="4" height="6" fill="#F59E0B" />
            {/* Keyhole */}
            <circle cx="19" cy="19" r="1.2" fill="#78350F" />
            <rect x="18.5" y="19" width="1" height="2.5" fill="#78350F" />
          </g>
        )}

        {/* ----------------- 2. EMERALD CRYSTAL FOLDER ----------------- */}
        {def.id === '8bit:emerald' && (
          <g>
            {/* Glowing crystal corner spires (outside outline) */}
            <path d="M2 22L5 19V26L2 29V22ZM4 26L7 23V29L4 31V26Z" fill="#34D399" />
            <path d="M32 23L35 20V27L32 29V23Z" fill="#6EE7B7" />
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#022C22" />
            {/* Pages top */}
            <path d="M8 6H29V10H8V6Z" fill="#ECFDF5" />
            <path d="M9 7H28V8H9V7Z" fill="#A7F3D0" />
            {/* Front Cover Dark Emerald */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#047857" />
            {/* Geometric Crystal Facet Lines */}
            <path d="M10 13H30L26 26H14L10 13Z" fill="#065F46" />
            <polygon points="10,13 20,13 16,19" fill="#10B981" opacity="0.8" />
            <polygon points="20,13 30,13 24,19" fill="#34D399" opacity="0.85" />
            <polygon points="10,13 16,19 14,26" fill="#059669" />
            <polygon points="30,13 24,19 26,26" fill="#10B981" />
            <polygon points="16,19 24,19 20,26" fill="#6EE7B7" opacity="0.9" />
            {/* Emerald Gold Clasp */}
            <rect x="16" y="17" width="6" height="7" fill="#FBBF24" />
            <polygon points="19,18 21,20 19,23 17,20" fill="#34D399" />
            <polygon points="19,19 20,20 19,21 18,20" fill="#FFFFFF" />
          </g>
        )}

        {/* ----------------- 3. RUBY FLAME FOLDER ----------------- */}
        {def.id === '8bit:ruby' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#180408" />
            {/* Pages */}
            <path d="M8 6H29V10H8V6Z" fill="#FFF1F2" />
            <path d="M9 7H28V8H9V7Z" fill="#FECDD3" />
            {/* Front Crimson Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#B91C1C" />
            {/* Gold Filigree Border */}
            <rect x="9" y="12" width="22" height="15" fill="none" stroke="#F59E0B" strokeWidth="1" />
            {/* 4 Corner Rivet Studs */}
            <circle cx="11" cy="14" r="1" fill="#FDE047" />
            <circle cx="29" cy="14" r="1" fill="#FDE047" />
            <circle cx="11" cy="25" r="1" fill="#FDE047" />
            <circle cx="29" cy="25" r="1" fill="#FDE047" />
            {/* Flame Swirls */}
            <path d="M12 21C13 18 15 16 16 16C15 19 16 22 17 23C18 20 20 17 20 14C22 17 23 20 24 22C24 19 26 17 27 16C26 21 24 24 21 25" stroke="#F59E0B" strokeWidth="1.2" fill="none" />
            {/* Central Flaming Ruby Gem Crest */}
            <polygon points="20,15 23,19 20,24 17,19" fill="#EF4444" />
            <polygon points="20,16 22,19 20,22 18,19" fill="#FECACA" opacity="0.85" />
            <circle cx="20" cy="19" r="1" fill="#FFFFFF" />
          </g>
        )}

        {/* ----------------- 4. AMETHYST AURA FOLDER ----------------- */}
        {def.id === '8bit:amethyst' && (
          <g>
            {/* Glowing Arcane Aura */}
            <rect x="3" y="5" width="30" height="24" rx="3" fill="#8B5CF6" opacity="0.3" className={`px-aura-${uid}`} filter="blur(3px)" />
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1E0E38" />
            {/* Pages */}
            <path d="M8 6H29V10H8V6Z" fill="#F5F3FF" />
            <path d="M9 7H28V8H9V7Z" fill="#DDD6FE" />
            {/* Front Violet Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#6D28D9" />
            {/* Corner Crystal Shards */}
            <polygon points="8,11 11,11 8,14" fill="#C4B5FD" />
            <polygon points="32,11 29,11 32,14" fill="#C4B5FD" />
            <polygon points="8,27 11,27 8,24" fill="#C4B5FD" />
            <polygon points="32,27 29,27 32,24" fill="#C4B5FD" />
            {/* Central 3D Amethyst Crystal Spire Cluster */}
            <g transform="translate(2, 0)">
              <polygon points="18,12 21,17 18,25 15,17" fill="#8B5CF6" />
              <polygon points="18,12 21,17 18,25" fill="#A78BFA" />
              <polygon points="18,13 20,17 18,23" fill="#DDD6FE" />
              {/* Left & right flanking crystals */}
              <polygon points="14,16 16,18 14,23 12,19" fill="#7C3AED" />
              <polygon points="22,16 24,19 22,23 20,18" fill="#C4B5FD" />
            </g>
          </g>
        )}

        {/* ----------------- 5. CYBER CIRCUIT FOLDER ----------------- */}
        {def.id === '8bit:cyber' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#041824" />
            {/* Pages Top */}
            <path d="M8 6H29V10H8V6Z" fill="#082F49" />
            <path d="M9 7H28V8H9V7Z" fill="#0284C7" />
            {/* Titanium Body */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#1E293B" />
            {/* Glowing Cyan Circuit Traces */}
            <path d="M9 15H14L17 18H23L26 15H31" stroke="#06B6D4" strokeWidth="1.5" fill="none" />
            <path d="M9 24H15L19 20H21L25 24H31" stroke="#22D3EE" strokeWidth="1.2" fill="none" />
            <path d="M12 12V15M28 12V15M17 18V26M23 18V26" stroke="#06B6D4" strokeWidth="1" fill="none" />
            {/* Circuit Nodes (Glowing Dots) */}
            <circle cx="12" cy="12" r="1.2" fill="#E0F2FE" />
            <circle cx="28" cy="12" r="1.2" fill="#E0F2FE" />
            <circle cx="17" cy="26" r="1.2" fill="#E0F2FE" />
            <circle cx="23" cy="26" r="1.2" fill="#E0F2FE" />
            {/* Top Metallic Port Clasp */}
            <rect x="16" y="11" width="8" height="5" rx="1" fill="#334155" stroke="#06B6D4" strokeWidth="1" />
            <rect x="18" y="13" width="4" height="1.5" fill="#22D3EE" />
          </g>
        )}

        {/* ----------------- 6. ADVANCED TECH / MOTHERBOARD FOLDER ----------------- */}
        {def.id === '8bit:tech' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#0B1120" />
            {/* Top Diagnostic LEDs Bar */}
            <path d="M8 6H29V10H8V6Z" fill="#1E293B" />
            <circle cx="11" cy="8" r="1" fill="#EF4444" />
            <circle cx="15" cy="8" r="1" fill="#FBBF24" />
            <circle cx="19" cy="8" r="1" fill="#22C55E" />
            <circle cx="23" cy="8" r="1" fill="#38BDF8" />
            {/* Motherboard PCB Green Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#15803D" />
            {/* PCB Copper Tracks */}
            <path d="M10 13H15V18H10M25 13H30V18H25M10 24H14V21H17M23 21H26V24H30" stroke="#86EFAC" strokeWidth="1" fill="none" opacity="0.65" />
            {/* Microchip IC Packages */}
            <rect x="10" y="19" width="5" height="5" fill="#0F172A" stroke="#94A3B8" strokeWidth="0.6" />
            <rect x="25" y="19" width="5" height="5" fill="#0F172A" stroke="#94A3B8" strokeWidth="0.6" />
            {/* Heavy Industrial Metal Lock */}
            <rect x="16" y="15" width="8" height="9" rx="1" fill="#94A3B8" stroke="#334155" strokeWidth="1" />
            <rect x="18" y="12" width="4" height="4" fill="none" stroke="#64748B" strokeWidth="1.2" />
            <circle cx="20" cy="18" r="1" fill="#0F172A" />
            <rect x="19.5" y="18" width="1" height="3" fill="#0F172A" />
          </g>
        )}

        {/* ----------------- 7. GOLDEN GLINT HORIZON FOLDER ----------------- */}
        {def.id === '8bit:glint' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1C1204" />
            {/* Silver Spine Bar */}
            <path d="M8 6H29V10H8V6Z" fill="#E2E8F0" />
            <path d="M9 7H28V8H9V7Z" fill="#FFFFFF" />
            {/* Rich Amber Gold Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#D97706" />
            {/* Triple Specular Reflection Stripes */}
            <path d="M11 11L26 26H23L8 11H11ZM16 11L31 26H28L13 11H16ZM22 11L33 22V19L25 11H22Z" fill="#FEF08A" opacity="0.6" />
            {/* Star Sparkle on top-left and bottom-right */}
            <g transform="translate(10, 12)">
              <polygon points="2,0 3,2 5,2 3,3 4,5 2,4 0,5 1,3 -1,2 1,2" fill="#FFFFFF" />
            </g>
            <g transform="translate(26, 22)">
              <polygon points="2,0 3,2 5,2 3,3 4,5 2,4 0,5 1,3 -1,2 1,2" fill="#FFFFFF" />
            </g>
          </g>
        )}

        {/* ----------------- 8. STEALTH OBSIDIAN FOLDER ----------------- */}
        {def.id === '8bit:obsidian' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#020617" />
            {/* Matte Black Spine */}
            <path d="M8 6H29V10H8V6Z" fill="#1E293B" />
            <path d="M9 7H28V8H9V7Z" fill="#334155" />
            {/* Carbon Fiber Plated Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#0F172A" />
            {/* Gunmetal Angular Bevels */}
            <path d="M9 12H31L29 26H11L9 12Z" stroke="#475569" strokeWidth="1" fill="#1E293B" />
            {/* Biometric Center Scanner */}
            <rect x="17" y="16" width="6" height="7" rx="1" fill="#020617" stroke="#94A3B8" strokeWidth="1" />
            <rect x="18" y="18" width="4" height="1" fill="#38BDF8" />
            <rect x="18" y="20" width="4" height="1" fill="#38BDF8" />
          </g>
        )}

        {/* ----------------- 9. DIAMOND PRISM FOLDER ----------------- */}
        {def.id === '8bit:diamond' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#082F49" />
            {/* Ice White Pages */}
            <path d="M8 6H29V10H8V6Z" fill="#F0F9FF" />
            <path d="M9 7H28V8H9V7Z" fill="#BAE6FD" />
            {/* Glacier Cyan Prism Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#0284C7" />
            {/* Faceted Diamond Diamond Shape */}
            <polygon points="20,12 28,18 20,27 12,18" fill="#38BDF8" />
            <polygon points="20,12 28,18 20,18" fill="#BAE6FD" />
            <polygon points="12,18 20,18 20,27" fill="#0EA5E9" />
            <polygon points="20,18 28,18 20,27" fill="#7DD3FC" />
            <polygon points="16,15 20,12 24,15 20,18" fill="#FFFFFF" opacity="0.9" />
          </g>
        )}

        {/* ----------------- 10. RETRO FLOPPY DISK FOLDER ----------------- */}
        {def.id === '8bit:floppy' && (
          <g>
            {/* Dark Outline */}
            <path d="M5 4H27L31 8V28H5V4Z" fill="#0F172A" />
            {/* Disk Body Slate */}
            <path d="M6 5H26L30 9V27H6V5Z" fill="#334155" />
            {/* Top Metal Sliding Shutter */}
            <rect x="11" y="5" width="14" height="9" fill="#CBD5E1" />
            <rect x="14" y="6" width="3" height="6" fill="#0F172A" />
            {/* White Label Area with colorful tracks */}
            <rect x="9" y="16" width="18" height="9" rx="1" fill="#F8FAFC" />
            <rect x="11" y="18" width="14" height="1.5" fill="#EF4444" />
            <rect x="11" y="20.5" width="14" height="1.5" fill="#3B82F6" />
            <rect x="11" y="23" width="9" height="1" fill="#94A3B8" />
          </g>
        )}

        {/* ----------------- 11. ARCADE SUPER STAR FOLDER ----------------- */}
        {def.id === '8bit:arcade' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1C1917" />
            {/* Pages */}
            <path d="M8 6H29V10H8V6Z" fill="#FEFCE8" />
            {/* Arcade Yellow Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#EAB308" />
            {/* Pixel Grid Lines */}
            <rect x="9" y="12" width="22" height="15" fill="none" stroke="#CA8A04" strokeWidth="1" />
            {/* Flashing 8-Bit Super Star */}
            <g transform="translate(14, 13)">
              <polygon points="6,0 8,4 12,5 9,8 10,12 6,10 2,12 3,8 0,5 4,4" fill="#FFFFFF" />
              <polygon points="6,2 7,5 10,5 8,7 9,10 6,8 3,10 4,7 2,5 5,5" fill="#FACC15" />
              <circle cx="5" cy="6" r="0.8" fill="#000000" />
              <circle cx="7" cy="6" r="0.8" fill="#000000" />
            </g>
          </g>
        )}

        {/* ----------------- 12. SAKURA BLOSSOM FOLDER ----------------- */}
        {def.id === '8bit:sakura' && (
          <g>
            {/* Dark Outline */}
            <path d="M4 4H15V6H32V8H34V28H32V30H6V28H4V4Z" fill="#1C0A14" />
            {/* Pages */}
            <path d="M8 6H29V10H8V6Z" fill="#FFF1F2" />
            <path d="M9 7H28V8H9V7Z" fill="#FBCFE8" />
            {/* Pink Satin Cover */}
            <path d="M7 10H33V27H31V29H9V27H7V10Z" fill="#BE185D" />
            {/* Gold Filigree Ribbon */}
            <path d="M9 19H31" stroke="#FDE047" strokeWidth="1.5" />
            {/* Sakura Blossom Petal Crest */}
            <g transform="translate(16, 15)">
              <circle cx="4" cy="4" r="3" fill="#FCE7F3" />
              <circle cx="4" cy="1" r="2" fill="#F472B6" />
              <circle cx="7" cy="4" r="2" fill="#F472B6" />
              <circle cx="4" cy="7" r="2" fill="#F472B6" />
              <circle cx="1" cy="4" r="2" fill="#F472B6" />
              <circle cx="4" cy="4" r="1.5" fill="#FEF08A" />
            </g>
          </g>
        )}

        {/* Animated Light Specular Sheen Stripe */}
        <g clipPath={`url(#clip-${uid})`}>
          <rect
            x="0"
            y="0"
            width="36"
            height="32"
            fill={`url(#shine-${uid})`}
            className={`px-shine-${uid}`}
          />
        </g>

        {/* 8-Bit Twinkling Pixel Glint Star on Top-Right Corner */}
        <g className={`px-glint-${uid}`} style={{ transformBox: 'fill-box' }}>
          <rect x="27" y="12" width="4" height="1.2" fill="#FFFFFF" />
          <rect x="28.4" y="10.6" width="1.2" height="4" fill="#FFFFFF" />
          <rect x="28.4" y="12" width="1.2" height="1.2" fill={def.glowColor} />
        </g>
      </svg>
    </div>
  );
}
