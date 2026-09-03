'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from '../Icon';
import { useLayout } from '@/lib/useLayout';
import { playClick, playTick } from '@/lib/audio';

type Mode = 'sorting' | 'tree' | 'recursion' | 'state';

type Algorithm = {
  id: string;
  name: string;
  mode: Mode;
  complexity: string;
  space: string;
  description: string;
};

const ALGORITHMS: Algorithm[] = [
  { id: 'quicksort', name: 'QuickSort (Divide & Conquer)', mode: 'sorting', complexity: 'O(n log n)', space: 'O(log n)', description: 'Pivot partitioning with recursive sub-array sorting.' },
  { id: 'mergesort', name: 'MergeSort (Divide & Merge)', mode: 'sorting', complexity: 'O(n log n)', space: 'O(n)', description: 'Stable sorting dividing list into halves and merging back.' },
  { id: 'bst', name: 'Binary Search Tree (In-Order)', mode: 'tree', complexity: 'O(log n)', space: 'O(h)', description: 'Ordered binary tree traversal visiting left subtree, root, and right.' },
  { id: 'bfs', name: 'Graph Breadth-First Search', mode: 'tree', complexity: 'O(V + E)', space: 'O(V)', description: 'Level-order graph traversal using a first-in-first-out queue.' },
  { id: 'fib', name: 'Fibonacci Call Stack', mode: 'recursion', complexity: 'O(2^n)', space: 'O(n)', description: 'Recursive execution stack frames tracking frame push and return unwinding.' },
  { id: 'memory', name: 'Object Heap & Pointer Allocation', mode: 'state', complexity: 'O(1)', space: 'O(n)', description: 'Dynamic memory lifecycle, pointer references, and garbage collection.' },
];

export function CodeVisualizer() {
  const { phone } = useLayout();
  const [selectedAlgo, setSelectedAlgo] = useState<Algorithm>(ALGORITHMS[0]);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  // Sorting state simulation
  const [arrayData, setArrayData] = useState<number[]>([38, 27, 43, 3, 9, 82, 10, 19, 50, 61, 14]);
  const [activeIndices, setActiveIndices] = useState<number[]>([2, 5]);
  const [sortedIndices, setSortedIndices] = useState<number[]>([]);
  const [pivotIdx, setPivotIdx] = useState<number | null>(4);

  // Stats
  const [comparisons, setComparisons] = useState(14);
  const [swaps, setSwaps] = useState(6);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStep((s) => {
        if (s >= 24) {
          setIsPlaying(false);
          return 0;
        }
        return s + 1;
      });
      // Simulate random step evolution
      setArrayData((prev) => {
        const next = [...prev];
        const i1 = Math.floor(Math.random() * next.length);
        const i2 = Math.floor(Math.random() * next.length);
        setActiveIndices([i1, i2]);
        if (Math.random() > 0.4) {
          const tmp = next[i1];
          next[i1] = next[i2];
          next[i2] = tmp;
          setSwaps((sw) => sw + 1);
        }
        setComparisons((c) => c + 1);
        return next;
      });
    }, 900 / speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const handleNext = () => {
    playTick();
    setStep((s) => s + 1);
    setComparisons((c) => c + 1);
    // Shuffle step
    setArrayData((prev) => {
      const next = [...prev];
      const i1 = (step * 2) % next.length;
      const i2 = (step * 2 + 1) % next.length;
      setActiveIndices([i1, i2]);
      const tmp = next[i1];
      next[i1] = next[i2];
      next[i2] = tmp;
      setSwaps((sw) => sw + 1);
      return next;
    });
  };

  const handlePrev = () => {
    playTick();
    if (step > 0) setStep((s) => s - 1);
  };

  const handleReset = () => {
    playClick();
    setIsPlaying(false);
    setStep(0);
    setComparisons(0);
    setSwaps(0);
    setArrayData([38, 27, 43, 3, 9, 82, 10, 19, 50, 61, 14]);
    setActiveIndices([]);
    setSortedIndices([]);
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, width: '100%', maxWidth: '100%',
      display: 'flex', flexDirection: 'column', gap: 18,
      boxSizing: 'border-box',
    }}>
      
      {/* Top Controller Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderRadius: 14,
        background: 'var(--card)', border: '1px solid var(--line2)', boxShadow: 'var(--sh)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--acc) 18%, transparent)', color: 'var(--accTx)',
          }}>
            <Icon name="spark" size={16} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>{selectedAlgo.name}</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{selectedAlgo.description}</div>
          </div>
        </div>

        {/* Algorithm Selector Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {ALGORITHMS.map((algo) => {
            const on = algo.id === selectedAlgo.id;
            return (
              <button
                key={algo.id}
                onClick={() => { setSelectedAlgo(algo); handleReset(); }}
                className="hov tap"
                style={{
                  padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: on ? 'var(--acc)' : 'var(--card2)',
                  color: on ? 'var(--ink)' : 'var(--tx2)',
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                  cursor: 'pointer',
                }}
              >
                {algo.name.split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Execution Surface */}
      <div style={{
        flex: 1, minHeight: 380, width: '100%', borderRadius: 18,
        background: 'var(--card)', border: '1px solid var(--line2)', boxShadow: 'var(--sh)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
      }}>
        
        {/* Surface Header with Metrics */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid var(--line2)', background: 'var(--card2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11.5, fontWeight: 700 }}>
            <span style={{ color: 'var(--tx2)' }}>Step <strong style={{ color: 'var(--tx)' }}>{step}</strong></span>
            <span style={{ color: 'var(--tx2)' }}>Comparisons: <strong style={{ color: 'var(--tx)' }}>{comparisons}</strong></span>
            <span style={{ color: 'var(--tx2)' }}>Swaps: <strong style={{ color: 'var(--tx)' }}>{swaps}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 700 }}>
            <span style={{ padding: '2px 8px', borderRadius: 5, background: 'color-mix(in srgb, var(--acc) 14%, transparent)', color: 'var(--accTx)' }}>
              Time: {selectedAlgo.complexity}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 5, background: 'var(--line)', color: 'var(--tx2)' }}>
              Space: {selectedAlgo.space}
            </span>
          </div>
        </div>

        {/* Interactive Visualization Body */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, position: 'relative', background: 'radial-gradient(var(--line) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}>
          {selectedAlgo.mode === 'sorting' && (
            <div style={{
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: phone ? 6 : 14,
              height: 240, width: '100%', maxWidth: 720,
            }}>
              {arrayData.map((val, idx) => {
                const isActive = activeIndices.includes(idx);
                const isPivot = pivotIdx === idx;
                const heightPct = Math.max(14, (val / 100) * 100);

                let bg = 'color-mix(in srgb, var(--acc) 35%, var(--card2))';
                let border = 'var(--line2)';
                if (isActive) {
                  bg = 'var(--acc)';
                  border = 'var(--acc)';
                } else if (isPivot) {
                  bg = 'var(--pal-amber)';
                  border = 'var(--pal-amber)';
                }

                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      height: `${heightPct}%`,
                      background: bg,
                      border: `1.5px solid ${border}`,
                      borderRadius: '8px 8px 3px 3px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 2px 4px',
                      transition: 'height .3s cubic-bezier(0.16, 1, 0.3, 1), background .2s ease',
                      boxShadow: isActive ? '0 0 16px var(--gl2)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? 'var(--ink)' : 'var(--tx)' }}>
                      {val}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? 'var(--ink)' : 'var(--tx3)' }}>
                      {idx}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {selectedAlgo.mode === 'tree' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              {/* Root */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: 'var(--acc)', color: 'var(--ink)',
                display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, boxShadow: 'var(--sh)',
              }}>42</div>
              {/* Level 1 */}
              <div style={{ display: 'flex', gap: 80 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: 'var(--card2)', border: '2px solid var(--acc)',
                  display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, color: 'var(--tx)',
                }}>21</div>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: 'var(--card2)', border: '2px solid var(--acc)',
                  display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, color: 'var(--tx)',
                }}>67</div>
              </div>
              {/* Level 2 */}
              <div style={{ display: 'flex', gap: 40 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--tx3)' }}>14</div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--tx3)' }}>35</div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--tx3)' }}>53</div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--card2)', border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--tx3)' }}>89</div>
              </div>
            </div>
          )}

          {selectedAlgo.mode === 'recursion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 320 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Call Stack Frames</div>
              {[
                { fn: 'fib(4)', state: 'waiting for fib(3) + fib(2)', ret: 'pending' },
                { fn: 'fib(3)', state: 'waiting for fib(2) + fib(1)', ret: 'pending' },
                { fn: 'fib(2)', state: 'computing base case fib(1) + fib(0)', ret: '1' },
                { fn: 'fib(1)', state: 'base case reached', ret: '1' },
              ].map((frame, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 14px', borderRadius: 10, background: i === 0 ? 'color-mix(in srgb, var(--acc) 18%, var(--card2))' : 'var(--card2)',
                    border: `1px solid ${i === 0 ? 'var(--acc)' : 'var(--line2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)' }}>{frame.fn}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{frame.state}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: frame.ret === 'pending' ? 'var(--pal-amber)' : 'var(--pal-mint)' }}>
                    {frame.ret}
                  </span>
                </div>
              ))}
            </div>
          )}

          {selectedAlgo.mode === 'state' && (
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(2, 1fr)', gap: 16, width: '100%', maxWidth: 560 }}>
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line2)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accTx)', marginBottom: 8 }}>STACK MEMORY</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'monospace' }}>
                  <div style={{ padding: 6, background: 'var(--card)', borderRadius: 6 }}>{'main() frame: [ptr -> 0x7FFE]'}</div>
                  <div style={{ padding: 6, background: 'var(--card)', borderRadius: 6 }}>balance = $1,420.00</div>
                  <div style={{ padding: 6, background: 'var(--card)', borderRadius: 6 }}>status = ACTIVE</div>
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line2)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pal-cyan)', marginBottom: 8 }}>HEAP MEMORY</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'monospace' }}>
                  <div style={{ padding: 6, background: 'var(--card)', borderRadius: 6 }}>Object [0x7FFE]: BankAccount</div>
                  <div style={{ padding: 6, background: 'var(--card)', borderRadius: 6 }}>Owner: "Benjamin"</div>
                  <div style={{ padding: 6, background: 'var(--card)', borderRadius: 6 }}>Transactions: [4 nodes]</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Playback Controller */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderTop: '1px solid var(--line2)', background: 'var(--card2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={handlePrev} className="hov tap" title="Previous step" style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}>
              <Icon name="back" size={14} color="var(--tx)" />
            </button>

            <button
              onClick={() => { setIsPlaying(!isPlaying); playClick(); }}
              className="hov tap"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 32,
                borderRadius: 8, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12, fontWeight: 800,
                border: 'none', cursor: 'pointer',
              }}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={13} color="var(--ink)" />
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button onClick={handleNext} className="hov tap" title="Next step" style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}>
              <Icon name="chevron" size={14} color="var(--tx)" />
            </button>

            <button onClick={handleReset} className="hov tap" title="Reset" style={{
              padding: '0 10px', height: 32, borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card)',
              fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', cursor: 'pointer',
            }}>
              Reset
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>Speed:</span>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: speed === s ? 'var(--acc)' : 'var(--card)',
                  color: speed === s ? 'var(--ink)' : 'var(--tx3)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
