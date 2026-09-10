'use client';

import { useSyncExternalStore } from 'react';
import { toast } from './toast';

/**
 * Library customisation that has no column to live in.
 *
 * A notebook's row carries name, colour and position — there is nowhere to put
 * a header image or a tag, and the shelf wallpaper belongs to nobody. Rather
 * than a migration for decoration, these ride in localStorage next to
 * `bd_archived_notebooks`, which already works this way. The cost is that they
 * are per-device; the images are wallpaper, not content, so that is the right
 * trade. Anything that must survive a new phone belongs in Supabase instead.
 *
 * Images are downscaled hard before they are stored: localStorage is ~5MB for
 * the whole origin, and a single untouched phone photo is bigger than that.
 */

const KEY = 'bd_shelf_prefs';

export type BookPrefs = {
  /** Data URL for the card's header band. */
  image?: string;
  /** One short label shown beside the note count. */
  tag?: string;
};

export type ShelfPrefs = {
  /** Data URL behind the library hero, replacing the generated gradient. */
  wallpaper?: string;
  books: Record<string, BookPrefs>;
  /** Whether the "Picked up lately" grid is collapsed. */
  hideRecent?: boolean;
};

const EMPTY: ShelfPrefs = { books: {} };

let cache: ShelfPrefs | null = null;
const listeners = new Set<() => void>();

function load(): ShelfPrefs {
  if (cache) return cache;
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) as ShelfPrefs : EMPTY;
    cache = { ...EMPTY, ...parsed, books: parsed.books ?? {} };
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

export function setWallpaper(dataUrl: string | undefined) {
  commit({ ...load(), wallpaper: dataUrl });
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

/**
 * Ask for an image and hand back a downscaled data URL.
 *
 * `wide` is the hero, which spans the page; the card band is a sliver, so it
 * gets a much smaller budget. Both are JPEG — a photo as PNG is several times
 * the size for no visible gain at these dimensions.
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
        resolve(await shrink(file, kind === 'wide' ? 1440 : 720, kind === 'wide' ? 0.78 : 0.72));
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
