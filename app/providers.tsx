'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, persister } from '@/lib/offline';
import { devFixturesOn, seedDevFixtures } from '@/lib/devFixtures';

export function Providers({ children }: { children: React.ReactNode }) {
  // Seed before anything below can mount and fire a query. Seeding after the
  // first paint lost the race: a page's useQuery had already gone to a
  // signed-out Supabase, and its empty answer landed on top of the fixture a
  // moment later, so half the preview came up blank depending on timing.
  if (devFixturesOn()) seedDevFixtures();

  // The *persister* needs `window`, so it is null during the static export's
  // prerender pass — but the QueryClient itself is fine there, and the shell
  // now reads queries, so it must always have a provider above it. Rendering
  // children bare here threw "No QueryClient set" on every prerender.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  // Dev preview: restoring the persisted cache is asynchronous and lands *after*
  // mount effects, so it would overwrite the fixtures with whatever a signed-out
  // client last stored — usually nothing. Skip persistence entirely here.
  if (!ready || !persister || devFixturesOn()) {
    return (
      <QueryClientProvider client={queryClient}>
        {ready && <ReconnectBridge />}
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
