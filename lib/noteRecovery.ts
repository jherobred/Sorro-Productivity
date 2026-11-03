'use client';
import { useSyncExternalStore } from 'react';
import { currentUserId, supabase } from './supabase';
import { LEGACY_DB, moveLegacyDatabase } from './storageKeys';

export type PageVersion = { id: string; notebook_id: string; title: string; body: string; at: string };
type Record = { key: string; user: string; draft?: PageVersion; versions: PageVersion[] };
type SaveState = 'saving' | 'saved' | 'error';
const states = new Map<string, SaveState>();
const listeners = new Set<() => void>();
let revision = 0;
let storageError = false;
const emit = () => { revision++; for (const f of listeners) f(); };
export function setPageState(id: string, state: SaveState) { states.set(id, state); emit(); }
export function usePageState(id: string) {
  useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => revision, () => 0);
  return { state: states.get(id) ?? 'saved', storageError };
}
export function usePageHealth() {
  useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => revision, () => 0);
  return { pending: [...states.values()].filter(s => s === 'saving').length, failed: [...states.values()].filter(s => s === 'error').length };
}
let activeUser: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => { const next=session?.user.id??null; if(next!==activeUser){activeUser=next;states.clear();emit();} });

let database: Promise<IDBDatabase> | undefined;
function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sorro-page-recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pages', { keyPath: 'key' });
    // Unsaved drafts from before the rename move over before anything reads them.
    request.onsuccess = () => void moveLegacyDatabase(LEGACY_DB.recovery, request.result, 'pages').catch(() => {}).then(() => resolve(request.result));
    request.onerror = () => reject(request.error);
  });
  return database;
}
const same = (a?: PageVersion, b?: PageVersion) => a?.title === b?.title && a?.body === b?.body && a?.notebook_id === b?.notebook_id;

// A read/modify/write transaction keeps the final keystroke ahead of an older
// acknowledgement, even while several saves finish close together.
async function edit(id: string, change: (r: Record) => void) {
  const [database, user] = await Promise.all([db(), currentUserId()]);
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    const key = `${user}:${id}`;
    const read = store.get(key);
    read.onsuccess = () => { const r: Record = read.result ?? { key, user, versions: [] }; change(r); store.put(r); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function failed() { storageError = true; emit(); }
export function keepPageDraft(page: Omit<PageVersion, 'at'>) {
  setPageState(page.id, 'saving');
  const draft = { ...page, at: new Date().toISOString() };
  void edit(page.id, r => { r.draft = draft; }).catch(failed);
}
export function rememberPage(page: Omit<PageVersion, 'at'>, force = false) {
  const version = { ...page, at: new Date().toISOString() };
  return edit(page.id, r => {
    const last = r.versions.at(-1);
    if (same(last, version)) return;
    // One snapshot per minute, plus a checkpoint each time an editor opens.
    if (!force && r.versions.length > 1 && Date.now() - Date.parse(last!.at) < 60_000) r.versions.pop();
    r.versions.push(version);
    r.versions = r.versions.slice(-30);
  }).catch(failed);
}
export function acknowledgePage(page: Omit<PageVersion, 'at'>) {
  void edit(page.id, r => { if (same(r.draft, { ...page, at: '' })) delete r.draft; }).catch(failed);
  void rememberPage(page);
}
export function discardPageDraft(id: string) { void edit(id, r => { delete r.draft; }).catch(failed); }
export async function pageRecovery() {
  const [database, user] = await Promise.all([db(), currentUserId()]);
  const records = await new Promise<Record[]>((resolve, reject) => {
    const request = database.transaction('pages').objectStore('pages').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return records.filter(r => r.user === user);
}
