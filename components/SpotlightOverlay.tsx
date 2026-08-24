'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Mascot } from '@/components/challenges/Mascot';
import { useOverlayBack } from '@/lib/nav';
import { playTick, playCelebration } from '@/lib/audio';
import type { TabOnboardingConfig, OnboardingStep } from '@/lib/onboardingData';

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
    // Update immediately and again after scroll settles
    updateRect();
    const timer1 = setTimeout(updateRect, 100);
    const timer2 = setTimeout(updateRect, 400);

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
      if (e.key === 'ArrowRight') {
        if (!isLast) {
          playTick();
          setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
        } else {
          onFinish();
        }
      } else if (e.key === 'ArrowLeft') {
        if (!isFirst) {
          playTick();
          setStepIndex((i) => Math.max(0, i - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLast, isFirst, totalSteps, onFinish]);

  const handleNext = () => {
    playTick();
    if (isLast) {
      onFinish();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    playTick();
    setStepIndex((i) => Math.max(0, i - 1));
  };

  // Compute popover positioning relative to target rect
  const computePopoverStyle = (): React.CSSProperties => {
    const popoverWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? Math.min(window.innerWidth - 32, 420) : 460;

    if (!rect) {
      // Centered dialog fallback
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

    const placement = currentStep.placement || (rect.top > 350 ? 'top' : 'bottom');

    let top = 0;
    let left = 0;

    if (placement === 'bottom') {
      top = rect.top + rect.height + margin;
      left = Math.max(16, Math.min(windowWidth - popoverWidth - 16, rect.left + rect.width / 2 - popoverWidth / 2));
      // Adjust if overflows bottom
      if (top + 280 > windowHeight) {
        top = Math.max(16, rect.top - 280 - margin);
      }
    } else if (placement === 'top') {
      top = Math.max(16, rect.top - 320 - margin);
      left = Math.max(16, Math.min(windowWidth - popoverWidth - 16, rect.left + rect.width / 2 - popoverWidth / 2));
      // Adjust if overflows top
      if (top < 16) {
        top = rect.top + rect.height + margin;
      }
    } else if (placement === 'right') {
      left = rect.left + rect.width + margin;
      top = Math.max(16, Math.min(windowHeight - 320, rect.top));
      if (left + popoverWidth > windowWidth) {
        left = Math.max(16, rect.left - popoverWidth - margin);
      }
    } else {
      // left
      left = Math.max(16, rect.left - popoverWidth - margin);
      top = Math.max(16, Math.min(windowHeight - 320, rect.top));
      if (left < 16) {
        left = rect.left + rect.width + margin;
      }
    }

    return {
      position: 'fixed',
      top: Math.max(12, Math.min(windowHeight - 340, top)),
      left: Math.max(12, Math.min(windowWidth - popoverWidth - 12, left)),
      width: popoverWidth,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 9999,
      transition: 'top .28s cubic-bezier(.2,.8,.2,1), left .28s cubic-bezier(.2,.8,.2,1)',
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
            box-shadow: 0 0 0 0 color-mix(in srgb, ${config.accentColor} 80%, transparent), 0 0 24px color-mix(in srgb, ${config.accentColor} 50%, transparent);
          }
          70% {
            box-shadow: 0 0 0 16px transparent, 0 0 36px color-mix(in srgb, ${config.accentColor} 20%, transparent);
          }
          100% {
            box-shadow: 0 0 0 0 transparent, 0 0 24px color-mix(in srgb, ${config.accentColor} 50%, transparent);
          }
        }
        @keyframes pointer-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
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
            {/* White background reveals the dark backdrop */}
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {/* Black rectangle cuts out the target element */}
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

      {/* Pulsing Glowing Beacon Border over Target Element */}
      {rect && (
        <div
          onClick={handleNext}
          title="Click to advance tour"
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

      {/* Floating Anchored Character Companion Popover */}
      <div
        ref={popoverRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          ...computePopoverStyle(),
          background: 'var(--card)',
          border: `1.5px solid color-mix(in srgb, ${config.accentColor} 35%, var(--line2))`,
          borderRadius: 22,
          padding: '18px 20px',
          boxShadow: `0 20px 50px -10px rgba(0,0,0,.65), 0 0 28px color-mix(in srgb, ${config.accentColor} 22%, transparent)`,
          color: 'var(--tx)',
        }}
      >
        {/* Header with Mascot & Tour Info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: `color-mix(in srgb, ${config.accentColor} 20%, var(--card2))`,
                border: `1.5px solid color-mix(in srgb, ${config.accentColor} 45%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
                boxShadow: `0 4px 12px color-mix(in srgb, ${config.accentColor} 20%, transparent)`,
              }}
            >
              <Mascot id={config.tabId} animal={config.animal} size={32} mood={isLast ? 'celebrating' : 'keen'} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: `color-mix(in srgb, ${config.accentColor} 18%, transparent)`,
                    color: config.accentColor,
                  }}
                >
                  {config.tabTitle} Tour
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                  {stepIndex + 1}/{totalSteps}
                </span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)', marginTop: 1 }}>
                {config.characterName}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close tour"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
            }}
          >
            <Icon name="close" size={13} color="var(--tx2)" />
          </button>
        </div>

        {/* Step Highlight Card */}
        <div
          style={{
            background: 'var(--card2)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: `color-mix(in srgb, ${currentStep.color} 20%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
              }}
            >
              <Icon name={currentStep.icon as IconName} size={15} color={currentStep.color} />
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)', letterSpacing: '-.01em' }}>
                  {currentStep.title}
                </div>
                {currentStep.badge && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: 5,
                      background: `color-mix(in srgb, ${currentStep.color} 18%, transparent)`,
                      color: currentStep.color,
                    }}
                  >
                    {currentStep.badge}
                  </span>
                )}
              </div>
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.55, margin: '6px 0 10px' }}>
            {currentStep.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {currentStep.bulletPoints.map((pt, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 5,
                    background: `color-mix(in srgb, ${currentStep.color} 20%, transparent)`,
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                    marginTop: 1,
                  }}
                >
                  <Icon name="check" size={9} color={currentStep.color} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.4 }}>
                  {pt}
                </span>
              </div>
            ))}
          </div>

          {currentStep.proTip && (
            <div
              style={{
                background: 'color-mix(in srgb, var(--pal-amber) 10%, var(--card))',
                border: '1px solid color-mix(in srgb, var(--pal-amber) 20%, transparent)',
                borderRadius: 9,
                padding: '7px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
              }}
            >
              <Icon name="spark" size={13} color="var(--pal-amber)" />
              <span style={{ fontSize: 10.5, color: 'var(--tx)', fontWeight: 600 }}>
                {currentStep.proTip}
              </span>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {/* Step Dots */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {config.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  playTick();
                  setStepIndex(i);
                }}
                aria-label={`Step ${i + 1}`}
                style={{
                  width: i === stepIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === stepIndex ? config.accentColor : 'var(--line2)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all .25s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="hov k-squish"
                style={{
                  padding: '7px 12px',
                  borderRadius: 10,
                  background: 'var(--card2)',
                  border: '1px solid var(--line2)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--tx)',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            )}

            <button
              onClick={() => {
                onFinish();
              }}
              className="hov k-squish"
              title="Skip to finish and claim RP"
              style={{
                padding: '7px 10px',
                borderRadius: 10,
                background: 'transparent',
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              Skip to Finish
            </button>

            <button
              onClick={handleNext}
              className="acc k-squish"
              style={{
                padding: '7px 14px',
                borderRadius: 10,
                background: isLast ? 'var(--pal-amber)' : 'var(--acc)',
                color: 'var(--ink)',
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: isLast ? '0 4px 14px rgba(255,194,75,.35)' : 'var(--sh)',
              }}
            >
              {isLast ? (
                <>
                  <Icon name="trophy" size={13} color="var(--ink)" />
                  Finish & Claim +15 RP
                </>
              ) : (
                <>
                  Next
                  <Icon name="plus" size={11} color="var(--ink)" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
