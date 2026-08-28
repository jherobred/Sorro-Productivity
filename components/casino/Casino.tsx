'use client';

import React, { useState } from 'react';
import { useRanked } from '@/lib/challenges';
import { useCasinoCredits } from '@/lib/casino';
import { CasinoAgeGate } from './CasinoAgeGate';
import { CasinoHeader } from './CasinoHeader';
import { BlackjackGame } from './BlackjackGame';
import { SlotGame } from './SlotGame';
import { Icon } from '@/components/Icon';

export type CasinoProps = {
  onExit?: () => void;
};

export function Casino({ onExit }: CasinoProps) {
  const { data: ranked } = useRanked();
  const currentRp = ranked?.rp ?? 0;

  const {
    credits,
    setCredits,
    isAgeVerified,
    verifyAge,
    depositRp,
    withdrawToRp,
    claimFreeFaucet,
    stats,
    recordHandWin,
    recordSlotSpin,
  } = useCasinoCredits(currentRp);

  const [activeGame, setActiveGame] = useState<'blackjack' | 'slots'>('blackjack');

  return (
    <div className="w-full flex flex-col items-center gap-5 select-none" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* 18+ Legal Age Verification Onboarding Gate */}
      {!isAgeVerified && (
        <CasinoAgeGate
          onVerify={verifyAge}
          onExit={onExit || (() => {})}
        />
      )}

      {/* Casino Balance Bar, RP Exchange, Game Switcher */}
      <CasinoHeader
        credits={credits}
        currentRp={currentRp}
        depositRp={depositRp}
        withdrawToRp={withdrawToRp}
        claimFreeFaucet={claimFreeFaucet}
        activeGame={activeGame}
        setActiveGame={setActiveGame}
      />

      {/* Active Game Floor */}
      <div className="w-full flex justify-center">
        {activeGame === 'blackjack' ? (
          <BlackjackGame
            credits={credits}
            setCredits={setCredits}
            recordHandWin={recordHandWin}
          />
        ) : (
          <SlotGame
            credits={credits}
            setCredits={setCredits}
            recordSlotSpin={recordSlotSpin}
          />
        )}
      </div>

      {/* Casino Live Stats & Fair Play Ticker */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 16px',
          borderRadius: 14,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--line2)',
          fontSize: 11.5,
          color: 'var(--tx3)',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--pal-emerald)' }}>●</span>
            <span>Provably Fair Simulation Engine</span>
          </div>
          <div>Hands Played: <strong style={{ color: 'var(--tx)' }}>{stats.blackjackHands}</strong></div>
          <div>Slot Spins: <strong style={{ color: 'var(--tx)' }}>{stats.slotSpins}</strong></div>
          <div>Biggest Win: <strong style={{ color: '#FCD34D' }}>{stats.biggestWin.toLocaleString()} DOS Coin</strong></div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="spark" size={12} color="var(--tx3)" />
          <span>Gator Stake · BitHit Network · Virtual Entertainment</span>
        </div>
      </div>
    </div>
  );
}
