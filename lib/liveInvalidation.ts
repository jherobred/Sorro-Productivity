/** Coalesce row events and preserve optimistic edits until writes finish. */
export function createInvalidationQueue<TTimer>(port: {
  busy: () => boolean;
  invalidate: (key: string) => void;
  schedule: (run: () => void, delay: number) => TTimer;
  cancel: (timer: TTimer) => void;
}) {
  const pending = new Set<string>();
  let timer: TTimer | undefined;
  let disposed = false;

  const flush = () => {
    timer = undefined;
    if (disposed) return;
    // Mutation names and table names differ (task.complete versus tasks,
    // nb2.saveNote versus notes). Check executing writes, not string prefixes.
    if (port.busy()) {
      timer = port.schedule(flush, 350);
      return;
    }
    const keys = [...pending];
    pending.clear();
    for (const key of keys) port.invalidate(key);
  };

  return {
    add(keys: readonly string[]) {
      if (disposed) return;
      for (const key of keys) pending.add(key);
      if (timer === undefined) timer = port.schedule(flush, 120);
    },
    dispose() {
      disposed = true;
      pending.clear();
      if (timer !== undefined) port.cancel(timer);
      timer = undefined;
    },
  };
}
