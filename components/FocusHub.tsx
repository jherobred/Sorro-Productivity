'use client';

import { useState, useEffect, useRef } from 'react';
import { Mascot } from './challenges/Mascot';
import { currentUserId } from '@/lib/supabase';
import { hueOf } from '@/lib/people';
import { playFocusBell, playCelebration, playClick, playTick, startAmbient, stopAmbient, type AmbientSound } from '@/lib/audio';
import { Icon } from './Icon';

export type FocusPreset = 25 | 50 | 5 | 15;

export function FocusHub({
  onClose,
  initialDuration = 25,
}: {
  onClose?: () => void;
  initialDuration?: number;
}) {
  const [duration, setDuration] = useState<number>(initialDuration * 60);
  const [timeLeft, setTimeLeft] = useState<number>(initialDuration * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [ambient, setAmbient] = useState<AmbientSound>('off');
  const [volume, setVolume] = useState<number>(0.35);
  const [me, setMe] = useState<string>('');
  const [celebrated, setCelebrated] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    void currentUserId().then(setMe).catch(() => setMe(''));
  }, []);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setRunning(false);
            stopAmbient();
            playFocusBell();
            setTimeout(playCelebration, 600);
            setCelebrated(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  const toggleTimer = () => {
    playClick();
    if (!running) {
      if (timeLeft === 0) setTimeLeft(duration);
      setRunning(true);
      if (ambient !== 'off') startAmbient(ambient, volume);
    } else {
      setRunning(false);
      stopAmbient();
    }
  };

  const resetTimer = () => {
    playClick();
    setRunning(false);
    stopAmbient();
    setTimeLeft(duration);
    setCelebrated(false);
  };

  const setPreset = (mins: number) => {
    playTick();
    setRunning(false);
    stopAmbient();
    setDuration(mins * 60);
    setTimeLeft(mins * 60);
    setCelebrated(false);
  };

  const handleAmbientChange = (type: AmbientSound) => {
    playTick();
    setAmbient(type);
    if (running) {
      startAmbient(type, volume);
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = duration > 0 ? (duration - timeLeft) / duration : 0;
  const hue = me ? hueOf(me) : '#7C6CFF';

  // SVG Circular progress math
  const size = 220;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--card)',
        borderRadius: 20,
        padding: '24px 20px',
        boxShadow: 'var(--shl)',
        border: '1px solid var(--line2)',
        maxWidth: 440,
        width: '100%',
        margin: '0 auto',
        overflow: 'hidden',
      }}
    >
      {/* Glow aura */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, ${hue} ${running ? '24%' : '10%'}, transparent), transparent 70%)`,
          transition: 'background 0.5s ease',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `color-mix(in srgb, ${hue} 20%, transparent)`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="clock" size={16} color={hue} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: '-.02em' }}>Focus Station</h3>
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Lock in & earn XP</span>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="k-squish"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--card2)',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--tx2)',
            }}
          >
            Done
          </button>
        )}
      </div>

      {/* Preset Selector */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          background: 'var(--card2)',
          padding: 4,
          borderRadius: 12,
          marginBottom: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {[
          { label: '25m Sprint', mins: 25 },
          { label: '50m Deep', mins: 50 },
          { label: '5m Break', mins: 5 },
          { label: '15m Rest', mins: 15 },
        ].map((p) => {
          const active = duration === p.mins * 60;
          return (
            <button
              key={p.mins}
              onClick={() => setPreset(p.mins)}
              className="k-squish"
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: active ? 800 : 600,
                background: active ? hue : 'transparent',
                color: active ? '#0A0912' : 'var(--tx2)',
                transition: 'all 0.2s ease',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Circular Timer & Mascot */}
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto 20px', zIndex: 1 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--line2)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={hue}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
              transition: 'stroke-dashoffset 0.5s ease',
            }}
          />
        </svg>

        {/* Center content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {/* Mascot Study Buddy */}
          {me && (
            <div style={{ marginBottom: 4, transform: 'scale(0.85)' }}>
              <Mascot
                id={me}
                mood={celebrated ? 'celebrating' : running ? 'grinding' : 'coffee'}
                hue={hue}
                size={44}
                variant="full"
                accessory="headphones"
              />
            </div>
          )}

          {/* Digits */}
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-.04em',
              color: 'var(--tx)',
              lineHeight: 1,
            }}
          >
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>

          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', marginTop: 4, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {celebrated ? 'Session Complete! 🎉' : running ? 'Focusing...' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Control buttons */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20, position: 'relative', zIndex: 1 }}>
        <button
          onClick={toggleTimer}
          className="k-squish"
          style={{
            flex: 1,
            minHeight: 46,
            borderRadius: 14,
            background: hue,
            color: '#0A0912',
            fontSize: 14,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: `0 8px 24px -8px ${hue}`,
          }}
        >
          <Icon name={running ? 'moon' : 'play'} size={18} color="#0A0912" />
          <span>{running ? 'Pause' : timeLeft === 0 ? 'Start Again' : 'Start Focus'}</span>
        </button>

        <button
          onClick={resetTimer}
          className="k-squish"
          title="Reset"
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: 'var(--card2)',
            border: '1px solid var(--line2)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--tx2)',
          }}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {/* Ambient Lo-Fi Noise Bar */}
      <div
        style={{
          background: 'var(--card2)',
          borderRadius: 14,
          padding: '10px 14px',
          border: '1px solid var(--line)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
            Ambient Soundscape
          </span>
          <span style={{ fontSize: 10.5, color: hue, fontWeight: 700 }}>
            {ambient === 'off' ? 'Off' : ambient}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'off', label: 'Off', icon: 'close' },
            { id: 'rain', label: '🌧️ Rain', icon: 'drop' },
            { id: 'brownnoise', label: '🌊 Deep', icon: 'mind' },
            { id: 'cafe', label: '☕ Cafe', icon: 'cup' },
          ].map((item) => {
            const active = ambient === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleAmbientChange(item.id as AmbientSound)}
                className="k-squish"
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: active ? 800 : 600,
                  background: active ? `color-mix(in srgb, ${hue} 22%, var(--card))` : 'var(--card)',
                  color: active ? hue : 'var(--tx2)',
                  border: `1px solid ${active ? hue : 'var(--line)'}`,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
