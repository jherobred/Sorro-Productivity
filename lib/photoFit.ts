/**
 * Where a picture sits inside its frame.
 *
 *   node lib/photoFit.check.ts
 *
 * Three numbers, applied as CSS by components/PhotoFrame: `x`/`y` are the
 * percentages `object-position` takes, `zoom` is a plain scale. The file in
 * storage is never touched, so reframing is free and a photo reframed ten
 * times is exactly as sharp as when it was uploaded.
 *
 * The maths lives here rather than in the component because it is the only
 * part that can be wrong in a way you would not see until somebody's face was
 * off the edge of their own avatar.
 */

export type Fit = { x: number; y: number; zoom: number };

export const CENTRED: Fit = { x: 50, y: 50, zoom: 1 };

/** The zoom range the slider offers. 1 is "fit"; past 4 is a pixel hunt. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Read a stored value into a usable one.
 *
 * The database column defaults to `{}` and older rows have no key at all, so
 * every field has to survive being missing. Anything out of range is pulled
 * back in rather than rejected — a bad number should still show you a picture.
 */
export function toFit(v: unknown): Fit {
  const o = (v ?? {}) as Partial<Record<keyof Fit, unknown>>;
  const num = (k: keyof Fit, fallback: number) =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : fallback;
  return {
    x: clamp(num('x', 50), 0, 100),
    y: clamp(num('y', 50), 0, 100),
    zoom: clamp(num('zoom', 1), MIN_ZOOM, MAX_ZOOM),
  };
}

/**
 * One drag step.
 *
 * `dx`/`dy` are pixels the pointer moved; `w`/`h` are the frame's size. The
 * sign is inverted because `object-position` says which part of the *picture*
 * meets the frame's edge: dragging right should reveal more of the picture's
 * left, which is a smaller percentage. Get this backwards and the picture
 * fights your finger.
 *
 * Divided by the zoom so the control gets finer the further in you are —
 * at 4× a 20-pixel nudge would otherwise throw the subject out of frame, and
 * the last few pixels of framing would be unreachable on a phone.
 */
export function pan(fit: Fit, dx: number, dy: number, w: number, h: number): Fit {
  return {
    ...fit,
    x: clamp(fit.x - (dx / Math.max(1, w)) * 100 / fit.zoom, 0, 100),
    y: clamp(fit.y - (dy / Math.max(1, h)) * 100 / fit.zoom, 0, 100),
  };
}

export const setZoom = (fit: Fit, zoom: number): Fit => ({ ...fit, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) });

/** True when nothing has been adjusted — lets a caller skip writing a default. */
export const isCentred = (f: Fit) => f.x === 50 && f.y === 50 && f.zoom === 1;
