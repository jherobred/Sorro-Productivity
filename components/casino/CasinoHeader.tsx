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
  onOpenRules?: () => void;
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
  const [exchangeMode, setExchangeMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [rpInput, setRpInput] = useState('10');
  const [creditInput, setCreditInput] = useState('1000');
  const [submitting, setSubmitting] = useState(false);

  const handleDeposit = async () => {
    const num = parseInt(rpInput, 10);
    if (isNaN(num) || num <= 0) {
      toast('Enter a valid RP amount');
      return;
    }
    if (num > currentRp) {
      toast(`You only have ${currentRp} RP available`);
      return;
    }
    setSubmitting(true);
    const ok = await depositRp(num);
    setSubmitting(false);
    if (ok) {
      playCelebration();
      toast(`Deposited ${num} RP for ${num * RP_EXCHANGE_RATE} Casino Credits! 🎰`);
      setExchangeOpen(false);
    } else {
      toast('Deposit failed. Please try again.');
    }
  };

  const handleWithdraw = async () => {
    const num = parseInt(creditInput, 10);
    if (isNaN(num) || num < RP_EXCHANGE_RATE) {
      toast(`Minimum cash out is ${RP_EXCHANGE_RATE} Credits (1 RP)`);
      return;
    }
    if (num > credits) {
      toast(`You only have ${credits} Credits available`);
      return;
    }
    setSubmitting(true);
    const ok = await withdrawToRp(num);
    setSubmitting(false);
    if (ok) {
      playCelebration();
      const rpEarned = Math.floor(num / RP_EXCHANGE_RATE);
      toast(`Cashed out ${num} Credits for +${rpEarned} RP to your Ranked ladder! 🏆`);
      setExchangeOpen(false);
    } else {
      toast('Cash out failed. Please try again.');
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Top Banner Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
          borderRadius: 18,
          background: 'linear-gradient(135deg, #0C151B 0%, #0A0D15 100%)',
          border: '1.5px solid color-mix(in srgb, var(--pal-emerald) 32%, transparent)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        }}
      >
        {/* Left: Casino Title & Game Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🐊</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-.02em', color: '#FFFFFF' }}>
                  GATOR STAKE
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: '#10B981',
                    color: '#0A0912',
                  }}
                >
                  Live Casino
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>
                High-Stakes Blackjack & 5x5 Tumbling Slots
              </div>
            </div>
          </div>

          {/* Game Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              padding: 3,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid var(--line2)',
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
                gap: 5,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all .2s ease',
                background: activeGame === 'blackjack' ? 'var(--pal-emerald)' : 'transparent',
                color: activeGame === 'blackjack' ? '#0A0912' : 'var(--tx2)',
                boxShadow: activeGame === 'blackjack' ? '0 2px 10px rgba(16, 185, 129, 0.35)' : 'none',
              }}
            >
              <span>♠</span>
              <span>Blackjack (6-Deck)</span>
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
                gap: 5,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                transition: 'all .2s ease',
                background: activeGame === 'slots' ? 'var(--pal-amber)' : 'transparent',
                color: activeGame === 'slots' ? '#0A0912' : 'var(--tx2)',
                boxShadow: activeGame === 'slots' ? '0 2px 10px rgba(245, 158, 11, 0.35)' : 'none',
              }}
            >
              <span>🎰</span>
              <span>5x5 Bayou Slots</span>
            </button>
          </div>
        </div>

        {/* Right: Balances & RP Exchange Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Daily Faucet Button */}
          <button
            type="button"
            onClick={() => {
              playCelebration();
              claimFreeFaucet();
              toast('+500 Free Starter Chips Claimed! 🎁');
            }}
            className="hov k-squish"
            title="Claim 500 Free Starter Credits"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--pal-amber) 15%, var(--card2))',
              border: '1px solid color-mix(in srgb, var(--pal-amber) 35%, transparent)',
              color: 'var(--pal-amber)',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Icon name="spark" size={12} color="var(--pal-amber)" />
            <span>+500 Chips</span>
          </button>

          {/* RP Balance Chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 11px',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--line)',
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--tx2)',
            }}
          >
            <span style={{ color: 'var(--pal-violet)', fontWeight: 900 }}>RP:</span>
            <span style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{currentRp}</span>
          </div>

          {/* Casino Credits Balance Chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)',
              border: '1.5px solid #10B981',
              boxShadow: '0 0 15px rgba(16, 185, 129, 0.25)',
              fontSize: 13,
              fontWeight: 900,
              color: '#FFFFFF',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>🪙</span>
            <span>{credits.toLocaleString()}</span>
            <span style={{ fontSize: 9.5, color: '#81C784', textTransform: 'uppercase' }}>Credits</span>
          </div>

          {/* Exchange RP <-> Credits Button */}
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
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              border: '1px solid #60A5FA',
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
            }}
          >
            <Icon name="money" size={13} color="#FFFFFF" />
            <span>RP Exchange</span>
          </button>
        </div>
      </div>

      {/* RP Exchange & Cash Out Modal */}
      <AnimatePresence>
        {exchangeOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9990,
              background: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
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
                maxWidth: 460,
                background: 'linear-gradient(180deg, #131A26 0%, #0D121B 100%)',
                borderRadius: 20,
                border: '1.5px solid var(--line2)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="money" size={18} color="var(--pal-emerald)" />
                  <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#FFFFFF' }}>
                    RP & Casino Credits Exchange
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setExchangeOpen(false)}
                  className="hov"
                  style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--tx2)', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>

              {/* Mode Tabs: Deposit RP vs Cash Out to RP */}
              <div style={{ display: 'flex', borderRadius: 10, background: 'rgba(0,0,0,0.5)', padding: 3, border: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setExchangeMode('deposit')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    border: 'none',
                    background: exchangeMode === 'deposit' ? 'var(--pal-emerald)' : 'transparent',
                    color: exchangeMode === 'deposit' ? '#0A0912' : 'var(--tx2)',
                    cursor: 'pointer',
                  }}
                >
                  Deposit RP → Credits (1 RP = 100🪙)
                </button>
                <button
                  type="button"
                  onClick={() => setExchangeMode('withdraw')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    border: 'none',
                    background: exchangeMode === 'withdraw' ? 'var(--pal-violet)' : 'transparent',
                    color: exchangeMode === 'withdraw' ? '#FFFFFF' : 'var(--tx2)',
                    cursor: 'pointer',
                  }}
                >
                  Cash Out → Ranked RP (100🪙 = 1 RP)
                </button>
              </div>

              {exchangeMode === 'deposit' ? (
                /* Deposit RP Mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                    Exchange your productivity Ranked RP into Casino Credits:
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        type="number"
                        min="1"
                        max={currentRp}
                        value={rpInput}
                        onChange={(e) => setRpInput(e.target.value)}
                        placeholder="RP Amount"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid var(--line2)',
                          color: '#FFFFFF',
                          fontSize: 15,
                          fontWeight: 800,
                        }}
                      />
                      <span style={{ position: 'absolute', right: 12, top: 12, fontSize: 11, fontWeight: 700, color: 'var(--pal-violet)' }}>
                        RP
                      </span>
                    </div>

                    <span style={{ fontSize: 18, color: 'var(--tx3)' }}>→</span>

                    <div
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid #10B981',
                        color: '#34D399',
                        fontSize: 15,
                        fontWeight: 900,
                        textAlign: 'right',
                      }}
                    >
                      {((parseInt(rpInput, 10) || 0) * RP_EXCHANGE_RATE).toLocaleString()} 🪙
                    </div>
                  </div>

                  {/* Preset Quick Buttons */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[10, 25, 50, 100, currentRp].map((amt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRpInput(String(Math.max(1, amt)))}
                        className="hov"
                        style={{
                          padding: '4px 10px',
                          borderRadius: 7,
                          background: 'var(--card2)',
                          border: '1px solid var(--line2)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--tx2)',
                          cursor: 'pointer',
                        }}
                      >
                        {amt === currentRp ? 'Max RP' : `+${amt} RP`}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={submitting || currentRp <= 0}
                    onClick={handleDeposit}
                    className="k-squish"
                    style={{
                      marginTop: 6,
                      padding: '11px',
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      border: '1px solid #34D399',
                      color: '#0A0912',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Converting...' : 'Deposit RP to Credits'}
                  </button>
                </div>
              ) : (
                /* Cash Out to RP Mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--tx2)' }}>
                    Bank your casino winnings back into Ranked RP to climb the Season 1 ladder:
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        type="number"
                        min={RP_EXCHANGE_RATE}
                        step={RP_EXCHANGE_RATE}
                        max={credits}
                        value={creditInput}
                        onChange={(e) => setCreditInput(e.target.value)}
                        placeholder="Credits Amount"
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 10,
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid var(--line2)',
                          color: '#FFFFFF',
                          fontSize: 15,
                          fontWeight: 800,
                        }}
                      />
                      <span style={{ position: 'absolute', right: 12, top: 12, fontSize: 11, fontWeight: 700, color: '#34D399' }}>
                        🪙
                      </span>
                    </div>

                    <span style={{ fontSize: 18, color: 'var(--tx3)' }}>→</span>

                    <div
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(124, 108, 255, 0.1)',
                        border: '1px solid var(--pal-violet)',
                        color: 'var(--pal-violet)',
                        fontSize: 15,
                        fontWeight: 900,
                        textAlign: 'right',
                      }}
                    >
                      +{Math.floor((parseInt(creditInput, 10) || 0) / RP_EXCHANGE_RATE)} RP
                    </div>
                  </div>

                  {/* Preset Quick Buttons */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[1000, 2500, 5000, 10000, credits].map((amt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCreditInput(String(Math.max(100, amt)))}
                        className="hov"
                        style={{
                          padding: '4px 10px',
                          borderRadius: 7,
                          background: 'var(--card2)',
                          border: '1px solid var(--line2)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--tx2)',
                          cursor: 'pointer',
                        }}
                      >
                        {amt === credits ? 'All Credits' : `${amt.toLocaleString()}🪙`}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={submitting || credits < RP_EXCHANGE_RATE}
                    onClick={handleWithdraw}
                    className="k-squish"
                    style={{
                      marginTop: 6,
                      padding: '11px',
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #7C6CFF 0%, #5B47FB 100%)',
                      border: '1px solid #9A8EFF',
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Cashing out...' : 'Cash Out to Ranked RP'}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
