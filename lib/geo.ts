'use client';

/**
 * Where you are, and what that place is called.
 *
 * Position comes from the device (GPS on the phone app, the browser's location
 * on the web). Names come from OpenStreetMap's Nominatim, which asks for no
 * more than one request a second, so lookups go through one queue and every
 * answer is remembered on the device by rounded coordinates.
 */

export type Spot = { lat: number; lng: number; accuracy: number | null };
export type PlaceHit = { name: string; detail: string; lat: number; lng: number };

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export function currentSpot(timeoutMs = 12_000): Promise<Spot> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This device cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED
        ? 'Location is off for Sorro. Allow it in your settings, or pick the place on the map.'
        : 'Your location could not be found just now. Pick the place on the map instead.')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Follows the device while a run is recorded. Returns the function that stops it. */
export function followSpots(onSpot: (spot: Spot) => void, onError: (message: string) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('This device cannot share its location.');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onSpot({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null }),
    (e) => onError(e.code === e.PERMISSION_DENIED ? 'Location is off for Sorro.' : 'Lost the GPS signal for a moment.'),
    { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/* One request at a time, a second apart. */
let queue: Promise<unknown> = Promise.resolve();
function politely<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.then(() => new Promise((r) => setTimeout(r, 1100)), () => new Promise((r) => setTimeout(r, 1100)));
  return next;
}

const CACHE = 'bd_place_names';
const readCache = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(CACHE) ?? '{}'); } catch { return {}; } };
const writeCache = (cache: Record<string, string>) => {
  try {
    const entries = Object.entries(cache);
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(entries.slice(-300))));
  } catch { /* full storage only costs a repeat lookup */ }
};

type Address = Record<string, string | undefined>;

function shortName(name: string | undefined, address: Address | undefined): string {
  const a = address ?? {};
  const spot = name || a.amenity || a.shop || a.leisure || a.tourism || a.building || a.road || a.neighbourhood;
  const area = a.suburb || a.city_district || a.quarter || a.city || a.town || a.village || a.municipality;
  return [spot, area].filter((part, i, all) => part && all.indexOf(part) === i).join(', ');
}

/** "Jollibee, Sampaloc". Empty when the lookup fails; the place stays editable either way. */
export async function placeName(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cache = readCache();
  if (cache[key]) return cache[key];
  try {
    const data = await politely(async () => {
      const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{ name?: string; address?: Address }>;
    });
    const name = shortName(data.name, data.address);
    if (name) { cache[key] = name; writeCache(cache); }
    return name;
  } catch {
    return '';
  }
}

export async function searchPlaces(query: string, near?: Spot | null): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const view = near ? `&viewbox=${near.lng - 0.3},${near.lat + 0.3},${near.lng + 0.3},${near.lat - 0.3}` : '';
  try {
    const rows = await politely(async () => {
      const res = await fetch(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}${view}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{ name?: string; display_name: string; lat: string; lon: string; address?: Address }[]>;
    });
    return rows.map((r) => ({
      name: shortName(r.name, r.address) || r.display_name.split(',')[0],
      detail: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch {
    return [];
  }
}
