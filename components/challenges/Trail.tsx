'use client';

import { Mascot } from './Mascot';
import type { Mood } from '@/lib/mascot';

/**
 * The Trail — a challenge as a walk everyone is on.
 *
 * What was here was the Arena: a floor tipped back with `rotateX` and a token
 * per person sliding across it. The perspective was the problem. A tilted plane
 * makes the far end shorter than the near one, so two people the same distance
 * apart looked further apart at the top of the board than at the bottom, and
 * the one thing a race view exists to show — the gap — was the thing it drew
 * wrong. It was also a floor with nobody on it.
 *
 * Flat lanes, then, and a creature on each. Left is where everyone started,
 * right is the finish, and the ground behind each animal is what it has
 * covered. Same numbers as the standings list, arranged so the gap is a
 * distance instead of a subtraction.
 *
 * Nothing here shames the back of the field: an animal's face comes from
 * whether that person went recently, never from where they are in the line
 * (`lib/mascot.ts` has the reasoning). The only mark of first place is the
 * crown, which is a fact rather than a verdict.
 *
 * **They are running now.** The first version drew everybody at 32 pixels,
 * upright and breathing, which is a standings list with pictures on it — the
 * gap was in the geometry but nothing on the card said anyone was trying. Each
 * animal that has covered any ground leans into it, gallops, and kicks dust
 * back down the lane, and the one in front is going visibly harder. The size
 * went up with it, because a 32px head cannot carry a lean.
 */

export type Walker = {
  id: string;
  label: string;
  color: string;
  /** How far along, 0–1. */
  at: number;
  score: number;
  you: boolean;
  mood: Mood;
};

export function Trail({
  walkers, unit, target,
}: {
  walkers: Walker[];
  unit: string;
  /** Drawn as the flag when the rule has one. */
  target?: number | null;
}) {
  const lanes = Math.max(1, walkers.length);
  // Roomier than it was: the animals are half again as big and a gallop needs
  // somewhere to go. Above six competitors it tightens rather than growing a
  // card nobody can see the bottom of.
  const laneH = lanes > 6 ? 52 : 62;
  const height = lanes * laneH + 30;
  const lead = walkers.reduce((n, w) => Math.max(n, w.score), 0);

  return (
    <div style={{ padding: '4px 0 2px' }}>
      <div
        role="img"
        aria-label={walkers.map((w) => `${w.label}: ${w.score} ${unit}`).join('. ')}
        style={{
          position: 'relative', height, borderRadius: 12, overflow: 'hidden',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--acc) 13%, transparent), transparent 62%), url("/textures/topo-contour.svg") no-repeat center bottom / cover, var(--card2)',
          border: '1px solid var(--line)',
        }}>

        {/* hills, drawn once behind everything — the only decoration on the panel */}
        <svg aria-hidden viewBox="0 0 300 60" preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}>
          <path d="M0 44 q38 -22 74 -4 q34 17 68 -6 q36 -24 74 -2 q40 23 84 2 V60 H0 Z"
            fill="color-mix(in srgb, var(--acc) 16%, transparent)" />
          <path d="M0 52 q46 -14 92 2 q44 15 88 -4 q44 -18 120 4 V60 H0 Z"
            fill="color-mix(in srgb, var(--acc) 9%, transparent)" />
        </svg>

        {/* the finish: a chequered post, not a dotted line — it is the thing
            everyone on the card is running at and it should look like it */}
        <span aria-hidden style={{
          position: 'absolute', right: '3.5%', top: 6, bottom: 6, width: 7, borderRadius: 2,
          background:
            'repeating-conic-gradient(var(--tx2) 0% 25%, var(--card) 0% 50%) 0 0 / 7px 7px',
          opacity: 0.7,
        }} />
        <span aria-hidden style={{
          position: 'absolute', right: '3.5%', top: 4, width: 14, height: 10,
          background: target != null ? 'var(--acc)' : 'var(--tx3)',
          clipPath: 'polygon(0 0, 100% 26%, 0 52%)', transformOrigin: 'left',
        }} />

        {walkers.map((w, i) => {
          // Clamped away from both edges: at nought the animal would be sliced
          // in half by the frame, and at one it would stand on the flag.
          const at = Math.max(0.02, Math.min(0.86, w.at));
          const flip = at > 0.5;
          const size = w.you ? 54 : 46;
          // Nobody at the start line is sprinting, and neither is a rest day.
          const racing = w.at > 0.01 && w.mood !== 'resting';
          const behind = lead - w.score;
          return (
            <span key={w.id} style={{
              position: 'absolute', left: '4%', right: '4%', top: 12 + i * laneH, height: laneH,
            }}>
              {/* the path, and the part of it walked */}
              <span aria-hidden style={{
                position: 'absolute', left: 0, right: 0, bottom: 7, height: 2, borderRadius: 2,
                background: 'repeating-linear-gradient(90deg, var(--line2) 0 6px, transparent 6px 12px)',
              }} />
              <span aria-hidden className="tr-fill" style={{
                position: 'absolute', left: 0, bottom: 7, width: `${at * 100}%`, height: 3, borderRadius: 2,
                background: `linear-gradient(90deg, color-mix(in srgb, ${w.color} 25%, transparent), ${w.color})`,
              }} />

              {/*
                The animal and its name are one row, so they can never land on
                top of each other. Which way the row runs is what keeps it on
                the card: past halfway the name goes on the left, because the
                walker furthest along is by definition the one with no room to
                its right — the leader's name was the first thing to fall off.
                The offset is half a mascot, so the animal stands on the point
                whichever way the row is facing.
              */}
              <span className="tr-walk" style={{
                position: 'absolute', bottom: 4, display: 'flex', alignItems: 'flex-end', gap: 7,
                flexDirection: flip ? 'row-reverse' : 'row',
                maxWidth: flip ? `${at * 100}%` : `${(1 - at) * 100}%`,
                ...(flip
                  ? { right: `${(1 - at) * 100}%`, translate: `${size / 2}px 0` }
                  : { left: `${at * 100}%`, translate: `${-size / 2}px 0` }),
              }}>
                <Mascot id={w.id} mood={w.mood} hue={w.color} size={size} crown={i === 0} racing={racing} />
                <span style={{
                  marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0,
                  padding: '2px 8px', borderRadius: 999,
                  background: 'color-mix(in srgb, var(--card) 86%, transparent)',
                  border: `1px solid ${w.you ? w.color : 'var(--line2)'}`,
                  fontSize: 10.5, fontWeight: 800, color: w.you ? 'var(--tx)' : 'var(--tx2)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.you ? 'You' : w.label}
                  </span>
                  <span style={{ flex: 'none', color: w.color }}>{w.score}</span>
                  {/* How far back, in the units of the challenge. The gap is the
                      one number a race view owes you and it was arithmetic the
                      reader had to do. Nobody is told they are last. */}
                  {behind > 0 && (
                    <span style={{ flex: 'none', color: 'var(--tx3)', fontWeight: 700 }}>−{behind}</span>
                  )}
                </span>
              </span>
            </span>
          );
        })}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 7,
        fontSize: 9.5, color: 'var(--tx3)', letterSpacing: '.08em', fontWeight: 700,
      }}>
        <span>START</span>
        <span>{target != null ? `${target} ${unit} — FINISH` : `MOST ${unit.toUpperCase()} WINS`}</span>
      </div>
    </div>
  );
}
