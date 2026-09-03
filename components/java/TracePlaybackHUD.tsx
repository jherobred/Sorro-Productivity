'use client';

import { useState } from 'react';
import { Icon } from '../Icon';
import { playClick, playTick } from '@/lib/audio';
import { usePrefs } from '@/lib/prefs';
import type { RunResult, Step } from '@/lib/java';

interface TracePlaybackHUDProps {
  result: RunResult;
  currentStepIndex: number | null;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onStepChange: (stepIndex: number | null) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onClose?: () => void;
  phone?: boolean;
}

const SPEEDS = [0.5, 1, 2, 4];

export function TracePlaybackHUD({
  result,
  currentStepIndex,
  isPlaying,
  onPlayToggle,
  onStepChange,
  speed,
  onSpeedChange,
  onClose,
  phone = false,
}: TracePlaybackHUDProps) {
  const [minimized, setMinimized] = useState(false);
  const { prefs } = usePrefs();
  // Both hooks run before this early return, so the order stays stable.
  const totalSteps = result.trace.length;
  if (totalSteps <= 1) return null;

  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  const tint = (ms: number) => (prefs.motion ? `background ${ms}ms ${EASE}` : 'none');

  const activeIndex = currentStepIndex ?? totalSteps - 1;
  const isFinalState = currentStepIndex === null;
  const currentStep: Step | null = result.trace[activeIndex] ?? null;

  const handleStepPrev = () => {
    playTick();
    const prev = Math.max(0, activeIndex - 1);
    onStepChange(prev);
  };

  const handleStepNext = () => {
    playTick();
    const next = Math.min(totalSteps - 1, activeIndex + 1);
    onStepChange(next);
  };

  const cycleSpeed = () => {
    playClick();
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    onSpeedChange(next);
  };

  // -------------------------------------------------------------
  // Compact Mini-Dock Mode (Floating Capsule)
  // -------------------------------------------------------------
  if (minimized) {
    return (
      <div
        className="k-bloom"
        style={{
          position: 'sticky',
          bottom: phone ? 8 : 14,
          alignSelf: 'center',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 24,
          background: 'color-mix(in srgb, var(--card) 92%, transparent)',
          border: '1px solid color-mix(in srgb, var(--acc) 35%, var(--line2))',
          boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 18px color-mix(in srgb, var(--acc) 18%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          maxWidth: 'calc(100% - 24px)',
        }}
      >
        {/* Status Indicator Dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isPlaying ? 'var(--pal-mint)' : isFinalState ? 'var(--pal-sky)' : 'var(--pal-amber)',
            boxShadow: isPlaying ? '0 0 8px var(--pal-mint)' : 'none',
            flex: 'none',
          }}
        />

        {/* Mini Play / Pause */}
        <button
          onClick={onPlayToggle}
          className="acc k-squish"
          title={isPlaying ? 'Pause' : 'Play trace'}
          aria-label={isPlaying ? 'Pause' : 'Play trace'}
          style={{
            width: 32,
            height: 32,
            minWidth: 32,
            borderRadius: '50%',
            background: 'var(--acc)',
            color: 'var(--ink)',
            border: 'none',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name={isPlaying ? 'minus' : 'play'} size={12} color="var(--ink)" />
        </button>

        {/* Step Index Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {isFinalState ? 'Live (Final)' : `Step ${activeIndex + 1}/${totalSteps}`}
          </span>
          {currentStep?.note && (
            <span
              style={{
                fontSize: 9.5,
                color: 'var(--tx3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: phone ? 120 : 200,
              }}
            >
              {currentStep.note}
            </span>
          )}
        </div>

        {/* Expand HUD Toggle */}
        <button
          onClick={() => {
            playClick();
            setMinimized(false);
          }}
          className="hov k-squish"
          title="Expand Playback HUD"
          aria-label="Expand Playback HUD"
          style={{
            minWidth: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            color: 'var(--tx2)',
            cursor: 'pointer',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          <span>HUD</span>
          <Icon name="expand" size={12} color="var(--tx2)" />
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Full Glassmorphic Playback HUD
  // -------------------------------------------------------------
  return (
    <div
      className="k-bloom"
      style={{
        position: 'sticky',
        bottom: phone ? 6 : 12,
        alignSelf: 'center',
        zIndex: 40,
        width: '100%',
        maxWidth: 620,
        borderRadius: 16,
        background: 'color-mix(in srgb, var(--card) 92%, transparent)',
        border: '1px solid color-mix(in srgb, var(--acc) 30%, var(--line2))',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--acc) 14%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: phone ? '8px 10px' : '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: phone ? 6 : 8,
      }}
    >
      {/* Top Meta & Commentary Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Status Dot */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isPlaying ? 'var(--pal-mint)' : isFinalState ? 'var(--pal-sky)' : 'var(--pal-amber)',
              boxShadow: isPlaying ? '0 0 8px var(--pal-mint)' : 'none',
              flex: 'none',
              transition: tint(200),
            }}
          />

          {/* Step Count */}
          <span style={{ fontSize: phone ? 11 : 12, fontWeight: 800, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {isFinalState ? 'Final State (Live)' : `Step ${activeIndex + 1} of ${totalSteps}`}
          </span>

          {/* Step Commentary Badge */}
          {currentStep?.note && (
            <div
              title={currentStep.note}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--acc) 16%, var(--card2))',
                border: '1px solid color-mix(in srgb, var(--acc) 32%, transparent)',
                color: 'var(--accTx)',
                fontSize: phone ? 9.5 : 10.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: phone ? 130 : 260,
                minWidth: 0,
              }}
            >
              <Icon name="spark" size={10} color="var(--accTx)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentStep.note}</span>
            </div>
          )}
        </div>

        {/* Right Actions: Speed & Collapse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          {/* Speed Toggle */}
          <button
            onClick={cycleSpeed}
            className="hov k-squish"
            title="Cycle Playback Speed (0.5x, 1x, 2x, 4x)"
            aria-label={`Speed ${speed}x`}
            style={{
              height: phone ? 30 : 28,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--tx2)',
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {speed}x
          </button>

          {/* Minimize Button */}
          <button
            onClick={() => {
              playClick();
              setMinimized(true);
            }}
            className="hov k-squish"
            title="Minimize HUD to capsule"
            aria-label="Minimize HUD"
            style={{
              width: phone ? 32 : 28,
              height: phone ? 32 : 28,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              color: 'var(--tx3)',
              cursor: 'pointer',
            }}
          >
            <Icon name="collapse" size={12} color="var(--tx3)" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="hov k-squish"
              title="Close Timeline"
              aria-label="Close Timeline"
              style={{
                width: phone ? 32 : 28,
                height: phone ? 32 : 28,
                borderRadius: 6,
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              <Icon name="close" size={13} color="var(--tx3)" />
            </button>
          )}
        </div>
      </div>

      {/* Scrubber Range Slider with Step Track */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={activeIndex}
          onChange={(e) => {
            if (isPlaying) onPlayToggle();
            onStepChange(Number(e.target.value));
          }}
          aria-label="Execution scrubber"
          style={{
            width: '100%',
            accentColor: 'var(--acc)',
            height: 6,
            borderRadius: 3,
            cursor: 'pointer',
            outline: 'none',
          }}
        />

        {/* Milestone Dots for smaller step traces */}
        {totalSteps <= 28 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              // A button, not a span: these were 4px click targets with no
              // keyboard path and no role. The dot stays 4px visually while the
              // button pads out the hit area. 28 dots cannot each reach 44px on
              // a phone, so the range input above stays the primary control and
              // these are the coarse secondary one.
              <button
                key={i}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                aria-current={i === activeIndex ? 'true' : undefined}
                onClick={() => {
                  if (isPlaying) onPlayToggle();
                  onStepChange(i);
                }}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: phone ? 14 : 12,
                  height: phone ? 20 : 14,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: i === activeIndex ? 'var(--acc)' : i < activeIndex ? 'color-mix(in srgb, var(--acc) 50%, var(--tx3))' : 'var(--line2)',
                    transition: tint(150),
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Control Buttons Bar with Touch-Friendly Hit Areas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: phone ? 4 : 8 }}>
        {/* Jump to Start */}
        <button
          onClick={() => {
            playClick();
            onStepChange(0);
          }}
          disabled={activeIndex === 0}
          className="hov k-squish"
          title="Jump to Start (Step 1)"
          aria-label="Jump to Start"
          style={{
            minHeight: phone ? 36 : 32,
            padding: phone ? '0 8px' : '0 10px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            fontSize: 11,
            color: 'var(--tx2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            opacity: activeIndex === 0 ? 0.35 : 1,
          }}
        >
          <Icon name="back" size={11} color="var(--tx2)" />
          {!phone && <span style={{ fontSize: 10.5, fontWeight: 700 }}>Start</span>}
        </button>

        {/* Step Prev */}
        <button
          onClick={handleStepPrev}
          disabled={activeIndex === 0}
          className="hov k-squish"
          title="Step Backward"
          aria-label="Step Backward"
          style={{
            flex: phone ? 1 : 'none',
            minHeight: phone ? 38 : 34,
            padding: phone ? '0 8px' : '0 12px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            fontSize: phone ? 10.5 : 11,
            fontWeight: 700,
            color: 'var(--tx)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: activeIndex === 0 ? 0.35 : 1,
          }}
        >
          <Icon name="back" size={12} color="var(--tx)" />
          <span>Back</span>
        </button>

        {/* Play/Pause Main Button */}
        <button
          onClick={onPlayToggle}
          className="acc k-squish"
          title={isPlaying ? 'Pause Execution Trace' : 'Play Execution Trace'}
          aria-label={isPlaying ? 'Pause Execution Trace' : 'Play Execution Trace'}
          style={{
            flex: phone ? 1.4 : 'none',
            minHeight: phone ? 38 : 34,
            padding: phone ? '0 12px' : '0 20px',
            borderRadius: 9,
            background: 'var(--acc)',
            color: 'var(--ink)',
            fontSize: phone ? 11.5 : 12,
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0 4px 14px color-mix(in srgb, var(--acc) 40%, transparent)',
          }}
        >
          <Icon name={isPlaying ? 'minus' : 'play'} size={13} color="var(--ink)" />
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        {/* Step Next */}
        <button
          onClick={handleStepNext}
          disabled={activeIndex === totalSteps - 1}
          className="hov k-squish"
          title="Step Forward"
          aria-label="Step Forward"
          style={{
            flex: phone ? 1 : 'none',
            minHeight: phone ? 38 : 34,
            padding: phone ? '0 8px' : '0 12px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            fontSize: phone ? 10.5 : 11,
            fontWeight: 700,
            color: 'var(--tx)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            opacity: activeIndex === totalSteps - 1 ? 0.35 : 1,
          }}
        >
          <span>Next</span>
          <Icon name="back" size={12} color="var(--tx)" style={{ transform: 'rotate(180deg)' }} />
        </button>

        {/* Jump to End / Live Final State */}
        <button
          onClick={() => {
            playClick();
            onStepChange(null);
          }}
          className="hov k-squish"
          title="Jump to Final Live Output"
          aria-label="Jump to Final Live Output"
          style={{
            minHeight: phone ? 36 : 32,
            padding: phone ? '0 8px' : '0 10px',
            borderRadius: 8,
            border: `1px solid ${isFinalState ? 'var(--acc)' : 'var(--line2)'}`,
            background: isFinalState ? 'color-mix(in srgb, var(--acc) 22%, var(--card2))' : 'var(--card2)',
            color: isFinalState ? 'var(--accTx)' : 'var(--tx2)',
            fontSize: phone ? 10.5 : 11,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span>Live</span>
          <Icon name="back" size={11} color={isFinalState ? 'var(--accTx)' : 'var(--tx2)'} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>
    </div>
  );
}
