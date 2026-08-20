/**
 * Canvas geometry: where an edge leaves a card, what shape it draws between
 * two, and what a card's box becomes while a handle is being dragged.
 *
 * Its own module with no imports, so `node lib/canvasGeom.check.ts` can run it.
 * The arithmetic here is the part that has to be right — a card that turns
 * inside out when you drag past its own far edge is not a rendering bug, it is
 * a maths bug, and it belongs somewhere a check can reach.
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Which edge or corner of a card is being dragged. */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** A card, as far as geometry cares. */
export type Box = { x: number; y: number; w: number; h: number };

/** Cards land on a 10px grid unless alt is held, and never get smaller than this. */
export const SNAP = 10;
export const MIN_W = 100;
export const MIN_H = 60;

/** Where an edge leaves a card, in world coordinates. */
export function anchor(n: Box, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: n.x + n.w / 2, y: n.y };
    case 'bottom': return { x: n.x + n.w / 2, y: n.y + n.h };
    case 'left': return { x: n.x, y: n.y + n.h / 2 };
    case 'right': return { x: n.x + n.w, y: n.y + n.h / 2 };
  }
}

const OUT: Record<Side, [number, number]> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * A cubic bezier whose control points push straight out of each side — what
 * makes Obsidian's edges leave a card perpendicular rather than cutting
 * diagonally across it. Control distance grows with the gap, capped so a long
 * edge does not balloon.
 */
export function edgePath(a: { x: number; y: number }, aSide: Side, b: { x: number; y: number }, bSide: Side): string {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const pull = Math.min(Math.max(dist * 0.4, 30), 180);
  const [ax, ay] = OUT[aSide];
  const [bx, by] = OUT[bSide];
  return `M ${a.x} ${a.y} C ${a.x + ax * pull} ${a.y + ay * pull}, ${b.x + bx * pull} ${b.y + by * pull}, ${b.x} ${b.y}`;
}

/** The pair of sides that gives the shortest, least-crossing connection. */
export function bestSides(a: Box, b: Box): [Side, Side] {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Bounding box of every card, for zoom-to-fit. */
export function bounds(nodes: Box[]) {
  if (!nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * The card's new box while a handle is being dragged.
 *
 * A west or north handle moves the corner it is on and leaves the opposite one
 * where it is, so the card grows away from the pointer rather than sliding.
 * The minimum sizes are applied to the *edge being moved*, which is what stops
 * a card from turning inside out when you drag past its far side.
 */
export function resized(
  g: { handle: Handle; x: number; y: number; w: number; h: number },
  dx: number, dy: number, snap = true,
): { x: number; y: number; w: number; h: number } {
  const q = (v: number) => (snap ? Math.round(v / SNAP) * SNAP : Math.round(v));
  let { x, y, w, h } = g;

  if (g.handle.includes('e')) w = Math.max(MIN_W, q(g.w + dx));
  if (g.handle.includes('s')) h = Math.max(MIN_H, q(g.h + dy));
  if (g.handle.includes('w')) {
    const right = g.x + g.w;
    x = Math.min(right - MIN_W, q(g.x + dx));
    w = right - x;
  }
  if (g.handle.includes('n')) {
    const bottom = g.y + g.h;
    y = Math.min(bottom - MIN_H, q(g.y + dy));
    h = bottom - y;
  }
  return { x, y, w, h };
}
