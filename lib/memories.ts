'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { supabase, currentUserId } from './supabase';
import { storeImage, deleteImage, getImage, useImageUrls } from './imageStore';
import { useSignedUrl, useSignedUrls } from './uploads';
import { decodeMemoryName, encodeMemoryName, type MemoryInfo, type MemoryKind } from './memoryName';

/**
 * Memories: a photo, where and when it was taken, and what it was.
 *
 * Saved on the device first, so capturing works offline and shows at once,
 * then synced to storage: the photo at `memories/img/<id>.webp`, and a marker
 * whose file name carries the details (see memoryName.ts). Listing the marker
 * folder is the whole index on any other device, with no table to migrate.
 * An edit renames the marker; the photo's path never changes, so a meal can
 * point at it.
 */

export type Memory = MemoryInfo & {
  /** The marker's storage name once it has been uploaded. */
  marker?: string;
  /** The photo in IndexedDB, kept on the device that took it. */
  localId?: string;
  photoSynced?: boolean;
  pending?: boolean;
  removed?: boolean;
  removedAt?: number;
  updatedAt: number;
};

export type { MemoryKind } from './memoryName';

const BUCKET = 'bd-files';
const UNDO_MS = 6_500;
const storageKey = (uid: string) => `bd_memories:${uid}`;
export const memoryPhotoPath = (uid: string, id: string) => `${uid}/memories/img/${id}.webp`;
const markerPath = (uid: string, name: string) => `${uid}/memories/meta/${name}`;
/** A 1×1 transparent WebP: the marker needs a body, and an image is what the bucket takes. */
const BLANK = () => new Blob([Uint8Array.from(atob('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='), (c) => c.charCodeAt(0))], { type: 'image/webp' });

type Snapshot = { owner: string | null; list: Memory[]; ready: boolean };
let state: Snapshot = { owner: null, list: [], ready: false };
let started = false;
let syncing = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function persist(uid: string, list: Memory[]) {
  try { localStorage.setItem(storageKey(uid), JSON.stringify(list)); } catch { /* the list still lives for this visit */ }
  if (state.owner === uid) { state = { owner: uid, list, ready: true }; emit(); }
}

const put = (uid: string, memory: Memory) => persist(uid, [...state.list.filter((m) => m.id !== memory.id), memory]);

async function loadOwner() {
  const uid = await currentUserId().catch(() => null);
  if (uid && uid === state.owner) return;
  let list: Memory[] = [];
  if (uid) {
    try { list = JSON.parse(localStorage.getItem(storageKey(uid)) ?? '[]'); } catch { list = []; }
  }
  state = { owner: uid, list, ready: true };
  emit();
  if (uid) void refreshMemories();
}

/** Brings in memories saved on other devices and sends this device's changes. */
export async function refreshMemories() {
  const uid = state.owner;
  if (!uid || uid === 'me' || typeof navigator === 'undefined' || !navigator.onLine) return;
  await pullRemote(uid).catch(() => undefined);
  await pushPending(uid).catch(() => undefined);
}

async function pullRemote(uid: string) {
  const startedAt = Date.now();
  const remote = new Map<string, { info: MemoryInfo; name: string }>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${uid}/memories/meta`, { limit: 1000, offset });
    if (error || !data) return;
    for (const row of data) {
      const info = decodeMemoryName(row.name);
      if (info) remote.set(info.id, { info, name: row.name });
    }
    if (data.length < 1000) break;
  }
  if (state.owner !== uid) return;
  const local = new Map(state.list.map((m) => [m.id, m]));
  const next: Memory[] = [];
  for (const m of state.list) {
    const there = remote.get(m.id);
    if (m.pending || m.removed) { next.push(m); continue; }
    if (there) next.push(there.name === m.marker ? m : { ...m, ...there.info, marker: there.name, updatedAt: startedAt });
    // Gone from storage, and not new here: deleted on another device.
    else if (!m.marker || m.updatedAt > startedAt - 300_000) next.push(m);
    else if (m.localId) void deleteImage(m.localId).catch(() => undefined);
  }
  for (const [id, there] of remote) {
    if (!local.has(id)) next.push({ ...there.info, marker: there.name, photoSynced: true, updatedAt: startedAt });
  }
  persist(uid, next);
}

async function pushPending(uid: string) {
  if (syncing) return;
  syncing = true;
  try {
    for (const m of [...state.list]) {
      if (state.owner !== uid) break;
      if (!m.pending) continue;
      if (m.removed) {
        if (Date.now() - (m.removedAt ?? 0) < UNDO_MS) continue;
        const paths = [m.marker ? markerPath(uid, m.marker) : null, m.photo ? memoryPhotoPath(uid, m.id) : null].filter(Boolean) as string[];
        if (paths.length) {
          const { error } = await supabase.storage.from(BUCKET).remove(paths);
          if (error) continue;
        }
        if (m.localId) void deleteImage(m.localId).catch(() => undefined);
        persist(uid, state.list.filter((x) => x.id !== m.id));
        continue;
      }
      let current = m;
      if (current.photo && !current.photoSynced && current.localId) {
        const blob = await getImage(current.localId);
        if (!blob) continue;
        const { error } = await supabase.storage.from(BUCKET).upload(memoryPhotoPath(uid, current.id), blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
        if (error) continue;
        current = { ...(state.list.find((x) => x.id === m.id) ?? current), photoSynced: true };
        put(uid, current);
      }
      const name = encodeMemoryName(current);
      if (current.marker !== name) {
        const { error } = await supabase.storage.from(BUCKET).upload(markerPath(uid, name), BLANK(), { contentType: 'image/webp', upsert: true });
        if (error) continue;
        if (current.marker) await supabase.storage.from(BUCKET).remove([markerPath(uid, current.marker)]);
      }
      const latest = state.list.find((x) => x.id === m.id);
      // An edit made while this upload was out waits for the next pass.
      const changed = latest && encodeMemoryName(latest) !== name;
      if (latest) put(uid, { ...latest, marker: name, photoSynced: latest.photo ? true : latest.photoSynced, pending: !!changed || !!latest.removed });
    }
  } finally {
    syncing = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started && typeof window !== 'undefined') {
    started = true;
    void loadOwner();
    supabase.auth.onAuthStateChange(() => { queueMicrotask(() => void loadOwner()); });
    window.addEventListener('online', () => void refreshMemories());
    window.addEventListener('focus', () => void refreshMemories());
  }
  return () => { listeners.delete(listener); };
}

const EMPTY: Snapshot = { owner: null, list: [], ready: false };

/** Every memory, newest first, optionally of some kinds only. */
export function useMemories(kinds?: readonly MemoryKind[]) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const key = kinds?.join(',') ?? '';
  const list = useMemo(() => snapshot.list
    .filter((m) => !m.removed && (!key || key.split(',').includes(m.kind)))
    .sort((a, b) => b.at - a.at), [snapshot.list, key]);
  return { list, ready: snapshot.ready, owner: snapshot.owner };
}

async function owner(): Promise<string> {
  if (!state.owner) await loadOwner();
  if (!state.owner) throw new Error('Sign in to keep memories');
  return state.owner;
}

/** Keeps a new memory. The photo, if any, is already prepared as WebP. Returns the saved memory. */
export async function saveMemory(info: Omit<MemoryInfo, 'id' | 'photo'> & { id?: string }, photo?: Blob | null): Promise<Memory> {
  const uid = await owner();
  const id = info.id ?? crypto.randomUUID();
  let localId: string | undefined;
  if (photo) localId = (await storeImage(new File([photo], `${id}.webp`, { type: 'image/webp' }))).id;
  const memory: Memory = { ...info, id, photo: !!photo, localId, photoSynced: false, pending: true, updatedAt: Date.now() };
  put(uid, memory);
  void refreshMemories();
  return memory;
}

export async function editMemory(id: string, patch: Partial<Omit<MemoryInfo, 'id' | 'photo'>>) {
  const uid = await owner();
  const current = state.list.find((m) => m.id === id);
  if (!current) return;
  put(uid, { ...current, ...patch, pending: true, updatedAt: Date.now() });
  void refreshMemories();
}

/** Deletes after a short wait, so the toast's Undo can still bring it back. */
export async function removeMemory(id: string) {
  const uid = await owner();
  const current = state.list.find((m) => m.id === id);
  if (!current) return;
  put(uid, { ...current, removed: true, removedAt: Date.now(), pending: true, updatedAt: Date.now() });
  setTimeout(() => void refreshMemories(), UNDO_MS + 200);
}

export async function restoreMemory(id: string) {
  const uid = await owner();
  const current = state.list.find((m) => m.id === id);
  if (!current?.removed) return;
  const clean = { ...current, removed: false, removedAt: undefined, updatedAt: Date.now() };
  put(uid, { ...clean, pending: !clean.marker || encodeMemoryName(clean) !== clean.marker || (clean.photo && !clean.photoSynced) });
}

/** The storage path a memory's photo has, or will have once it uploads. */
export async function photoPathFor(id: string): Promise<string> {
  return memoryPhotoPath(await owner(), id);
}

/** Photo URLs for a whole list at once, by memory id, for the map and the gallery. */
export function useMemoryPhotos(list: Memory[]): Record<string, string> {
  const withPhoto = list.filter((m) => m.photo);
  const local = useImageUrls(withPhoto.map((m) => m.localId));
  const snapshotOwner = useSyncExternalStore(subscribe, () => state.owner, () => null);
  const remoteOnes = withPhoto.filter((m) => !m.localId || !local[m.localId]);
  const canSign = !!snapshotOwner && snapshotOwner !== 'me';
  const signed = useSignedUrls(BUCKET, canSign ? remoteOnes.map((m) => memoryPhotoPath(snapshotOwner!, m.id)) : []);
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of withPhoto) if (m.localId && local[m.localId]) out[m.id] = local[m.localId];
    if (canSign) remoteOnes.forEach((m, i) => { if (signed[i]) out[m.id] = signed[i]!; });
    return out;
    // `withPhoto` and `remoteOnes` are derived from the arguments listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, local, signed, canSign]);
}

/** A paintable URL for a memory's photo: the copy on this device when there is one, otherwise a signed link. */
export function useMemoryPhoto(memory: Memory | null | undefined): string | undefined {
  const local = useImageUrls([memory?.photo ? memory.localId : undefined]);
  const snapshotOwner = useSyncExternalStore(subscribe, () => state.owner, () => null);
  const needsRemote = !!memory?.photo && (!memory.localId || !local[memory.localId]) && !!snapshotOwner && snapshotOwner !== 'me';
  const remote = useSignedUrl(BUCKET, needsRemote ? memoryPhotoPath(snapshotOwner!, memory!.id) : null);
  return (memory?.localId ? local[memory.localId] : undefined) || remote || undefined;
}
