'use client';

import { useSyncExternalStore } from 'react';
import { supabase, currentUserId } from './supabase';
import { storeImage, deleteImage, getImage, useImageUrls } from './imageStore';
import { useSignedUrl } from './uploads';

export type CoverKind = 'notebook' | 'task';
export type CoverTarget = { kind: CoverKind; id: string; title: string; color?: string };
/**
 * `removed` marks a cover taken off. It stays as a marker, newer than any file
 * still listed in storage, so a refresh cannot bring the old picture back while
 * the delete is waiting for a connection. `pending` on it means the stored files
 * still need deleting.
 */
type CoverRef = { localId?: string; path?: string; updatedAt: number; pending?: boolean; removed?: boolean };
type Snapshot = { owner: string | null; covers: Record<string, CoverRef> };
const EMPTY: Snapshot = { owner: null, covers: {} };
let state = EMPTY;
let initialized = false;
let syncing = false;
let poll:ReturnType<typeof setInterval>|undefined;
const migrations=new Set<string>();
const listeners = new Set<() => void>();
const keyOf = (kind: CoverKind, id: string) => `${kind}:${id}`;
const storageKey = (uid: string) => `bd_object_covers:${uid}`;
const emit = () => { for (const listener of listeners) listener(); };

function persist(uid: string, covers: Record<string, CoverRef>) {
  // Do not claim a durable save if the metadata write fails.
  localStorage.setItem(storageKey(uid), JSON.stringify(covers));
  if (state.owner === uid) { state = { owner: uid, covers }; emit(); }
}

async function loadOwner() {
  const uid = await currentUserId().catch(() => null);
  if (uid === state.owner) return;
  let covers: Record<string, CoverRef> = {};
  if (uid) {
    try { covers = JSON.parse(localStorage.getItem(storageKey(uid)) ?? '{}'); } catch { covers = {}; }
  }
  state = { owner: uid, covers }; emit();
  if (uid) { void refreshRemote(uid); void syncPending(); }
}

async function refreshRemote(uid: string) {
  if (uid === 'me' || !navigator.onLine) return false;
  const startedAt = Date.now();
  const prefix = `${uid}/object-covers`;
  const remote: Record<string, CoverRef> = {};
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from('sorro-files').list(prefix, { limit: 1000, offset });
    if (error || !data) return false;
    for (const row of data) {
      const match = /^(notebook|task)__(.+)__(\d+)\.png$/.exec(row.name);
      if (!match) continue;
      const key = keyOf(match[1] as CoverKind, decodeURIComponent(match[2]));
      const time = Number(match[3]);
      if (!remote[key] || remote[key].updatedAt < time) remote[key] = { path: `${prefix}/${row.name}`, updatedAt: time };
    }
    if (data.length < 1000) break;
  }
  if (state.owner !== uid) return false;
  const merged = { ...state.covers };
  for (const [key, ref] of Object.entries(remote)) {
    if (!merged[key]?.pending && (!merged[key] || merged[key].updatedAt < ref.updatedAt)) merged[key] = ref;
  }
  // A synced cover whose file is gone was removed on another device. Covers
  // chosen in the last few minutes are left alone: their upload may have
  // finished after this listing was taken.
  for (const [key, ref] of Object.entries(merged)) {
    if (ref.path && !ref.pending && !ref.removed && !remote[key] && ref.updatedAt < startedAt - 300_000) delete merged[key];
  }
  try { persist(uid, merged); } catch { /* Cached covers remain usable when storage is full. */ }
  return true;
}

/** Deletes every stored file for one cover. */
async function deleteRemote(uid: string, key: string) {
  const split = key.indexOf(':');
  const stem = `${key.slice(0, split)}__${encodeURIComponent(key.slice(split + 1))}__`;
  const prefix = `${uid}/object-covers`;
  const { data, error } = await supabase.storage.from('sorro-files').list(prefix, { limit: 1000, search: stem });
  if (error || !data) return false;
  const paths = data.filter((row) => row.name.startsWith(stem)).map((row) => `${prefix}/${row.name}`);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from('sorro-files').remove(paths);
    if (removeError) return false;
  }
  if (state.owner === uid && state.covers[key]?.removed) persist(uid, { ...state.covers, [key]: { ...state.covers[key], pending: false } });
  return true;
}

async function uploadPending(uid: string, key: string, ref: CoverRef) {
  if (ref.removed) return deleteRemote(uid, key);
  if (!ref.localId || uid === 'me') return false;
  const blob = await getImage(ref.localId);
  if (!blob || state.owner !== uid) return false;
  const split = key.indexOf(':');
  const kind = key.slice(0, split);
  const id = encodeURIComponent(key.slice(split + 1));
  const path = `${uid}/object-covers/${kind}__${id}__${ref.updatedAt}.png`;
  const { error } = await supabase.storage.from('sorro-files').upload(path, blob, { contentType: 'image/png', cacheControl: '3600', upsert: true });
  if (error) return false;
  // An earlier upload finishing must never replace a more recent selection.
  if (state.owner === uid && state.covers[key]?.updatedAt === ref.updatedAt) {
    persist(uid, { ...state.covers, [key]: { ...ref, path, pending: false } });
    if (ref.path && ref.path !== path) await supabase.storage.from('sorro-files').remove([ref.path]);
  }
  return true;
}

export async function syncPending() {
  if (syncing || !state.owner || !navigator.onLine) return;
  syncing = true;
  const uid = state.owner;
  try {
    for (const [key, ref] of Object.entries(state.covers)) {
      if (state.owner !== uid) break;
      if (ref.pending) await uploadPending(uid, key, ref).catch(() => false);
    }
  } finally { syncing = false; }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if(!poll&&typeof window!=='undefined')poll=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine&&state.owner){void refreshRemote(state.owner);void syncPending();}},30_000);
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;
    void loadOwner();
    supabase.auth.onAuthStateChange(() => { queueMicrotask(() => void loadOwner()); });
    window.addEventListener('online', () => { if(state.owner)void refreshRemote(state.owner);void syncPending(); });
    window.addEventListener('focus', () => { if (state.owner) void refreshRemote(state.owner); void syncPending(); });
    window.addEventListener('storage', (event) => {
      if (state.owner && event.key === storageKey(state.owner)) {
        try { state = { ...state, covers: JSON.parse(event.newValue ?? '{}') }; emit(); } catch { /* Ignore damaged metadata. */ }
      }
    });
  }
  return () => { listeners.delete(listener);if(!listeners.size){clearInterval(poll);poll=undefined;} };
}

/** Promote legacy device-only wallpapers only after checking for newer cloud covers. */
export async function migrateNotebookCovers(books:{id:string;name:string;color:string}[],images:Record<string,{image?:string}>){
 const uid=await currentUserId().catch(()=>null);if(!uid||uid==='me')return;
 if(state.owner!==uid)await loadOwner();
 /* This runs on every notebook refetch, so nothing to promote must cost no storage listing. */
 const unmigrated=(book:{id:string})=>!!images[book.id]?.image&&!state.covers[keyOf('notebook',book.id)]&&!migrations.has(uid+':'+book.id);
 if(!books.some(unmigrated))return;
 if(!await refreshRemote(uid))return;
 for(const book of books){const localId=images[book.id]?.image,key=keyOf('notebook',book.id),attempt=uid+':'+book.id;
  if(!localId||state.owner!==uid||state.covers[key]||migrations.has(attempt))continue;
  migrations.add(attempt);
  try{const blob=await getImage(localId);if(!blob)continue;const {prepareCover}=await import('./coverProcessing');const png=await prepareCover(new File([blob],'wallpaper',{type:blob.type}));if(state.owner!==uid||state.covers[key])continue;await saveObjectCover({kind:'notebook',id:book.id,title:book.name,color:book.color},png);}catch{migrations.delete(attempt);}
 }
}

export function useObjectCover(kind: CoverKind, id: string) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const found = snapshot.covers[keyOf(kind, id)];
  const ref = found?.removed ? undefined : found;
  const local = useImageUrls([ref?.localId]);
  const remote = useSignedUrl('sorro-files', ref?.path);
  return { url: (ref?.localId ? local[ref.localId] : undefined) || remote, pending: !!ref?.pending, exists: !!ref };
}

/** Whether a cover is set right now, for menus built outside a render. */
export const hasObjectCover = (kind: CoverKind, id: string) => {
  const ref = state.covers[keyOf(kind, id)];
  return !!ref && !ref.removed;
};

/**
 * Takes a cover off. The picture goes from this device at once, and from
 * storage now or, when offline, the next time the covers sync.
 */
export async function removeObjectCover(kind: CoverKind, id: string): Promise<void> {
  const uid = await currentUserId();
  if (state.owner !== uid) await loadOwner();
  const key = keyOf(kind, id);
  const old = state.covers[key];
  if (!old || old.removed) return;
  persist(uid, { ...state.covers, [key]: { updatedAt: Date.now(), removed: true, pending: uid !== 'me' } });
  if (old.localId) void deleteImage(old.localId).catch(() => undefined);
  if (uid !== 'me' && navigator.onLine) void deleteRemote(uid, key).catch(() => false);
}

/** Pixels go to IndexedDB before the network. Only the selected result syncs. */
export async function saveObjectCover(target: CoverTarget, blob: Blob): Promise<'synced' | 'device'> {
  const uid = await currentUserId();
  if (state.owner !== uid) await loadOwner();
  const key = keyOf(target.kind, target.id);
  const old = state.covers[key];
  const stored = await storeImage(new File([blob], 'cover.png', { type: 'image/png' }));
  const ref: CoverRef = { localId: stored.id, path: old?.path, updatedAt: Date.now(), pending: true };
  try { persist(uid, { ...state.covers, [key]: ref }); }
  catch (error) { await deleteImage(stored.id).catch(() => undefined); throw error; }
  if (old?.localId) void deleteImage(old.localId).catch(() => undefined);
  if (!navigator.onLine || uid === 'me') return 'device';
  // A slow connection cannot hold the preview open indefinitely. The upload
  // continues and clears pending only when its real response confirms success.
  const upload = uploadPending(uid, key, ref).catch(() => false);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const synced = await Promise.race([upload, new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), 12_000); })]);
  clearTimeout(timeout);
  return synced ? 'synced' : 'device';
}
