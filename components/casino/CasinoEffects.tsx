'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { casinoAudio } from '@/lib/casinoAudio';

/** Animated rolling number ticker with synchronized sound chimes */
export function RollingNumber({
  value,
  durationMs = 800,
  formatter = (v: number) => v.toLocaleString(),
  className = '',
  style = {},
}: {
  value: number;
  durationMs?: number;
  formatter?: (v: number) => string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    if (value === displayValue) return;

    const start = displayValue;
    const end = value;
    const diff = end - start;
    const startTime = performance.now();
    let stepCount = 0;

    let frameId: number;
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const current = Math.floor(start + diff * progress);
      setDisplayValue(current);

      stepCount++;
      if (stepCount % 3 === 0 && progress < 1) {
        casinoAudio.playCoinChime(stepCount);
      }

      if (progress < 1) {
        frameId = requestAnimationFrame(update);
      } else {
        setDisplayValue(end);
        casinoAudio.playCoinChime(stepCount + 1);
      }
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [value, durationMs, displayValue]);

  return (
    <span className={className} style={style}>
      {formatter(displayValue)}
    </span>
  );
}

/** Golden DOS Coin Shower Celebration Particle Fountain */
export function CoinShower({ active }: { active: boolean }) {
  const [coins, setCoins] = useState<{ id: number; x: number; delay: number; scale: number; rot: number }[]>([]);

  useEffect(() => {
    if (!active) {
      setCoins([]);
      return;
    }
    const list = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 94 + 3,
      delay: Math.random() * 0.8,
      scale: 0.7 + Math.random() * 0.6,
      rot: Math.random() * 720 - 360,
    }));
    setCoins(list);
  }, [active]);

  if (!active || coins.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        overflow: 'hidden',
      }}
    >
      {coins.map((c) => (
        <motion.div
          key={c.id}
          initial={{ y: -60, x: `${c.x}vw`, opacity: 1, scale: c.scale, rotate: 0 }}
          animate={{
            y: '105vh',
            rotate: c.rot,
            opacity: [1, 1, 0.8, 0],
          }}
          transition={{
            duration: 1.8 + Math.random() * 0.8,
            delay: c.delay,
            ease: 'easeIn',
          }}
          style={{
            position: 'absolute',
            fontSize: 28,
            filter: 'drop-shadow(0 4px 10px rgba(253, 224, 71, 0.6))',
          }}
        >
          🪙
        </motion.div>
      ))}
    </div>
  );
}

/** Audio Mute / Unmute Toggle Button */
export function AudioMuteToggle() {
  const [muted, setMuted] = useState<boolean>(casinoAudio.getMuted());

  const handleToggle = () => {
    const isNowMuted = casinoAudio.toggleMute();
    setMuted(isNowMuted);
    if (!isNowMuted) {
      casinoAudio.playChip();
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="hov k-squish"
      title={muted ? 'Unmute Casino Audio' : 'Mute Casino Audio'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 10px',
        borderRadius: 8,
        background: muted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
        border: muted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
        color: muted ? '#F87171' : '#34D399',
        fontSize: 11,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      <span>{muted ? '🔇' : '🔊'}</span>
      <span>{muted ? 'Muted' : 'Audio ON'}</span>
    </button>
  );
}

/** Live High-Roller Ticker Stream */
export function HighRollerMarquee() {
  const mockWins = [
    'User_88x won 4,800 DOS on Merramun 6x5 🌙',
    'Bayou HighRoller hit Natural 21 Blackjack (+2,500 DOS) ♠',
    'LuckyJackpot triggered 10 Merramun Free Spins 🔥',
    'CrocMaster doubled down on 11 -> 21 (+1,000 DOS) 🐊',
    'DeepWebWhale exchanged 50 RP -> 5,000 DOS Coin 🟢',
  ];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % mockWins.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [mockWins.length]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        borderRadius: 20,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: 700,
        overflow: 'hidden',
        maxWidth: 380,
      }}
    >
      <span style={{ color: '#22C55E', fontSize: 9, flex: 'none' }}>● LIVE</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          style={{ color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {mockWins[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
