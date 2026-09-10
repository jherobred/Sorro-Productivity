/**
 * Readable text over colours and pictures the reader chose.
 *
 * The palette used to be six curated hues, so a tag could safely be drawn in
 * its own colour and note titles could sit on a generated gradient. The wheel
 * and the wallpapers ended that: white is now a notebook colour, and a
 * photograph of snow is now a card background. Both put white on white.
 *
 * Luminance is the sRGB relative luminance from WCAG 2.1, which is what
 * contrast ratios are actually built on — a plain (r+g+b)/3 calls yellow and
 * blue equally bright and picks the wrong ink for both.
 */

const INK_DARK = '#0E1116';
const INK_LIGHT = '#FFFFFF';

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0 (black) to 1 (white). Alpha is ignored; the backdrop behind it is unknown. */
export function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  if (full.length < 6) return 0.5;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return 0.5;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Black or white, whichever this background can carry. */
export function readableOn(background: string): string {
  return luminance(background) > 0.45 ? INK_DARK : INK_LIGHT;
}

/** The same call for a picture, whose luminance was measured when it was stored. */
export function readableOnLuminance(lum: number | undefined): string | undefined {
  if (lum === undefined) return undefined;
  return lum > 0.45 ? INK_DARK : INK_LIGHT;
}

/**
 * A chosen colour, nudged until it can be read as text on the card.
 *
 * The tag keeps its own hue — that is the point of colouring it — so this
 * mixes toward the theme's ink rather than replacing it, and only as far as
 * it has to. A mid-tone colour comes back untouched.
 */
export function inkFor(color: string, dark: boolean): string {
  const lum = luminance(color);
  if (dark && lum < 0.14) return `color-mix(in srgb, ${color} 55%, #FFFFFF)`;
  if (!dark && lum > 0.6) return `color-mix(in srgb, ${color} 55%, ${INK_DARK})`;
  return color;
}
