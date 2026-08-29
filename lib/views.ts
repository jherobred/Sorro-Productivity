'use client';

import { useSyncExternalStore } from 'react';

const LS_KEY = 'basedly-views';
const EMPTY_VIEWS: Record<string, number> = {};
const listeners = new Set<() => void>();
const sessionSeen = new Set<string>();

let cachedRaw: string | null = null;
let cachedSnapshot: Record<string, number> = EMPTY_VIEWS;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): Record<string, number> {
  if (typeof window === 'undefined') return EMPTY_VIEWS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY_VIEWS;
    return cachedSnapshot;
  } catch {
    return EMPTY_VIEWS;
  }
}

function writeStorage(views: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(views);
    localStorage.setItem(LS_KEY, raw);
    cachedRaw = raw;
    cachedSnapshot = views;
    emit();
  } catch {
    // quota
  }
}


/**
 * Hoisted, not an inline arrow. useSyncExternalStore re-subscribes whenever
 * the subscribe function changes identity, so an arrow written at the call
 * site made every render of every consumer remove its listener, add it back
 * and re-read the snapshot.
 */
const subscribe = (onStoreChange: () => void) => {
      listeners.add(onStoreChange);
      const onStorage = (e: StorageEvent) => {
        if (e.key === LS_KEY) {
          cachedRaw = null;
          onStoreChange();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
      };
};

const serverSnapshot = () => EMPTY_VIEWS;

export function usePostViews(): Record<string, number> {
  return useSyncExternalStore(subscribe, readStorage, serverSnapshot);
}

export function recordPostView(itemId: string) {
  if (typeof window === 'undefined' || !itemId) return;
  if (sessionSeen.has(itemId)) return;
  sessionSeen.add(itemId);

  const current = readStorage();
  const next = { ...current, [itemId]: (current[itemId] ?? 0) + 1 };
  writeStorage(next);
}
