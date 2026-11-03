import { QueryClient, type MutationFunction } from '@tanstack/react-query';
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client';
import { LEGACY_DB, moveLegacyDatabase } from './storageKeys';

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
 * **The cache lives in IndexedDB, not localStorage.** This was the app's worst
 * source of felt slowness and it was invisible in any network trace, because
 * it was not the network. `localStorage.setItem` is synchronous and it blocks
 * the main thread; the sync persister called it with the *entire serialised
 * query cache* on a one-second throttle. Every tick a note, a tick, a message
 * or a drag caused, the phone stopped to `JSON.stringify` every screen you had
 * opened this session and write the whole string out again. On a mid-range
 * Android that is tens of milliseconds of dropped frames on a timer, felt as
 * stutter while typing and dragging. It also capped the cache at localStorage's
 * ~5MB, which a few weeks of notes and a feed of images will pass.
 *
 * IndexedDB is asynchronous, so the write happens off the critical path, and
 * its quota is measured in hundreds of megabytes. The `Persister` interface is
 * three methods and takes promises, so this needs no new dependency — the one
 * that was here (`query-sync-storage-persister`) can go.
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

const DB = 'sorro';
const STORE = 'cache';
const CACHE_KEY = 'sorro-cache';

/** One connection for the session; opening a database per write is the slow way. */
let dbPromise: Promise<IDBDatabase> | null = null;

function openAt(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, version);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb blocked'));
  });
}

/**
 * The database, with its store guaranteed to exist.
 *
 * `onupgradeneeded` only fires when the version goes *up*, so a database that
 * already exists at this version but has no store would never get one — every
 * read and write would fail silently for as long as that database lived, and
 * the app would look like it simply had no offline cache. That state is
 * reachable: another build, an interrupted upgrade, or anything else that
 * opened `sorro` first. So the store is checked after opening, and if it is
 * missing the database is reopened one version higher, which is the only way
 * to get an upgrade transaction.
 */
function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openAt().then((db) => {
    if (db.objectStoreNames.contains(STORE)) return db;
    const next = db.version + 1;
    db.close();
    return openAt(next);
  }).then(async (db) => {
    // The queue of offline writes made under the old name comes along before the first restore.
    await moveLegacyDatabase(LEGACY_DB.cache, db, STORE).catch(() => {});
    return db;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

/**
 * Structured clone, not JSON.
 *
 * IndexedDB stores the object graph directly, so there is no stringify on the
 * way in and no parse on the way out — which is most of what made the old
 * persister expensive, and all of what made restoring the cache on launch slow
 * enough to see.
 */
/**
 * The cache copied over from the Basedly database sits under its old key. It is
 * moved to the current key on first restore, so sign-out (which deletes the
 * current key) can never leave it behind for the next account.
 */
async function adoptLegacyCache(): Promise<PersistedClient | undefined> {
  const old = await tx<PersistedClient | undefined>('readonly', (s) => s.get(LEGACY_DB.cacheKey));
  if (old === undefined) return undefined;
  await tx('readwrite', (s) => s.put(old, CACHE_KEY));
  await tx('readwrite', (s) => s.delete(LEGACY_DB.cacheKey));
  return old;
}

function makePersister(): Persister {
  // Still throttled. The write is off the main thread now, but a cache that
  // hits disk on every keystroke is still a phone writing for no reason.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedClient | null = null;

  const flush = () => {
    timer = null;
    const value = pending;
    pending = null;
    if (value) void tx('readwrite', (s) => s.put(value, CACHE_KEY)).catch(() => {});
  };

  return {
    persistClient(client) {
      pending = client;
      if (!timer) timer = setTimeout(flush, 1000);
    },
    restoreClient() {
      return tx<PersistedClient | undefined>('readonly', (s) => s.get(CACHE_KEY))
        .then((v) => v ?? adoptLegacyCache())
        // A corrupt or unreadable store must not stop the app from starting.
        // Losing the offline cache costs a refetch; throwing costs the session.
        .catch(() => undefined);
    },
    removeClient() {
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
      return Promise.all([
        tx('readwrite', (s) => s.delete(CACHE_KEY)),
        tx('readwrite', (s) => s.delete(LEGACY_DB.cacheKey)),
      ]).then(() => undefined).catch(() => undefined);
    },
  };
}

export const persister =
  typeof window === 'undefined' || typeof indexedDB === 'undefined'
    ? undefined
    : makePersister();

/** Drop the in-memory cache and its IndexedDB copy — called on account switch, so the next account cannot rehydrate into the previous one's rows. */
export async function resetPersistedCache() {
  queryClient.clear();
  await persister?.removeClient();
}

// The old localStorage cache is dead weight after the move — up to 5MB of a
// budget the app still shares with prefs and the auth session. Cleared once,
// on first load after the upgrade.
if (typeof window !== 'undefined') {
  try { window.localStorage.removeItem(LEGACY_DB.cacheKey); } catch { /* private mode */ }
}

/**
 * Register a mutation so it survives a restart. Call at module scope, then pass
 * the returned key as `mutationKey` in useMutation and omit mutationFn.
 *
 * Gotcha: because mutationFn lives in setMutationDefaults, useMutation has no
 * function signature to infer variables from. If the hook has no `onMutate` to
 * infer from either, state the generics explicitly or TS infers `void` and every
 * .mutate(arg) call fails to compile:
 *
 *   useMutation<unknown, Error, { id: string }>({ mutationKey: KEY })
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
