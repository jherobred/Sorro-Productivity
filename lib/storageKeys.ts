/**
 * Sorro was called Basedly. Saved keys and local databases still carry the old
 * name on devices that ran it, so they move once, before anything reads them.
 */
type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const OLD = /^basedly(?=[-_])/;

/** Moves every `basedly-*` / `basedly_*` key to its `sorro` name. Returns how many moved. */
export function migrateStorageKeys(store: KeyStore): number {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && OLD.test(k)) keys.push(k); }
  for (const k of keys) {
    // The pre-IndexedDB query cache (up to 5MB) is dead weight: dropped, never copied.
    if (k === 'basedly-cache') { try { store.removeItem(k); } catch { /* ignore */ } continue; }
    try {
      const next = k.replace(OLD, 'sorro');
      const value = store.getItem(k);
      if (store.getItem(next) === null && value !== null) store.setItem(next, value);
      store.removeItem(k);
    } catch { /* full storage: this key stays behind, the rest still move */ }
  }
  return keys.length;
}

export function migrateBrowserStorage() {
  try { migrateStorageKeys(localStorage); } catch { /* private mode */ }
  try { migrateStorageKeys(sessionStorage); } catch { /* private mode */ }
}

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

/**
 * Copies one object store from an old IndexedDB database into the new one, then
 * deletes the old database. Records already in the new store win. Safe to call
 * on every open: with no old database it does nothing.
 */
export async function moveLegacyDatabase(oldName: string, target: IDBDatabase, store: string): Promise<void> {
  if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some(d => d.name === oldName)) return;
  const old = await new Promise<IDBDatabase | null>(resolve => {
    const r = indexedDB.open(oldName);
    r.onupgradeneeded = () => { r.transaction?.abort(); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
  if (!old) return;
  if (old.objectStoreNames.contains(store)) {
    const src = old.transaction(store, 'readonly').objectStore(store);
    const [keys, values] = await Promise.all([request(src.getAllKeys()), request(src.getAll())]);
    const have = new Set((await request(target.transaction(store, 'readonly').objectStore(store).getAllKeys())).map(k => JSON.stringify(k)));
    const tx = target.transaction(store, 'readwrite');
    const dst = tx.objectStore(store);
    const inline = dst.keyPath !== null;
    keys.forEach((k, i) => { if (!have.has(JSON.stringify(k))) { if (inline) dst.put(values[i]); else dst.put(values[i], k); } });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  }
  old.close();
  indexedDB.deleteDatabase(oldName);
}

/** Note bodies written before the rename open with `<!-- basedly-…` markers. Readers pass bodies through this. */
export const rebrandBody = (body: string) => body.includes('<!-- basedly-') ? body.replaceAll('<!-- basedly-', '<!-- sorro-') : body;

/** Old local database names, read once by moveLegacyDatabase. */
export const LEGACY_DB = { cache: 'basedly', cacheKey: 'basedly-cache', recovery: 'basedly-page-recovery' } as const;
