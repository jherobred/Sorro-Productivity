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
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function readStorage(): RepostItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: RepostItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    emit();
  } catch {
    // quota
  }
}

export function useReposts(): RepostItem[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      const onStorage = (e: StorageEvent) => {
        if (e.key === LS_KEY) onStoreChange();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
      };
    },
    readStorage,
    () => []
  );
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
