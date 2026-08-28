'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { casinoAudio } from '@/lib/casinoAudio';
import { RollingNumber, CoinShower } from './CasinoEffects';
import { toast } from '@/lib/toast';

export type SlotGameProps = {
  credits: number;
  setCredits: React.Dispatch<React.SetStateAction<number>>;
  recordSlotSpin: (bet: number, win: number) => void;
};

export type MerramunSymbol = {
  id: string;
  name: string;
  glyph: string;
  color: string;
  glowColor: string;
  tier: 'scatter' | 'wild' | 'high' | 'mid' | 'low';
  payoutBase: number;
};

export const MERRAMUN_SYMBOLS: MerramunSymbol[] = [
  { id: 'scatter', name: 'Merramun Moon', glyph: '🌙', color: '#FCD34D', glowColor: 'rgba(252, 211, 77, 0.9)', tier: 'scatter', payoutBase: 20 },
  { id: 'anubis', name: 'Anubis God', glyph: '🐺', color: '#818CF8', glowColor: 'rgba(129, 140, 248, 0.8)', tier: 'wild', payoutBase: 25 },
  { id: 'skull', name: 'Crimson Skull', glyph: '💀', color: '#F87171', glowColor: 'rgba(239, 68, 68, 0.85)', tier: 'high', payoutBase: 16 },
  { id: 'cobra', name: 'Cyan Cobra', glyph: '🐍', color: '#38BDF8', glowColor: 'rgba(56, 189, 248, 0.85)', tier: 'high', payoutBase: 14 },
  { id: 'bastet', name: 'Bastet Cat', glyph: '🐱', color: '#60A5FA', glowColor: 'rgba(96, 165, 250, 0.75)', tier: 'high', payoutBase: 12 },
  { id: 'eye', name: 'Eye of Horus', glyph: '👁️', color: '#FBBF24', glowColor: 'rgba(251, 191, 36, 0.75)', tier: 'mid', payoutBase: 10 },
  { id: 'urn', name: 'Golden Urn', glyph: '🏺', color: '#EAB308', glowColor: 'rgba(234, 179, 8, 0.65)', tier: 'mid', payoutBase: 8 },
  { id: 'scroll', name: 'Papyrus Scroll', glyph: '📜', color: '#FDE68A', glowColor: 'rgba(253, 230, 138, 0.65)', tier: 'low', payoutBase: 6 },
  { id: 'ankh', name: 'Golden Ankh', glyph: '☥', color: '#F59E0B', glowColor: 'rgba(245, 158, 11, 0.85)', tier: 'low', payoutBase: 5 },
];

const WEIGHTED_POOL = [
  'ankh', 'ankh', 'ankh', 'ankh', 'ankh',
  'scroll', 'scroll', 'scroll', 'scroll',
  'urn', 'urn', 'urn',
  'eye', 'eye', 'eye',
  'bastet', 'bastet',
  'cobra', 'cobra',
  'skull', 'skull',
  'anubis',
  'scatter',
];

function getRandomSymbol(): MerramunSymbol {
  const pick = WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
  return MERRAMUN_SYMBOLS.find((s) => s.id === pick) || MERRAMUN_SYMBOLS[0];
}

const COLS = 6;
const ROWS = 5;

function generateInitialGrid(): MerramunSymbol[][] {
  const grid: MerramunSymbol[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: MerramunSymbol[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(getRandomSymbol());
    }
    grid.push(row);
  }
  return grid;
}

export function SlotGame({ credits, setCredits, recordSlotSpin }: SlotGameProps) {
  const [grid, setGrid] = useState<MerramunSymbol[][]>(generateInitialGrid);
  const [bet, setBet] = useState<number>(50);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [tumbleWin, setTumbleWin] = useState<number>(0);
  const [lastWinSummary, setLastWinSummary] = useState<string | null>(null);
  const [winningCells, setWinningCells] = useState<{ r: number; c: number }[]>([]);
  const [teaserCol, setTeaserCol] = useState<number | null>(null);
  const [screenShake, setScreenShake] = useState<boolean>(false);
  const [showCoinShower, setShowCoinShower] = useState<boolean>(false);

  // Free Spins Bonus State
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [bonusMultiplier, setBonusMultiplier] = useState<number>(1);
  const [totalBonusWon, setTotalBonusWon] = useState<number>(0);

  // Auto-Spin & Turbo State
  const [autoSpins, setAutoSpins] = useState<number>(0);
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [bigWinOverlay, setBigWinOverlay] = useState<{ amount: number; title: string } | null>(null);

  const findMatches = (currentGrid: MerramunSymbol[][]) => {
    const counts: Record<string, { symbol: MerramunSymbol; cells: { r: number; c: number }[] }> = {};

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const sym = currentGrid[r][c];
        if (!counts[sym.id]) {
          counts[sym.id] = { symbol: sym, cells: [] };
        }
        counts[sym.id].cells.push({ r, c });
      }
    }

    const matches: { symbol: MerramunSymbol; cells: { r: number; c: number }[]; count: number }[] = [];
    for (const id in counts) {
      const entry = counts[id];
      if (entry.symbol.tier === 'scatter') {
        if (entry.cells.length >= 4) {
          matches.push({ symbol: entry.symbol, cells: entry.cells, count: entry.cells.length });
        }
      } else if (entry.cells.length >= 8) {
        matches.push({ symbol: entry.symbol, cells: entry.cells, count: entry.cells.length });
      }
    }

    return matches;
  };

  // Cascading Tumble with Audio & Particle Shockwaves
  const performTumble = async (
    startGrid: MerramunSymbol[][],
    currentMultiplier: number,
    accumulatedWin: number
  ): Promise<{ finalGrid: MerramunSymbol[][]; totalWin: number; summary: string | null }> => {
    let activeGrid = startGrid;
    let spinWin = accumulatedWin;
    let mult = currentMultiplier;
    let summary: string | null = null;

    while (true) {
      const matches = findMatches(activeGrid);
      if (matches.length === 0) break;

      const winningSet = new Set<string>();
      let stepWin = 0;

      for (const m of matches) {
        for (const cell of m.cells) {
          winningSet.add(`${cell.r},${cell.c}`);
        }
        const payoutTier = m.count >= 12 ? 2.5 : m.count >= 10 ? 1.8 : 1.2;
        const payout = Math.floor(bet * (m.symbol.payoutBase / 10) * payoutTier * mult);
        stepWin += payout;
        summary = `${m.count}X ${m.symbol.glyph} PAYS +${payout.toLocaleString()} DOS`;
      }

      spinWin += stepWin;
      setTumbleWin(spinWin);
      setLastWinSummary(summary);

      const winCellsArray = Array.from(winningSet).map((k) => {
        const [r, c] = k.split(',').map(Number);
        return { r, c };
      });
      setWinningCells(winCellsArray);

      // Play explosion audio and screen shake
      casinoAudio.playTumbleExplosion();
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 240);

      // Pause for sparkling cyan dissolve particle animation
      await new Promise((r) => setTimeout(r, turboMode ? 200 : 440));

      // Drop new symbols column by column
      const nextGrid: MerramunSymbol[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null as never));

      for (let c = 0; c < COLS; c++) {
        const survivingColumn: MerramunSymbol[] = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          if (!winningSet.has(`${r},${c}`)) {
            survivingColumn.unshift(activeGrid[r][c]);
          }
        }
        while (survivingColumn.length < ROWS) {
          survivingColumn.unshift(getRandomSymbol());
        }
        for (let r = 0; r < ROWS; r++) {
          nextGrid[r][c] = survivingColumn[r];
        }
      }

      activeGrid = nextGrid;
      setGrid(nextGrid);
      setWinningCells([]);

      // Increment tumble multiplier
      mult = Math.min(100, mult + 1);
      setMultiplier(mult);

      await new Promise((r) => setTimeout(r, turboMode ? 160 : 340));
    }

    return { finalGrid: activeGrid, totalWin: spinWin, summary };
  };

  // Main Spin Execution
  const handleSpin = useCallback(
    async (isBonusSpin = false) => {
      if (isSpinning) return;
      if (!isBonusSpin && credits < bet) {
        toast('Insufficient DOS Coins to spin');
        setAutoSpins(0);
        return;
      }

      casinoAudio.playSpinStart();
      setIsSpinning(true);
      setShowCoinShower(false);
      setTeaserCol(null);

      if (!isBonusSpin) {
        setCredits((prev) => prev - bet);
        setTumbleWin(0);
        setLastWinSummary(null);
      }
      setWinningCells([]);
      setMultiplier(isBonusSpin ? bonusMultiplier : 1);

      // Generate staggered drops column by column
      const newGrid = generateInitialGrid();

      // Check scatter counts to trigger anticipation teaser on last reels
      let scatterCountSoFar = 0;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (newGrid[r][c].id === 'scatter') scatterCountSoFar++;
        }
        if (scatterCountSoFar === 3 && c === 4) {
          // Teaser on reel 5 and 6!
          setTeaserCol(5);
          casinoAudio.playScatterTeaser();
          await new Promise((r) => setTimeout(r, turboMode ? 250 : 600));
        } else {
          casinoAudio.playReelLand(c);
          await new Promise((r) => setTimeout(r, turboMode ? 35 : 70));
        }
      }

      setGrid(newGrid);
      setTeaserCol(null);

      // Check total scatters
      let totalScatters = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (newGrid[r][c].id === 'scatter') totalScatters++;
        }
      }

      await new Promise((r) => setTimeout(r, turboMode ? 120 : 260));

      // Execute tumble sequence
      const { totalWin, summary } = await performTumble(
        newGrid,
        isBonusSpin ? bonusMultiplier : 1,
        0
      );

      if (totalWin > 0) {
        setCredits((prev) => prev + totalWin);
        if (isBonusSpin) {
          setTotalBonusWon((prev) => prev + totalWin);
          setBonusMultiplier((prev) => Math.min(100, prev + 1));
        }

        if (totalWin >= bet * 20) {
          casinoAudio.playBigWinFanfare();
          setShowCoinShower(true);
          setBigWinOverlay({
            amount: totalWin,
            title: totalWin >= bet * 50 ? 'ANCIENT MERRAMUN TREASURY! 👑' : 'SENSATIONAL TUMBLE WIN! 💎',
          });
        }
      }

      // Check 4+ Merramun Moon Scatters -> 10 Free Spins
      if (!isBonusSpin && totalScatters >= 4) {
        casinoAudio.playBigWinFanfare();
        setFreeSpinsLeft(10);
        setBonusMultiplier(2);
        setTotalBonusWon(totalWin);
        setShowCoinShower(true);
        toast('🌙 4+ MERRAMUN MOONS! 10 FREE SPINS UNLOCKED!');
      }

      recordSlotSpin(bet, totalWin);
      setIsSpinning(false);

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
      }, turboMode ? 500 : 1100);
      return () => clearTimeout(timer);
    }
  }, [freeSpinsLeft, isSpinning, handleSpin, turboMode]);

  // Auto-spin loop
  useEffect(() => {
    if (autoSpins > 0 && freeSpinsLeft === 0 && !isSpinning) {
      const timer = setTimeout(() => {
        void handleSpin(false);
      }, turboMode ? 350 : 850);
      return () => clearTimeout(timer);
    }
  }, [autoSpins, freeSpinsLeft, isSpinning, handleSpin, turboMode]);

  // Buy Feature (100x Bet)
  const handleBuyBonus = () => {
    const cost = bet * 100;
    if (credits < cost) {
      toast(`Need ${cost.toLocaleString()} DOS Coins to Buy Merramun Feature`);
      return;
    }
    casinoAudio.playBigWinFanfare();
    setCredits((prev) => prev - cost);
    setFreeSpinsLeft(10);
    setBonusMultiplier(2);
    setTotalBonusWon(0);
    setShowCoinShower(true);
    toast('FEATURE ACTIVATED: 10 Merramun Free Spins Starting! 🌙');
  };

  return (
    <div className="w-full flex flex-col items-center gap-4 select-none" style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Coin Shower Fountain on Big Wins */}
      <CoinShower active={showCoinShower} />

      {/* Ornate Merramun Machine Cabinet Frame */}
      <motion.div
        animate={{
          x: screenShake ? [-3, 3, -2, 2, 0] : 0,
          y: screenShake ? [2, -2, 1, -1, 0] : 0,
        }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 22,
          background: freeSpinsLeft > 0
            ? 'linear-gradient(180deg, #1C1504 0%, #080A0F 100%)'
            : 'linear-gradient(180deg, #070B12 0%, #030508 100%)',
          border: freeSpinsLeft > 0 ? '3.5px solid #F59E0B' : '3px solid #D4AF37',
          boxShadow: freeSpinsLeft > 0
            ? '0 0 55px rgba(245, 158, 11, 0.5), 0 20px 50px rgba(0,0,0,0.9)'
            : '0 0 45px rgba(212, 175, 55, 0.35), 0 20px 50px rgba(0,0,0,0.9)',
          padding: '16px 14px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          overflow: 'hidden',
          transition: 'all 0.4s ease',
        }}
      >
        {/* Ornate Gold Merramun Pediment Header */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          {/* Top Golden Wings Frame */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              width: '100%',
              padding: '0 10px',
            }}
          >
            <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, transparent, #D4AF37)' }} />
            {/* Center Crescent Moon Crest */}
            <div
              style={{
                position: 'relative',
                padding: '4px 28px 6px',
                borderRadius: '8px 8px 16px 16px',
                background: 'linear-gradient(180deg, #1C180A 0%, #0D0B05 100%)',
                border: '1.5px solid #D4AF37',
                boxShadow: '0 4px 18px rgba(212, 175, 55, 0.4)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, color: '#FDE047', lineHeight: 1 }}>🌙</div>
              <h1
                style={{
                  margin: '2px 0 0',
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: '.22em',
                  color: '#FDE047',
                  textTransform: 'uppercase',
                  textShadow: '0 0 12px rgba(253, 224, 71, 0.7), 0 2px 4px #000000',
                  fontFamily: 'serif',
                }}
              >
                MERRAMUN
              </h1>
            </div>
            <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #D4AF37, transparent)' }} />
          </div>
        </div>

        {/* 6x5 Deep Basalt Hieroglyph Reels Grid */}
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 6,
            padding: 8,
            borderRadius: 14,
            background: 'radial-gradient(ellipse at 50% 50%, #0A0F1A 0%, #030508 100%)',
            border: '2px solid #854D0E',
            boxShadow: 'inset 0 0 25px rgba(0,0,0,0.9), 0 0 15px rgba(133, 77, 14, 0.3)',
            width: '100%',
          }}
        >
          {/* Scatter Teaser Anticipation Glow on Reel 5 & 6 */}
          {teaserCol !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ repeat: Infinity, duration: 0.3 }}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: '34%',
                borderRadius: 12,
                background: 'radial-gradient(circle, rgba(253, 224, 71, 0.4) 0%, rgba(245, 158, 11, 0.15) 100%)',
                border: '2px solid #FDE047',
                boxShadow: '0 0 30px rgba(253, 224, 71, 0.6)',
                pointerEvents: 'none',
                zIndex: 15,
              }}
            />
          )}

          {grid.map((row, r) =>
            row.map((sym, c) => {
              const isWinning = winningCells.some((cell) => cell.r === r && cell.c === c);
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: 10,
                    background: isWinning
                      ? 'radial-gradient(circle, rgba(56, 189, 248, 0.4) 0%, rgba(14, 165, 233, 0.18) 100%)'
                      : 'linear-gradient(180deg, #0E1524 0%, #070B14 100%)',
                    border: isWinning ? '2px solid #38BDF8' : '1px solid rgba(212, 175, 55, 0.2)',
                    boxShadow: isWinning ? `0 0 18px ${sym.glowColor}` : 'inset 0 2px 6px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {/* Subtle Hieroglyph Texture Background */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0.08,
                      fontSize: 10,
                      display: 'grid',
                      placeItems: 'center',
                      pointerEvents: 'none',
                      color: '#FDE047',
                    }}
                  >
                    𓀀𓁐𓃠𓆓𓇯
                  </div>

                  {/* Sparkling Dissolve Particles on Tumble */}
                  {isWinning && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: [0, 1, 0], scale: [0.7, 1.4, 1.7] }}
                      transition={{ duration: 0.42 }}
                      style={{
                        position: 'absolute',
                        inset: -4,
                        pointerEvents: 'none',
                        background: 'radial-gradient(circle, rgba(56,189,248,0.85) 0%, rgba(253,224,71,0.6) 50%, transparent 80%)',
                        mixBlendMode: 'screen',
                        zIndex: 10,
                      }}
                    />
                  )}

                  {/* Main Symbol Glyph */}
                  <motion.span
                    animate={{
                      scale: isWinning ? [1, 1.28, 0.6] : 1,
                      filter: isWinning ? 'brightness(1.6) drop-shadow(0 0 12px #38BDF8)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.8))',
                    }}
                    transition={{ duration: 0.22 }}
                    style={{
                      fontSize: 24,
                      lineHeight: 1,
                      zIndex: 2,
                    }}
                  >
                    {sym.glyph}
                  </motion.span>

                  {/* Symbol Label */}
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: sym.color,
                      letterSpacing: '.04em',
                      marginTop: 2,
                      textTransform: 'uppercase',
                      zIndex: 2,
                      opacity: 0.9,
                    }}
                  >
                    {sym.name.split(' ')[0]}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Tumble Win Live Indicator & Rolling Multiplier Banner */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {/* Active Pays Line */}
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              color: lastWinSummary ? '#FDE047' : 'rgba(255,255,255,0.4)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              minHeight: 18,
              textAlign: 'center',
            }}
          >
            {lastWinSummary || 'MATCH 8+ SYMBOLS ANYWHERE TO TUMBLE'}
          </div>

          {/* TUMBLE WIN Plaque with Rolling Number Counter */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 340,
              padding: '6px 20px',
              borderRadius: 12,
              background: 'linear-gradient(180deg, #3A2B0E 0%, #1A1204 100%)',
              border: '2px solid #D4AF37',
              boxShadow: '0 4px 20px rgba(212, 175, 55, 0.4), inset 0 1px 3px rgba(255,255,255,0.3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '.16em',
                color: '#FDE047',
                textTransform: 'uppercase',
              }}
            >
              {freeSpinsLeft > 0 ? `FREE SPINS (${freeSpinsLeft}) · TUMBLE WIN` : 'TUMBLE WIN'}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: '#FFFFFF',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '.04em',
              }}
            >
              <RollingNumber value={tumbleWin} durationMs={600} /> <span style={{ fontSize: 13, color: '#FDE047' }}>DOS</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Control Station: Betting, Turbo, Auto, Buy Feature */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '16px 18px',
          borderRadius: 18,
          background: 'linear-gradient(180deg, #0F172A 0%, #0A0F1D 100%)',
          border: '1.5px solid var(--line2)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        }}
      >
        {/* Top Control Strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          {/* Bet Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase' }}>Bet:</span>
            {[10, 25, 50, 100, 250, 500].map((bVal) => (
              <button
                key={bVal}
                type="button"
                onClick={() => {
                  casinoAudio.playChip();
                  setBet(bVal);
                }}
                disabled={isSpinning}
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 800,
                  border: bet === bVal ? '1.5px solid #F59E0B' : '1px solid var(--line)',
                  background: bet === bVal ? 'rgba(245, 158, 11, 0.25)' : 'var(--card2)',
                  color: bet === bVal ? '#FCD34D' : 'var(--tx2)',
                  cursor: 'pointer',
                }}
              >
                {bVal} 🪙
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Turbo Toggle */}
            <button
              type="button"
              onClick={() => {
                casinoAudio.playChip();
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
                border: turboMode ? '1px solid #38BDF8' : '1px solid var(--line)',
                background: turboMode ? 'rgba(56, 189, 248, 0.25)' : 'var(--card2)',
                color: turboMode ? '#38BDF8' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              <span>⚡</span>
              <span>Turbo {turboMode ? 'ON' : 'OFF'}</span>
            </button>

            {/* Buy Feature (100x Bet) */}
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
              <span>🌙</span>
              <span>Buy Feature ({(bet * 100).toLocaleString()} 🪙)</span>
            </button>
          </div>
        </div>

        {/* Spin Bar */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[10, 25, 50].map((count) => (
              <button
                key={count}
                type="button"
                disabled={isSpinning}
                onClick={() => {
                  casinoAudio.playChip();
                  setAutoSpins(autoSpins === count ? 0 : count);
                }}
                style={{
                  padding: '12px 14px',
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

          <button
            type="button"
            disabled={isSpinning}
            onClick={() => handleSpin(false)}
            className="k-squish"
            style={{
              flex: 1,
              maxWidth: 360,
              padding: '14px 28px',
              borderRadius: 14,
              background: isSpinning
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: isSpinning ? '1px solid transparent' : '1.5px solid #34D399',
              color: isSpinning ? 'var(--tx3)' : '#0A0912',
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: '.06em',
              boxShadow: isSpinning ? 'none' : '0 6px 25px rgba(16, 185, 129, 0.45)',
              cursor: isSpinning ? 'not-allowed' : 'pointer',
            }}
          >
            {isSpinning ? 'TUMBLING...' : autoSpins > 0 ? `AUTO TUMBLING (${autoSpins})` : 'SPIN MERRAMUN 🌙'}
          </button>
        </div>
      </div>

      {/* Sensational Big Win Celebration Overlay */}
      <AnimatePresence>
        {bigWinOverlay && (
          <div
            onClick={() => setBigWinOverlay(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.88)',
              backdropFilter: 'blur(14px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              cursor: 'pointer',
            }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', damping: 15 }}
              style={{
                textAlign: 'center',
                padding: '36px 44px',
                borderRadius: 24,
                background: 'linear-gradient(180deg, #1C1504 0%, #070B14 100%)',
                border: '3px solid #D4AF37',
                boxShadow: '0 0 70px rgba(212, 175, 55, 0.7)',
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 8 }}>🌙👑💀</div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#FDE047', margin: '0 0 10px', letterSpacing: '.08em', fontFamily: 'serif' }}>
                {bigWinOverlay.title}
              </h1>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                +<RollingNumber value={bigWinOverlay.amount} durationMs={1200} /> <span style={{ fontSize: 24, color: '#FDE047' }}>DOS COIN</span>
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
