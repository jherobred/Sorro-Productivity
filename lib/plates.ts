/**
 * Plate diary: every meal you kept, read back as moments, places, companions
 * and stamps. Pure, so node --test can hold it.
 *
 * A plate is a meal memory (photo, time, place) or a meal logged in Fuel
 * without one, placed at its slot's usual hour. A moment is plates had
 * together: same place, same day, within MOMENT_GAP of the one before.
 * Companions are @names in a caption, since a meal has nowhere else to say
 * who was at the table.
 */

export type PlateMemory = { id: string; at: number; place: string; caption: string; ref: string | null; lat: number | null; lng: number | null; photo: boolean };
export type PlateMeal = { id: string; on_date: string; name: string; slot: string; photo_path: string | null; place: string | null };

export type Plate = {
  id: string;
  memoryId: string | null;
  mealId: string | null;
  at: number;
  name: string;
  /** The caption when it says more than the dish's name. */
  note: string;
  place: string;
  lat: number | null;
  lng: number | null;
  drink: boolean;
  people: string[];
  /** A picture that is not a memory photo: a shipped illustration ("/food/…") or an older storage path. */
  art: string | null;
};

export type Moment = { id: string; at: number; place: string; plates: Plate[] };
export type Place = { key: string; name: string; visits: number; plates: Plate[]; first: number; last: number; usual: string; lat: number | null; lng: number | null };
export type Companion = { key: string; name: string; tables: number; plates: Plate[]; last: number; note: string };

export const MOMENT_GAP = 90 * 60_000;
const SLOT_HOUR: Record<string, number> = { Breakfast: 8, Lunch: 12.5, Snack: 15.5, Dinner: 19 };
const DRINK = /\b(coffee|kape|latte|americano|espresso|cappuccino|mocha|frapp\w*|tea|milk ?tea|boba|matcha|juice|shake|smoothie|soda|cola|coke|sprite|lemonade|yakult|water|beer|wine|drinks?)\b/i;

export const isDrink = (name: string) => DRINK.test(name);
export const placeKey = (place: string) => place.trim().toLowerCase().replace(/\s+/g, ' ');
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** "@pauline and @Tita_Wena" → ["Pauline", "Tita Wena"]. */
export function mentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/@([\p{L}\p{N}_.'-]+)/gu)) {
    const raw = m[1].replace(/[.'_-]+$/, '').replace(/_/g, ' ');
    if (!raw) continue;
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

export function platesFrom(memories: PlateMemory[], meals: PlateMeal[]): Plate[] {
  const byId = new Map(meals.map((m) => [m.id, m]));
  const used = new Set<string>();
  const out: Plate[] = [];
  for (const m of memories) {
    const meal = m.ref?.startsWith('meal:') ? byId.get(m.ref.slice(5)) : undefined;
    if (meal) used.add(meal.id);
    const caption = m.caption.trim();
    const name = meal?.name || caption.replace(/@[\p{L}\p{N}_.'-]+/gu, '').trim() || 'A plate';
    out.push({
      id: m.id, memoryId: m.id, mealId: meal?.id ?? null, at: m.at, name,
      note: caption && caption !== name ? caption : '',
      place: (m.place || meal?.place || '').trim(), lat: m.lat, lng: m.lng,
      drink: isDrink(name), people: mentions(caption),
      art: !m.photo && meal?.photo_path ? meal.photo_path : null,
    });
  }
  for (const meal of meals) {
    if (used.has(meal.id)) continue;
    const [y, mo, d] = meal.on_date.split('-').map(Number);
    const h = SLOT_HOUR[meal.slot] ?? 12;
    out.push({
      id: meal.id, memoryId: null, mealId: meal.id, at: new Date(y, mo - 1, d, Math.floor(h), Math.round((h % 1) * 60)).getTime(),
      name: meal.name, note: '', place: (meal.place ?? '').trim(), lat: null, lng: null,
      drink: isDrink(meal.name), people: [], art: meal.photo_path,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Plates newest first in, sittings newest first out. A moment's time is when it started. */
export function momentsOf(plates: Plate[]): Moment[] {
  const out: Moment[] = [];
  for (const p of plates) {
    const last = out[out.length - 1];
    const prev = last?.plates[last.plates.length - 1];
    if (last && prev && prev.at - p.at <= MOMENT_GAP && sameDay(prev.at, p.at) && placeKey(prev.place) === placeKey(p.place)) {
      last.plates.push(p);
      last.at = p.at;
    } else out.push({ id: p.id, at: p.at, place: p.place, plates: [p] });
  }
  return out;
}

const commonest = (names: string[]) => {
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

/** Every named place, most visited first. A visit is a moment, not a plate. */
export function placesOf(moments: Moment[]): Place[] {
  const by = new Map<string, Place>();
  for (const m of moments) {
    const key = placeKey(m.place);
    if (!key) continue;
    const p = by.get(key) ?? { key, name: m.place, visits: 0, plates: [], first: m.at, last: m.at, usual: '', lat: null, lng: null };
    p.visits++;
    p.plates.push(...m.plates);
    p.first = Math.min(p.first, m.at);
    p.last = Math.max(p.last, m.at);
    by.set(key, p);
  }
  for (const p of by.values()) {
    p.usual = commonest(p.plates.map((x) => x.name));
    const spots = p.plates.filter((x) => x.lat !== null && x.lng !== null);
    if (spots.length) {
      p.lat = spots.reduce((s, x) => s + x.lat!, 0) / spots.length;
      p.lng = spots.reduce((s, x) => s + x.lng!, 0) / spots.length;
    }
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits || b.last - a.last);
}

/** Everyone @named at a table, most shared first. */
export function companionsOf(moments: Moment[]): Companion[] {
  const by = new Map<string, Companion>();
  for (const m of moments) {
    const names = mentions(m.plates.flatMap((p) => p.people.map((x) => '@' + x.replace(/ /g, '_'))).join(' '));
    for (const name of names) {
      const key = name.toLowerCase();
      const c = by.get(key) ?? { key, name, tables: 0, plates: [], last: 0, note: '' };
      c.tables++;
      c.plates.push(...m.plates);
      c.last = Math.max(c.last, m.at);
      if (!c.note) c.note = m.plates.map((p) => p.note.replace(/@[\p{L}\p{N}_.'-]+/gu, '').replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
      by.set(key, c);
    }
  }
  return [...by.values()].sort((a, b) => b.tables - a.tables || b.last - a.last);
}

/** Stamp letters: one word gives its first letter ("Mcdo" → "M"), more give two ("Pauline home" → "PH"). */
export function initials(name: string): string {
  const words = name.replace(/['’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0][0] : words[0][0] + words[1][0]).toUpperCase();
}

const INKS = ['#2f5d43', '#b4842a', '#c0453a', '#1f6a5a', '#5c2d6e', '#c4532c', '#2c4f8c', '#6b4a2f'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
export const stampInk = (key: string) => INKS[Math.abs(hash(key)) % INKS.length];
/** A small fixed lean for a sticker or stamp, so a grid of them looks placed by hand. */
export const lean = (key: string, max = 7) => (Math.abs(hash(key)) % (max * 2 + 1)) - max;
