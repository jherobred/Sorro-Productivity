/**
 * The geometry behind the app's one progress bar (components/AsciiBar.tsx).
 *
 * A bar of `cells` characters has to represent a percentage, and rounding it to
 * whole cells makes a 24-cell bar move in 4.2% steps — visible as tiles popping
 * in rather than a fill growing. The leading edge instead picks one of eight
 * eighth-blocks, so the same bar resolves 192 positions and reads as motion.
 *
 * Pure, so it can be checked without a DOM: lib/asciiBar.check.ts.
 */

/** Left-to-right eighth blocks. Index 0 is empty; a full cell is `█`. */
export const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const;
export const FULL = '█';
export const TRACK = '░';

export type BarParts = {
  /** Whole filled cells. */
  filled: string;
  /** The partial cell at the leading edge, or '' when the edge is flush. */
  edge: string;
  /** The unfilled remainder. */
  rest: string;
};

export function barParts(pct: number, cells: number): BarParts {
  const n = Math.max(1, Math.floor(cells));
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

  const eighths = Math.round((p / 100) * n * 8);
  const whole = Math.min(Math.floor(eighths / 8), n);
  const edge = whole < n ? EIGHTHS[eighths % 8] : '';

  return {
    filled: FULL.repeat(whole),
    edge,
    rest: TRACK.repeat(Math.max(0, n - whole - (edge ? 1 : 0))),
  };
}

/** Total printed width, which must always equal `cells` or the row jitters. */
export function barWidth(parts: BarParts): number {
  return parts.filled.length + (parts.edge ? 1 : 0) + parts.rest.length;
}
