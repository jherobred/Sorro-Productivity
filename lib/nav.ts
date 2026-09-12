'use client';

import { useEffect, useRef } from 'react';
import { createOverlayHistory, type NavigationState } from './navigationHistory';

let navigation: ReturnType<typeof createOverlayHistory> | undefined;

function controller() {
  if (!navigation) {
    const nativePush = window.history.pushState.bind(window.history);
    const nativeReplace = window.history.replaceState.bind(window.history);
    navigation = createOverlayHistory({
      read: () => ({ url: window.location.href, state: window.history.state as NavigationState }),
      push: nativePush,
      replace: nativeReplace,
      back: () => window.history.back(),
      defer: run => window.queueMicrotask(run),
    }, `${Date.now()}`);
  }
  return navigation;
}

export function pushOverlay(close: () => void) {
  return controller().register(close);
}

export function closeTopOverlay() {
  return controller().closeTop();
}

export function useOverlayBack(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => open ? pushOverlay(() => latest.current()) : undefined, [open]);
}

/** Installed once by Shell. Browser side buttons use native Back exactly once. */
export function useBackGuard() {
  useEffect(() => {
    const nav = controller();
    const priorPush = window.history.pushState;
    const priorReplace = window.history.replaceState;
    const push: History['pushState'] = (state, title, url) => nav.write('push', state, title, url);
    const replace: History['replaceState'] = (state, title, url) => nav.write('replace', state, title, url);
    window.history.pushState = push;
    window.history.replaceState = replace;

    const pop = () => nav.pop();
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return;
      // Let focused controls and menus finish their own key handling first.
      queueMicrotask(() => {
        if (!event.defaultPrevented && nav.closeTop()) event.preventDefault();
      });
    };
    window.addEventListener('popstate', pop);
    window.addEventListener('keydown', key);

    let cancelled = false;
    let remove: (() => void) | undefined;
    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (cancelled || !Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener('backButton', ({ canGoBack }) => {
        if (nav.hasOverlays() || canGoBack) window.history.back();
        else void App.minimizeApp();
      });
      if (cancelled) void listener.remove();
      else remove = () => { void listener.remove(); };
    })();

    return () => {
      cancelled = true;
      remove?.();
      window.removeEventListener('popstate', pop);
      window.removeEventListener('keydown', key);
      if (window.history.pushState === push) window.history.pushState = priorPush;
      if (window.history.replaceState === replace) window.history.replaceState = priorReplace;
    };
  }, []);
}
