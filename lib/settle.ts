'use client';

import type { QueryClient } from '@tanstack/react-query';

/**
 * Refetch when the writing stops, not after every write.
 *
 * Every mutation in this app used to invalidate its query the moment it
 * settled. That looks harmless and is not, because a refetch started by one
 * write can land after a later write's optimistic update:
 *
 *   type "a"  → optimistic "a"   → PATCH → settled → refetch starts
 *   type "b"  → optimistic "ab"
 *   type "c"  → optimistic "abc"
 *                              ← refetch returns "a", overwriting "abc"
 *
 * The characters vanish under the cursor, and a note or a canvas card appears
 * to delete itself. Debouncing the writes narrows the window; it cannot close
 * it, because any refetch still in flight outranks every optimistic update
 * made while it was travelling.
 *
 * `isMutating()` counts the mutations currently running, including the one
 * calling this. So `> 1` means others are still in flight and this is not the
 * moment to ask the server what the truth is — the last one out turns the
 * lights on. This is TanStack's documented remedy for exactly this race.
 *
 * Optimistic state remains authoritative while you are working; the server
 * gets the last word only once you have stopped.
 */
export function settler(qc: QueryClient, ...keys: readonly (readonly unknown[])[]) {
  return () => {
    if (qc.isMutating() > 1) return;
    for (const key of keys) void qc.invalidateQueries({ queryKey: key });
  };
}
