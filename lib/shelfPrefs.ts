'use client';

import { useSyncExternalStore } from 'react';
import { toast } from './toast';

/**
 * Library customisation that has no column to live in.
 *
 * A notebook's row carries name, colour and position — there is nowhere to put
 * a header image, and the library wallpapers belong to nobody. Rather than a
 * migration for decoration, these ride in localStorage next to
 * `bd_archived_notebooks`, which already works this way. The cost is that they
 * are per-device; the images are wallpaper, not content, so that is the right
 * trade. Anything that must survive a new phone belongs in Supabase instead.
 *
 * Images are downscaled hard before they are stored: localStorage is ~5MB for
 * the whole origin, and a single untouched phone photo is bigger than that.
 */

const KEY = 'bd_shelf_prefs';

/** How a picture sits in the frame it fills. */
export type Framing = { fit?: 'cover' | 'contain'; pos?: 'top' | 'center' | 'bottom' };

export type BookPrefs = Framing & {
  /** Data URL for the card's header band, or a board tile's whole face. */
  image?: string;
  /** One short label shown beside the note count. */
  tag?: string;
};

export type ShelfPrefs = {
  /** Every wallpaper the reader has added. The hero cycles through them. */
  wallpapers: string[];
  /** Which wallpaper is showing. */
  wallpaperAt: number;
  /** Framing for the hero. */
  wallpaperFrame: Framing;
  books: Record<string, BookPrefs>;
  /** Whether the "Picked up lately" grid is collapsed. */
  hideRecent?: boolean;
};

const EMPTY: ShelfPrefs = { wallpapers: [], wallpaperAt: 0, wallpaperFrame: {}, books: {} };

let cache: ShelfPrefs | null = null;
const listeners = new Set<() => void>();

function load(): ShelfPrefs {
  if (cache) return cache;
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<ShelfPrefs> & { wallpaper?: string } : {};
    // The first cut stored a single `wallpaper`; carry it into the list.
    const wallpapers = parsed.wallpapers ?? (parsed.wallpaper ? [parsed.wallpaper] : []);
    cache = {
      wallpapers,
      wallpaperAt: Math.min(parsed.wallpaperAt ?? 0, Math.max(0, wallpapers.length - 1)),
      wallpaperFrame: parsed.wallpaperFrame ?? {},
      books: parsed.books ?? {},
      hideRecent: parsed.hideRecent,
    };
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function commit(next: ShelfPrefs) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota. The write is lost but the in-memory value stands, so the screen
    // still shows what was just picked — say so rather than failing silently.
    toast('No room left for more images. Remove one first.');
  }
  for (const l of listeners) l();
}

/** The wallpaper currently on the hero, if any. */
export function currentWallpaper(p: ShelfPrefs): string | undefined {
  return p.wallpapers[p.wallpaperAt];
}

export function addWallpaper(dataUrl: string) {
  const p = load();
  const wallpapers = [...p.wallpapers, dataUrl];
  commit({ ...p, wallpapers, wallpaperAt: wallpapers.length - 1 });
}

/** Drop the one on screen and land on its neighbour. */
export function removeCurrentWallpaper() {
  const p = load();
  if (!p.wallpapers.length) return;
  const wallpapers = p.wallpapers.filter((_, i) => i !== p.wallpaperAt);
  commit({ ...p, wallpapers, wallpaperAt: Math.max(0, Math.min(p.wallpaperAt, wallpapers.length - 1)) });
}

export function cycleWallpaper(step = 1) {
  const p = load();
  if (p.wallpapers.length < 2) return;
  const n = p.wallpapers.length;
  commit({ ...p, wallpaperAt: (p.wallpaperAt + step + n) % n });
}

export function setWallpaperFrame(patch: Framing) {
  const p = load();
  commit({ ...p, wallpaperFrame: { ...p.wallpaperFrame, ...patch } });
}

export function setBookPrefs(id: string, patch: BookPrefs | null) {
  const prefs = load();
  const books = { ...prefs.books };
  if (patch === null) delete books[id];
  else books[id] = { ...books[id], ...patch };
  commit({ ...prefs, books });
}

export function setHideRecent(hide: boolean) {
  commit({ ...load(), hideRecent: hide });
}

export function useShelfPrefs(): ShelfPrefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    load,
    () => EMPTY,
  );
}

/** `background` shorthand for a framed picture, or undefined when there is none. */
export function framed(image: string | undefined, frame: Framing | undefined): string | undefined {
  if (!image) return undefined;
  return `${frame?.pos ?? 'center'}/${frame?.fit ?? 'cover'} no-repeat url("${image}")`;
}

/**
 * Ask for an image and hand back a downscaled data URL.
 *
 * `wide` is the hero, which spans the page; a card band is smaller, so it gets
 * a smaller budget. Both are JPEG — a photo as PNG is several times the size
 * for no visible gain at these dimensions.
 */
export function pickImage(kind: 'wide' | 'band'): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await shrink(file, kind === 'wide' ? 1440 : 900, kind === 'wide' ? 0.78 : 0.74));
      } catch {
        toast('Could not read that image.');
        resolve(null);
      }
    };
    input.click();
  });
}

async function shrink(file: File, maxW: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(bitmap.width * scale);
  cv.height = Math.round(bitmap.height * scale);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, cv.width, cv.height);
  bitmap.close();
  return cv.toDataURL('image/jpeg', quality);
}
