'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Mascot } from '@/components/challenges/Mascot';
import { useOverlayBack } from '@/lib/nav';
import { playTick, playCelebration } from '@/lib/audio';
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
  const [stepIndex, setStepIndex] = useState(0);

  const totalSteps = config.steps.length;
  const currentStep = config.steps[stepIndex] || config.steps[0];
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;

  const handleNext = () => {
    playTick();
    if (isLast) {
      playCelebration();
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
        zIndex: 9998,
        background: 'rgba(4, 6, 12, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${config.tabTitle} Tour`}
        className="k-bloom navsb"
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--card)',
          border: `1.5px solid color-mix(in srgb, ${config.accentColor} 40%, var(--line2))`,
          borderRadius: 22,
          padding: '22px 24px',
          boxShadow: `0 24px 60px -12px rgba(0,0,0,.7), 0 0 32px color-mix(in srgb, ${config.accentColor} 20%, transparent)`,
          color: 'var(--tx)',
        }}
      >
        {/* Header with Mascot & Tour Info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: `color-mix(in srgb, ${config.accentColor} 20%, var(--card2))`,
                border: `1.5px solid color-mix(in srgb, ${config.accentColor} 45%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
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
                <span style={{ fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                  {stepIndex + 1}/{totalSteps}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)', marginTop: 2 }}>
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

        {/* Current Step Content Box */}
        <div
          style={{
            background: 'var(--card2)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '16px 18px',
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: `color-mix(in srgb, ${currentStep.color} 20%, transparent)`,
                display: 'grid',
                placeItems: 'center',
                flex: 'none',
              }}
            >
              <Icon name={currentStep.icon as IconName} size={16} color={currentStep.color} />
            </div>

            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)' }}>
                {currentStep.title}
              </div>
            </div>
          </div>

          <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5, margin: '6px 0 12px' }}>
            {currentStep.description}
          </p>

          {currentStep.actionPrompt && (
            <div
              style={{
                background: 'color-mix(in srgb, var(--pal-amber) 12%, var(--card))',
                border: '1px solid color-mix(in srgb, var(--pal-amber) 30%, transparent)',
                borderRadius: 9,
                padding: '7px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="spark" size={13} color="var(--pal-amber)" />
              <span style={{ fontSize: 11, color: 'var(--tx)', fontWeight: 700 }}>
                {currentStep.actionPrompt}
              </span>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
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
                  width: i === stepIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === stepIndex ? config.accentColor : 'var(--line2)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all .25s ease',
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
                  padding: '6px 12px',
                  borderRadius: 9,
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
              onClick={handleNext}
              className="acc k-squish"
              style={{
                padding: '6px 14px',
                borderRadius: 9,
                background: isLast ? 'var(--pal-amber)' : 'var(--acc)',
                color: '#0A0912',
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
                  <Icon name="trophy" size={13} color="#0A0912" />
                  Finish (+15 RP)
                </>
              ) : (
                <>
                  Next
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
