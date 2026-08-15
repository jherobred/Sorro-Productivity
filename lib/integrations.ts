'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation } from './offline';

/**
 * Third-party connections.
 *
 * Neither of these can run from the browser:
 *   - Canvas LMS serves no CORS headers, and its access token must never sit in
 *     a client bundle or in localStorage.
 *   - Google Calendar's API needs a token Supabase only hands over at sign-in
 *     and never refreshes, so an OAuth path would break an hour after login.
 *
 * So both go through one Edge Function (`sync`) that runs with the caller's JWT.
 * RLS on bd_integrations means the function can only ever read the row belonging
 * to whoever called it. Google Calendar is read-only, via the private ICS URL
 * that Calendar itself publishes under Settings → Integrate calendar.
 */

export type Integration = {
  kind: 'canvas_lms' | 'gcal_ics';
  config: Record<string, string>;
  enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
};

const KEY = ['integrations'] as const;

export function useIntegrations() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Integration[]> => {
      const { data, error } = await supabase.from('bd_integrations')
        .select('kind,config,enabled,last_sync_at,last_error');
      if (error) throw error;
      return (data ?? []) as Integration[];
    },
  });
}

const SAVE = defineMutation('integration.save', async (v: { kind: string; config: Record<string, string>; enabled: boolean }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_integrations')
    .upsert({ user_id, kind: v.kind, config: v.config, enabled: v.enabled }, { onConflict: 'user_id,kind' });
  if (error) throw error;
});

const REMOVE = defineMutation('integration.remove', async (v: { kind: string }) => {
  const { error } = await supabase.from('bd_integrations').delete().eq('kind', v.kind);
  if (error) throw error;
});

export type SyncResult = { ok: boolean; imported: number; message: string };

/**
 * Not a defineMutation: a sync is a request for fresh data, not a durable write.
 * Replaying it after a restart would be pointless work, so it stays online-only.
 */
export async function runSync(kind: Integration['kind']): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke<SyncResult>('sync', { body: { kind } });
  if (error) {
    // Edge Functions return the failure body alongside a non-2xx, and that body
    // carries the useful message ("401 from Canvas"), so dig it out.
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.text().catch(() => '') : '';
    let message = error.message;
    try { message = JSON.parse(detail).message ?? message; } catch { /* plain text or empty */ }
    return { ok: false, imported: 0, message };
  }
  return data ?? { ok: false, imported: 0, message: 'No response' };
}

export function useIntegrationActions() {
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: KEY });
  return {
    save: useMutation<unknown, Error, { kind: string; config: Record<string, string>; enabled: boolean }>({ mutationKey: SAVE, onSettled: settle }),
    remove: useMutation<unknown, Error, { kind: string }>({ mutationKey: REMOVE, onSettled: settle }),
  };
}
