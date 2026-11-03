'use client';

import { useEffect, useState } from 'react';
import { supabase, currentUserId } from './supabase';
import { assertSafeFile, safeFileName, IMAGE_EXT } from './uploadGuard';

/**
 * Uploads for feed images and journal photos. README lists these as the
 * gradient placeholders that v1 replaces with real files.
 *
 * Storage RLS keys on the first path segment being the user's id, so every
 * object goes to `<uid>/<uuid>-<name>` (see the sorro_v1_schema policies).
 */

export type Bucket = 'bd-feed' | 'bd-journal' | 'bd-files' | 'bd-avatars';

export async function uploadTo(bucket: Bucket, file: File, rules: { types?: Set<string>; maxBytes?: number } = {}): Promise<string> {
  const type = assertSafeFile(file, rules.types, rules.maxBytes);
  const user_id = await currentUserId();
  const safeName = safeFileName(file.name);
  const path = `${user_id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    // The verified type, not the raw one — a blank File.type would otherwise be
    // stored as octet-stream and served back as a download.
    contentType: type,
  });
  if (error) throw error;
  return path;
}

/**
 * Your avatar, at a stable path.
 *
 * One object per person rather than one per upload: a new photo replaces the
 * old file instead of leaving every picture you have ever set sitting in the
 * bucket. The bucket is public, so the URL needs no signing — but it also needs
 * cache-busting, since the path never changes.
 */
export async function uploadAvatar(file: File): Promise<string> {
  return uploadProfileImage(file, 'avatar');
}

/**
 * Your cover picture, in the same bucket at its own stable name.
 *
 * A second bucket would need its own RLS policy saying the same thing the
 * avatar bucket's already says — first path segment is your user id — so it
 * shares that one. `avatar.jpg` and `cover.jpg` cannot collide.
 */
export async function uploadCover(file: File): Promise<string> {
  return uploadProfileImage(file, 'cover');
}

async function uploadProfileImage(file: File, kind: 'avatar' | 'cover'): Promise<string> {
  const type = assertSafeFile(file, new Set(Object.keys(IMAGE_EXT)));
  const user_id = await currentUserId();
  const ext = IMAGE_EXT[type] ?? 'jpg';
  const path = `${user_id}/${kind}.${ext}`;
  const { error } = await supabase.storage.from('bd-avatars').upload(path, file, {
    cacheControl: '3600',
    contentType: type,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('bd-avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Signed URLs for private objects. Buckets are private, so images need a
 * short-lived signed link rather than a public URL.
 *
 * **Requests are batched by a microtask.** The old version signed one path per
 * call, which meant one round trip per `<img>`: a feed of forty cards, each
 * now able to carry ten pictures, is four hundred requests to render one
 * screen, and on a phone they queue. Every `signedUrl` in the same tick is
 * collected and sent as a single `createSignedUrls`, so a whole page of images
 * costs one request no matter how many components ask.
 */
const cache = new Map<string, { url: string; until: number }>();
const TTL = 3600;

type Waiter = { path: string; resolve: (v: string | null) => void };
const queued = new Map<Bucket, Waiter[]>();

/** Supabase caps a batch; well above a screenful, but not unbounded. */
const BATCH = 100;

async function flush(bucket: Bucket) {
  const waiters = queued.get(bucket) ?? [];
  queued.delete(bucket);
  if (!waiters.length) return;

  for (let i = 0; i < waiters.length; i += BATCH) {
    const slice = waiters.slice(i, i + BATCH);
    // Deduplicate: the same picture can be asked for by a card and by the
    // full-screen view of that card at the same moment.
    const paths = [...new Set(slice.map((w) => w.path))];
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, TTL);

    const byPath = new Map<string, string>();
    if (!error) {
      for (const row of data ?? []) {
        if (row.signedUrl && row.path) byPath.set(row.path, row.signedUrl);
      }
    }
    for (const [path, url] of byPath) {
      cache.set(`${bucket}/${path}`, { url, until: Date.now() + (TTL - 60) * 1000 });
    }
    for (const w of slice) w.resolve(byPath.get(w.path) ?? null);
  }
}

export function signedUrl(bucket: Bucket, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);

  return new Promise((resolve) => {
    const list = queued.get(bucket);
    if (list) { list.push({ path, resolve }); return; }
    queued.set(bucket, [{ path, resolve }]);
    // One tick is enough: React mounts a whole page's images in the same
    // commit, so they all land in this batch.
    queueMicrotask(() => { void flush(bucket); });
  });
}

/**
 * Several paths at once, in the order given — for a gallery, where the number
 * of pictures is not known at compile time and a hook cannot go in a loop.
 * Shares the batch above, so this is still one request.
 */
export function useSignedUrls(bucket: Bucket, paths: string[]): (string | null)[] {
  const joined = paths.join('|');
  const [urls, setUrls] = useState<(string | null)[]>(() => paths.map(() => null));

  useEffect(() => {
    let alive = true;
    const list = joined ? joined.split('|') : [];
    Promise.all(list.map((p) => signedUrl(bucket, p)))
      .then((r) => { if (alive) setUrls(r); });
    return () => { alive = false; };
  }, [bucket, joined]);

  return urls;
}

/** Resolve a storage path to a displayable URL; null while loading or absent. */
export function useSignedUrl(bucket: Bucket, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    signedUrl(bucket, path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [bucket, path]);

  return url;
}
