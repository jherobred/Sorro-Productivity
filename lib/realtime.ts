'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * Invalidate a query when a table changes for other people too.
 *
 * Only the community layer and shared projects get a socket (BACKEND.md
 * "Realtime"). Personal tracking — habits, body, money, journal — stays on
 * plain fetch + revalidation on purpose.
 */
export function useRealtime(table: string, queryKey: readonly unknown[], filter?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`rt:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => void qc.invalidateQueries({ queryKey })
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // queryKey is an array literal at most call sites; join it for a stable dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, qc, queryKey.join(':')]);
}
