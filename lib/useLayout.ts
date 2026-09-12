'use client';

import { useSyncExternalStore } from 'react';

/**
 * Layout is driven by automatic device detection and manual view mode override.
 * Three modes:
 * - 'auto': Automatically detects whether the user is on a phone/mobile device.
 * - 'phone': Forces dedicated mobile phone view.
 * - 'web': Forces dedicated web/desktop view.
 */
export type ViewMode = 'auto' | 'phone' | 'web';

export type Layout = {
  phone: boolean;
  viewMode: ViewMode;
  isPhoneDevice: boolean;
  landscape: boolean;
  width: number;
  height: number;
  setViewMode: (mode: ViewMode) => void;
};

export function isPhoneDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // Tablets and Android WebViews get the same roomy layout as an equally
  // sized browser. Input capabilities must not force a phone composition.
  return window.innerWidth <= 760;
}

const LS_KEY = 'basedly-viewmode';

function readViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val === 'phone' || val === 'web' || val === 'auto') return val;
  } catch { /* ignore */ }
  return 'auto';
}

let currentViewMode: ViewMode = 'auto';
let initialized = false;
let listening = false;

const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/**
 * What the server, and the first client render, sees.
 *
 * One frozen object rather than a fresh literal per call. `useSyncExternalStore`
 * compares snapshots by identity, so a new object every time is an unequal
 * snapshot every time — React logged "The result of getServerSnapshot should be
 * cached to avoid an infinite loop" on every page that reads the layout, which
 * is nearly all of them.
 */
const SERVER_LAYOUT: Layout = {
  phone: false,
  viewMode: 'auto',
  isPhoneDevice: false,
  landscape: false,
  width: 1440,
  height: 900,
  setViewMode,
};

function computeLayout(): Layout {
  if (typeof window === 'undefined') return SERVER_LAYOUT;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const deviceIsPhone = isPhoneDevice();
  const phone = currentViewMode === 'phone' ? true : currentViewMode === 'web' ? false : deviceIsPhone;
  const landscape = phone && w > h;

  return {
    phone,
    viewMode: currentViewMode,
    isPhoneDevice: deviceIsPhone,
    landscape,
    width: w,
    height: h,
    setViewMode,
  };
}

let cachedLayout: Layout = computeLayout();

export function setViewMode(mode: ViewMode) {
  currentViewMode = mode;
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch { /* ignore */ }
  cachedLayout = computeLayout();
  emit();
}

function subscribe(callback: () => void) {
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    initialized = true;
    currentViewMode = readViewMode();
    cachedLayout = computeLayout();

    const handleResize = () => {
      cachedLayout = computeLayout();
      emit();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  }

  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}


export function useLayout(): Layout {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!initialized && typeof window !== 'undefined') {
        initialized = true;
        currentViewMode = readViewMode();
        cachedLayout = computeLayout();
      }
      return cachedLayout;
    },
    () => SERVER_LAYOUT,
  );
}
