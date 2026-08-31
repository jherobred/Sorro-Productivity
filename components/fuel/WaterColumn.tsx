'use client';

import { usePrefs } from '@/lib/prefs';
import { AsciiBar } from '@/components/AsciiBar';
import {
  hydration, fillPct, goalPct, GOAL_MARK, GOAL_ML, CUP_ML, type Hydration,
} from '@/lib/hydration';

/**
 * Water, as a thing you can look at rather than a number you have to judge.
 *
 * The column is the whole point: it fills, and the colour and the speed of the
 * surface say whether that is the right amount for this hour. Behind pace it is
 * amber and almost still; on pace it is a calm green; over the hourly ceiling
 * it goes red and choppy and the chip pulses. Nobody has to read a percentage
 * to know which of those is happening.
 *
 * Two details that matter and look like decoration:
 *
 * The glass is drawn to 3.2 L, not to the 2.5 L goal, so the dashed goal line
 * sits at 78% with room above it. A column that tops out at the goal can never
 * show overshoot, which is the one state it exists to warn about.
 *
 * The wave is a rounded square wider than the glass, rotating. Its width sets
 * how much curve you see: much wider and the surface reads as a flat line, so
 * 155% is tuned rather than arbitrary. It is clipped by the fill, which is what
 * makes it a surface instead of a wash over the whole vessel.
 */

export function WaterColumn({
  total, lastHour, hour, width = 70, height = 142,
}: {
  total: number; lastHour: number; hour: number; width?: number; height?: number;
}) {
  const { prefs } = usePrefs();
  const s = hydration(total, lastHour, hour);

  return (
    <div style={{ width, height, flex: 'none' }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        borderRadius: '10px 10px 16px 16px', border: '1.5px solid var(--line2)',
        background: 'linear-gradient(180deg, rgba(120,116,143,.11), rgba(120,116,143,.03))',
      }}>
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, bottom: `${GOAL_MARK}%`, height: 0, zIndex: 4,
          borderTop: '1px dashed rgba(239,237,245,.45)',
        }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden',
          height: `${fillPct(total)}%`,
          transition: prefs.motion ? 'height .9s cubic-bezier(.16,1,.3,1)' : 'none',
        }}>
          <span aria-hidden style={{ position: 'absolute', inset: 0, background: s.hue, opacity: 0.3 }} />
          {[0, 1].map((n) => (
            <span
              key={n}
              aria-hidden
              className={prefs.motion ? 'water-wave' : undefined}
              style={{
                position: 'absolute', left: '50%', top: n === 0 ? -11 : -3,
                width: '155%', paddingBottom: '155%', borderRadius: '41%',
                background: s.hue, opacity: n === 0 ? 0.45 : 0.9,
                transform: 'translateX(-50%)',
                animationDuration: `${n === 0 ? s.waveSec : s.waveSec * 1.45}s`,
                animationDirection: n === 1 ? 'reverse' : 'normal',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The chip. Pulses only for the two warnings. */
export function WaterChip({ state }: { state: Hydration }) {
  const { prefs } = usePrefs();
  return (
    <span
      className={state.alarm && prefs.motion ? 'water-thump' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px',
        borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700,
        letterSpacing: '.09em', textTransform: 'uppercase', alignSelf: 'flex-start',
        background: `color-mix(in srgb, ${state.hue} 17%, transparent)`,
        color: state.hue,
        border: `1px solid color-mix(in srgb, ${state.hue} 42%, transparent)`,
      }}
    >
      {state.label}
    </span>
  );
}

/**
 * Ten cups, sized to fit whatever they are given rather than to a fixed width.
 *
 * They flex, so all ten stay on one row inside the card at any phone width —
 * the previous version put them outside it and let them wrap.
 */
export function Cups({
  count, goal = GOAL_ML / CUP_ML, hue, onSet,
}: {
  count: number; goal?: number; hue: string; onSet: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 3, width: '100%' }}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < count;
        return (
          <button
            key={i}
            onClick={() => onSet(i + 1 === count ? i : i + 1)}
            aria-label={`${i + 1} cup${i ? 's' : ''}`}
            aria-pressed={on}
            style={{
              flex: 1, minWidth: 0, height: 27, padding: 0, cursor: 'pointer',
              borderRadius: '3px 3px 7px 7px', background: 'transparent',
              border: `1.5px solid ${on ? `color-mix(in srgb, ${hue} 58%, transparent)` : 'var(--line2)'}`,
              position: 'relative', overflow: 'hidden',
            }}
          >
            {on && (
              <span aria-hidden style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: '74%',
                background: hue, opacity: 0.8, transition: 'background .4s ease',
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The whole card: column, read-out, cups, bar. */
export function WaterCard({
  total, lastHour, hour, onSetCups,
}: {
  total: number; lastHour: number; hour: number; onSetCups: (n: number) => void;
}) {
  const s = hydration(total, lastHour, hour);
  const cups = Math.round(total / CUP_ML);

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 15,
      padding: 11, display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', gap: 11 }}>
        <WaterColumn total={total} lastHour={lastHour} hour={hour} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <WaterChip state={s} />
          <div>
            <span className="num" style={{
              fontSize: 28, fontWeight: 700, letterSpacing: '-.04em', display: 'block', lineHeight: 1,
            }}>
              {(total / 1000).toFixed(2)}
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}> L</span>
            </span>
            <span className="num" style={{ fontSize: 9.5, color: 'var(--tx3)' }}>
              of {(GOAL_ML / 1000).toFixed(1)} L · {cups} of {GOAL_ML / CUP_ML} cups
            </span>
          </div>
          <p style={{ fontSize: 10, lineHeight: 1.4, color: s.alarm ? s.hue : 'var(--tx2)', margin: 0 }}>
            {s.why} {s.act}
          </p>
        </div>
      </div>

      <Cups count={cups} hue={s.hue} onSet={onSetCups} />

      <AsciiBar
        value={goalPct(total)}
        hue={s.hue}
        text={`${(total / 1000).toFixed(2)} L of ${(GOAL_ML / 1000).toFixed(1)} L`}
        label="Water today"
      />
    </div>
  );
}
