'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type DealerMood = 'idle' | 'dealing' | 'win' | 'lose' | 'blackjack' | 'jackpot' | 'taunt';

export type AlligatorDealerProps = {
  mood?: DealerMood;
  speech?: string;
  className?: string;
};

export function AlligatorDealer({ mood = 'idle', speech, className = '' }: AlligatorDealerProps) {
  const [blink, setBlink] = useState(false);
  const [jawOpen, setJawOpen] = useState(false);

  // Periodic natural blinking
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 200);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Animate jaw when dealing or speaking
  useEffect(() => {
    if (mood === 'dealing' || mood === 'taunt' || speech) {
      setJawOpen(true);
      const timer = setTimeout(() => setJawOpen(false), 800);
      return () => clearTimeout(timer);
    }
  }, [mood, speech]);

  return (
    <div className={`flex flex-col items-center select-none ${className}`} style={{ minWidth: 260 }}>
      {/* Dealer Speech Bubble */}
      <AnimatePresence mode="wait">
        {speech && (
          <motion.div
            key={speech}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            style={{
              marginBottom: 10,
              padding: '8px 16px',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--card2) 90%, #0F281E)',
              border: '1.5px solid color-mix(in srgb, var(--pal-emerald) 40%, transparent)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 0 12px color-mix(in srgb, var(--pal-emerald) 20%, transparent)',
              color: 'var(--tx)',
              fontSize: 12.5,
              fontWeight: 700,
              textAlign: 'center',
              maxWidth: 320,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: -7,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: '7px solid color-mix(in srgb, var(--pal-emerald) 40%, transparent)',
              }}
            />
            {speech}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gator Gus Animated SVG Avatar */}
      <motion.div
        animate={{
          y: mood === 'win' || mood === 'jackpot' ? [-4, 4, -4] : [0, -2, 0],
          rotate: mood === 'blackjack' ? [-2, 2, -2] : 0,
        }}
        transition={{
          repeat: Infinity,
          duration: mood === 'win' ? 0.6 : 3,
          ease: 'easeInOut',
        }}
        style={{
          position: 'relative',
          width: 130,
          height: 120,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <svg
          viewBox="0 0 200 180"
          width="100%"
          height="100%"
          style={{ overflow: 'visible', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))' }}
        >
          <defs>
            <linearGradient id="gatorSkin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1B5E20" />
              <stop offset="60%" stopColor="#2E7D32" />
              <stop offset="100%" stopColor="#1B4D1E" />
            </linearGradient>
            <linearGradient id="gatorBelly" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#81C784" />
              <stop offset="100%" stopColor="#4CAF50" />
            </linearGradient>
            <linearGradient id="gatorHat" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#212121" />
              <stop offset="100%" stopColor="#111111" />
            </linearGradient>
            <linearGradient id="gatorGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFE082" />
              <stop offset="100%" stopColor="#FFB300" />
            </linearGradient>
          </defs>

          {/* Gator Neck / Collar */}
          <path d="M 65 140 Q 100 165 135 140 L 145 175 Q 100 190 55 175 Z" fill="#1B4D1E" />
          <path d="M 75 148 L 100 165 L 125 148 L 100 138 Z" fill="#FFFFFF" />
          {/* Crimson Bow Tie */}
          <polygon points="82,150 100,158 82,166" fill="#D32F2F" />
          <polygon points="118,150 100,158 118,166" fill="#D32F2F" />
          <circle cx="100" cy="158" r="4" fill="#B71C1C" />

          {/* Main Gator Head */}
          <ellipse cx="100" cy="98" rx="52" ry="42" fill="url(#gatorSkin)" />

          {/* Gator Snout / Jaws */}
          <motion.path
            d="M 50 92 Q 100 80 150 92 Q 175 110 165 125 Q 100 145 35 125 Q 25 110 50 92 Z"
            fill="url(#gatorSkin)"
            stroke="#144A18"
            strokeWidth="3"
            animate={{
              d: jawOpen
                ? 'M 50 92 Q 100 80 150 92 Q 180 120 165 140 Q 100 160 35 140 Q 20 120 50 92 Z'
                : 'M 50 92 Q 100 80 150 92 Q 175 110 165 125 Q 100 145 35 125 Q 25 110 50 92 Z',
            }}
            transition={{ duration: 0.18 }}
          />

          {/* Nostrils */}
          <circle cx="85" cy="94" r="3.5" fill="#0E2F11" />
          <circle cx="115" cy="94" r="3.5" fill="#0E2F11" />

          {/* Snout Scales / Ridges */}
          <path d="M 68 85 Q 73 80 78 85 Q 83 80 88 85" stroke="#144A18" strokeWidth="2.5" fill="none" />
          <path d="M 112 85 Q 117 80 122 85 Q 127 80 132 85" stroke="#144A18" strokeWidth="2.5" fill="none" />

          {/* Razor Teeth */}
          <polygon points="58,118 64,110 70,118" fill="#FFFFFF" />
          <polygon points="76,121 82,112 88,121" fill="#FFFFFF" />
          {/* Gold Tooth */}
          <polygon points="95,123 101,114 107,123" fill="url(#gatorGold)" />
          <polygon points="113,121 119,112 125,121" fill="#FFFFFF" />
          <polygon points="131,118 137,110 143,118" fill="#FFFFFF" />

          {/* Gator Eyes */}
          {/* Left Eye Ridge */}
          <ellipse cx="72" cy="68" rx="18" ry="16" fill="url(#gatorSkin)" stroke="#144A18" strokeWidth="2" />
          {/* Right Eye Ridge */}
          <ellipse cx="128" cy="68" rx="18" ry="16" fill="url(#gatorSkin)" stroke="#144A18" strokeWidth="2" />

          {/* Eyeballs */}
          <circle cx="72" cy="68" r="11" fill="#FFEB3B" />
          <circle cx="128" cy="68" r="11" fill="#FFEB3B" />

          {/* Slit Pupils / Blink Animation */}
          {blink ? (
            <>
              <line x1="62" y1="68" x2="82" y2="68" stroke="#144A18" strokeWidth="4" strokeLinecap="round" />
              <line x1="118" y1="68" x2="138" y2="68" stroke="#144A18" strokeWidth="4" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="72" cy="68" rx="3" ry="9" fill="#0A0912" />
              <ellipse cx="128" cy="68" rx="3" ry="9" fill="#0A0912" />
              {/* Eye Catchlights */}
              <circle cx="70" cy="63" r="2.5" fill="#FFFFFF" />
              <circle cx="126" cy="63" r="2.5" fill="#FFFFFF" />
            </>
          )}

          {/* Fedora / Dealer Top Hat */}
          <ellipse cx="100" cy="48" rx="48" ry="10" fill="url(#gatorHat)" />
          <path d="M 68 46 L 73 14 Q 100 12 127 14 L 132 46 Z" fill="url(#gatorHat)" stroke="#000000" strokeWidth="1.5" />
          {/* Golden Hat Ribbon */}
          <path d="M 71 42 L 73 35 Q 100 33 127 35 L 129 42 Z" fill="url(#gatorGold)" />
          {/* Ace Card in Hat Band */}
          <rect x="116" y="20" width="12" height="18" rx="2" fill="#FFFFFF" stroke="#CCCCCC" strokeWidth="0.8" transform="rotate(15 116 20)" />
          <text x="118" y="32" fontSize="8" fontWeight="bold" fill="#D32F2F" transform="rotate(15 116 20)">A♥</text>
        </svg>

        {/* Dealer Nameplate Badge */}
        <div
          style={{
            position: 'absolute',
            bottom: -10,
            background: '#0D1117',
            border: '1px solid #2E7D32',
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: '#81C784',
            whiteSpace: 'nowrap',
          }}
        >
          Gator Gus · Dealer
        </div>
      </motion.div>
    </div>
  );
}
