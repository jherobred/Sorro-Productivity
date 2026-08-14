'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryClient, persister } from '@/lib/offline';

export function Providers({ children }: { children: React.ReactNode }) {
  // The persister needs `window`, so it is null during the static export's
  // prerender pass. Render children bare until we are on the client.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready || !persister) return <>{children}</>;

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
