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

export function usePostViews(): Record<string, number> {
  return useSyncExternalStore(
    (onStoreChange) => {
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
    },
    readStorage,
    () => EMPTY_VIEWS
  );
}

export function recordPostView(itemId: string) {
  if (typeof window === 'undefined' || !itemId) return;
  if (sessionSeen.has(itemId)) return;
  sessionSeen.add(itemId);

  const current = readStorage();
  const next = { ...current, [itemId]: (current[itemId] ?? 0) + 1 };
  writeStorage(next);
}
