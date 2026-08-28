'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, currentUserId } from './supabase';
import { useQueryClient } from '@tanstack/react-query';
import { RANKED } from './challenges';

export const CASINO_STORAGE_CREDITS = 'basedly_casino_credits_v1';
export const CASINO_STORAGE_VERIFIED = 'basedly_casino_age_verified_v1';
export const CASINO_STORAGE_STATS = 'basedly_casino_stats_v1';

export const RP_EXCHANGE_RATE = 100; // 1 RP = 100 Casino Credits

export type CasinoStats = {
  blackjackHands: number;
  blackjackWins: number;
  slotSpins: number;
  slotWins: number;
  totalWon: number;
  totalBet: number;
  biggestWin: number;
};

export const DEFAULT_STATS: CasinoStats = {
  blackjackHands: 0,
  blackjackWins: 0,
  slotSpins: 0,
  slotWins: 0,
  totalWon: 0,
  totalBet: 0,
  biggestWin: 0,
};

export function getStoredCredits(): number {
  if (typeof window === 'undefined') return 1000;
  try {
    const raw = localStorage.getItem(CASINO_STORAGE_CREDITS);
    return raw !== null ? Number(raw) : 1000; // 1,000 complimentary starter credits
  } catch {
    return 1000;
  }
}

export function setStoredCredits(amount: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CASINO_STORAGE_CREDITS, String(Math.max(0, Math.floor(amount))));
  } catch { /* private mode */ }
}

export function getStoredAgeVerified(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CASINO_STORAGE_VERIFIED) === 'true';
  } catch {
    return false;
  }
}

export function setStoredAgeVerified(verified: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CASINO_STORAGE_VERIFIED, verified ? 'true' : 'false');
  } catch { /* private mode */ }
}

export function getStoredStats(): CasinoStats {
  if (typeof window === 'undefined') return DEFAULT_STATS;
  try {
    const raw = localStorage.getItem(CASINO_STORAGE_STATS);
    return raw ? JSON.parse(raw) : DEFAULT_STATS;
  } catch {
    return DEFAULT_STATS;
  }
}

export function updateStoredStats(patch: Partial<CasinoStats>) {
  if (typeof window === 'undefined') return;
  try {
    const prev = getStoredStats();
    const updated = { ...prev, ...patch };
    localStorage.setItem(CASINO_STORAGE_STATS, JSON.stringify(updated));
  } catch { /* private mode */ }
}

/** Hook for managing casino credits, RP deposits, and RP cashouts */
export function useCasinoCredits(currentRp: number = 0) {
  const [credits, setCredits] = useState<number>(getStoredCredits);
  const [isAgeVerified, setIsAgeVerified] = useState<boolean>(getStoredAgeVerified);
  const [stats, setStats] = useState<CasinoStats>(getStoredStats);
  const [isExchanging, setIsExchanging] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    setStoredCredits(credits);
  }, [credits]);

  const verifyAge = useCallback(() => {
    setStoredAgeVerified(true);
    setIsAgeVerified(true);
  }, []);

  const resetAgeVerification = useCallback(() => {
    setStoredAgeVerified(false);
    setIsAgeVerified(false);
  }, []);

  /** Convert RP into Casino Credits (1 RP -> 100 Credits) */
  const depositRp = useCallback(
    async (rpAmount: number): Promise<boolean> => {
      if (rpAmount <= 0 || rpAmount > currentRp) return false;
      setIsExchanging(true);
      try {
        const uid = await currentUserId();
        const newRp = Math.max(0, currentRp - rpAmount);
        const creditGain = rpAmount * RP_EXCHANGE_RATE;

        if (uid) {
          const { error } = await supabase
            .from('bd_ranked')
            .update({ rp: newRp })
            .eq('user_id', uid);
          if (error) throw error;
        }

        setCredits((prev) => prev + creditGain);
        await qc.invalidateQueries({ queryKey: RANKED });
        return true;
      } catch (err) {
        console.error('Failed to deposit RP to Casino:', err);
        return false;
      } finally {
        setIsExchanging(false);
      }
    },
    [currentRp, qc]
  );

  /** Cash out Casino Credits back into RP (100 Credits -> 1 RP) */
  const withdrawToRp = useCallback(
    async (creditAmount: number): Promise<boolean> => {
      if (creditAmount < RP_EXCHANGE_RATE || creditAmount > credits) return false;
      const rpGain = Math.floor(creditAmount / RP_EXCHANGE_RATE);
      const creditCost = rpGain * RP_EXCHANGE_RATE;

      setIsExchanging(true);
      try {
        const uid = await currentUserId();
        const newRp = currentRp + rpGain;

        if (uid) {
          const { error } = await supabase
            .from('bd_ranked')
            .update({ rp: newRp, peak_rp: Math.max(newRp, currentRp) })
            .eq('user_id', uid);
          if (error) throw error;
        }

        setCredits((prev) => Math.max(0, prev - creditCost));
        await qc.invalidateQueries({ queryKey: RANKED });
        return true;
      } catch (err) {
        console.error('Failed to cash out credits to RP:', err);
        return false;
      } finally {
        setIsExchanging(false);
      }
    },
    [credits, currentRp, qc]
  );

  /** Claim daily free chips faucet (e.g. +500 credits) */
  const claimFreeFaucet = useCallback(() => {
    setCredits((prev) => prev + 500);
    setStoredCredits(credits + 500);
  }, [credits]);

  const recordHandWin = useCallback((bet: number, winAmount: number, isWin: boolean, isBlackjack: boolean = false) => {
    setStats((prev) => {
      const next: CasinoStats = {
        ...prev,
        blackjackHands: prev.blackjackHands + 1,
        blackjackWins: prev.blackjackWins + (isWin ? 1 : 0),
        totalBet: prev.totalBet + bet,
        totalWon: prev.totalWon + winAmount,
        biggestWin: Math.max(prev.biggestWin, winAmount),
      };
      updateStoredStats(next);
      return next;
    });
  }, []);

  const recordSlotSpin = useCallback((bet: number, winAmount: number) => {
    setStats((prev) => {
      const next: CasinoStats = {
        ...prev,
        slotSpins: prev.slotSpins + 1,
        slotWins: prev.slotWins + (winAmount > 0 ? 1 : 0),
        totalBet: prev.totalBet + bet,
        totalWon: prev.totalWon + winAmount,
        biggestWin: Math.max(prev.biggestWin, winAmount),
      };
      updateStoredStats(next);
      return next;
    });
  }, []);

  return {
    credits,
    setCredits,
    isAgeVerified,
    verifyAge,
    resetAgeVerification,
    depositRp,
    withdrawToRp,
    claimFreeFaucet,
    isExchanging,
    stats,
    recordHandWin,
    recordSlotSpin,
  };
}

/* ==========================================================================
   Blackjack Engine Utilities
   ========================================================================== */

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Card = {
  suit: Suit;
  rank: Rank;
  value: number;
  isAce: boolean;
  hidden?: boolean;
};

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      let value = 10;
      if (rank === 'A') value = 11;
      else if (!isNaN(Number(rank))) value = Number(rank);
      deck.push({
        suit,
        rank,
        value,
        isAce: rank === 'A',
      });
    }
  }
  return deck;
}

export function createShoe(numDecks: number = 6): Card[] {
  let shoe: Card[] = [];
  for (let i = 0; i < numDecks; i++) {
    shoe = shoe.concat(createDeck());
  }
  // Fisher-Yates shuffle
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function calculateHandValue(cards: Card[]): { score: number; isSoft: boolean; isBust: boolean; isBlackjack: boolean } {
  const visibleCards = cards.filter((c) => !c.hidden);
  let total = 0;
  let aceCount = 0;

  for (const card of visibleCards) {
    total += card.value;
    if (card.isAce) aceCount++;
  }

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount--;
  }

  const isBlackjack = visibleCards.length === 2 && total === 21;
  const isSoft = aceCount > 0 && total <= 21;
  const isBust = total > 21;

  return { score: total, isSoft, isBust, isBlackjack };
}
