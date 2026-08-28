'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/Icon';
import { AlligatorDealer } from './AlligatorDealer';

export type CasinoAgeGateProps = {
  onVerify: () => void;
  onExit: () => void;
};

export function CasinoAgeGate({ onVerify, onExit }: CasinoAgeGateProps) {
  const [agreedAge, setAgreedAge] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  const canProceed = agreedAge && agreedTerms;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 12, 0.88)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'linear-gradient(180deg, #101622 0%, #0A0D15 100%)',
          borderRadius: 24,
          border: '1.5px solid color-mix(in srgb, var(--pal-emerald) 40%, transparent)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8), 0 0 30px color-mix(in srgb, var(--pal-emerald) 15%, transparent)',
          padding: '28px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          color: 'var(--tx)',
        }}
      >
        {/* Animated Gator Dealer in Header */}
        <AlligatorDealer mood="taunt" speech="Hold up, partner! Show me your badge before entering the high-stakes swamp!" />

        <div style={{ margin: '14px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
              color: 'var(--pal-amber)',
              border: '1px solid color-mix(in srgb, var(--pal-amber) 40%, transparent)',
            }}
          >
            18+ Compliance & Legal Notice
          </span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', margin: '4px 0 8px', color: '#FFFFFF' }}>
          Welcome to Basedly High-Stakes Casino
        </h2>

        <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.5, margin: '0 0 16px', maxWidth: 440 }}>
          Basedly Casino is an interactive entertainment simulation featuring real-world Bayou Blackjack and the Merramun 6x5 Deep Web Slot Machine.
          Games utilize simulated DOS Coins exchanged from your gamified Reward Points (RP).
        </p>

        {/* Legal Disclaimer Box */}
        <div
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '12px 14px',
            textAlign: 'left',
            fontSize: 11.5,
            color: 'var(--tx3)',
            lineHeight: 1.45,
            marginBottom: 18,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--tx)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="spark" size={13} color="var(--pal-amber)" />
            Virtual Entertainment Disclaimer
          </div>
          • No real fiat currency, crypto deposits, or monetary wagering are used or accepted.
          <br />
          • RP (Reward Points) are internal gamification rewards earned from productivity challenges and daily habits.
          <br />
          • You must be of legal age (18+ or 21+ where applicable) to enter simulated casino environments.
        </div>

        {/* Checkbox Agreements */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--tx)',
            }}
          >
            <input
              type="checkbox"
              checked={agreedAge}
              onChange={(e) => setAgreedAge(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--pal-emerald)', cursor: 'pointer', flex: 'none' }}
            />
            <span>I certify that I am at least 18 years of age (or legal gambling age in my jurisdiction).</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--tx)',
            }}
          >
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--pal-emerald)', cursor: 'pointer', flex: 'none' }}
            />
            <span>I acknowledge this is a virtual simulator with no real money value.</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ width: '100%', display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onExit}
            className="hov k-squish"
            style={{
              flex: 1,
              padding: '11px 16px',
              borderRadius: 12,
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              color: 'var(--tx2)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Exit to Community
          </button>
          <button
            type="button"
            disabled={!canProceed}
            onClick={onVerify}
            className="k-squish"
            style={{
              flex: 1.5,
              padding: '11px 18px',
              borderRadius: 12,
              background: canProceed
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : 'rgba(255,255,255,0.08)',
              border: canProceed ? '1px solid #34D399' : '1px solid transparent',
              color: canProceed ? '#0A0912' : 'var(--tx3)',
              fontSize: 13.5,
              fontWeight: 800,
              boxShadow: canProceed ? '0 4px 20px rgba(16, 185, 129, 0.4)' : 'none',
              cursor: canProceed ? 'pointer' : 'not-allowed',
              opacity: canProceed ? 1 : 0.6,
            }}
          >
            Verify & Enter Casino 🐊
          </button>
        </div>
      </motion.div>
    </div>
  );
}
