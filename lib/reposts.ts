'use client';

import { useSyncExternalStore } from 'react';
import { toast } from './toast';
import { playCelebration, playClick } from './audio';

export type RepostItem = {
  id: string;
  itemId: string;
  kind: 'photo' | 'discussion';
  authorId: string;
  userId: string;
  quoteText?: string;
  repostedAt: string;
};

const LS_KEY = 'basedly-reposts';
const EMPTY_REPOSTS: RepostItem[] = [];
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedSnapshot: RepostItem[] = EMPTY_REPOSTS;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): RepostItem[] {
  if (typeof window === 'undefined') return EMPTY_REPOSTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    cachedRaw = raw;
    cachedSnapshot = raw ? JSON.parse(raw) : EMPTY_REPOSTS;
    return cachedSnapshot;
  } catch {
    return EMPTY_REPOSTS;
  }
}

function writeStorage(items: RepostItem[]) {
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

const serverSnapshot = () => EMPTY_REPOSTS;

export function useReposts(): RepostItem[] {
  return useSyncExternalStore(subscribe, readStorage, serverSnapshot);
}

export function repostPost(args: {
  itemId: string;
  kind: 'photo' | 'discussion';
  authorId: string;
  userId: string;
  quoteText?: string;
}) {
  const current = readStorage();
  const existing = current.find((r) => r.itemId === args.itemId && r.userId === args.userId);

  if (existing) {
    // Remove repost (toggle off)
    const next = current.filter((r) => r.id !== existing.id);
    writeStorage(next);
    toast('Repost removed from your profile');
    return false;
  }

  const newItem: RepostItem = {
    id: crypto.randomUUID(),
    itemId: args.itemId,
    kind: args.kind,
    authorId: args.authorId,
    userId: args.userId,
    quoteText: args.quoteText?.trim() || undefined,
    repostedAt: new Date().toISOString(),
  };

  writeStorage([newItem, ...current]);
  playCelebration();
  toast(args.quoteText ? 'Quote reposted to your profile!' : 'Reposted to your profile!');
  return true;
}

export function isItemReposted(itemId: string, userId: string): boolean {
  const current = readStorage();
  return current.some((r) => r.itemId === itemId && r.userId === userId);
}
