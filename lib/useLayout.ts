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
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;

  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
  const isCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const isNarrow = window.innerWidth < 900;

  return isMobileUA || (isCoarse && isNarrow) || isNarrow;
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

const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function computeLayout(): Layout {
  if (typeof window === 'undefined') {
    return {
      phone: false,
      viewMode: 'auto',
      isPhoneDevice: false,
      landscape: false,
      width: 1440,
      height: 900,
      setViewMode,
    };
  }

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
  if (!initialized && typeof window !== 'undefined') {
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

/**
 * One object, returned every time. React warns "the result of getServerSnapshot
 * should be cached" when this returned a fresh literal per call — the same fix
 * prefs.ts applies, and for the same reason: getSnapshot must be pure, and a
 * new object per call is a new snapshot every render.
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
