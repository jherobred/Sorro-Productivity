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

export type Bucket = 'bd-feed' | 'bd-journal' | 'bd-files';

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
