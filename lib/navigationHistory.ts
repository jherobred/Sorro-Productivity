/** Browser history adapter, kept independent of React for regression tests. */
export type NavigationState = Record<string, unknown> | null;
export type NavigationPort = {
  read: () => { url: string; state: NavigationState };
  push: (state: NavigationState, title: string, url?: string | URL | null) => void;
  replace: (state: NavigationState, title: string, url?: string | URL | null) => void;
  back: () => void;
  defer: (run: () => void) => void;
};

const MARKER = '__bdOverlay';
type Marker = { id: string; url: string };
type Overlay = { close: () => void; url: string };

function clean(state: NavigationState): NavigationState {
  if (!state) return state;
  const { [MARKER]: _overlay, bdOverlay: _legacyOverlay, ...rest } = state;
  return rest;
}

/**
 * One temporary entry protects the current page while nested views are open.
 * Each Back closes one view and re-arms that entry only if another remains.
 * A real route push replaces the temporary entry, preserving the actual route
 * sequence without leaving closed dialogs behind in browser history.
 */
export function createOverlayHistory(port: NavigationPort, session = 'sorro') {
  const overlays: Overlay[] = [];
  let serial = 0;
  let marker: Marker | null = null;
  let pendingBack = false;
  let cleanupQueued = false;
  const queuedWrites: (() => void)[] = [];

  const ownsCurrent = () => {
    const current = port.read();
    const value = current.state?.[MARKER] as Marker | undefined;
    return !!marker && current.url === marker.url && value?.id === marker.id;
  };

  function arm() {
    if (!overlays.length || pendingBack || ownsCurrent()) return;
    const current = port.read();
    marker = { id: `${session}:${++serial}`, url: current.url };
    port.push({ ...clean(current.state), [MARKER]: marker }, '', current.url);
  }

  function scheduleCleanup() {
    if (cleanupQueued) return;
    cleanupQueued = true;
    port.defer(() => {
      cleanupQueued = false;
      // A menu becoming a dialog and React Strict Mode remounts reuse this
      // entry instead of scheduling a second browser traversal.
      if (overlays.length || pendingBack || !ownsCurrent()) return;
      pendingBack = true;
      port.back();
    });
  }

  function dismissAll() {
    const closing = overlays.splice(0).reverse();
    for (const overlay of closing) overlay.close();
  }

  function closeTop() {
    const top = overlays.pop();
    if (!top) return false;
    top.close();
    scheduleCleanup();
    return true;
  }

  return {
    register(close: () => void) {
      const overlay = { close, url: port.read().url };
      overlays.push(overlay);
      arm();
      return () => {
        const index = overlays.indexOf(overlay);
        if (index !== -1) overlays.splice(index, 1);
        scheduleCleanup();
      };
    },
    closeTop,
    hasOverlays: () => overlays.length > 0,
    pop() {
      const current = port.read();
      const previous = marker;
      marker = null;
      if (pendingBack) {
        pendingBack = false;
        if (previous && current.url !== previous.url) dismissAll();
        for (const write of queuedWrites.splice(0)) write();
        arm();
        return;
      }
      if (!previous) return;
      if (current.url !== previous.url) {
        // Explicit multi-entry traversal is allowed to leave the page.
        dismissAll();
        return;
      }
      closeTop();
      arm();
    },
    write(kind: 'push' | 'replace', state: NavigationState, title: string, url?: string | URL | null) {
      if (pendingBack) {
        // A close-button traversal is asynchronous. Finish it before pushing
        // a route, or that traversal would pop the route just requested.
        queuedWrites.push(() => this.write(kind, state, title, url));
        return;
      }
      const current = port.read();
      const nextUrl = url == null ? current.url : new URL(String(url), current.url).href;
      const activeEntry = ownsCurrent();
      if (activeEntry && nextUrl !== current.url) {
        marker = null;
        dismissAll();
        port.replace(clean(state), title, url);
        return;
      }
      if (activeEntry) {
        // Next updates its router tree with replaceState. Preserve that state
        // and our marker without appending a duplicate of the current URL.
        port.replace({ ...clean(state), [MARKER]: marker }, title, url);
        return;
      }
      if (nextUrl !== current.url) dismissAll();
      port[kind](clean(state), title, url);
    },
  };
}
