'use client';

import { useSyncExternalStore } from 'react';
import { toast } from './toast';
import { playClick } from './audio';

const LS_KEY = 'basedly-bookmarks';
const EMPTY_BOOKMARKS: string[] = [];
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedSnapshot: string[] = EMPTY_BOOKMARKS;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): string[] {
  if (typeof window === 'undefined') return EMPTY_BOOKMARKS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY_BOOKMARKS;
    return cachedSnapshot;
  } catch {
    return EMPTY_BOOKMARKS;
  }
}

function writeStorage(items: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(items);
    localStorage.setItem(LS_KEY, raw);
    cachedRaw = raw;
    cachedSnapshot = items;
    emit();
  } catch {
    // quota
  }
}

export function useBookmarks(): string[] {
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
    () => EMPTY_BOOKMARKS
  );
}

export function toggleBookmark(itemId: string): boolean {
  const current = readStorage();
  const exists = current.includes(itemId);

  if (exists) {
    const next = current.filter((id) => id !== itemId);
    writeStorage(next);
    playClick();
    toast('Removed from bookmarks');
    return false;
  } else {
    const next = [itemId, ...current];
    writeStorage(next);
    playClick();
    toast('Added to bookmarks');
    return true;
  }
}

export function isBookmarked(itemId: string): boolean {
  return readStorage().includes(itemId);
}
