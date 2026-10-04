/** A durable, per-account outbox. Only changed fields are merged into the server copy. */
export type PreferencePatch = Record<string, unknown>;
const maps = new Set(['eventMeta', 'calendarTaskPlans']);
const record = (value: unknown): PreferencePatch => value && typeof value === 'object' && !Array.isArray(value) ? value as PreferencePatch : {};

export function preferenceDelta(before: PreferencePatch, change: PreferencePatch): PreferencePatch {
  const delta: PreferencePatch = {};
  for (const [key, value] of Object.entries(change)) {
    if (!maps.has(key)) { if (JSON.stringify(before[key]) !== JSON.stringify(value)) delta[key] = value; continue; }
    const old = record(before[key]), next = record(value), entries: PreferencePatch = {};
    for (const id of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (JSON.stringify(old[id]) === JSON.stringify(next[id])) continue;
      if (!(id in next)) entries[id] = null; // explicit removal survives reconnect
      else if (key === 'eventMeta') {
        const fields: PreferencePatch = {}, a = record(old[id]), b = record(next[id]);
        for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) fields[field] = b[field] ?? null;
        }
        entries[id] = fields;
      } else entries[id] = next[id];
    }
    if (Object.keys(entries).length) delta[key] = entries;
  }
  return delta;
}

/** keepRemovals combines queued patches; ordinary application removes tombstones. */
export function mergePreferencePatch(base: PreferencePatch, patch: PreferencePatch, keepRemovals = false): PreferencePatch {
  const next = { ...base, ...patch };
  for (const key of maps) {
    if (!(key in patch)) continue;
    const entries = { ...record(base[key]) };
    for (const [id, value] of Object.entries(record(patch[key]))) {
      if (value === null && !keepRemovals) delete entries[id];
      else entries[id] = key === 'eventMeta' && value !== null ? { ...record(entries[id]), ...record(value) } : value;
    }
    next[key] = entries;
  }
  return next;
}

type Pending = { revision: number; patch: PreferencePatch };
export class PreferenceOutbox {
  private entries: Record<string, Pending>;
  private running = new Map<string, Promise<void>>();
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  private key: string;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, key = 'basedly-prefs-outbox') {
    this.storage = storage; this.key = key;
    try { this.entries = JSON.parse(storage.getItem(key) || '{}'); } catch { this.entries = {}; }
  }
  pending(owner: string): PreferencePatch { return this.entries[owner]?.patch ?? {}; }
  enqueue(owner: string, patch: PreferencePatch) {
    if (!Object.keys(patch).length) return;
    const previous = this.entries[owner];
    this.entries[owner] = { revision: (previous?.revision ?? 0) + 1, patch: mergePreferencePatch(previous?.patch ?? {}, patch, true) };
    this.save();
  }
  private save() { this.storage.setItem(this.key, JSON.stringify(this.entries)); }
  flush(owner: string, read: () => Promise<PreferencePatch>, write: (value: PreferencePatch) => Promise<void>): Promise<void> {
    const existing = this.running.get(owner);
    if (existing) return existing;
    const job = (async () => {
      while (this.entries[owner]) {
        const batch = this.entries[owner];
        const remote = await read();
        await write(mergePreferencePatch(remote, batch.patch));
        // A change made during the request is still owed. Never acknowledge it early.
        if (this.entries[owner]?.revision === batch.revision) { delete this.entries[owner]; this.save(); }
      }
    })().finally(() => this.running.delete(owner));
    this.running.set(owner, job);
    return job;
  }
}
