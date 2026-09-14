/**
 * The arithmetic behind the cover crop tool, kept apart from the pointer
 * handling so it can be checked on its own.
 *
 * The frame stays still in the middle of the stage and the photo moves and
 * scales behind it. Offsets are in stage pixels, measured from the frame's
 * centre to the photo's centre. The photo may never leave a gap inside the
 * frame, so every change is clamped against the photo's size at that zoom.
 */

export type Size = { w: number; h: number };
export type Placement = { x: number; y: number; zoom: number; turn: 0 | 1 | 2 | 3 };

/** The photo's size once turned a quarter at a time. */
export const turned = (image: Size, turn: number): Size => (turn % 2 ? { w: image.h, h: image.w } : image);

/** The largest frame of this shape that fits the stage with a margin around it. */
export function frameFor(stage: Size, aspect: number, margin = 0.86): Size {
  const w = Math.min(stage.w * margin, stage.h * margin * aspect);
  return { w, h: w / aspect };
}

/** Stage pixels per photo pixel, so the photo just covers the frame at zoom 1. */
export const coverScale = (image: Size, frame: Size, turn: number) => {
  const t = turned(image, turn);
  return Math.max(frame.w / t.w, frame.h / t.h);
};

/** Keeps the photo covering the frame: no gap on any side. */
export function clampPlacement(p: Placement, image: Size, frame: Size): Placement {
  const zoom = Math.min(4, Math.max(1, p.zoom));
  const scale = coverScale(image, frame, p.turn) * zoom;
  const t = turned(image, p.turn);
  const spareX = Math.max(0, (t.w * scale - frame.w) / 2);
  const spareY = Math.max(0, (t.h * scale - frame.h) / 2);
  return { ...p, zoom, x: Math.min(spareX, Math.max(-spareX, p.x)), y: Math.min(spareY, Math.max(-spareY, p.y)) };
}

/**
 * The output size for a crop: as many photo pixels as the frame covers, never
 * upscaled, with the long edge capped.
 */
export function outputSize(image: Size, frame: Size, p: Placement, longest = 1600): Size {
  const scale = coverScale(image, frame, p.turn) * p.zoom;
  let w = frame.w / scale, h = frame.h / scale;
  const cap = Math.min(1, longest / Math.max(w, h));
  w *= cap; h *= cap;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/**
 * Where the frame's middle sits in the photo's own pixels. Used by tests to
 * check that what the frame shows is what the output draws.
 */
export function frameCentreInImage(image: Size, frame: Size, p: Placement): { x: number; y: number } {
  const scale = coverScale(image, frame, p.turn) * p.zoom;
  // Undo the offset and scale, then the quarter turns, around the photo's centre.
  let x = -p.x / scale, y = -p.y / scale;
  for (let i = 0; i < p.turn; i++) [x, y] = [y, -x];
  return { x: image.w / 2 + x, y: image.h / 2 + y };
}
