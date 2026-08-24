'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { Mascot } from '@/components/challenges/Mascot';
import { useOverlayBack } from '@/lib/nav';
import { playTick } from '@/lib/audio';
import type { TabOnboardingConfig } from '@/lib/onboardingData';

export function TabOnboardingModal({
  config,
  onClose,
  onFinish,
}: {
  config: TabOnboardingConfig;
  onClose: () => void;
  onFinish: () => void;
}) {
  useOverlayBack(true, onClose);
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  const totalSteps = config.steps.length;
  const currentStep = config.steps[stepIndex] || config.steps[0];
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (!isLast) {
          playTick();
          setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
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
  }, [isLast, isFirst, totalSteps]);

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,.72)',
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
        className="k-bloom navsb"
        style={{
          width: 580,
          maxWidth: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
          background: 'var(--card)',
          border: `1.5px solid color-mix(in srgb, ${config.accentColor} 30%, var(--line2))`,
          borderRadius: 24,
          padding: 24,
          boxShadow: `0 24px 60px -12px rgba(0,0,0,.5), 0 0 32px color-mix(in srgb, ${config.accentColor} 20%, transparent)`,
          position: 'relative',
        }}
      >
        {/* Top Header with Character Mascot & Tab Tag */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 16,
                background: `color-mix(in srgb, ${config.accentColor} 22%, var(--card2))`,
                border: `1.5px solid color-mix(in srgb, ${config.accentColor} 50%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
                boxShadow: `0 4px 16px color-mix(in srgb, ${config.accentColor} 25%, transparent)`,
              }}
            >
              <Mascot id={config.tabId} animal={config.animal} size={38} mood={isLast ? 'celebrating' : 'keen'} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: `color-mix(in srgb, ${config.accentColor} 18%, transparent)`,
                    color: config.accentColor,
                  }}
                >
                  {config.tabTitle} Tour
                </span>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  {stepIndex + 1} of {totalSteps}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)', marginTop: 2 }}>
                {config.characterName}
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close tour"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
            }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* Character Dialogue Speech Bubble */}
        <div
          style={{
            background: `color-mix(in srgb, ${config.accentColor} 10%, var(--card2))`,
            border: `1px solid color-mix(in srgb, ${config.accentColor} 25%, var(--line))`,
            borderRadius: 16,
            padding: '12px 16px',
            marginBottom: 20,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--tx)', lineHeight: 1.5 }}>
            “{config.greeting}”
          </div>
        </div>

        {/* Current Step Content Box */}
        <div
          style={{
            background: 'var(--card2)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            padding: '18px 20px',
            marginBottom: 20,
          }}
        >
          {/* Step Title & Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: `color-mix(in srgb, ${currentStep.color} 20%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
              }}
            >
              <Icon name={currentStep.icon as IconName} size={18} color={currentStep.color} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                  {currentStep.title}
                </h3>
                {currentStep.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: `color-mix(in srgb, ${currentStep.color} 18%, transparent)`,
                      color: currentStep.color,
                    }}
                  >
                    {currentStep.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{currentStep.subtitle}</div>
            </div>
          </div>

          {/* Description */}
          <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.6, margin: '10px 0 14px' }}>
            {currentStep.description}
          </p>

          {/* Feature Bullet Points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {currentStep.bulletPoints.map((pt, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    background: `color-mix(in srgb, ${currentStep.color} 20%, transparent)`,
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                    marginTop: 2,
                  }}
                >
                  <Icon name="check" size={11} color={currentStep.color} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.5 }}>
                  {pt}
                </span>
              </div>
            ))}
          </div>

          {/* Pro-Tip Box */}
          {currentStep.proTip && (
            <div
              style={{
                background: 'color-mix(in srgb, var(--pal-amber) 12%, var(--card))',
                border: '1px solid color-mix(in srgb, var(--pal-amber) 25%, transparent)',
                borderRadius: 12,
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
              }}
            >
              <Icon name="spark" size={14} color="var(--pal-amber)" />
              <span style={{ fontSize: 11.5, color: 'var(--tx)', fontWeight: 600 }}>
                <strong>Pro-Tip:</strong> {currentStep.proTip}
              </span>
            </div>
          )}

          {/* Shortcut Banner */}
          {currentStep.shortcut && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                fontSize: 11,
                color: 'var(--tx3)',
              }}
            >
              <Icon name="clock" size={12} color="var(--tx3)" />
              <span>Keyboard Shortcut:</span>
              <kbd
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: 'var(--tx)',
                }}
              >
                {currentStep.shortcut}
              </kbd>
            </div>
          )}
        </div>

        {/* Footer Navigation & Progress Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {config.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  playTick();
                  setStepIndex(i);
                }}
                aria-label={`Go to step ${i + 1}`}
                style={{
                  width: i === stepIndex ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="hov k-squish"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  background: 'var(--card2)',
                  border: '1px solid var(--line2)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--tx)',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
            )}

            <button
              onClick={onClose}
              className="hov k-squish"
              style={{
                padding: '9px 14px',
                borderRadius: 12,
                background: 'transparent',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              Skip
            </button>

            <button
              onClick={handleNext}
              className="acc k-squish"
              style={{
                padding: '9px 18px',
                borderRadius: 12,
                background: isLast ? 'var(--pal-amber)' : 'var(--acc)',
                color: 'var(--ink)',
                fontSize: 12.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: isLast ? '0 4px 16px rgba(255,194,75,.35)' : 'var(--sh)',
              }}
            >
              {isLast ? (
                <>
                  <Icon name="trophy" size={14} color="var(--ink)" />
                  Finish & Claim +15 RP
                </>
              ) : (
                <>
                  Next
                  <Icon name="plus" size={13} color="var(--ink)" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
