'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlligatorDealer, DealerMood } from './AlligatorDealer';
import { playCelebration, playClick } from '@/lib/audio';
import { toast } from '@/lib/toast';

export type SlotGameProps = {
  credits: number;
  setCredits: React.Dispatch<React.SetStateAction<number>>;
  recordSlotSpin: (bet: number, win: number) => void;
};

export type SlotSymbol = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  tier: 'wild' | 'scatter' | 'high' | 'mid' | 'low';
  payoutBase: number;
};

const SYMBOLS: SlotSymbol[] = [
  { id: 'wild', name: 'Gator Wild', emoji: '🐊', color: '#10B981', tier: 'wild', payoutBase: 25 },
  { id: 'scatter', name: 'Bonus Star', emoji: '⭐', color: '#F59E0B', tier: 'scatter', payoutBase: 10 },
  { id: 'diamond', name: 'Diamond', emoji: '💎', color: '#38D6F2', tier: 'high', payoutBase: 15 },
  { id: 'crown', name: 'Crown', emoji: '👑', color: '#FBBF24', tier: 'high', payoutBase: 12 },
  { id: 'money', name: 'Money Bag', emoji: '💰', color: '#34D399', tier: 'mid', payoutBase: 8 },
  { id: 'clover', name: 'Clover', emoji: '🍀', color: '#4ADE80', tier: 'mid', payoutBase: 6 },
  { id: 'cherry', name: 'Cherry', emoji: '🍒', color: '#F87171', tier: 'low', payoutBase: 4 },
  { id: 'lemon', name: 'Lemon', emoji: '🍋', color: '#FDE047', tier: 'low', payoutBase: 3 },
];

const WEIGHTED_POOL = [
  'lemon', 'lemon', 'lemon', 'lemon',
  'cherry', 'cherry', 'cherry', 'cherry',
  'clover', 'clover', 'clover',
  'money', 'money', 'money',
  'crown', 'crown',
  'diamond', 'diamond',
  'wild',
  'scatter',
];

function getRandomSymbol(): SlotSymbol {
  const pick = WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
  return SYMBOLS.find((s) => s.id === pick) || SYMBOLS[0];
}

function generateInitialGrid(): SlotSymbol[][] {
  const grid: SlotSymbol[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: SlotSymbol[] = [];
    for (let c = 0; c < 5; c++) {
      row.push(getRandomSymbol());
    }
    grid.push(row);
  }
  return grid;
}

export function SlotGame({ credits, setCredits, recordSlotSpin }: SlotGameProps) {
  const [grid, setGrid] = useState<SlotSymbol[][]>(generateInitialGrid);
  const [bet, setBet] = useState<number>(50);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [lastWinAmount, setLastWinAmount] = useState<number>(0);
  const [winningCells, setWinningCells] = useState<{ r: number; c: number }[]>([]);

  // Free Spins Bonus State
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [bonusMultiplier, setBonusMultiplier] = useState<number>(1);
  const [totalBonusWon, setTotalBonusWon] = useState<number>(0);

  // Auto-Spin & Turbo State
  const [autoSpins, setAutoSpins] = useState<number>(0);
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [bigWinOverlay, setBigWinOverlay] = useState<{ amount: number; title: string } | null>(null);

  // Dealer interaction
  const [dealerMood, setDealerMood] = useState<DealerMood>('idle');
  const [dealerSpeech, setDealerSpeech] = useState<string>('Spin the 5x5 Bayou reels! Match 4+ clusters to tumble!');

  const spinRef = useRef({ isSpinning, freeSpinsLeft, autoSpins });
  spinRef.current = { isSpinning, freeSpinsLeft, autoSpins };

  // Calculate cluster matches (horizontal / vertical adjacency)
  const findClusters = (currentGrid: SlotSymbol[][]) => {
    const visited: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(false));
    const clusters: { symbol: SlotSymbol; cells: { r: number; c: number }[] }[] = [];

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (visited[r][c]) continue;
        const currentSymbol = currentGrid[r][c];
        if (currentSymbol.id === 'scatter') continue; // Scatters pay separately

        const cellsInCluster: { r: number; c: number }[] = [];
        const queue: [number, number][] = [[r, c]];
        visited[r][c] = true;

        while (queue.length > 0) {
          const [cr, cc] = queue.shift()!;
          cellsInCluster.push({ r: cr, c: cc });

          const neighbors: [number, number][] = [
            [cr - 1, cc],
            [cr + 1, cc],
            [cr, cc - 1],
            [cr, cc + 1],
          ];

          for (const [nr, nc] of neighbors) {
            if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && !visited[nr][nc]) {
              const nSymbol = currentGrid[nr][nc];
              if (nSymbol.id === currentSymbol.id || nSymbol.id === 'wild' || currentSymbol.id === 'wild') {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
              }
            }
          }
        }

        if (cellsInCluster.length >= 4) {
          clusters.push({ symbol: currentSymbol, cells: cellsInCluster });
        }
      }
    }

    return clusters;
  };

  // Perform cascading tumble
  const performTumble = async (
    startGrid: SlotSymbol[][],
    currentMultiplier: number,
    accumulatedWin: number
  ): Promise<{ finalGrid: SlotSymbol[][]; totalWin: number }> => {
    let activeGrid = startGrid;
    let spinWin = accumulatedWin;
    let mult = currentMultiplier;

    while (true) {
      const clusters = findClusters(activeGrid);

      // Check scatters
      let scatterCount = 0;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (activeGrid[r][c].id === 'scatter') scatterCount++;
        }
      }

      if (clusters.length === 0 && scatterCount < 3) {
        break;
      }

      // Collect winning coordinates
      const winningSet = new Set<string>();
      let stepWin = 0;

      for (const cl of clusters) {
        for (const cell of cl.cells) {
          winningSet.add(`${cell.r},${cell.c}`);
        }
        const clusterPayout = Math.floor(bet * (cl.symbol.payoutBase / 10) * (cl.cells.length / 3) * mult);
        stepWin += clusterPayout;
      }

      if (scatterCount >= 3) {
        stepWin += bet * scatterCount * 5;
      }

      spinWin += stepWin;
      const winCellsArray = Array.from(winningSet).map((k) => {
        const [r, c] = k.split(',').map(Number);
        return { r, c };
      });
      setWinningCells(winCellsArray);

      if (stepWin > 0) {
        playCelebration();
      }

      // Pause for explosion animation
      await new Promise((r) => setTimeout(r, turboMode ? 250 : 500));

      // Drop new symbols into cleared cells (column by column)
      const nextGrid: SlotSymbol[][] = Array.from({ length: 5 }, () => Array(5).fill(null as never));

      for (let c = 0; c < 5; c++) {
        const survivingColumn: SlotSymbol[] = [];
        for (let r = 4; r >= 0; r--) {
          if (!winningSet.has(`${r},${c}`)) {
            survivingColumn.unshift(activeGrid[r][c]);
          }
        }
        while (survivingColumn.length < 5) {
          survivingColumn.unshift(getRandomSymbol());
        }
        for (let r = 0; r < 5; r++) {
          nextGrid[r][c] = survivingColumn[r];
        }
      }

      activeGrid = nextGrid;
      setGrid(nextGrid);
      setWinningCells([]);

      // Increment tumble multiplier
      mult = Math.min(64, mult * 2);
      setMultiplier(mult);

      await new Promise((r) => setTimeout(r, turboMode ? 200 : 400));
    }

    return { finalGrid: activeGrid, totalWin: spinWin };
  };

  // Main Spin Action
  const handleSpin = useCallback(
    async (isBonusSpin = false) => {
      if (isSpinning) return;
      if (!isBonusSpin && credits < bet) {
        toast('Insufficient credits to spin');
        setAutoSpins(0);
        return;
      }

      playClick();
      setIsSpinning(true);
      if (!isBonusSpin) {
        setCredits((prev) => prev - bet);
      }
      setWinningCells([]);
      setMultiplier(isBonusSpin ? bonusMultiplier : 1);
      setDealerMood('dealing');
      setDealerSpeech('Reels tumbling down! Hold on to your hats!');

      // Generate initial drop
      const newGrid = generateInitialGrid();
      setGrid(newGrid);

      // Check scatter triggers
      let initialScatters = 0;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (newGrid[r][c].id === 'scatter') initialScatters++;
        }
      }

      await new Promise((r) => setTimeout(r, turboMode ? 150 : 350));

      // Execute cascade tumbles
      const { totalWin } = await performTumble(
        newGrid,
        isBonusSpin ? bonusMultiplier : 1,
        0
      );

      setLastWinAmount(totalWin);

      if (totalWin > 0) {
        setCredits((prev) => prev + totalWin);
        if (isBonusSpin) {
          setTotalBonusWon((prev) => prev + totalWin);
          setBonusMultiplier((prev) => Math.min(100, prev + 1));
        }

        if (totalWin >= bet * 20) {
          setBigWinOverlay({
            amount: totalWin,
            title: totalWin >= bet * 50 ? 'SENSATIONAL WIN! 🐊👑' : 'BIG WIN! 💰✨',
          });
          setDealerMood('jackpot');
          setDealerSpeech('HOLY CROCODILE! A massive jackpot cascade!');
        } else {
          setDealerMood('win');
          setDealerSpeech(`Boom! Cascading win of ${totalWin.toLocaleString()} 🪙!`);
        }
      } else {
        setDealerMood('idle');
        setDealerSpeech('No match this spin. The next tumble could explode!');
      }

      // Check if Free Spins were triggered
      if (!isBonusSpin && initialScatters >= 3) {
        playCelebration();
        setFreeSpinsLeft(10);
        setBonusMultiplier(2);
        setTotalBonusWon(totalWin);
        toast(`🐊 10 FREE SPINS TRIGGERED! Progressive multiplier active! 🐊`);
        setDealerMood('jackpot');
        setDealerSpeech('10 FREE SPINS UNLOCKED! Welcome to the Gator Bonus Round!');
      }

      recordSlotSpin(bet, totalWin);
      setIsSpinning(false);

      // Handle Auto-Spins
      if (!isBonusSpin && autoSpins > 1) {
        setAutoSpins((prev) => prev - 1);
      } else if (!isBonusSpin && autoSpins === 1) {
        setAutoSpins(0);
      }
    },
    [isSpinning, credits, bet, turboMode, bonusMultiplier, autoSpins, setCredits, recordSlotSpin]
  );

  // Auto-play free spins loop
  useEffect(() => {
    if (freeSpinsLeft > 0 && !isSpinning) {
      const timer = setTimeout(() => {
        setFreeSpinsLeft((prev) => prev - 1);
        void handleSpin(true);
      }, turboMode ? 600 : 1200);
      return () => clearTimeout(timer);
    }
  }, [freeSpinsLeft, isSpinning, handleSpin, turboMode]);

  // Auto-spin regular loop
  useEffect(() => {
    if (autoSpins > 0 && freeSpinsLeft === 0 && !isSpinning) {
      const timer = setTimeout(() => {
        void handleSpin(false);
      }, turboMode ? 400 : 900);
      return () => clearTimeout(timer);
    }
  }, [autoSpins, freeSpinsLeft, isSpinning, handleSpin, turboMode]);

  // Buy Bonus (Stake/Rainbet Signature 100x Bet)
  const handleBuyBonus = () => {
    const cost = bet * 100;
    if (credits < cost) {
      toast(`Need ${cost.toLocaleString()} Credits to Buy 10 Free Spins`);
      return;
    }
    playCelebration();
    setCredits((prev) => prev - cost);
    setFreeSpinsLeft(10);
    setBonusMultiplier(2);
    setTotalBonusWon(0);
    toast('FEATURE BOUGHT! 10 Free Spins Starting Now! 🐊🔥');
    setDealerMood('jackpot');
    setDealerSpeech('FEATURE BOUGHT! Let the golden bayou free spins roll!');
  };

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* 5x5 Slots Main Arena */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 720,
          borderRadius: 24,
          background: freeSpinsLeft > 0
            ? 'radial-gradient(ellipse at 50% 30%, #3B2D05 0%, #1A1402 60%, #0D0A01 100%)'
            : 'radial-gradient(ellipse at 50% 30%, #0F2E22 0%, #0A1B14 60%, #050F0B 100%)',
          border: freeSpinsLeft > 0 ? '4px solid #F59E0B' : '4px solid #10B981',
          boxShadow: freeSpinsLeft > 0
            ? '0 0 50px rgba(245, 158, 11, 0.4), 0 20px 50px rgba(0,0,0,0.8)'
            : '0 0 40px rgba(16, 185, 129, 0.3), 0 20px 50px rgba(0,0,0,0.8)',
          padding: '20px 18px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          overflow: 'hidden',
          transition: 'all 0.5s ease',
        }}
      >
        {/* Dealer Header Area */}
        <AlligatorDealer mood={dealerMood} speech={dealerSpeech} />

        {/* Multiplier & Win Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 8px' }}>
          {freeSpinsLeft > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.25)',
                border: '1.5px solid #F59E0B',
                color: '#FCD34D',
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              <span>🔥 FREE SPINS: {freeSpinsLeft} LEFT</span>
              <span>· Total: {totalBonusWon.toLocaleString()}🪙</span>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid var(--line2)',
                color: 'var(--tx2)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span>Last Win:</span>
              <span style={{ color: lastWinAmount > 0 ? '#34D399' : 'var(--tx)', fontWeight: 900 }}>
                {lastWinAmount.toLocaleString()} 🪙
              </span>
            </div>
          )}

          {/* Current Tumble Multiplier */}
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 10,
              background: multiplier > 1
                ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                : 'rgba(0,0,0,0.5)',
              border: multiplier > 1 ? '1.5px solid #FCD34D' : '1px solid var(--line2)',
              color: multiplier > 1 ? '#0A0912' : 'var(--tx3)',
              fontSize: 13,
              fontWeight: 900,
              boxShadow: multiplier > 1 ? '0 0 15px rgba(245, 158, 11, 0.5)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            Multiplier: {multiplier}X
          </div>
        </div>

        {/* 5x5 Grid Reel Container */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            padding: 10,
            borderRadius: 18,
            background: 'rgba(0, 0, 0, 0.65)',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
            width: '100%',
            maxWidth: 480,
          }}
        >
          {grid.map((row, r) =>
            row.map((symbol, c) => {
              const isWinning = winningCells.some((cell) => cell.r === r && cell.c === c);
              return (
                <motion.div
                  key={`${r}-${c}`}
                  animate={{
                    scale: isWinning ? [1, 1.25, 0.8] : 1,
                    rotate: isWinning ? [0, -8, 8, 0] : 0,
                    filter: isWinning
                      ? 'drop-shadow(0 0 12px #FCD34D) brightness(1.4)'
                      : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                  }}
                  transition={{ duration: 0.25 }}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 12,
                    background: isWinning
                      ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.4) 0%, rgba(217, 119, 6, 0.4) 100%)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                    border: isWinning ? '2px solid #FCD34D' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{symbol.emoji}</span>
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: symbol.color,
                      letterSpacing: '.04em',
                      marginTop: 2,
                      textTransform: 'uppercase',
                    }}
                  >
                    {symbol.name.split(' ')[0]}
                  </span>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Control Station: Bets, Spin, Auto, Turbo, Buy Feature */}
      <div
        style={{
          width: '100%',
          maxWidth: 720,
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
        {/* Bet Selector & Buy Feature Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase' }}>Bet:</span>
            {[10, 25, 50, 100, 250, 500].map((bVal) => (
              <button
                key={bVal}
                type="button"
                onClick={() => {
                  playClick();
                  setBet(bVal);
                }}
                disabled={isSpinning}
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 800,
                  border: bet === bVal ? '1.5px solid #F59E0B' : '1px solid var(--line)',
                  background: bet === bVal ? 'rgba(245, 158, 11, 0.2)' : 'var(--card2)',
                  color: bet === bVal ? '#FCD34D' : 'var(--tx2)',
                  cursor: 'pointer',
                }}
              >
                {bVal}🪙
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Turbo Toggle */}
            <button
              type="button"
              onClick={() => {
                playClick();
                setTurboMode(!turboMode);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                border: turboMode ? '1px solid #38D6F2' : '1px solid var(--line)',
                background: turboMode ? 'rgba(56, 214, 242, 0.2)' : 'var(--card2)',
                color: turboMode ? '#38D6F2' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              <span>⚡</span>
              <span>Turbo {turboMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* Buy Bonus Feature (100x Bet) */}
            <button
              type="button"
              disabled={isSpinning || freeSpinsLeft > 0}
              onClick={handleBuyBonus}
              className="k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 900,
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                border: '1px solid #FCD34D',
                color: '#0A0912',
                cursor: isSpinning ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.35)',
              }}
            >
              <span>⭐</span>
              <span>Buy Feature ({(bet * 100).toLocaleString()}🪙)</span>
            </button>
          </div>
        </div>

        {/* Spin & Auto-Spin Action Bar */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
          {/* Auto-Spin Selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[10, 25, 50].map((count) => (
              <button
                key={count}
                type="button"
                disabled={isSpinning}
                onClick={() => {
                  playClick();
                  setAutoSpins(autoSpins === count ? 0 : count);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: autoSpins === count ? 'var(--pal-violet)' : 'var(--card2)',
                  color: autoSpins === count ? '#FFFFFF' : 'var(--tx2)',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                }}
              >
                Auto {count}
              </button>
            ))}
          </div>

          {/* Big Green Spin Button */}
          <button
            type="button"
            disabled={isSpinning}
            onClick={() => handleSpin(false)}
            className="k-squish"
            style={{
              flex: 1,
              maxWidth: 320,
              padding: '14px 28px',
              borderRadius: 14,
              background: isSpinning
                ? 'rgba(255,255,255,0.1)'
                : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: isSpinning ? '1px solid transparent' : '1.5px solid #34D399',
              color: isSpinning ? 'var(--tx3)' : '#0A0912',
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: '.04em',
              boxShadow: isSpinning ? 'none' : '0 6px 25px rgba(16, 185, 129, 0.45)',
              cursor: isSpinning ? 'not-allowed' : 'pointer',
            }}
          >
            {isSpinning ? 'TUMBLING...' : autoSpins > 0 ? `AUTO SPINNING (${autoSpins})` : 'SPIN REELS 🎰'}
          </button>
        </div>
      </div>

      {/* Sensational Big Win Celebration Modal */}
      <AnimatePresence>
        {bigWinOverlay && (
          <div
            onClick={() => setBigWinOverlay(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              cursor: 'pointer',
            }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', damping: 15 }}
              style={{
                textAlign: 'center',
                padding: '36px 40px',
                borderRadius: 24,
                background: 'linear-gradient(180deg, #1A1303 0%, #0A0D15 100%)',
                border: '3px solid #F59E0B',
                boxShadow: '0 0 60px rgba(245, 158, 11, 0.6)',
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 8 }}>🐊👑💎</div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: '#FCD34D', margin: '0 0 10px', letterSpacing: '.05em' }}>
                {bigWinOverlay.title}
              </h1>
              <div style={{ fontSize: 48, fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                +{bigWinOverlay.amount.toLocaleString()} 🪙
              </div>
              <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 14 }}>
                Click anywhere to collect & continue
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
