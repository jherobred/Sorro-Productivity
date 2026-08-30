'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * How wide the open side panel is, if one is open.
 *
 * L5's claim is that depth arrives as a panel pushed in from the right, not as
 * a sheet dropped on top of the page. A panel that overlays needs nothing from
 * the shell — it just covers whatever is behind it. A panel that *pushes* has
 * to tell the shell how much room it took, or the centred column stays where it
 * was and the panel sits on top of it anyway.
 *
 * So panels register their width while they are open and deregister when they
 * close. Shell reads the total and insets the page by it. Any panel that
 * registers gets the behaviour; one that does not keeps overlaying, which is
 * still correct under the other four layouts.
 */

let width = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getSnapshot = () => width;
/** The static export prerenders with nothing open, which is always true. */
const getServerSnapshot = () => 0;

export function useSidePanelWidth(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Declare a panel open at `w` pixels; pass 0 (or unmount) to close it.
 *
 * Written as an effect rather than a call during render because it is a write
 * to a store other components read — doing it in the render body makes the
 * panel's own first render tear against the shell's.
 */
export function useRegisterSidePanel(w: number) {
  useEffect(() => {
    if (!w) return;
    width = w;
    emit();
    return () => { width = 0; emit(); };
  }, [w]);
}
