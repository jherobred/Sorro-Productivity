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
  const [dealerSpeech, setDealerSpeech] = useState<string>('Place your bets and let’s see what you’ve got!');
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
      toast('Not enough credits for this bet');
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
      toast('Not enough credits to double bet');
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
      toast('Insufficient credits');
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
      const dealerUpVal = dCard1.value;

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
    }, 900);
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
      // If there are more split hands, move to next hand
      if (activeHandIndex < playerHands.length - 1) {
        setActiveHandIndex(activeHandIndex + 1);
      } else {
        // Round ends for player
        handleDealerTurn(newPlayerHands[0], dealerHand, false);
      }
    } else if (val.score === 21) {
      // Auto stand on 21
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
      const revealedDealer = dealerHand.map((c) => ({ ...c, hidden: false }));
      setDealerHand(revealedDealer);
      handleDealerTurn(playerHands[0], revealedDealer, false);
    }
  };

  // Player action: DOUBLE DOWN
  const handleDoubleDown = () => {
    if (gameState !== 'player_turn') return;
    const currentHandBet = handBets[activeHandIndex];
    if (credits < currentHandBet) {
      toast('Not enough credits to Double Down');
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
        const revealedDealer = dealerHand.map((c) => ({ ...c, hidden: false }));
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
      toast('Not enough credits to split hand');
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
        toast(`Insurance placed for ${insCost} Credits`);
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
      toast(`Insurance Paid 2:1! (+${insPayout} Credits)`);
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
        resultsSummary.push(`Hand ${idx + 1}: Bust (Lost ${hBet}🪙)`);
      } else if (playerHasNaturalBJ && pHands.length === 1) {
        if (dealerVal.isBlackjack) {
          totalWinPayout += hBet; // Push
          resultsSummary.push('Blackjack Push! Bet returned.');
          setDealerMood('idle');
        } else {
          const bjPayout = Math.floor(hBet * 2.5); // 3:2 payout
          totalWinPayout += bjPayout;
          anyWin = true;
          resultsSummary.push(`NATURAL BLACKJACK! Paid 3:2 (+${bjPayout}🪙)`);
          setDealerMood('blackjack');
        }
      } else if (dealerVal.isBust) {
        const winAmount = hBet * 2;
        totalWinPayout += winAmount;
        anyWin = true;
        resultsSummary.push(`Dealer Bust! Hand ${idx + 1} Wins (+${winAmount}🪙)`);
        setDealerMood('win');
      } else if (pVal.score > dealerVal.score) {
        const winAmount = hBet * 2;
        totalWinPayout += winAmount;
        anyWin = true;
        resultsSummary.push(`Hand ${idx + 1} Wins ${pVal.score} vs ${dealerVal.score} (+${winAmount}🪙)`);
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
      setDealerSpeech('Gator pays out! Nice hand, high roller!');
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        width: '100%',
      }}
    >
      {/* Felt Casino Table Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 520,
          borderRadius: 24,
          background: 'radial-gradient(ellipse at 50% 30%, #0F4229 0%, #082618 60%, #05140D 100%)',
          border: '6px solid #2B1810',
          boxShadow: 'inset 0 0 50px rgba(0,0,0,0.8), 0 16px 40px rgba(0,0,0,0.7)',
          padding: '24px 20px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Table Felt Markings */}
        <div
          style={{
            position: 'absolute',
            top: '38%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            opacity: 0.25,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.18em', color: '#FCD34D', textTransform: 'uppercase' }}>
            BLACKJACK PAYS 3 TO 2
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: '#FFFFFF', marginTop: 2 }}>
            Dealer must draw to 16 and stand on all 17s · 6-Deck Shoe
          </div>
        </div>

        {/* Dealer Area & Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
          <AlligatorDealer mood={dealerMood} speech={dealerSpeech} />

          {/* Dealer Cards */}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, minHeight: 90, alignItems: 'center' }}>
              {dealerHand.map((c, i) => (
                <PlayingCard key={i} card={c} index={i} />
              ))}
            </div>
            {dealerHand.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#A7F3D0',
                  background: 'rgba(0,0,0,0.5)',
                  padding: '2px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(16,185,129,0.3)',
                }}
              >
                Dealer: {dealerValue.score} {dealerValue.isSoft && '(Soft)'}
              </div>
            )}
          </div>
        </div>

        {/* Insurance Prompt Modal Overlay */}
        <AnimatePresence>
          {showInsurancePrompt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                position: 'absolute',
                top: '45%',
                zIndex: 20,
                background: 'rgba(10, 15, 25, 0.95)',
                border: '1.5px solid var(--pal-amber)',
                borderRadius: 16,
                padding: '16px 20px',
                textAlign: 'center',
                boxShadow: '0 12px 30px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, color: '#FFFFFF', marginBottom: 4 }}>
                Take Insurance? (Cost: {Math.floor(bet / 2)} 🪙)
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 12 }}>
                Pays 2:1 if Dealer reveals a natural Blackjack
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleInsurance(true)}
                  className="k-squish"
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: 'var(--pal-emerald)',
                    color: '#0A0912',
                    fontWeight: 800,
                    fontSize: 12,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Yes, Take Insurance
                </button>
                <button
                  type="button"
                  onClick={() => handleInsurance(false)}
                  className="k-squish"
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: 'var(--card2)',
                    color: 'var(--tx2)',
                    fontWeight: 700,
                    fontSize: 12,
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                >
                  No, Pass
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Round Result Toast Banner */}
        <AnimatePresence>
          {roundResultText && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              style={{
                position: 'absolute',
                top: '52%',
                zIndex: 15,
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%)',
                border: '1.5px solid #6EE7B7',
                borderRadius: 14,
                padding: '8px 18px',
                color: '#0A0912',
                fontSize: 13.5,
                fontWeight: 900,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                textAlign: 'center',
              }}
            >
              {roundResultText}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Hands Area */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '100%' }}>
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
                    padding: '8px 12px',
                    borderRadius: 14,
                    background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    border: isSelected ? '1.5px solid #10B981' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, minHeight: 90, alignItems: 'center' }}>
                    {hand.map((c, i) => (
                      <PlayingCard key={i} card={c} index={i} />
                    ))}
                  </div>
                  {hand.length > 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: hVal.isBust ? '#F87171' : '#FCD34D',
                        background: 'rgba(0,0,0,0.6)',
                        padding: '2px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.15)',
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

      {/* Blackjack Interactive Control Station */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '16px 20px',
          borderRadius: 20,
          background: 'linear-gradient(180deg, #101724 0%, #0C111C 100%)',
          border: '1.5px solid var(--line2)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Chip Rack for Betting */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase' }}>Chips:</span>
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
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 10.5,
                  fontWeight: 900,
                  border: currentSelectedChip === val ? '2px solid #FFFFFF' : '1.5px dashed rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  background:
                    val === 10
                      ? 'radial-gradient(circle, #3B82F6, #1E40AF)'
                      : val === 25
                      ? 'radial-gradient(circle, #10B981, #065F46)'
                      : val === 50
                      ? 'radial-gradient(circle, #F59E0B, #B45309)'
                      : val === 100
                      ? 'radial-gradient(circle, #EF4444, #991B1B)'
                      : val === 250
                      ? 'radial-gradient(circle, #8B5CF6, #5B21B6)'
                      : val === 500
                      ? 'radial-gradient(circle, #EC4899, #9D174D)'
                      : 'radial-gradient(circle, #EAB308, #713F12)',
                  color: '#FFFFFF',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
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
                background: 'rgba(0,0,0,0.5)',
                border: '1.5px solid var(--pal-amber)',
                fontSize: 13,
                fontWeight: 900,
                color: 'var(--pal-amber)',
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
                padding: '12px 36px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: '1.5px solid #34D399',
                color: '#0A0912',
                fontSize: 15,
                fontWeight: 900,
                boxShadow: '0 6px 24px rgba(16, 185, 129, 0.4)',
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
                  color: canDouble ? '#0A0912' : 'var(--tx3)',
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

/** Individual Animated Playing Card */
function PlayingCard({ card, index }: { card: Card; index: number }) {
  const isRed = card.suit === '♥' || card.suit === '♦';

  return (
    <motion.div
      initial={{ scale: 0.6, y: -40, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ delay: index * 0.1, type: 'spring', damping: 18 }}
      style={{
        width: 58,
        height: 84,
        borderRadius: 8,
        background: card.hidden
          ? 'repeating-linear-gradient(45deg, #1E293B, #1E293B 6px, #0F172A 6px, #0F172A 12px)'
          : '#FFFFFF',
        border: card.hidden ? '2px solid #334155' : '1.5px solid #CBD5E1',
        boxShadow: '0 6px 14px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4px 6px',
        color: isRed ? '#DC2626' : '#0F172A',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {card.hidden ? (
        <div style={{ margin: 'auto', fontSize: 16, opacity: 0.6 }}>🐊</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>{card.rank}</span>
            <span style={{ fontSize: 11 }}>{card.suit}</span>
          </div>

          <div style={{ alignSelf: 'center', fontSize: 18, lineHeight: 1 }}>{card.suit}</div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              lineHeight: 1,
              transform: 'rotate(180deg)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 900 }}>{card.rank}</span>
            <span style={{ fontSize: 11 }}>{card.suit}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
