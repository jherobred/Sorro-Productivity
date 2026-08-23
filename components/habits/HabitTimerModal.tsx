'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { playCelebration, playTick, playClick } from '@/lib/audio';
import { toast } from '@/lib/toast';
import type { Habit } from '@/lib/habits';

export function HabitTimerModal({
  habit,
  onClose,
  onComplete,
}: {
  habit: Habit;
  onClose: () => void;
  onComplete: (elapsedSeconds: number) => void;
}) {
  useOverlayBack(true, onClose);

  // default target duration in seconds (defaults to target * 60 or 25 mins)
  const targetSeconds = (habit.target && habit.kind === 'dur' ? habit.target * 60 : 25 * 60);
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [secondsLeft, setSecondsLeft] = useState(targetSeconds);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [running, setRunning] = useState(true);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsElapsed((s) => s + 1);
        setSecondsLeft((s) => {
          if (s <= 1) {
            playCelebration();
            toast(`Target time reached for ${habit.name}! 🎉`);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, habit.name]);

  const toggleRunning = () => {
    playClick();
    setRunning((r) => !r);
  };

  const addTime = (mins: number) => {
    playTick();
    setSecondsLeft((s) => s + mins * 60);
    toast(`+${mins} minutes added`);
  };

  const resetTimer = () => {
    playClick();
    setRunning(false);
    setSecondsLeft(targetSeconds);
    setSecondsElapsed(0);
  };

  const handleFinish = () => {
    playCelebration();
    const loggedMins = Math.max(1, Math.round(secondsElapsed / 60));
    onComplete(loggedMins);
    onClose();
    toast(`Logged ${loggedMins} minutes for ${habit.name}! 🔥`);
  };

  const displayTime = mode === 'countdown' ? secondsLeft : secondsElapsed;
  const mins = Math.floor(displayTime / 60);
  const secs = displayTime % 60;
  const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const progressPct = targetSeconds > 0
    ? Math.min(100, Math.round((secondsElapsed / targetSeconds) * 100))
    : 100;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom"
        style={{
          width: 420,
          maxWidth: '100%',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 24,
          padding: 24,
          boxShadow: 'var(--shl)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="hov k-squish"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'var(--card2)',
          }}
        >
          <Icon name="close" size={14} color="var(--tx2)" />
        </button>

        {/* Habit Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: `color-mix(in srgb, ${habit.color} 18%, transparent)`, color: habit.color, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
          <Icon name={(habit.icon as IconName) || 'clock'} size={13} color={habit.color} />
          {habit.name}
        </div>

        {habit.cue && (
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 20, maxWidth: 300, marginInline: 'auto' }}>
            {habit.cue}
          </div>
        )}

        {/* Circular Animated Timer Progress */}
        <div style={{ position: 'relative', width: 220, height: 220, margin: '10px auto 20px' }}>
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--line2)"
              strokeWidth="6"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={habit.color}
              strokeWidth="6"
              strokeDasharray="276.46"
              strokeDashoffset={276.46 * (1 - progressPct / 100)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>

          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: 44,
                fontWeight: 900,
                letterSpacing: '-.03em',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--tx)',
              }}
            >
              {timeFormatted}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>
              {mode === 'countdown' ? `${Math.round(progressPct)}% complete` : 'Stopwatch active'}
            </div>
          </div>
        </div>

        {/* Quick adjustments */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => addTime(5)}
            className="hov k-squish"
            style={{
              padding: '5px 11px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: 'var(--tx2)',
            }}
          >
            +5 min
          </button>
          <button
            onClick={() => addTime(15)}
            className="hov k-squish"
            style={{
              padding: '5px 11px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: 'var(--tx2)',
            }}
          >
            +15 min
          </button>
          <button
            onClick={() => setMode((m) => (m === 'countdown' ? 'stopwatch' : 'countdown'))}
            className="hov k-squish"
            style={{
              padding: '5px 11px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: 'var(--tx2)',
            }}
          >
            {mode === 'countdown' ? 'Switch to Stopwatch' : 'Switch to Timer'}
          </button>
        </div>

        {/* Primary Controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={resetTimer}
            className="hov k-squish"
            title="Reset"
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="refresh" size={16} color="var(--tx2)" />
          </button>

          <button
            onClick={toggleRunning}
            className="k-squish"
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              background: running ? 'var(--card2)' : habit.color,
              color: running ? 'var(--tx)' : '#0C0F16',
              border: running ? '1px solid var(--line2)' : 'none',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {running ? (
              <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                <span style={{ width: 4, height: 14, background: 'var(--tx)', borderRadius: 1 }} />
                <span style={{ width: 4, height: 14, background: 'var(--tx)', borderRadius: 1 }} />
              </span>
            ) : (
              <Icon name="play" size={16} color="#0C0F16" />
            )}
            {running ? 'Pause Timer' : 'Resume Timer'}
          </button>

          <button
            onClick={handleFinish}
            className="acc k-squish"
            title="Log Completion"
            style={{
              height: 46,
              paddingInline: 16,
              borderRadius: 14,
              background: 'var(--acc)',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="check" size={16} color="var(--ink)" />
            Log Done
          </button>
        </div>
      </div>
    </div>
  );
}
