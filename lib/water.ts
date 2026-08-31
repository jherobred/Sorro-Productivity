'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';
import { fixture } from './devFixtures';
import { CUP_ML, WAKE_H, inLastHour } from './hydration';
import { logDay, logDayStart } from './logday';

/**
 * Every cup, with the time on it.
 *
 * `bd_body_days.water` is a running count, which can say how much but never how
 * fast — and how fast is the whole basis of the over-drinking warning. Ten cups
 * across a day is the target; the same ten inside an hour is the thing the app
 * is supposed to interrupt.
 *
 * The day column stays as the cheap total so nothing that already reads it has
 * to change; this is the detail underneath it.
 */

export type Sip = { id: string; at: string; ml: number };

const KEY = ['water_log'] as const;

/**
 * The current lived day's sips. Fetched from 04:00 rather than midnight, so a
 * 01:20 glass still belongs to the night it was actually drunk on.
 */
export function useWater(now: Date = new Date()) {
  const day = logDay(now);
  return useQuery({
    queryKey: [...KEY, day],
    queryFn: async (): Promise<Sip[]> => {
      const fx = fixture<Sip[]>('water_log');
      if (fx) return fx;
      const from = logDayStart(day).toISOString();
      const { data, error } = await supabase.from('bd_water_log')
        .select('id,at,ml').gte('at', from).order('at');
      if (error) throw error;
      return (data ?? []) as Sip[];
    },
  });
}

const ADD_SIP = defineMutation('water.add', async (v: Sip) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_water_log').insert({ ...v, user_id });
  if (error) throw error;
});

const DEL_SIP = defineMutation('water.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_water_log').delete().eq('id', v.id);
  if (error) throw error;
});

export function useWaterActions(now: Date = new Date()) {
  const qc = useQueryClient();
  const key = [...KEY, logDay(now)] as const;
  const settle = settler(qc, key);

  const add = useMutation<unknown, Error, Sip, Sip[]>({
    mutationKey: ADD_SIP,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Sip[]>(key) ?? [];
      queryClient.setQueryData<Sip[]>(key, [...prev, v]);
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(key, ctx); toast(e.message); },
    onSettled: settle,
  });

  const remove = useMutation<unknown, Error, { id: string }, Sip[]>({
    mutationKey: DEL_SIP,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Sip[]>(key) ?? [];
      queryClient.setQueryData<Sip[]>(key, prev.filter((s) => s.id !== v.id));
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(key, ctx); },
    onSettled: settle,
  });

  return { add, remove };
}

/** Millilitres logged today, and how many of them landed in the last hour. */
export function waterTotals(sips: Sip[], now: Date = new Date()) {
  const total = sips.reduce((s, x) => s + x.ml, 0);
  return { total, lastHour: inLastHour(sips.map((s) => [s.at, s.ml] as const), now) };
}

/**
 * Set the count to `n` cups by adding or removing from the end.
 *
 * The cups row is a row of toggles, so the gesture is "make it this many"
 * rather than "add one" — tapping the sixth cup when four are filled should add
 * two, and tapping the last filled one should take it back off.
 *
 * Back-filling is why the timestamps are not all `now`. Someone who forgot to
 * log all day and taps the sixth cup at 17:00 is reporting six cups *drunk*,
 * not six cups drunk in one go — but stamping them all at this instant puts
 * 1.5 L inside the rolling hour and the app accuses them of drinking too fast.
 * The warning would fire on the one person diligently catching up.
 *
 * So a single tap stamps now, because that is a real sip. Adding several at
 * once spreads them back evenly over the waking day, which is the honest
 * reading of what the gesture claims.
 */
export function setCups(
  sips: Sip[],
  n: number,
  add: (s: Sip) => void,
  remove: (id: string) => void,
  now: Date = new Date(),
) {
  const have = sips.length;

  if (n > have) {
    const adding = n - have;
    for (let i = 0; i < adding; i++) {
      add({ id: crypto.randomUUID(), at: backfillAt(i, adding, now), ml: CUP_ML });
    }
  } else if (n < have) {
    // Newest first: undoing a mistake takes back the cup you just logged.
    const doomed = [...sips].sort((a, b) => b.at.localeCompare(a.at)).slice(0, have - n);
    for (const s of doomed) remove(s.id);
  }
}

/**
 * When the `i`th of `count` back-filled cups is claimed to have been drunk.
 *
 * One cup is now. Several are spread from the start of the waking day up to
 * now, oldest first, so the last one still lands at this moment and the rest
 * sit far enough back not to read as a burst.
 */
export function backfillAt(i: number, count: number, now: Date = new Date()): string {
  if (count <= 1) return now.toISOString();
  const wake = new Date(now);
  wake.setHours(WAKE_H, 0, 0, 0);
  // Before the waking hour there is no span to spread across; fall back to an
  // hour apart so the cups still do not stack inside one rolling window.
  const span = now.getTime() - wake.getTime();
  if (span <= 0) return new Date(now.getTime() - (count - 1 - i) * 3600_000).toISOString();
  return new Date(wake.getTime() + (span * i) / (count - 1)).toISOString();
}
