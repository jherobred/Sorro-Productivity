'use client';

import { useEffect, useState } from 'react';
import { supabase, currentUserId } from './supabase';

/**
 * Uploads for feed images and journal photos. README lists these as the
 * gradient placeholders that v1 replaces with real files.
 *
 * Storage RLS keys on the first path segment being the user's id, so every
 * object goes to `<uid>/<uuid>-<name>` (see the basedly_v1_schema policies).
 */

export type Bucket = 'bd-feed' | 'bd-journal' | 'bd-files' | 'bd-avatars';

export async function uploadTo(bucket: Bucket, file: File): Promise<string> {
  const user_id = await currentUserId();
  const path = `${user_id}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
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
  const user_id = await currentUserId();
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 5);
  const path = `${user_id}/avatar.${ext}`;
  const { error } = await supabase.storage.from('bd-avatars').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('bd-avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Signed URL for a private object. Buckets are private, so images need a
 * short-lived signed link rather than a public URL.
 *
 * ponytail: one request per image, cached in module scope for the signing
 * window. Batch via createSignedUrls if a feed page ever gets long enough
 * to make the round-trips show.
 */
const cache = new Map<string, { url: string; until: number }>();
const TTL = 3600;

export async function signedUrl(bucket: Bucket, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL);
  if (error || !data) return null;
  cache.set(key, { url: data.signedUrl, until: Date.now() + (TTL - 60) * 1000 });
  return data.signedUrl;
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
