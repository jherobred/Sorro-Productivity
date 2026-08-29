'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Mascot } from '@/components/challenges/Mascot';
import { useOverlayBack } from '@/lib/nav';
import { playTick, playCelebration } from '@/lib/audio';
import type { TabOnboardingConfig } from '@/lib/onboardingData';

export function SpotlightOverlay({
  config,
  onClose,
  onFinish,
}: {
  config: TabOnboardingConfig;
  onClose: () => void;
  onFinish: () => void;
}) {
  useOverlayBack(true, onClose);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const totalSteps = config.steps.length;
  const currentStep = config.steps[stepIndex] || config.steps[0];
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;

  // Track target element bounding rect
  const updateRect = useCallback(() => {
    if (!currentStep.targetSelector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(currentStep.targetSelector);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    } else {
      setRect(null);
    }
  }, [currentStep]);

  // Scroll target element into view and update rect on step change
  useEffect(() => {
    if (currentStep.targetSelector) {
      const el = document.querySelector(currentStep.targetSelector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
    updateRect();
    const timer1 = setTimeout(updateRect, 100);
    const timer2 = setTimeout(updateRect, 350);

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [currentStep, updateRect]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        executeTaskAndAdvance();
      } else if (e.key === 'ArrowLeft') {
        if (!isFirst) {
          playTick();
          setStepIndex((i) => Math.max(0, i - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Actually perform the action on the target DOM element
  const executeTaskAndAdvance = () => {
    if (currentStep.targetSelector) {
      const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
      if (el) {
        // Trigger click or focus on the real target element
        try {
          el.focus();
          el.click();
        } catch { /* ignore */ }
      }
    }

    setTaskFeedback('Step Completed!');
    playTick();

    setTimeout(() => {
      setTaskFeedback(null);
      if (isLast) {
        playCelebration();
        onFinish();
      } else {
        setStepIndex((i) => i + 1);
      }
    }, 380);
  };

  const handlePrev = () => {
    playTick();
    setStepIndex((i) => Math.max(0, i - 1));
  };

  // Compute popover positioning relative to target rect
  const computePopoverStyle = (): React.CSSProperties => {
    const popoverWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? Math.min(window.innerWidth - 32, 380) : 400;

    if (!rect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: popoverWidth,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 9999,
      };
    }

    const margin = 16;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    const placement = currentStep.placement || (rect.top > 320 ? 'top' : 'bottom');

    let top = 0;
    let left = 0;

    if (placement === 'bottom') {
      top = rect.top + rect.height + margin;
      left = Math.max(16, Math.min(windowWidth - popoverWidth - 16, rect.left + rect.width / 2 - popoverWidth / 2));
      if (top + 220 > windowHeight) {
        top = Math.max(16, rect.top - 220 - margin);
      }
    } else if (placement === 'top') {
      top = Math.max(16, rect.top - 240 - margin);
      left = Math.max(16, Math.min(windowWidth - popoverWidth - 16, rect.left + rect.width / 2 - popoverWidth / 2));
      if (top < 16) {
        top = rect.top + rect.height + margin;
      }
    } else if (placement === 'right') {
      left = rect.left + rect.width + margin;
      top = Math.max(16, Math.min(windowHeight - 240, rect.top));
      if (left + popoverWidth > windowWidth) {
        left = Math.max(16, rect.left - popoverWidth - margin);
      }
    } else {
      left = Math.max(16, rect.left - popoverWidth - margin);
      top = Math.max(16, Math.min(windowHeight - 240, rect.top));
      if (left < 16) {
        left = rect.left + rect.width + margin;
      }
    }

    return {
      position: 'fixed',
      top: Math.max(12, Math.min(windowHeight - 260, top)),
      left: Math.max(12, Math.min(windowWidth - popoverWidth - 12, left)),
      width: popoverWidth,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 9999,
      transition: 'top .25s cubic-bezier(.2,.8,.2,1), left .25s cubic-bezier(.2,.8,.2,1)',
    };
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes beacon-pulse {
          0% {
            box-shadow: 0 0 0 0 color-mix(in srgb, ${config.accentColor} 80%, transparent), 0 0 20px color-mix(in srgb, ${config.accentColor} 45%, transparent);
          }
          70% {
            box-shadow: 0 0 0 14px transparent, 0 0 32px color-mix(in srgb, ${config.accentColor} 20%, transparent);
          }
          100% {
            box-shadow: 0 0 0 0 transparent, 0 0 20px color-mix(in srgb, ${config.accentColor} 45%, transparent);
          }
        }
      `}</style>

      {/* SVG Backdrop Cutout Mask */}
      <svg
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9991,
          pointerEvents: 'auto',
          cursor: 'pointer',
        }}
      >
        <defs>
          <mask id="bd-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {rect && (
              <rect
                x={rect.left - 6}
                y={rect.top - 6}
                width={rect.width + 12}
                height={rect.height + 12}
                rx="14"
                ry="14"
                fill="#000"
              />
            )}
          </mask>
        </defs>

        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(4, 6, 12, 0.78)"
          mask="url(#bd-spotlight-mask)"
        />
      </svg>

      {/* Pulsing Beacon Ring over Target Element */}
      {rect && (
        <div
          onClick={executeTaskAndAdvance}
          title="Click to interact"
          style={{
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 14,
            border: `2px solid ${config.accentColor}`,
            animation: 'beacon-pulse 2s infinite cubic-bezier(.2,.8,.2,1)',
            zIndex: 9995,
            pointerEvents: 'auto',
            cursor: 'pointer',
            background: 'transparent',
          }}
        />
      )}

      {/* Compact Interactive Character Popover */}
      <div
        ref={popoverRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          ...computePopoverStyle(),
          background: 'var(--card)',
          border: `1.5px solid color-mix(in srgb, ${config.accentColor} 40%, var(--line2))`,
          borderRadius: 20,
          padding: '14px 16px',
          boxShadow: `0 16px 40px -8px rgba(0,0,0,.65), 0 0 24px color-mix(in srgb, ${config.accentColor} 20%, transparent)`,
          color: 'var(--tx)',
        }}
      >
        {/* Header with Mascot & Step Counter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `color-mix(in srgb, ${config.accentColor} 20%, var(--card2))`,
                border: `1px solid color-mix(in srgb, ${config.accentColor} 40%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
              }}
            >
              <Mascot id={config.tabId} animal={config.animal} size={28} mood={isLast ? 'celebrating' : 'keen'} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>
                  {currentStep.title}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: `color-mix(in srgb, ${config.accentColor} 18%, transparent)`,
                    color: config.accentColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {stepIndex + 1}/{totalSteps}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close tour"
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
            }}
          >
            <Icon name="close" size={12} color="var(--tx2)" />
          </button>
        </div>

        {/* Short, Punchy Description */}
        <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.45, margin: '4px 0 10px' }}>
          {currentStep.description}
        </p>

        {/* Action Prompt Pill */}
        {currentStep.actionPrompt && (
          <div
            style={{
              background: 'color-mix(in srgb, var(--pal-amber) 12%, var(--card2))',
              border: '1px solid color-mix(in srgb, var(--pal-amber) 30%, transparent)',
              borderRadius: 9,
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
            }}
          >
            <Icon name="spark" size={13} color="var(--pal-amber)" />
            <span style={{ fontSize: 11, color: 'var(--tx)', fontWeight: 700 }}>
              {currentStep.actionPrompt}
            </span>
          </div>
        )}

        {/* Instant Task Completion Feedback */}
        {taskFeedback && (
          <div
            className="fade"
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--pal-amber)',
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            ✨ {taskFeedback}
          </div>
        )}

        {/* Controls Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Step Dots */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {config.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  playTick();
                  setStepIndex(i);
                }}
                aria-label={`Step ${i + 1}`}
                style={{
                  width: i === stepIndex ? 14 : 5,
                  height: 5,
                  borderRadius: 3,
                  background: i === stepIndex ? config.accentColor : 'var(--line2)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all .2s ease',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="hov k-squish"
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'var(--card2)',
                  border: '1px solid var(--line2)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--tx)',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            )}

            {/* Interactive "Do Task & Advance" Button */}
            <button
              onClick={executeTaskAndAdvance}
              className="acc k-squish"
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: isLast ? 'var(--pal-amber)' : 'var(--acc)',
                color: '#0A0912',
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: isLast ? '0 4px 12px rgba(255,194,75,.35)' : 'var(--sh)',
              }}
            >
              {isLast ? (
                <>
                  <Icon name="trophy" size={13} color="#0A0912" />
                  Finish Tour
                </>
              ) : (
                <>
                  {currentStep.actionLabel || 'Try It & Next'}
                  <Icon name="plus" size={11} color="#0A0912" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
