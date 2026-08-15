'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, persister } from '@/lib/offline';
import { devFixturesOn, seedDevFixtures } from '@/lib/devFixtures';

export function Providers({ children }: { children: React.ReactNode }) {
  // The *persister* needs `window`, so it is null during the static export's
  // prerender pass — but the QueryClient itself is fine there, and the shell
  // now reads queries, so it must always have a provider above it. Rendering
  // children bare here threw "No QueryClient set" on every prerender.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready || !persister) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  // Dev preview: restoring the persisted cache is asynchronous and lands *after*
  // mount effects, so it would overwrite the fixtures with whatever a signed-out
  // client last stored — usually nothing. Skip persistence entirely here.
  if (devFixturesOn()) {
    seedDevFixtures();
    return (
      <QueryClientProvider client={queryClient}>
        <ReconnectBridge />
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: Infinity, buster: 'v1' }}
      onSuccess={() => {
        // Cache restored — replay anything that was queued while offline.
        void queryClient.resumePausedMutations();
      }}
    >
      <ReconnectBridge />
      {children}
    </PersistQueryClientProvider>
  );
}

/** Capacitor's webview does not always fire `online`; poll the flag as a backstop. */
function ReconnectBridge() {
  useEffect(() => {
    const sync = () => onlineManager.setOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return null;
}
