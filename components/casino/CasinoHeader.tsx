'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/Icon';
import { RP_EXCHANGE_RATE } from '@/lib/casino';
import { toast } from '@/lib/toast';
import { playCelebration, playClick } from '@/lib/audio';

export type CasinoHeaderProps = {
  credits: number;
  currentRp: number;
  depositRp: (amount: number) => Promise<boolean>;
  withdrawToRp: (amount: number) => Promise<boolean>;
  claimFreeFaucet: () => void;
  activeGame: 'blackjack' | 'slots';
  setActiveGame: (g: 'blackjack' | 'slots') => void;
};

export function CasinoHeader({
  credits,
  currentRp,
  depositRp,
  withdrawToRp,
  claimFreeFaucet,
  activeGame,
  setActiveGame,
}: CasinoHeaderProps) {
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeMode, setExchangeMode] = useState<'rp_to_dos' | 'dos_to_rp'>('rp_to_dos');
  const [rpInput, setRpInput] = useState('10');
  const [dosInput, setDosInput] = useState('1000');
  const [submitting, setSubmitting] = useState(false);

  const handleExchange = async () => {
    if (exchangeMode === 'rp_to_dos') {
      const num = parseInt(rpInput, 10);
      if (isNaN(num) || num <= 0) {
        toast('Enter a valid RP amount');
        return;
      }
      if (num > currentRp) {
        toast(`Insufficient RP (Available: ${currentRp} RP)`);
        return;
      }
      setSubmitting(true);
      const ok = await depositRp(num);
      setSubmitting(false);
      if (ok) {
        playCelebration();
        toast(`Exchanged ${num} RP for ${(num * RP_EXCHANGE_RATE).toLocaleString()} DOS Coins! 🪙`);
        setExchangeOpen(false);
      } else {
        toast('Exchange failed');
      }
    } else {
      const num = parseInt(dosInput, 10);
      if (isNaN(num) || num < RP_EXCHANGE_RATE) {
        toast(`Minimum withdrawal is ${RP_EXCHANGE_RATE} DOS Coins (1 RP)`);
        return;
      }
      if (num > credits) {
        toast(`Insufficient DOS Coins (Available: ${credits.toLocaleString()})`);
        return;
      }
      setSubmitting(true);
      const ok = await withdrawToRp(num);
      setSubmitting(false);
      if (ok) {
        playCelebration();
        const rpEarned = Math.floor(num / RP_EXCHANGE_RATE);
        toast(`Exchanged ${num.toLocaleString()} DOS Coins for +${rpEarned} RP! 🏆`);
        setExchangeOpen(false);
      } else {
        toast('Withdrawal failed');
      }
    }
  };

  return (
    <div className="w-full flex flex-col gap-3 select-none">
      {/* BitHit & Casino Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
          borderRadius: 18,
          background: 'linear-gradient(135deg, #090D14 0%, #05080E 100%)',
          border: '1.5px solid #1E293B',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
        }}
      >
        {/* Left: Brand Identity & Game Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🐊</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', color: '#FFFFFF' }}>
                  GATOR STAKE
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: '#10B981',
                    color: '#051E13',
                  }}
                >
                  Deep Casino
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: '#64748B', fontWeight: 600 }}>
                Powered by BitHit DOS Coin Network
              </div>
            </div>
          </div>

          {/* Game Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              padding: 3,
              borderRadius: 10,
              background: '#0B111D',
              border: '1px solid #1E293B',
            }}
          >
            <button
              type="button"
              onClick={() => {
                playClick();
                setActiveGame('blackjack');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all .2s ease',
                background: activeGame === 'blackjack' ? '#10B981' : 'transparent',
                color: activeGame === 'blackjack' ? '#041B11' : '#94A3B8',
                boxShadow: activeGame === 'blackjack' ? '0 2px 12px rgba(16, 185, 129, 0.4)' : 'none',
              }}
            >
              <span>♠</span>
              <span>Bayou Blackjack</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playClick();
                setActiveGame('slots');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all .2s ease',
                background: activeGame === 'slots' ? '#D4AF37' : 'transparent',
                color: activeGame === 'slots' ? '#1A1204' : '#94A3B8',
                boxShadow: activeGame === 'slots' ? '0 2px 12px rgba(212, 175, 55, 0.4)' : 'none',
              }}
            >
              <span>🌙</span>
              <span>Merramun 6x5 Slots</span>
            </button>
          </div>
        </div>

        {/* Right: BitHit DOS Coin Balances & Exchange */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Daily BitHit Faucet Button */}
          <button
            type="button"
            onClick={() => {
              playCelebration();
              claimFreeFaucet();
              toast('+500 DOS Coin Faucet Claimed! 🎁');
            }}
            className="hov k-squish"
            title="Claim 500 Free DOS Coins"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#FCD34D',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Icon name="spark" size={12} color="#FCD34D" />
            <span>+500 DOS Faucet</span>
          </button>

          {/* RP Balance Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 10,
              background: '#0B111D',
              border: '1px solid #1E293B',
              fontSize: 11.5,
              fontWeight: 700,
              color: '#94A3B8',
            }}
          >
            <span style={{ color: 'var(--pal-violet)', fontWeight: 900 }}>RP:</span>
            <span style={{ color: '#F8FAFC', fontVariantNumeric: 'tabular-nums' }}>{currentRp}</span>
          </div>

          {/* DOS Coin Wallet Balance */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(180, 83, 9, 0.1) 100%)',
              border: '1.5px solid #D4AF37',
              boxShadow: '0 0 15px rgba(212, 175, 55, 0.25)',
              fontSize: 13.5,
              fontWeight: 900,
              color: '#FFFFFF',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ color: '#FDE047' }}>🪙</span>
            <span>{credits.toLocaleString()}</span>
            <span style={{ fontSize: 9.5, color: '#FDE047', textTransform: 'uppercase', letterSpacing: '.06em' }}>DOS Coin</span>
          </div>

          {/* BitHit Exchange Modal Trigger Button */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setExchangeOpen(true);
            }}
            className="k-squish"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: '1px solid #34D399',
              color: '#051E13',
              fontSize: 12,
              fontWeight: 900,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            <span>🟢</span>
            <span>BitHit Exchange</span>
          </button>
        </div>
      </div>

      {/* BitHit Window Exchange Modal (Welcome to the Game Authentic UI) */}
      <AnimatePresence>
        {exchangeOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              style={{
                width: '100%',
                maxWidth: 440,
                background: '#0B0F15',
                borderRadius: 12,
                border: '1.5px solid #1E293B',
                boxShadow: '0 24px 60px rgba(0,0,0,0.9), 0 0 30px rgba(16, 185, 129, 0.15)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* BitHit Classic Window Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#070A0F',
                  borderBottom: '1px solid #1E293B',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#22C55E', fontSize: 14 }}>🟢</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#F8FAFC', letterSpacing: '.04em' }}>BitHit</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setExchangeOpen(false)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid #334155',
                      color: '#94A3B8',
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* BitHit Wallet Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  background: '#0E141E',
                  borderBottom: '1px solid #1E293B',
                  fontSize: 12,
                  color: '#4ADE80',
                  fontWeight: 800,
                }}
              >
                <span>Wallet</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ color: '#FDE047' }}>🪙 {credits.toLocaleString()} DOS</span>
                  <span style={{ color: '#A78BFA' }}>⚙️ {currentRp} RP</span>
                </div>
              </div>

              {/* BitHit Exchange Form */}
              <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Rate Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 13.5,
                    fontWeight: 900,
                    color: '#F8FAFC',
                    fontFamily: 'monospace',
                  }}
                >
                  <span>1 RP = {RP_EXCHANGE_RATE} DOS Coin</span>
                  <button
                    type="button"
                    onClick={() => setExchangeMode(exchangeMode === 'rp_to_dos' ? 'dos_to_rp' : 'rp_to_dos')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: '#22C55E',
                      color: '#052E16',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    ⇄ Flip
                  </button>
                </div>

                {/* Amount Input */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 6 }}>
                    {exchangeMode === 'rp_to_dos' ? 'Deposit Amount (RP)' : 'Withdraw Amount (DOS Coin)'}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      value={exchangeMode === 'rp_to_dos' ? rpInput : dosInput}
                      onChange={(e) => {
                        if (exchangeMode === 'rp_to_dos') setRpInput(e.target.value);
                        else setDosInput(e.target.value);
                      }}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: '#05070B',
                        border: '1px solid #334155',
                        color: '#F8FAFC',
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 10,
                        fontSize: 11,
                        fontWeight: 900,
                        color: exchangeMode === 'rp_to_dos' ? '#A78BFA' : '#FDE047',
                      }}
                    >
                      {exchangeMode === 'rp_to_dos' ? 'RP' : '🪙 DOS Coin'}
                    </span>
                  </div>
                </div>

                {/* Result Display */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 6 }}>
                    Result
                  </div>
                  <div
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#05070B',
                      border: '1px solid #1E293B',
                      color: exchangeMode === 'rp_to_dos' ? '#4ADE80' : '#A78BFA',
                      fontSize: 14,
                      fontWeight: 900,
                      fontFamily: 'monospace',
                    }}
                  >
                    {exchangeMode === 'rp_to_dos'
                      ? `${((parseInt(rpInput, 10) || 0) * RP_EXCHANGE_RATE).toLocaleString()} DOS Coin`
                      : `${Math.floor((parseInt(dosInput, 10) || 0) / RP_EXCHANGE_RATE)} RP`}
                  </div>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {exchangeMode === 'rp_to_dos'
                    ? [10, 25, 50, 100, currentRp].map((amt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setRpInput(String(Math.max(1, amt)))}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#1E293B',
                            border: '1px solid #334155',
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: '#CBD5E1',
                            cursor: 'pointer',
                          }}
                        >
                          {amt === currentRp ? 'Max RP' : `+${amt} RP`}
                        </button>
                      ))
                    : [1000, 2500, 5000, 10000, credits].map((amt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setDosInput(String(Math.max(100, amt)))}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: '#1E293B',
                            border: '1px solid #334155',
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: '#CBD5E1',
                            cursor: 'pointer',
                          }}
                        >
                          {amt === credits ? 'All DOS' : `${amt.toLocaleString()}🪙`}
                        </button>
                      ))}
                </div>

                {/* Network Stats */}
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#64748B',
                    lineHeight: 1.5,
                  }}
                >
                  Gas Fee: Free · Network: Internal Ledger<br />
                  Estimated waiting time: Instant
                </div>

                {/* Big Green BitHit Exchange Button */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleExchange}
                  className="k-squish"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 8,
                    background: 'linear-gradient(180deg, #22C55E 0%, #16A34A 100%)',
                    border: '1px solid #4ADE80',
                    color: '#052E16',
                    fontSize: 14,
                    fontWeight: 900,
                    letterSpacing: '.06em',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4)',
                  }}
                >
                  {submitting ? 'PROCESSING...' : 'EXCHANGE →'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
