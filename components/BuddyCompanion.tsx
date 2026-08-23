'use client';

import { useState, useEffect } from 'react';
import { Mascot } from './challenges/Mascot';
import { currentUserId } from '@/lib/supabase';
import { hueOf } from '@/lib/people';
import { moodOf, type Mood, type Animal, BUDDY_QUOTES } from '@/lib/mascot';
import { playClick, playTick, playCelebration } from '@/lib/audio';
import { Icon } from './Icon';

/**
 * Interactive Study Pet Companion.
 *
 * Sits on your dashboard, reacts to clicks, cheers your streaks,
 * gives daily motivational advice, and levels up with you.
 */
export function BuddyCompanion({
  daysSince = 0,
  streak = 1,
  xp = 120,
  onStartFocus,
}: {
  daysSince?: number | null;
  streak?: number;
  xp?: number;
  onStartFocus?: () => void;
}) {
  const [me, setMe] = useState('');
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [bouncing, setBouncing] = useState(false);
  const [currentMood, setCurrentMood] = useState<Mood>('keen');
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    void currentUserId().then((id) => {
      setMe(id || 'me');
      const baseMood = moodOf({ daysSince, leading: streak > 3 });
      setCurrentMood(baseMood);
    }).catch(() => {
      setMe('me');
      const baseMood = moodOf({ daysSince, leading: streak > 3 });
      setCurrentMood(baseMood);
    });
  }, [daysSince, streak]);

  if (!me) return null;

  const hue = hueOf(me);
  const petLevel = Math.max(1, Math.floor(xp / 100) + 1);

  const handlePet = () => {
    setBouncing(true);
    playClick();
    setQuoteIdx((prev) => (prev + 1) % BUDDY_QUOTES.length);

    // Spawn floating heart
    const newHeart = { id: Date.now(), x: Math.random() * 40 - 20, y: -10 };
    setHearts((h) => [...h.slice(-4), newHeart]);
    setTimeout(() => {
      setHearts((h) => h.filter((item) => item.id !== newHeart.id));
    }, 1000);

    setTimeout(() => setBouncing(false), 450);
  };

  const handleGiveCoffee = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTick();
    setCurrentMood('coffee');
    setTimeout(() => {
      setCurrentMood(moodOf({ daysSince, leading: streak > 3 }));
    }, 6000);
  };

  const handleCelebrate = (e: React.MouseEvent) => {
    e.stopPropagation();
    playCelebration();
    setCurrentMood('celebrating');
    setTimeout(() => {
      setCurrentMood(moodOf({ daysSince, leading: streak > 3 }));
    }, 5000);
  };

  return (
    <div
      onClick={handlePet}
      role="button"
      tabIndex={0}
      className="k-squish"
      style={{
        position: 'relative',
        background: 'var(--card)',
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: 'var(--sh)',
        border: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Background radial ambient glow */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -20,
          top: -20,
          width: 140,
          height: 140,
          borderRadius: '50%',
          pointerEvents: 'none',
          background: `radial-gradient(circle, color-mix(in srgb, ${hue} 18%, transparent) 0%, transparent 70%)`,
        }}
      />

      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: hue,
              padding: '2px 7px',
              borderRadius: 6,
              background: `color-mix(in srgb, ${hue} 14%, transparent)`,
            }}
          >
            Lvl {petLevel} Buddy
          </span>
          {streak > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
              🔥 {streak}d streak
            </span>
          )}
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleGiveCoffee}
            title="Give Coffee"
            className="k-squish"
            style={{
              padding: '4px 7px',
              borderRadius: 7,
              background: 'var(--card2)',
              border: '1px solid var(--line)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--tx2)',
            }}
          >
            ☕
          </button>
          <button
            onClick={handleCelebrate}
            title="Cheer"
            className="k-squish"
            style={{
              padding: '4px 7px',
              borderRadius: 7,
              background: 'var(--card2)',
              border: '1px solid var(--line)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--tx2)',
            }}
          >
            🎉
          </button>
        </div>
      </div>

      {/* Center Mascot and Speech Bubble */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, zIndex: 1 }}>
        {/* Animated Mascot */}
        <div
          style={{
            position: 'relative',
            transform: bouncing ? 'scale(1.15) translateY(-4px)' : 'none',
            transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            flex: 'none',
          }}
        >
          <Mascot
            id={me}
            mood={currentMood}
            hue={hue}
            size={56}
            variant="full"
            accessory="sweatband"
          />

          {/* Floating hearts on click */}
          {hearts.map((h) => (
            <span
              key={h.id}
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: `translate(${h.x}px, ${h.y}px)`,
                fontSize: 14,
                animation: 'pop 0.8s ease-out forwards',
                pointerEvents: 'none',
              }}
            >
              💖
            </span>
          ))}
        </div>

        {/* Speech Bubble */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--card2)',
            padding: '10px 13px',
            borderRadius: 12,
            border: '1px solid var(--line2)',
            position: 'relative',
          }}
        >
          {/* Arrow pointing to pet */}
          <span
            style={{
              position: 'absolute',
              left: -6,
              top: '40%',
              width: 0,
              height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: '6px solid var(--card2)',
            }}
          />
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--tx)',
              lineHeight: 1.45,
              margin: 0,
              textWrap: 'pretty',
            }}
          >
            "{BUDDY_QUOTES[quoteIdx]}"
          </p>
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: 'var(--tx3)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>Tap to interact</span>
            {onStartFocus && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onStartFocus();
                }}
                style={{
                  marginLeft: 'auto',
                  color: 'var(--accTx)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Focus Session →
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
