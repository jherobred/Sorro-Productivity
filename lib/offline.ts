import { QueryClient, type MutationFunction } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * Offline reads + queued writes.
 *
 * Reads: queries use networkMode 'offlineFirst' and an infinite gcTime, and the
 * whole cache is persisted, so every screen you have opened still renders with
 * no signal.
 *
 * Writes: mutations keep the default 'online' networkMode, which makes TanStack
 * *pause* them while offline instead of failing. Paused mutations are persisted
 * alongside the cache and replayed by resumePausedMutations() on reconnect —
 * including across a full app restart, which is why every mutation must be
 * registered by key below (a persisted mutation has no closure to resume into).
 *
 * ponytail: localStorage persister, ~5MB ceiling. Swap in the IndexedDB async
 * persister if a heavy user's cache starts getting evicted.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      gcTime: Infinity,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
    },
    mutations: {
      networkMode: 'online',
      retry: 3,
    },
  },
});

export const persister =
  typeof window === 'undefined'
    ? undefined
    : createSyncStoragePersister({
        storage: window.localStorage,
        key: 'basedly-cache',
        throttleTime: 1000,
      });

/**
 * Register a mutation so it survives a restart. Call at module scope, then pass
 * the returned key as `mutationKey` in useMutation and omit mutationFn.
 */
export function defineMutation<TVars, TData>(
  key: string,
  fn: MutationFunction<TData, TVars>
): readonly [string] {
  queryClient.setMutationDefaults([key], { mutationFn: fn as MutationFunction<unknown, unknown> });
  return [key] as const;
}

/** True when there are writes waiting for a connection — drives the offline pill. */
export function pendingWriteCount(): number {
  return queryClient.getMutationCache().findAll({ predicate: (m) => m.state.isPaused }).length;
}
