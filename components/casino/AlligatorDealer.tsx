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
      setTimeout(() => setBlink(false), 180);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Animate jaw when dealing or speaking
  useEffect(() => {
    if (mood === 'dealing' || mood === 'taunt' || speech) {
      setJawOpen(true);
      const timer = setTimeout(() => setJawOpen(false), 700);
      return () => clearTimeout(timer);
    }
  }, [mood, speech]);

  return (
    <div
      className={`flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}
    >
      {/* Dealer Speech Bubble */}
      <div style={{ minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 6 }}>
        <AnimatePresence mode="wait">
          {speech && (
            <motion.div
              key={speech}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18 }}
              style={{
                padding: '6px 14px',
                borderRadius: 12,
                background: 'rgba(8, 20, 14, 0.92)',
                border: '1.5px solid #10B981',
                boxShadow: '0 6px 20px rgba(0,0,0,0.6), 0 0 12px rgba(16,185,129,0.25)',
                color: '#ECFDF5',
                fontSize: 12,
                fontWeight: 700,
                textAlign: 'center',
                maxWidth: 320,
                position: 'relative',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid #10B981',
                }}
              />
              {speech}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gator Gus Dealer Avatar */}
      <motion.div
        animate={{
          y: mood === 'win' || mood === 'jackpot' ? [-3, 3, -3] : [0, -2, 0],
          rotate: mood === 'blackjack' ? [-1.5, 1.5, -1.5] : 0,
        }}
        transition={{
          repeat: Infinity,
          duration: mood === 'win' ? 0.6 : 3.2,
          ease: 'easeInOut',
        }}
        style={{
          position: 'relative',
          width: 124,
          height: 110,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0 auto',
        }}
      >
        <svg
          viewBox="0 0 200 180"
          width="100%"
          height="100%"
          style={{ overflow: 'visible', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.6))' }}
        >
          <defs>
            <linearGradient id="gatorSkin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#14532D" />
              <stop offset="45%" stopColor="#166534" />
              <stop offset="100%" stopColor="#0F3D20" />
            </linearGradient>
            <linearGradient id="gatorScales" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#15803D" />
            </linearGradient>
            <linearGradient id="gatorHat" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E293B" />
              <stop offset="100%" stopColor="#0F172A" />
            </linearGradient>
            <linearGradient id="gatorGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
          </defs>

          {/* Shoulders / Dealer Tuxedo Collar */}
          <path d="M 50 145 Q 100 170 150 145 L 160 180 Q 100 195 40 180 Z" fill="#090D14" />
          <path d="M 72 148 L 100 166 L 128 148 L 100 138 Z" fill="#F8FAFC" />
          
          {/* Crimson Velvet Bow Tie */}
          <polygon points="80,150 100,158 80,166" fill="#DC2626" />
          <polygon points="120,150 100,158 120,166" fill="#DC2626" />
          <circle cx="100" cy="158" r="4.5" fill="#991B1B" />

          {/* Main Gator Head Base */}
          <ellipse cx="100" cy="98" rx="54" ry="44" fill="url(#gatorSkin)" stroke="#052E16" strokeWidth="2.5" />

          {/* Gator Snout / Upper Jaw */}
          <motion.path
            d="M 48 92 Q 100 78 152 92 Q 176 112 166 128 Q 100 148 34 128 Q 24 112 48 92 Z"
            fill="url(#gatorSkin)"
            stroke="#052E16"
            strokeWidth="3"
            animate={{
              d: jawOpen
                ? 'M 48 92 Q 100 78 152 92 Q 182 122 166 142 Q 100 164 34 142 Q 18 122 48 92 Z'
                : 'M 48 92 Q 100 78 152 92 Q 176 112 166 128 Q 100 148 34 128 Q 24 112 48 92 Z',
            }}
            transition={{ duration: 0.16 }}
          />

          {/* Nostrils */}
          <ellipse cx="82" cy="94" rx="4" ry="3" fill="#021A0C" />
          <ellipse cx="118" cy="94" rx="4" ry="3" fill="#021A0C" />

          {/* Snout Ridges */}
          <path d="M 66 84 Q 72 79 78 84 Q 84 79 90 84" stroke="#052E16" strokeWidth="2.5" fill="none" />
          <path d="M 110 84 Q 116 79 122 84 Q 128 79 134 84" stroke="#052E16" strokeWidth="2.5" fill="none" />

          {/* Teeth */}
          <polygon points="56,120 62,111 68,120" fill="#FFFFFF" />
          <polygon points="74,123 80,113 86,123" fill="#FFFFFF" />
          {/* 24K Gold Tooth */}
          <polygon points="94,125 100,114 106,125" fill="url(#gatorGold)" stroke="#78350F" strokeWidth="0.5" />
          <polygon points="114,123 120,113 126,123" fill="#FFFFFF" />
          <polygon points="132,120 138,111 144,120" fill="#FFFFFF" />

          {/* Eye Ridges */}
          <ellipse cx="70" cy="68" rx="19" ry="17" fill="url(#gatorSkin)" stroke="#052E16" strokeWidth="2.5" />
          <ellipse cx="130" cy="68" rx="19" ry="17" fill="url(#gatorSkin)" stroke="#052E16" strokeWidth="2.5" />

          {/* Golden Reptile Eyeballs */}
          <circle cx="70" cy="68" r="12" fill="#FACC15" />
          <circle cx="130" cy="68" r="12" fill="#FACC15" />

          {/* Slit Pupils & Animated Blink */}
          {blink ? (
            <>
              <line x1="58" y1="68" x2="82" y2="68" stroke="#021A0C" strokeWidth="4.5" strokeLinecap="round" />
              <line x1="118" y1="68" x2="142" y2="68" stroke="#021A0C" strokeWidth="4.5" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="70" cy="68" rx="3.2" ry="10" fill="#0A0912" />
              <ellipse cx="130" cy="68" rx="3.2" ry="10" fill="#0A0912" />
              {/* Catchlight reflections */}
              <circle cx="68" cy="63" r="2.8" fill="#FFFFFF" />
              <circle cx="128" cy="63" r="2.8" fill="#FFFFFF" />
            </>
          )}

          {/* High-Roller Fedora Hat */}
          <ellipse cx="100" cy="48" rx="52" ry="11" fill="url(#gatorHat)" stroke="#020617" strokeWidth="1.5" />
          <path d="M 66 46 L 72 12 Q 100 10 128 12 L 134 46 Z" fill="url(#gatorHat)" stroke="#020617" strokeWidth="1.5" />
          {/* Gold Hat Ribbon */}
          <path d="M 69 43 L 71 34 Q 100 32 129 34 L 131 43 Z" fill="url(#gatorGold)" />
          {/* Ace of Hearts playing card tucked in hat */}
          <rect x="118" y="18" width="13" height="19" rx="2.5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="0.8" transform="rotate(14 118 18)" />
          <text x="120" y="31" fontSize="8.5" fontWeight="900" fill="#DC2626" transform="rotate(14 118 18)">A♥</text>
        </svg>

        {/* Dealer Nameplate Badge */}
        <div
          style={{
            position: 'absolute',
            bottom: -10,
            background: 'linear-gradient(180deg, #0F172A 0%, #020617 100%)',
            border: '1.5px solid #10B981',
            boxShadow: '0 4px 12px rgba(0,0,0,0.7)',
            borderRadius: 6,
            padding: '2px 10px',
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: '#34D399',
            whiteSpace: 'nowrap',
          }}
        >
          Gator Gus · Bayou Dealer
        </div>
      </motion.div>
    </div>
  );
}
