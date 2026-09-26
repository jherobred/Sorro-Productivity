'use client';

import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const DisplayAwake = registerPlugin<{ setEnabled(options: { enabled: boolean }): Promise<void> }>('DisplayAwake');
let nativeQueue = Promise.resolve();
function setNative(enabled: boolean) {
  const next = nativeQueue.catch(() => {}).then(() => DisplayAwake.setEnabled({ enabled }));
  nativeQueue = next;
  return next;
}

/** A screen-only lock, held only while the user explicitly enables it. */
export function useScreenAwake(enabled: boolean) {
  const [status, setStatus] = useState<'off' | 'starting' | 'on' | 'paused' | 'unavailable' | 'error'>('off');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) { setStatus('off'); return; }
    const native = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('DisplayAwake');
    if (!native && !('wakeLock' in navigator)) { setStatus('unavailable'); return; }
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    let requesting = false;
    let retryWhenReady = false;
    const acquire = async () => {
      if (disposed || lock || document.visibilityState !== 'visible') return;
      if (requesting) { retryWhenReady = true; return; }
      requesting = true;
      setStatus('starting');
      try {
        if (native) {
          await setNative(true);
          if (!disposed && document.visibilityState === 'visible') setStatus('on');
        } else {
          const next = await navigator.wakeLock.request('screen');
          if (disposed || document.visibilityState !== 'visible') { await next.release(); return; }
          lock = next;
          setStatus('on');
          next.addEventListener('release', () => {
            if (lock !== next) return;
            lock = undefined;
            if (!disposed) setStatus('paused');
          });
        }
      } catch {
        if (!disposed) setStatus('error');
      } finally {
        requesting = false;
        if (retryWhenReady) { retryWhenReady = false; void acquire(); }
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') void acquire();
      else {
        if (native) void setNative(false).catch(() => {});
        if (lock) { const held = lock; lock = undefined; void held.release().catch(() => {}); }
        setStatus('paused');
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      if (native) void setNative(false).catch(() => {});
      if (lock) void lock.release().catch(() => {});
    };
  }, [enabled, attempt]);
  return { status, retry: () => setAttempt(n => n + 1) };
}
