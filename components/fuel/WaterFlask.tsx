'use client';

import { usePrefs } from '@/lib/prefs';
import { Icon } from '@/components/Icon';
import {
  hydration, fillPct, goalPct, GOAL_MARK, GOAL_ML, CUP_ML, type Hydration,
} from '@/lib/hydration';

/**
 * Water Flask & Dashboard Card matching Canva layout with error prevention & backtracking.
 *
 * Left: Visual cylinder tank with 2.5L STOP ceiling line and dynamic fluid.
 * Right: Pace chip, big stat, coaching copy, 10 interactive cup icons, and matrix progress bar.
 */

export function WaterFlask({
  total,
  lastHour,
  hour,
  width = 86,
  height = 168,
}: {
  total: number;
  lastHour: number;
  hour: number;
  width?: number;
  height?: number;
}) {
  const { prefs } = usePrefs();
  const s = hydration(total, lastHour, hour);
  const fill = fillPct(total);

  return (
    <div style={{ width, height, flex: 'none', position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          borderRadius: '16px 16px 20px 20px',
          border: '1.5px solid rgba(255,255,255,0.12)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
          boxShadow: 'inset 0 0 16px rgba(0,0,0,0.4)',
        }}
      >
        {/* 2.5L STOP indicator line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${GOAL_MARK}%`,
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 6,
            borderTop: '1px dashed rgba(255,255,255,0.45)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 7.5,
              fontWeight: 800,
              letterSpacing: '.06em',
              color: 'rgba(255,255,255,0.75)',
              transform: 'translateY(-100%)',
              paddingBottom: 1,
            }}
          >
            2.5L STOP
          </span>
        </div>

        {/* Fluid level */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            height: `${fill}%`,
            transition: prefs.motion ? 'height .8s cubic-bezier(.16,1,.3,1)' : 'none',
          }}
        >
          {/* Base liquid color */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg, ${s.hue} 0%, color-mix(in srgb, ${s.hue} 70%, #000) 100%)`,
              opacity: 0.88,
            }}
          />

          {/* Fluid wave top animation */}
          {[0, 1].map((n) => (
            <span
              key={n}
              aria-hidden
              className={prefs.motion ? 'water-wave' : undefined}
              style={{
                position: 'absolute',
                left: '50%',
                top: n === 0 ? -12 : -5,
                width: '160%',
                paddingBottom: '160%',
                borderRadius: '42%',
                background: s.hue,
                opacity: n === 0 ? 0.45 : 0.95,
                transform: 'translateX(-50%)',
                animationDuration: `${n === 0 ? s.waveSec : s.waveSec * 1.35}s`,
                animationDirection: n === 1 ? 'reverse' : 'normal',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 10 Interactive Cup icons matching Canva mockup glyphs */
export function FlaskCups({
  count,
  goal = 10,
  hue,
  onSet,
}: {
  count: number;
  goal?: number;
  hue: string;
  onSet: (n: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4, width: '100%' }}>
      {Array.from({ length: goal }, (_, i) => {
        const active = i < count;
        return (
          <button
            key={i}
            onClick={() => onSet(i + 1 === count ? i : i + 1)}
            aria-label={`${i + 1} of ${goal} cups (tap to backtrack)`}
            aria-pressed={active}
            className="k-squish"
            style={{
              height: 28,
              padding: 0,
              borderRadius: '4px 4px 8px 8px',
              border: `1.5px solid ${active ? hue : 'rgba(255,255,255,0.18)'}`,
              background: active ? hue : 'rgba(255,255,255,0.03)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              transition: 'all .2s ease',
              boxShadow: active ? `0 0 8px color-mix(in srgb, ${hue} 35%, transparent)` : 'none',
            }}
          >
            {/* Cup silhouette line */}
            <span
              style={{
                width: '60%',
                height: 2.5,
                borderRadius: 1,
                background: active ? '#0B0A13' : 'rgba(255,255,255,0.3)',
                transform: 'translateY(-2px)',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Complete Water Card with Tank, coaching message, cups, progress bar, and backtrack toolbar */
export function FuelWaterCard({
  total,
  lastHour,
  hour,
  hasSips = false,
  onSetCups,
  onAddSip,
  onUndoLastSip,
}: {
  total: number;
  lastHour: number;
  hour: number;
  hasSips?: boolean;
  onSetCups: (n: number) => void;
  onAddSip: (ml: number) => void;
  onUndoLastSip?: () => void;
}) {
  const s = hydration(total, lastHour, hour);
  const cups = Math.round(total / CUP_ML);
  const pct = goalPct(total);

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left: Flask */}
        <WaterFlask total={total} lastHour={lastHour} hour={hour} />

        {/* Right: Readout & Controls */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Status row with Backtrack indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid color-mix(in srgb, ${s.hue} 50%, transparent)`,
                background: `color-mix(in srgb, ${s.hue} 16%, transparent)`,
                color: s.hue,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
              }}
            >
              {s.label}
            </div>

            {hasSips && onUndoLastSip && (
              <button
                onClick={onUndoLastSip}
                className="hov k-squish"
                title="Undo last logged water sip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx2)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                <Icon name="undo" size={12} color="var(--tx3)" />
                Undo last sip
              </button>
            )}
          </div>

          {/* Large Number */}
          <div>
            <div
              className="num"
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '-.03em',
                lineHeight: 1,
                color: 'var(--tx)',
              }}
            >
              {(total / 1000).toFixed(2)}
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx3)', marginLeft: 4 }}>L</span>
            </div>
            <div
              className="num"
              style={{
                fontSize: 11.5,
                color: 'var(--tx3)',
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              of {(GOAL_ML / 1000).toFixed(1)} L · {cups} of {GOAL_ML / CUP_ML} cups
            </div>
          </div>

          {/* Coaching text */}
          <p
            style={{
              fontSize: 11.5,
              lineHeight: 1.45,
              color: s.alarm ? s.hue : 'var(--tx2)',
              margin: '2px 0 0',
            }}
          >
            {s.why} {s.act}
          </p>

          {/* 10 Interactive Cup icons (tap to increment or backtrack) */}
          <div style={{ marginTop: 4 }}>
            <FlaskCups count={cups} hue={s.hue} onSet={onSetCups} />
          </div>

          {/* Segmented dot-matrix progress track */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 14,
              borderRadius: 5,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--line2)',
              overflow: 'hidden',
            }}
          >
            {/* Dot pattern background */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.2) 1.2px, transparent 1.2px)',
                backgroundSize: '5px 5px',
                opacity: 0.7,
              }}
            />
            {/* Fill */}
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                borderRadius: 4,
                background: `linear-gradient(90deg, color-mix(in srgb, ${s.hue} 70%, transparent) 0%, ${s.hue} 100%)`,
                boxShadow: `0 0 10px color-mix(in srgb, ${s.hue} 50%, transparent)`,
                transition: 'width .6s cubic-bezier(.16,1,.3,1)',
              }}
            />
          </div>

          {/* Action Toolbar with Increment & Backtrack buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 1fr', gap: 6, marginTop: 2 }}>
            <button
              onClick={() => onAddSip(250)}
              className="hov k-squish"
              style={BTN_MINI}
            >
              +1 Cup (250ml)
            </button>
            <button
              onClick={() => onAddSip(500)}
              className="hov k-squish"
              style={BTN_MINI}
            >
              +500ml Bottle
            </button>
            <button
              onClick={() => onSetCups(Math.max(0, cups - 1))}
              disabled={cups === 0}
              className="hov k-squish"
              style={{
                ...BTN_MINI,
                color: cups === 0 ? 'var(--tx3)' : '#FF8585',
                borderColor: cups === 0 ? 'var(--line2)' : 'rgba(255, 107, 107, 0.3)',
                cursor: cups === 0 ? 'not-allowed' : 'pointer',
                opacity: cups === 0 ? 0.4 : 1,
              }}
            >
              -1 Cup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const BTN_MINI: React.CSSProperties = {
  padding: '7px 6px',
  borderRadius: 8,
  border: '1px solid var(--line2)',
  background: 'var(--card2)',
  color: 'var(--tx2)',
  fontSize: 10.5,
  fontWeight: 700,
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
  textAlign: 'center',
};
