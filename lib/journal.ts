'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { ymd } from './days';
import { fixture } from './devFixtures';

/**
 * The journal's data, shaped for the screen it feeds: a month heat map, a
 * streak, "on this day", and one page per day.
 *
 * Three queries rather than one, because they want different amounts of the
 * same table. The dates list is every entry with nothing but its date — a few
 * kilobytes for years of journalling, and enough for the streak and for knowing
 * which past years have anything to show. The month query pulls whole rows, but
 * only for the thirty-odd days on screen, which is where the heat levels and
 * the open page both come from. Nothing ever fetches every entry's text.
 *
 * The `pending` overlay is the same rule as notes: text that has been typed but
 * not yet written outranks anything a refetch brings back.
 *
 * The calendar arithmetic lives in `lib/days.ts`, which is pure and checked.
 */

export * from './days';

export type Entry = { id: string; entry_date: string; text: string; mood: string | null };

export const MOODS = [
  { id: 'rough', label: 'Rough', color: '#FF6B6B' },
  { id: 'okay', label: 'Okay', color: '#FFC24B' },
  { id: 'good', label: 'Good', color: '#34D9A0' },
  { id: 'great', label: 'Great', color: '#38D6F2' },
] as const;

export const moodColor = (id: string | null) => MOODS.find((m) => m.id === id)?.color ?? null;

const DATES_KEY = ['journal_dates'] as const;
const monthKey = (ym: string) => ['journal_month', ym] as const;

const pending = new Map<string, string>();

/* ------------------------------------------------------------------- reads */

/** Every entry's date, and nothing else. Feeds the streak and "on this day". */
export function useJournalDates() {
  return useQuery({
    queryKey: DATES_KEY,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('bd_journal_entries')
        .select('entry_date').is('deleted_at', null).order('entry_date').limit(5000);
      if (error) throw error;
      return (data ?? []).map((r) => r.entry_date as string);
    },
  });
}

/** Whole rows, but only for the month on screen. */
export function useJournalMonth(ym: string) {
  return useQuery({
    queryKey: monthKey(ym),
    queryFn: async (): Promise<Entry[]> => {
      // The key carries the month, so the fixture default cannot match it —
      // same escape hatch lib/events.ts uses for its windowed keys.
      const fx = fixture<Entry[]>('journal_month');
      if (fx) return fx;
      const [y, m] = ym.split('-').map(Number);
      const from = `${ym}-01`;
      const to = ymd(new Date(y, m, 0));
      const { data, error } = await supabase.from('bd_journal_entries')
        .select('id,entry_date,text,mood').is('deleted_at', null)
        .gte('entry_date', from).lte('entry_date', to).order('entry_date');
      if (error) throw error;
      return ((data ?? []) as Entry[]).map((e) =>
        pending.has(e.entry_date) ? { ...e, text: pending.get(e.entry_date)! } : e);
    },
  });
}

/**
 * The same day, in the years before this one. The dates list already says which
 * of them exist, so this asks for those rows exactly rather than filtering a
 * date pattern the database has no index for.
 */
export function useOnThisDay(date: string, allDates: string[]) {
  const md = date.slice(5);
  const want = allDates.filter((d) => d.slice(5) === md && d !== date);
  return useQuery({
    queryKey: ['journal_on_this_day', date, want.join(',')],
    enabled: want.length > 0,
    queryFn: async (): Promise<Entry[]> => {
      const fx = fixture<Entry[]>('journal_on_this_day');
      if (fx) return fx;
      const { data, error } = await supabase.from('bd_journal_entries')
        .select('id,entry_date,text,mood').in('entry_date', want).order('entry_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
}

/* --------------------------------------------------------------- mutations */

const SAVE = defineMutation('journal.save2', async (v: { entry_date: string; text: string; mood: string | null }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_journal_entries')
    .upsert({ user_id, entry_date: v.entry_date, text: v.text, mood: v.mood }, { onConflict: 'user_id,entry_date' });
  if (error) throw error;
  if (pending.get(v.entry_date) === v.text) pending.delete(v.entry_date);
});

export function useJournalActions(ym: string) {
  const qc = useQueryClient();
  const key = monthKey(ym);

  const save = useMutation<unknown, Error, { entry_date: string; text: string; mood: string | null }>({
    mutationKey: SAVE,
    onMutate: (v) => {
      pending.set(v.entry_date, v.text);
      const prev = queryClient.getQueryData<Entry[]>(key) ?? [];
      const hit = prev.some((e) => e.entry_date === v.entry_date);
      queryClient.setQueryData<Entry[]>(key, hit
        ? prev.map((e) => (e.entry_date === v.entry_date ? { ...e, text: v.text, mood: v.mood } : e))
        : [...prev, { id: `pending-${v.entry_date}`, entry_date: v.entry_date, text: v.text, mood: v.mood }]);
    },
    /**
     * No rollback: a failed write must not replace what was just typed with an
     * older copy of it. Same rule as notes, same reason.
     */
    onSettled: () => {
      // The dates list gains a day the first time one is written; the month
      // refetch is what turns the optimistic row into a real one with an id.
      if (qc.isMutating() > 1) return;
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: DATES_KEY });
    },
  });

  return { save };
}

