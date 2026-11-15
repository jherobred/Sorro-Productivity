'use client';
import { decodeText, parseItems } from '@/supabase/functions/news-drop/assemble';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { CARRY_DAYS, dayBefore, latestPerKind } from './newsLatest';

export const NEWS_KINDS = ['ai-digest', 'dev-stack', 'trending', 'hackathons', 'jobs', 'research', 'gaming', 'ph-brief', 'weekly'] as const;
export type NewsKind = typeof NEWS_KINDS[number];
export const KIND_NAMES: Record<NewsKind, string> = {
  'ai-digest': 'AI digest', 'dev-stack': 'Dev stack', trending: 'Trending repos', hackathons: 'Hackathons and scholarships',
  jobs: 'Internships and jobs', research: 'Research', gaming: 'Unreal and games', 'ph-brief': 'Metro Manila brief', weekly: 'Your week',
};

/** `why` and `image` come from the five-field lines; older editions and Sorro's own weekly have them empty or missing. */
export type NewsItem = { headline: string; summary: string; link: string; why?: string; image?: string };
export type Edition = { id: string; kind: NewsKind; edition: string; title: string; body: string; items: NewsItem[]; created_at: string; read_at: string | null };

/** Today in Manila, the day Grok's editions are filed under. */
export const manilaDay = (d = new Date()) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/**
 * The paper for `day`. Today's keeps each section's last edition until the new one arrives
 * (lib/newsLatest.ts), so opening the app before Grok's 5 a.m. drop still shows yesterday's news.
 * A past day from the archive shows exactly what was filed that day.
 */
export function useEdition(day: string) {
  return useQuery({
    queryKey: ['news', day],
    queryFn: async (): Promise<Edition[]> => {
      const today = day === manilaDay();
      const base = supabase.from('sorro_news').select('id,kind,edition,title,body,items,created_at,read_at');
      const { data, error } = await (today ? base.gte('edition', dayBefore(day, CARRY_DAYS)).lte('edition', day) : base.eq('edition', day)).order('created_at');
      if (error) throw error;
      const rows = (data ?? []) as Edition[];
      return (today ? latestPerKind(rows, day) : rows).map(readEdition);
    },
  });
}

/**
 * An edition Grok dropped is read again from its saved text, so one stored before a parsing fix
 * (colons kept as %3A, which hid its images and links) shows correctly without being sent again.
 * Editions Sorro writes itself have no text and keep their items.
 */
export function readEdition(e: Edition): Edition {
  if (!e.body?.trim()) return e;
  const parsed = parseItems(e.body);
  return { ...e, title: decodeText(e.title), items: parsed.items.length ? parsed.items : e.items };
}

/** The days that have an edition, newest first, for the archive. */
export function useEditionDays() {
  return useQuery({
    queryKey: ['news', 'days'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('sorro_news').select('edition').order('edition', { ascending: false }).limit(300);
      if (error) throw error;
      return [...new Set((data ?? []).map(r => r.edition as string))];
    },
  });
}

export async function markRead(ids: string[]) {
  if (!ids.length) return;
  await supabase.from('sorro_news').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
}

/** A new drop key, shown once: only its hash is stored. The old one stops working. */
export async function rotateKey(): Promise<string> {
  const { data, error } = await supabase.rpc('sorro_news_key_rotate');
  if (error) throw error;
  return data as string;
}

export function useKeyDate() {
  return useQuery({
    queryKey: ['news', 'key'],
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.from('sorro_news_keys').select('created_at').maybeSingle();
      return (data?.created_at as string | undefined) ?? null;
    },
  });
}

/** Sorro writes its own "Your week" edition on Mondays from the tasks due in the next seven days. */
export async function fillWeekly(day: string, items: NewsItem[]) {
  const { data } = await supabase.from('sorro_news').select('id').eq('kind', 'weekly').eq('edition', day).limit(1);
  if (data?.length || !items.length) return false;
  const { error } = await supabase.from('sorro_news').insert({ kind: 'weekly', edition: day, title: 'Due this week', body: '', items });
  return !error;
}
