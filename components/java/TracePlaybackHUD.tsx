'use client';

import { useState } from 'react';
import { Icon } from '../Icon';
import { playClick, playTick } from '@/lib/audio';
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
}

export function TracePlaybackHUD({
  result,
  currentStepIndex,
  isPlaying,
  onPlayToggle,
  onStepChange,
  speed,
  onSpeedChange,
  onClose,
}: TracePlaybackHUDProps) {
  const [minimized, setMinimized] = useState(false);
  const totalSteps = result.trace.length;
  if (totalSteps <= 1) return null;

  const activeIndex = currentStepIndex ?? totalSteps - 1;
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

  const speeds = [0.5, 1, 2, 4];
  const cycleSpeed = () => {
    playClick();
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    onSpeedChange(next);
  };

  if (minimized) {
    return (
      <div
        style={{
          position: 'sticky',
          bottom: 14,
          alignSelf: 'center',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 20,
          background: 'var(--card2)',
          border: '1px solid var(--line2)',
          boxShadow: 'var(--shl)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <button
          onClick={onPlayToggle}
          className="k-squish"
          title={isPlaying ? 'Pause' : 'Play execution trace'}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--acc)',
            color: 'var(--ink)',
            border: 'none',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name={isPlaying ? 'minus' : 'play'} size={11} color="var(--ink)" />
        </button>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>
          Step {activeIndex + 1}/{totalSteps}
        </span>
        <button
          onClick={() => setMinimized(false)}
          className="hov k-squish"
          title="Expand Playback HUD"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--tx3)',
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name="chev" size={13} color="var(--tx3)" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="k-bloom"
      style={{
        position: 'sticky',
        bottom: 12,
        alignSelf: 'center',
        zIndex: 40,
        width: '100%',
        maxWidth: 580,
        borderRadius: 16,
        background: 'color-mix(in srgb, var(--card) 92%, transparent)',
        border: '1px solid color-mix(in srgb, var(--acc) 30%, var(--line2))',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--acc) 14%, transparent)',
        backdropFilter: 'blur(16px)',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Top Meta Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isPlaying ? 'var(--pal-mint)' : 'var(--pal-amber)',
              boxShadow: isPlaying ? '0 0 8px var(--pal-mint)' : 'none',
              transition: 'background .2s',
            }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>
            {currentStepIndex === null ? 'Execution Finished' : `Step ${activeIndex + 1} of ${totalSteps}`}
          </span>
          {currentStep?.note && (
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--tx3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 240,
              }}
            >
              · {currentStep.note}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Speed Toggle */}
          <button
            onClick={cycleSpeed}
            className="hov k-squish"
            title="Playback Speed"
            style={{
              padding: '2px 7px',
              borderRadius: 6,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--tx2)',
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {speed}x
          </button>

          {/* Minimize */}
          <button
            onClick={() => setMinimized(true)}
            className="hov k-squish"
            title="Minimize HUD"
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx3)',
              cursor: 'pointer',
            }}
          >
            <Icon name="minus" size={12} color="var(--tx3)" />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="hov k-squish"
              title="Close Timeline"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              <Icon name="close" size={12} color="var(--tx3)" />
            </button>
          )}
        </div>
      </div>

      {/* Scrubber Range Track */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            flex: 1,
            accentColor: 'var(--acc)',
            height: 5,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        />
      </div>

      {/* Control Buttons Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {/* Jump to Start */}
        <button
          onClick={() => {
            playClick();
            onStepChange(0);
          }}
          className="hov k-squish"
          title="Jump to Start"
          style={{
            padding: '4px 8px',
            borderRadius: 7,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            fontSize: 11,
            color: 'var(--tx2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon name="back" size={12} color="var(--tx2)" />
        </button>

        {/* Step Prev */}
        <button
          onClick={handleStepPrev}
          disabled={activeIndex === 0}
          className="hov k-squish"
          title="Step Backward"
          style={{
            padding: '5px 12px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--tx)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: activeIndex === 0 ? 0.4 : 1,
          }}
        >
          <Icon name="back" size={12} color="var(--tx)" />
          <span>Step Back</span>
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={onPlayToggle}
          className="acc k-squish"
          title={isPlaying ? 'Pause Execution' : 'Play Execution'}
          style={{
            padding: '6px 18px',
            borderRadius: 9,
            background: 'var(--acc)',
            color: 'var(--ink)',
            fontSize: 12,
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 14px color-mix(in srgb, var(--acc) 40%, transparent)',
          }}
        >
          <Icon name={isPlaying ? 'minus' : 'play'} size={13} color="var(--ink)" />
          <span>{isPlaying ? 'Pause' : 'Play Trace'}</span>
        </button>

        {/* Step Next */}
        <button
          onClick={handleStepNext}
          disabled={activeIndex === totalSteps - 1}
          className="hov k-squish"
          title="Step Forward"
          style={{
            padding: '5px 12px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--tx)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: activeIndex === totalSteps - 1 ? 0.4 : 1,
          }}
        >
          <span>Step Next</span>
          <Icon name="back" size={12} color="var(--tx)" style={{ transform: 'rotate(180deg)' }} />
        </button>

        {/* Jump to End / Live Final State */}
        <button
          onClick={() => {
            playClick();
            onStepChange(null);
          }}
          className="hov k-squish"
          title="Jump to Final Output"
          style={{
            padding: '4px 8px',
            borderRadius: 7,
            border: '1px solid var(--line2)',
            background: currentStepIndex === null ? 'color-mix(in srgb, var(--acc) 20%, var(--card2))' : 'var(--card2)',
            color: currentStepIndex === null ? 'var(--accTx)' : 'var(--tx2)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Final
        </button>
      </div>
    </div>
  );
}
