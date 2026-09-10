'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Blob storage for library pictures.
 *
 * These started in localStorage as data URLs, which capped them hard: ~5MB for
 * the whole origin, and base64 adds a third on top of that, so a wallpaper had
 * to be squeezed to 1440px at quality 0.78 to leave room for a second one. It
 * showed.
 *
 * IndexedDB holds Blobs natively — no base64 inflation, and a quota measured
 * in hundreds of megabytes rather than five. So the picture goes in whole:
 * `storeImage` keeps the original bytes untouched unless the file is enormous,
 * because a re-encode is a quality loss that buys nothing here.
 *
 * localStorage still holds the ids and the framing; only the pixels moved.
 */

const DB_NAME = 'bd_images';
const STORE = 'blobs';
/** Files below this go in as they came. Above it, one downscale pass. */
const AS_IS_LIMIT = 8 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export const getImage = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const deleteImage = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);

/**
 * Store a picked file and hand back its id and how bright it is.
 *
 * The luminance is measured once, here, because text has to be drawn over
 * this picture on every render and sampling a photograph per paint is not
 * something to do in a grid of cards.
 */
export async function storeImage(file: File): Promise<{ id: string; lum: number }> {
  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const blob = file.size <= AS_IS_LIMIT ? file : await downscale(file);
  const lum = await measure(blob).catch(() => 0.5);
  await tx('readwrite', (s) => s.put(blob, id));
  return { id, lum };
}

/** Average sRGB relative luminance, off a 24px thumbnail of the picture. */
async function measure(blob: Blob): Promise<number> {
  const bitmap = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = 24;
  cv.height = 24;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bitmap.close(); return 0.5; }
  ctx.drawImage(bitmap, 0, 0, 24, 24);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, 24, 24);
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
  }
  return sum / (data.length / 4);
}

/** Only for files too big to keep whole. 3200px wide at 0.95 is still sharp. */
function downscale(file: File): Promise<Blob> {
  return createImageBitmap(file).then((bitmap) => new Promise<Blob>((resolve, reject) => {
    const scale = bitmap.width > 3200 ? 3200 / bitmap.width : 1;
    const cv = document.createElement('canvas');
    cv.width = Math.round(bitmap.width * scale);
    cv.height = Math.round(bitmap.height * scale);
    const ctx = cv.getContext('2d');
    if (!ctx) return reject(new Error('no 2d context'));
    ctx.drawImage(bitmap, 0, 0, cv.width, cv.height);
    bitmap.close();
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.95);
  }));
}

/**
 * Resolve image references to URLs the page can paint.
 *
 * Takes the whole set at once so a grid of cards needs one hook rather than
 * one per card. `data:` references are the pre-IndexedDB format and pass
 * straight through, so older saved pictures keep working.
 */
export function useImageUrls(refs: (string | undefined)[]): Record<string, string> {
  const key = refs.filter(Boolean).join('|');
  const wanted = useMemo(() => (key ? key.split('|') : []), [key]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    const direct: Record<string, string> = {};
    const ids: string[] = [];

    for (const ref of wanted) {
      if (ref.startsWith('data:')) direct[ref] = ref;
      else ids.push(ref);
    }
    if (!ids.length) { setUrls(direct); return; }

    void Promise.all(ids.map((id) => getImage(id).then((b) => [id, b] as const).catch(() => [id, undefined] as const)))
      .then((pairs) => {
        if (!live) return;
        const next = { ...direct };
        for (const [id, blob] of pairs) {
          if (!blob) continue;
          const u = URL.createObjectURL(blob);
          made.push(u);
          next[id] = u;
        }
        setUrls(next);
      });

    return () => {
      live = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [wanted]);

  return urls;
}
