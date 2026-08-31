'use client';

import { usePrefs } from '@/lib/prefs';

/**
 * The one progress bar in the app.
 *
 * Every screen used to draw its own — a 7px track div with a coloured child
 * whose width was a percentage string, and a `transition: width` that each
 * caller wrote out again with its own duration. Same shape twelve times, and
 * twelve chances for one of them to animate differently from the rest.
 *
 * That was solved by drawing it in text — a bar of `█` on a track of `░` — but
 * text bought the consistency at the price of everything else. A fixed
 * character count cannot reflow, so it was capped at 24 cells and truncated on
 * a phone; the number had to sit outside the track; and a row of block glyphs
 * reads as a terminal rather than as a body or a budget.
 *
 * This is the bar Home already used for "Happening Now": a real object. A
 * dotted track, a fill that glows in the section hue, a shimmer that sweeps it,
 * and the label *inside* the bar — which means a bar can finally say what it is
 * measuring rather than only how far along it is.
 *
 * Five shapes, one component. `shape` picks the geometry; everything else about
 * a bar is the same in all of them, which is the whole point of there being one
 * of these.
 *
 * The `cells` prop is kept and ignored. Fourteen call sites passed a character
 * count; deleting the prop would mean touching all fourteen to say nothing, and
 * a fluid bar has no cells to count.
 */

/** How long the fill takes to travel, at any distance. Matches Home. */
const RUN_MS = 800;
const EASE = 'cubic-bezier(.16, 1, .3, 1)';

export type BarShape =
  /** 24px with room for a label. The default, and what most rows want. */
  | 'standard'
  /** 15px, no label. For a row that already prints its number alongside. */
  | 'slim'
  /** 4px, square, sits flush along the bottom edge of a card or button. */
  | 'edge'
  /** 22px carrying two numbers — spent on the left, the limit on the right. */
  | 'jar'
  /** Fills upward instead of across, with the label set vertically. */
  | 'vertical';

const GEOM: Record<BarShape, { size: number; radius: number; font: number; dot: number }> = {
  standard: { size: 24, radius: 6, font: 11, dot: 7 },
  slim: { size: 15, radius: 5, font: 9, dot: 5 },
  edge: { size: 4, radius: 0, font: 0, dot: 0 },
  jar: { size: 22, radius: 6, font: 10, dot: 7 },
  vertical: { size: 34, radius: 9, font: 9, dot: 6 },
};

export function AsciiBar({
  value,
  hue,
  label,
  showValue = true,
  suffix = '%',
  shape = 'standard',
  text,
  rightText,
  length,
  cells: _cells,
  size: _size,
}: {
  /** 0–100. Values outside are clamped rather than overflowing the track. */
  value: number;
  /** Section hue for the fill. Defaults to the accent. */
  hue?: string;
  /** Announced to screen readers, which never see the bar. */
  label?: string;
  /** Print the percentage inside the track. */
  showValue?: boolean;
  /** Written after the number. Pass '' for a bare count. */
  suffix?: string;
  shape?: BarShape;
  /** Overrides the percentage with your own words, e.g. "1.50 L of 2.5 L". */
  text?: string;
  /** `jar` only: the right-hand number, e.g. the budget. */
  rightText?: string;
  /** Track length for `vertical` (height) — ignored by the others, which fill their width. */
  length?: number;
  /** Retired with the text bar. Accepted so the existing call sites still compile. */
  cells?: number;
  /** Retired with the text bar. */
  size?: number;
}) {
  const { prefs } = usePrefs();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const g = GEOM[shape];
  const colour = hue || 'var(--accTx)';
  const vertical = shape === 'vertical';
  const full = pct >= 99.5;

  /**
   * The fill is a plain width/height transition rather than a rAF loop. The
   * text bar needed frames because it had to recompute glyphs; a div does not,
   * and letting the compositor own it keeps a screen full of bars off the main
   * thread.
   */
  const move = prefs.motion ? `${vertical ? 'height' : 'width'} ${RUN_MS}ms ${EASE}` : 'none';

  const inner = (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        ...(vertical
          ? { left: 0, right: 0, bottom: 0, height: `${pct}%` }
          : { left: 0, top: 0, bottom: 0, width: `${pct}%` }),
        display: 'block',
        zIndex: 1,
        borderRadius: full
          ? g.radius
          : vertical
            ? `0 0 ${g.radius - 1}px ${g.radius - 1}px`
            : `${g.radius - 1}px 0 0 ${g.radius - 1}px`,
        background: `linear-gradient(${vertical ? '0deg' : '90deg'},
          color-mix(in srgb, ${colour} 78%, transparent) 0%, ${colour} 100%)`,
        boxShadow: `0 0 ${shape === 'edge' ? 8 : 12}px color-mix(in srgb, ${colour} 45%, transparent)`,
        transition: move,
        overflow: 'hidden',
      }}
    >
      {prefs.motion && pct > 0 && shape !== 'edge' && (
        <span
          className="bar-sheen"
          style={{
            position: 'absolute', inset: 0, backgroundSize: '200% 100%',
            backgroundImage:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,.45) 50%, transparent 100%)',
          }}
        />
      )}
    </span>
  );

  const words = text ?? (showValue ? `${Math.round(pct)}${suffix}` : '');
  const showLabel = shape !== 'edge' && (words !== '' || rightText);

  return (
    <span
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{
        position: 'relative',
        display: 'block',
        flex: 'none',
        ...(vertical
          ? { width: g.size, height: length ?? '100%', minHeight: 64 }
          : { width: '100%', height: g.size }),
        borderRadius: g.radius,
        background: 'color-mix(in srgb, var(--line2) 38%, var(--card2))',
        border: shape === 'edge' ? 'none' : '1px solid var(--line2)',
        overflow: 'hidden',
      }}
    >
      {g.dot > 0 && (
        <span
          aria-hidden
          style={{
            position: 'absolute', inset: 0, opacity: 0.62,
            backgroundImage: 'radial-gradient(circle, var(--line2) 1.2px, transparent 1.2px)',
            backgroundSize: `${g.dot}px ${g.dot}px`,
          }}
        />
      )}
      {inner}
      {showLabel && (
        <span
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center',
            justifyContent: rightText ? 'space-between' : 'center',
            padding: rightText ? '0 8px' : 0,
            gap: 5, pointerEvents: 'none',
            fontFamily: 'var(--font-mono)', fontSize: g.font, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', color: 'var(--tx)',
            textShadow: '0 1px 3px rgba(0,0,0,.75)',
            ...(vertical
              ? { writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)', justifyContent: 'center' }
              : null),
          }}
        >
          {words && <span>{words}</span>}
          {rightText && <span style={{ opacity: 0.85 }}>{rightText}</span>}
        </span>
      )}
    </span>
  );
}

/**
 * The same bar with nothing but the track — for rows that already state the
 * number next to it, which most of them do.
 */
export function AsciiBarBare(props: Omit<Parameters<typeof AsciiBar>[0], 'showValue'>) {
  return <AsciiBar {...props} showValue={false} />;
}
