/**
 * Memories are stored without a table: each one is a photo in storage and a
 * tiny marker file whose *name* carries everything the map and the gallery
 * need. One listing of the marker folder is the whole index, on any device.
 *
 *   <id>,<kind>,<taken ms>,<lat>,<lng>,<base64url JSON>.webp
 *
 * The JSON holds the words: place, caption, what it is linked to, whether it
 * has a photo, run distance and time, and a short route. Commas separate the
 * parts because storage keys allow them and base64url never contains one.
 * Pure, so node --test can hold it.
 */

export const MEMORY_KINDS = ['meal', 'workout', 'run', 'moment'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type MemoryInfo = {
  id: string;
  kind: MemoryKind;
  /** When it happened, in ms. */
  at: number;
  lat: number | null;
  lng: number | null;
  place: string;
  caption: string;
  /** What it belongs to: "meal:<id>" or "workout:<id>". */
  ref: string | null;
  /** False for a run or a check-in saved without a picture. */
  photo: boolean;
  km: number | null;
  minutes: number | null;
  /** Simplified route as [lat, lng] pairs, for a run. */
  route: [number, number][] | null;
};

/** Keeps a name well inside storage's 1024-byte key limit. */
const TEXT_BYTES = 200;

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

function clip(text: string, bytes: number): string {
  let out = text.trim();
  while (utf8.encode(out).length > bytes) out = out.slice(0, -1);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const coord = (value: number | null) => (value === null || !Number.isFinite(value) ? 'x' : value.toFixed(5));

export function encodeMemoryName(m: MemoryInfo): string {
  const body: Record<string, unknown> = {};
  if (m.place) body.p = clip(m.place, 80);
  if (m.caption) body.c = clip(m.caption, TEXT_BYTES - utf8.encode(String(body.p ?? '')).length);
  if (m.ref) body.r = m.ref;
  if (!m.photo) body.i = 0;
  if (m.km !== null) body.k = Math.round(m.km * 100) / 100;
  if (m.minutes !== null) body.m = Math.round(m.minutes);
  if (m.route?.length) body.g = encodeRoute(simplifyRoute(m.route, 24));
  const packed = toBase64Url(utf8.encode(JSON.stringify(body)));
  return `${m.id},${m.kind},${Math.round(m.at)},${coord(m.lat)},${coord(m.lng)},${packed}.webp`;
}

const NAME = /^([0-9a-f-]{36}),(meal|workout|run|moment),(\d{1,15}),(-?\d{1,3}\.\d+|x),(-?\d{1,3}\.\d+|x),([A-Za-z0-9_-]*)\.webp$/;

export function decodeMemoryName(name: string): MemoryInfo | null {
  const match = NAME.exec(name);
  if (!match) return null;
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(fromUtf8.decode(fromBase64Url(match[6]))) as Record<string, unknown>; } catch { return null; }
  const num = (v: string) => (v === 'x' ? null : Number(v));
  return {
    id: match[1],
    kind: match[2] as MemoryKind,
    at: Number(match[3]),
    lat: num(match[4]),
    lng: num(match[5]),
    place: typeof body.p === 'string' ? body.p : '',
    caption: typeof body.c === 'string' ? body.c : '',
    ref: typeof body.r === 'string' ? body.r : null,
    photo: body.i !== 0,
    km: typeof body.k === 'number' ? body.k : null,
    minutes: typeof body.m === 'number' ? body.m : null,
    route: typeof body.g === 'string' ? decodeRoute(body.g) : null,
  };
}

/* ---- routes: Google's polyline encoding, after dropping points the eye would not miss */

export function encodeRoute(points: [number, number][]): string {
  let out = '';
  let lastLat = 0, lastLng = 0;
  const push = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5);
    push(a - lastLat); push(b - lastLng);
    lastLat = a; lastLng = b;
  }
  return out;
}

export function decodeRoute(text: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  const read = () => {
    let result = 0, shift = 0, byte = 0;
    do { byte = text.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index <= text.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < text.length) {
    lat += read(); lng += read();
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Ramer–Douglas–Peucker, loosened until the route fits in `max` points. */
export function simplifyRoute(points: [number, number][], max: number): [number, number][] {
  if (points.length <= max) return points;
  const keep = (tolerance: number) => {
    const flags = new Array(points.length).fill(false);
    flags[0] = flags[points.length - 1] = true;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
      const [start, end] = stack.pop()!;
      let worst = -1, far = 0;
      const [ay, ax] = points[start], [by, bx] = points[end];
      for (let i = start + 1; i < end; i++) {
        const [py, px] = points[i];
        const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / (Math.hypot(by - ay, bx - ax) || 1);
        if (d > far) { far = d; worst = i; }
      }
      if (worst > 0 && far > tolerance) { flags[worst] = true; stack.push([start, worst], [worst, end]); }
    }
    return points.filter((_, i) => flags[i]);
  };
  let tolerance = 0.00002;
  let result = keep(tolerance);
  while (result.length > max) { tolerance *= 1.6; result = keep(tolerance); }
  return result;
}

/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const routeKm = (points: [number, number][]) =>
  points.slice(1).reduce((sum, p, i) => sum + distanceKm(points[i], p), 0);
