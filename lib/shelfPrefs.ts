'use client';

import { useSyncExternalStore } from 'react';
import { deleteImage, storeImage } from './imageStore';
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
 * Only the ids live here. The pictures themselves are Blobs in IndexedDB
 * (see imageStore), which is what lets them stay full quality — localStorage
 * would have capped a wallpaper at roughly a thousand pixels wide.
 */

const KEY = 'bd_shelf_prefs';

/** How a picture sits in the frame it fills. */
export type Framing = { fit?: 'cover' | 'contain'; pos?: 'top' | 'center' | 'bottom' };

export type BookPrefs = Framing & {
  /** imageStore id for the card header band, or a board tile's whole face. */
  image?: string;
  /** One short label shown beside the note count. */
  tag?: string;
};

export type ShelfPrefs = {
  /** imageStore ids, one per wallpaper. The hero cycles through them. */
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

export function addWallpaper(id: string) {
  const p = load();
  const wallpapers = [...p.wallpapers, id];
  commit({ ...p, wallpapers, wallpaperAt: wallpapers.length - 1 });
}

/** Drop the one on screen and land on its neighbour. */
export function removeCurrentWallpaper() {
  const p = load();
  if (!p.wallpapers.length) return;
  const gone = p.wallpapers[p.wallpaperAt];
  if (gone && !gone.startsWith('data:')) void deleteImage(gone);
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
  // Dropping or replacing a picture frees its bytes; nothing else points at it.
  const old = books[id]?.image;
  if (old && !old.startsWith('data:') && (patch === null || ('image' in patch && patch.image !== old))) {
    void deleteImage(old);
  }
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
 * Ask for an image, keep the bytes, hand back the id.
 *
 * No size tiers any more: hero and card band get the same full-quality file,
 * because the band is 84px tall on a 1x screen and three times that on a
 * retina one, and it is the same picture behind both. imageStore only
 * re-encodes when a file is genuinely enormous.
 */
export function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await storeImage(file));
      } catch {
        toast('Could not read that image.');
        resolve(null);
      }
    };
    input.click();
  });
}
