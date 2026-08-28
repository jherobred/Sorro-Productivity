'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, calculateHandValue, createShoe } from '@/lib/casino';
import { AlligatorDealer, DealerMood } from './AlligatorDealer';
import { playCelebration, playClick } from '@/lib/audio';
import { toast } from '@/lib/toast';

export type BlackjackGameProps = {
  credits: number;
  setCredits: React.Dispatch<React.SetStateAction<number>>;
  recordHandWin: (bet: number, win: number, isWin: boolean, isBlackjack?: boolean) => void;
};

const CHIP_VALUES = [10, 25, 50, 100, 250, 500, 1000];

export function BlackjackGame({ credits, setCredits, recordHandWin }: BlackjackGameProps) {
  // Shoe & Deck State
  const [shoe, setShoe] = useState<Card[]>(() => createShoe(6));
  const shoeRef = useRef<Card[]>(shoe);
  shoeRef.current = shoe;

  // Betting state
  const [bet, setBet] = useState<number>(50);
  const [currentSelectedChip, setCurrentSelectedChip] = useState<number>(50);
  const [gameState, setGameState] = useState<
    'betting' | 'dealing' | 'player_turn' | 'dealer_turn' | 'payout' | 'round_end'
  >('betting');

  // Hands
  const [playerHands, setPlayerHands] = useState<Card[][]>([[]]);
  const [activeHandIndex, setActiveHandIndex] = useState<number>(0);
  const [handBets, setHandBets] = useState<number[]>([50]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);

  // Insurance
  const [insuranceBet, setInsuranceBet] = useState<number>(0);
  const [showInsurancePrompt, setShowInsurancePrompt] = useState<boolean>(false);

  // Result messages & dealer mood
  const [dealerMood, setDealerMood] = useState<DealerMood>('idle');
  const [dealerSpeech, setDealerSpeech] = useState<string>('Place your bets in DOS Coin and let’s see what you’ve got!');
  const [roundResultText, setRoundResultText] = useState<string | null>(null);

  // Auto-refill shoe when running low (< 40 cards)
  const drawCard = useCallback((): Card => {
    if (shoeRef.current.length < 40) {
      const fresh = createShoe(6);
      setShoe(fresh);
      shoeRef.current = fresh;
      setDealerSpeech('Shuffling a fresh 6-deck shoe from the bayou! 🐊');
    }
    const card = shoeRef.current[0];
    const rest = shoeRef.current.slice(1);
    setShoe(rest);
    shoeRef.current = rest;
    return card;
  }, []);

  const addChipToBet = (val: number) => {
    if (gameState !== 'betting' && gameState !== 'round_end') return;
    if (bet + val > credits) {
      toast('Not enough DOS Coins for this bet');
      return;
    }
    playClick();
    setBet((prev) => prev + val);
  };

  const clearBet = () => {
    if (gameState !== 'betting' && gameState !== 'round_end') return;
    playClick();
    setBet(0);
  };

  const doubleBetAmount = () => {
    if (gameState !== 'betting' && gameState !== 'round_end') return;
    if (bet * 2 > credits) {
      toast('Not enough DOS Coins to double bet');
      return;
    }
    playClick();
    setBet((prev) => prev * 2);
  };

  // Start dealing round
  const handleDeal = async () => {
    if (bet <= 0) {
      toast('Please place a bet before dealing');
      return;
    }
    if (bet > credits) {
      toast('Insufficient DOS Coins');
      return;
    }

    playClick();
    setCredits((prev) => prev - bet);
    setHandBets([bet]);
    setGameState('dealing');
    setDealerMood('dealing');
    setDealerSpeech('Dealing cards, no more bets!');
    setRoundResultText(null);
    setShowInsurancePrompt(false);
    setInsuranceBet(0);
    setActiveHandIndex(0);

    // Initial 4 cards deal
    const pCard1 = drawCard();
    const dCard1 = drawCard();
    const pCard2 = drawCard();
    const dCard2 = { ...drawCard(), hidden: true }; // Hole card

    setPlayerHands([[pCard1, pCard2]]);
    setDealerHand([dCard1, dCard2]);

    setTimeout(() => {
      const playerVal = calculateHandValue([pCard1, pCard2]);

      // Check for Insurance offer if dealer shows Ace
      if (dCard1.isAce && credits >= Math.floor(bet / 2)) {
        setShowInsurancePrompt(true);
        setDealerSpeech('Dealer shows an Ace! Care for Insurance, partner?');
      }

      // Check immediate Natural Blackjack
      if (playerVal.isBlackjack) {
        handleDealerTurn([pCard1, pCard2], [dCard1, { ...dCard2, hidden: false }], true);
      } else {
        setGameState('player_turn');
        setDealerMood('idle');
        setDealerSpeech('Your move! Hit, Stand, Double, or Split.');
      }
    }, 850);
  };

  // Player actions: HIT
  const handleHit = () => {
    if (gameState !== 'player_turn') return;
    playClick();
    const newCard = drawCard();
    const currentHand = [...playerHands[activeHandIndex], newCard];
    const newPlayerHands = [...playerHands];
    newPlayerHands[activeHandIndex] = currentHand;
    setPlayerHands(newPlayerHands);

    const val = calculateHandValue(currentHand);
    if (val.isBust) {
      setDealerMood('taunt');
      setDealerSpeech(`Bust with ${val.score}! Swamp takes that one!`);
      if (activeHandIndex < playerHands.length - 1) {
        setActiveHandIndex(activeHandIndex + 1);
      } else {
        handleDealerTurn(newPlayerHands[0], dealerHand, false);
      }
    } else if (val.score === 21) {
      if (activeHandIndex < playerHands.length - 1) {
        setActiveHandIndex(activeHandIndex + 1);
      } else {
        handleStand();
      }
    }
  };

  // Player action: STAND
  const handleStand = () => {
    if (gameState !== 'player_turn') return;
    playClick();
    if (activeHandIndex < playerHands.length - 1) {
      setActiveHandIndex(activeHandIndex + 1);
      setDealerSpeech('Playing second split hand...');
    } else {
      setGameState('dealer_turn');
      const revealedDealer: Card[] = dealerHand.map((c) => ({ ...c, hidden: false }));
      setDealerHand(revealedDealer);
      handleDealerTurn(playerHands[0], revealedDealer, false);
    }
  };

  // Player action: DOUBLE DOWN
  const handleDoubleDown = () => {
    if (gameState !== 'player_turn') return;
    const currentHandBet = handBets[activeHandIndex];
    if (credits < currentHandBet) {
      toast('Not enough DOS Coins to Double Down');
      return;
    }
    playClick();
    setCredits((prev) => prev - currentHandBet);
    const newHandBets = [...handBets];
    newHandBets[activeHandIndex] = currentHandBet * 2;
    setHandBets(newHandBets);

    const newCard = drawCard();
    const currentHand = [...playerHands[activeHandIndex], newCard];
    const newPlayerHands = [...playerHands];
    newPlayerHands[activeHandIndex] = currentHand;
    setPlayerHands(newPlayerHands);

    setDealerSpeech('Doubled down! One final card dealt.');

    setTimeout(() => {
      if (activeHandIndex < playerHands.length - 1) {
        setActiveHandIndex(activeHandIndex + 1);
      } else {
        const revealedDealer: Card[] = dealerHand.map((c) => ({ ...c, hidden: false }));
        setDealerHand(revealedDealer);
        handleDealerTurn(currentHand, revealedDealer, false);
      }
    }, 700);
  };

  // Player action: SPLIT
  const handleSplit = () => {
    if (gameState !== 'player_turn') return;
    const currentHand = playerHands[activeHandIndex];
    if (currentHand.length !== 2 || currentHand[0].rank !== currentHand[1].rank) {
      toast('Can only split identical card ranks');
      return;
    }
    if (credits < bet) {
      toast('Not enough DOS Coins to split hand');
      return;
    }

    playClick();
    setCredits((prev) => prev - bet);

    const hand1 = [currentHand[0], drawCard()];
    const hand2 = [currentHand[1], drawCard()];

    setPlayerHands([hand1, hand2]);
    setHandBets([bet, bet]);
    setActiveHandIndex(0);
    setDealerSpeech('Split into two hands! Play hand 1 first.');
  };

  // Insurance Decision
  const handleInsurance = (take: boolean) => {
    setShowInsurancePrompt(false);
    if (take) {
      const insCost = Math.floor(bet / 2);
      if (credits >= insCost) {
        setCredits((prev) => prev - insCost);
        setInsuranceBet(insCost);
        toast(`Insurance placed for ${insCost} DOS Coins`);
      }
    }
    setGameState('player_turn');
  };

  // Dealer drawing logic and payout resolution
  const handleDealerTurn = async (
    pHand: Card[],
    dHandInitial: Card[],
    playerHasNaturalBlackjack: boolean
  ) => {
    setGameState('dealer_turn');
    let currentDealerCards: Card[] = dHandInitial.map((c) => ({ ...c, hidden: false }));
    setDealerHand(currentDealerCards);

    const dealerNatural = calculateHandValue(currentDealerCards).isBlackjack;

    // Handle insurance payout
    if (dealerNatural && insuranceBet > 0) {
      const insPayout = insuranceBet * 3;
      setCredits((prev) => prev + insPayout);
      toast(`Insurance Paid 2:1! (+${insPayout} DOS Coins)`);
    }

    // Dealer draws to 16, stands on 17+
    if (!playerHasNaturalBlackjack) {
      let dVal = calculateHandValue(currentDealerCards);
      while (dVal.score < 17) {
        await new Promise((r) => setTimeout(r, 650));
        const newCard = drawCard();
        currentDealerCards = [...currentDealerCards, newCard];
        setDealerHand(currentDealerCards);
        dVal = calculateHandValue(currentDealerCards);
      }
    }

    // Payout resolution
    setTimeout(() => {
      resolveRoundPayout(playerHands, currentDealerCards, playerHasNaturalBlackjack);
    }, 600);
  };

  const resolveRoundPayout = (
    pHands: Card[][],
    dHandFinal: Card[],
    playerHasNaturalBJ: boolean
  ) => {
    const dealerVal = calculateHandValue(dHandFinal);
    let totalWinPayout = 0;
    let anyWin = false;
    let resultsSummary: string[] = [];

    pHands.forEach((hand, idx) => {
      const pVal = calculateHandValue(hand);
      const hBet = handBets[idx] || bet;

      if (pVal.isBust) {
        resultsSummary.push(`Hand ${idx + 1}: Bust (-${hBet} DOS)`);
      } else if (playerHasNaturalBJ && pHands.length === 1) {
        if (dealerVal.isBlackjack) {
          totalWinPayout += hBet; // Push
          resultsSummary.push('Blackjack Push! Bet returned.');
          setDealerMood('idle');
        } else {
          const bjPayout = Math.floor(hBet * 2.5); // 3:2 payout
          totalWinPayout += bjPayout;
          anyWin = true;
          resultsSummary.push(`NATURAL BLACKJACK 3:2 (+${bjPayout} DOS)`);
          setDealerMood('blackjack');
        }
      } else if (dealerVal.isBust) {
        const winAmount = hBet * 2;
        totalWinPayout += winAmount;
        anyWin = true;
        resultsSummary.push(`Dealer Bust! Hand ${idx + 1} Wins (+${winAmount} DOS)`);
        setDealerMood('win');
      } else if (pVal.score > dealerVal.score) {
        const winAmount = hBet * 2;
        totalWinPayout += winAmount;
        anyWin = true;
        resultsSummary.push(`Hand ${idx + 1} Wins (${pVal.score} vs ${dealerVal.score}) +${winAmount} DOS`);
        setDealerMood('win');
      } else if (pVal.score === dealerVal.score) {
        totalWinPayout += hBet; // Push
        resultsSummary.push(`Hand ${idx + 1}: Push (${pVal.score} vs ${dealerVal.score})`);
      } else {
        resultsSummary.push(`Hand ${idx + 1} Lost (${pVal.score} vs ${dealerVal.score})`);
      }
    });

    if (totalWinPayout > 0) {
      setCredits((prev) => prev + totalWinPayout);
      playCelebration();
    }

    if (anyWin) {
      setDealerSpeech('Gator pays out in pure DOS Coin! Nice hand!');
    } else {
      setDealerMood('taunt');
      setDealerSpeech('House takes the hand! Try another round!');
    }

    setRoundResultText(resultsSummary.join(' · '));
    setGameState('round_end');

    const totalInvested = handBets.reduce((a, b) => a + b, 0);
    recordHandWin(totalInvested, totalWinPayout, anyWin, playerHasNaturalBJ);
  };

  const activeHand = playerHands[activeHandIndex] || [];
  const playerValue = calculateHandValue(activeHand);
  const dealerValue = calculateHandValue(dealerHand);
  const canSplit =
    gameState === 'player_turn' &&
    activeHand.length === 2 &&
    activeHand[0].rank === activeHand[1].rank &&
    credits >= bet;
  const canDouble =
    gameState === 'player_turn' &&
    activeHand.length === 2 &&
    credits >= (handBets[activeHandIndex] || bet);

  return (
    <div className="w-full flex flex-col items-center gap-4 select-none" style={{ maxWidth: 840, margin: '0 auto' }}>
      {/* Luxury Casino Velvet Felt Table Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 540,
          borderRadius: 28,
          background: 'radial-gradient(ellipse at 50% 25%, #0B482A 0%, #062E1A 50%, #03170D 100%)',
          border: '8px solid #2B160C',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.85), 0 20px 50px rgba(0,0,0,0.85), 0 0 0 2px #5C3A21',
          padding: '20px 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Table Felt Markings & Arch */}
        <div
          style={{
            position: 'absolute',
            top: '44%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            opacity: 0.28,
            width: '85%',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.2em', color: '#FCD34D', textTransform: 'uppercase' }}>
            BLACKJACK PAYS 3 TO 2
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: '#FFFFFF', marginTop: 3 }}>
            Dealer Must Draw to 16 and Stand on all 17s · 6-Deck Shoe
          </div>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.14em', color: '#6EE7B7', marginTop: 4 }}>
            INSURANCE PAYS 2 TO 1
          </div>
        </div>

        {/* Dealer Zone (Perfect Center Alignment) */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
          {/* Centered Alligator Dealer Avatar */}
          <AlligatorDealer mood={dealerMood} speech={dealerSpeech} />

          {/* Dealer Hand Area */}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, minHeight: 96, alignItems: 'center', justifyContent: 'center' }}>
              {dealerHand.map((c, i) => (
                <PlayingCard key={i} card={c} index={i} />
              ))}
            </div>
            {dealerHand.length > 0 && (
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 900,
                  color: '#A7F3D0',
                  background: 'rgba(3, 23, 13, 0.85)',
                  padding: '3px 12px',
                  borderRadius: 20,
                  border: '1px solid rgba(16,185,129,0.4)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                Dealer: {dealerValue.score} {dealerValue.isSoft && '(Soft)'}
              </div>
            )}
          </div>
        </div>

        {/* Insurance Modal Prompt */}
        <AnimatePresence>
          {showInsurancePrompt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: 'absolute',
                top: '46%',
                zIndex: 25,
                background: '#0B111D',
                border: '2px solid #F59E0B',
                borderRadius: 16,
                padding: '16px 22px',
                textAlign: 'center',
                boxShadow: '0 16px 40px rgba(0,0,0,0.9)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, color: '#F8FAFC', marginBottom: 4 }}>
                Take Insurance? (Cost: {Math.floor(bet / 2)} DOS)
              </div>
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 12 }}>
                Pays 2:1 if Dealer reveals natural Blackjack
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleInsurance(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: '#10B981',
                    color: '#051E13',
                    fontWeight: 900,
                    fontSize: 12,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Yes, Insure
                </button>
                <button
                  type="button"
                  onClick={() => handleInsurance(false)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: '#1E293B',
                    color: '#94A3B8',
                    fontWeight: 700,
                    fontSize: 12,
                    border: '1px solid #334155',
                    cursor: 'pointer',
                  }}
                >
                  Pass
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Round Result Floating Ribbon */}
        <AnimatePresence>
          {roundResultText && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              style={{
                position: 'absolute',
                top: '52%',
                zIndex: 20,
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: '1.5px solid #6EE7B7',
                borderRadius: 14,
                padding: '8px 20px',
                color: '#051E13',
                fontSize: 13.5,
                fontWeight: 900,
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                textAlign: 'center',
              }}
            >
              {roundResultText}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Hands Arena */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {playerHands.map((hand, idx) => {
              const hVal = calculateHandValue(hand);
              const isSelected = activeHandIndex === idx && playerHands.length > 1;
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 16,
                    background: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                    border: isSelected ? '2px solid #10B981' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, minHeight: 96, alignItems: 'center', justifyContent: 'center' }}>
                    {hand.map((c, i) => (
                      <PlayingCard key={i} card={c} index={i} />
                    ))}
                  </div>
                  {hand.length > 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        color: hVal.isBust ? '#F87171' : '#FCD34D',
                        background: 'rgba(5, 15, 10, 0.85)',
                        padding: '3px 12px',
                        borderRadius: 20,
                        border: '1px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      }}
                    >
                      {playerHands.length > 1 ? `Hand ${idx + 1}: ` : 'Player: '}
                      {hVal.score} {hVal.isSoft && '(Soft)'} {hVal.isBust && '· BUST!'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Control Station: Realistic 3D Chips & Action Buttons */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '16px 20px',
          borderRadius: 20,
          background: 'linear-gradient(180deg, #0F172A 0%, #0A0F1D 100%)',
          border: '1.5px solid var(--line2)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        }}
      >
        {/* Real-World Casino 3D Poker Chips Rack */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--tx3)', textTransform: 'uppercase' }}>Chips:</span>
            {CHIP_VALUES.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  setCurrentSelectedChip(val);
                  addChipToBet(val);
                }}
                disabled={gameState === 'dealing' || gameState === 'player_turn' || gameState === 'dealer_turn'}
                className="k-squish"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 900,
                  border: currentSelectedChip === val ? '2.5px solid #FFFFFF' : '2px dashed rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  background:
                    val === 10
                      ? 'radial-gradient(circle, #3B82F6 40%, #1D4ED8 100%)'
                      : val === 25
                      ? 'radial-gradient(circle, #10B981 40%, #047857 100%)'
                      : val === 50
                      ? 'radial-gradient(circle, #F59E0B 40%, #B45309 100%)'
                      : val === 100
                      ? 'radial-gradient(circle, #EF4444 40%, #B91C1C 100%)'
                      : val === 250
                      ? 'radial-gradient(circle, #8B5CF6 40%, #6D28D9 100%)'
                      : val === 500
                      ? 'radial-gradient(circle, #EC4899 40%, #BE185D 100%)'
                      : 'radial-gradient(circle, #EAB308 40%, #854D0E 100%)',
                  color: '#FFFFFF',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.4)',
                }}
              >
                {val}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={clearBet}
              disabled={gameState !== 'betting' && gameState !== 'round_end'}
              className="hov"
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--line)',
                color: 'var(--tx2)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={doubleBetAmount}
              disabled={gameState !== 'betting' && gameState !== 'round_end'}
              className="hov"
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--line)',
                color: 'var(--tx2)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              2X Bet
            </button>
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.6)',
                border: '1.5px solid #F59E0B',
                fontSize: 13,
                fontWeight: 900,
                color: '#FCD34D',
              }}
            >
              Bet: {bet.toLocaleString()} 🪙
            </div>
          </div>
        </div>

        {/* Action Button Bar */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          {gameState === 'betting' || gameState === 'round_end' ? (
            <button
              type="button"
              onClick={handleDeal}
              className="k-squish"
              style={{
                padding: '12px 40px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: '1.5px solid #34D399',
                color: '#051E13',
                fontSize: 15,
                fontWeight: 900,
                boxShadow: '0 6px 24px rgba(16, 185, 129, 0.45)',
                cursor: 'pointer',
              }}
            >
              DEAL CARDS ♠
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={gameState !== 'player_turn'}
                onClick={handleHit}
                className="k-squish"
                style={{
                  flex: 1,
                  maxWidth: 140,
                  padding: '12px 18px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  border: '1px solid #60A5FA',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 900,
                  cursor: gameState === 'player_turn' ? 'pointer' : 'not-allowed',
                  opacity: gameState === 'player_turn' ? 1 : 0.5,
                }}
              >
                HIT +
              </button>

              <button
                type="button"
                disabled={gameState !== 'player_turn'}
                onClick={handleStand}
                className="k-squish"
                style={{
                  flex: 1,
                  maxWidth: 140,
                  padding: '12px 18px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  border: '1px solid #F87171',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 900,
                  cursor: gameState === 'player_turn' ? 'pointer' : 'not-allowed',
                  opacity: gameState === 'player_turn' ? 1 : 0.5,
                }}
              >
                STAND ✋
              </button>

              <button
                type="button"
                disabled={!canDouble}
                onClick={handleDoubleDown}
                className="k-squish"
                style={{
                  flex: 1,
                  maxWidth: 140,
                  padding: '12px 18px',
                  borderRadius: 12,
                  background: canDouble
                    ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                    : 'rgba(255,255,255,0.06)',
                  border: canDouble ? '1px solid #FCD34D' : '1px solid var(--line)',
                  color: canDouble ? '#051E13' : 'var(--tx3)',
                  fontSize: 13.5,
                  fontWeight: 900,
                  cursor: canDouble ? 'pointer' : 'not-allowed',
                  opacity: canDouble ? 1 : 0.5,
                }}
              >
                DOUBLE 2X
              </button>

              {canSplit && (
                <button
                  type="button"
                  onClick={handleSplit}
                  className="k-squish"
                  style={{
                    flex: 1,
                    maxWidth: 140,
                    padding: '12px 18px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    border: '1px solid #C4B5FD',
                    color: '#FFFFFF',
                    fontSize: 13.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  SPLIT ➗
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Luxury Real-World Playing Card Component */
function PlayingCard({ card, index }: { card: Card; index: number }) {
  const isRed = card.suit === '♥' || card.suit === '♦';

  return (
    <motion.div
      initial={{ scale: 0.6, y: -40, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ delay: index * 0.1, type: 'spring', damping: 18 }}
      style={{
        width: 60,
        height: 88,
        borderRadius: 8,
        background: card.hidden
          ? 'radial-gradient(circle, #1E293B 30%, #0F172A 100%)'
          : '#FFFFFF',
        border: card.hidden ? '2px solid #475569' : '1.5px solid #CBD5E1',
        boxShadow: '0 8px 18px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '5px 6px',
        color: isRed ? '#DC2626' : '#0F172A',
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {card.hidden ? (
        <div
          style={{
            margin: 'auto',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'repeating-linear-gradient(45deg, #0F172A, #0F172A 4px, #1E293B 4px, #1E293B 8px)',
            borderRadius: 5,
          }}
        >
          <span style={{ fontSize: 16 }}>🐊</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 900 }}>{card.rank}</span>
            <span style={{ fontSize: 11.5 }}>{card.suit}</span>
          </div>

          <div style={{ alignSelf: 'center', fontSize: 20, lineHeight: 1 }}>{card.suit}</div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              lineHeight: 1,
              transform: 'rotate(180deg)',
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 900 }}>{card.rank}</span>
            <span style={{ fontSize: 11.5 }}>{card.suit}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
