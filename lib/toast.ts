'use client';

import { useSyncExternalStore } from 'react';
import { K } from './pal';

export type Toast = { id: number; text: string; undo?: () => void };

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Toast lifetime is 4200 ms — that is the window the user has to undo. */
export function toast(text: string, undo?: () => void) {
  const id = ++seq;
  toasts = [...toasts, { id, text, undo }];
  emit();
  setTimeout(() => dismiss(id), K.toastMs);
  return id;
}

export function dismiss(id: number) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}


/**
 * Hoisted, not an inline arrow. useSyncExternalStore re-subscribes whenever
 * subscribe changes identity, so an arrow at the call site made every render
 * of every consumer drop its listener, re-add it and re-read the snapshot.
 */
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
const snapshot = () => toasts;

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
