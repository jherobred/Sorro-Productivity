'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

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

export function useEdition(day: string) {
  return useQuery({
    queryKey: ['news', day],
    queryFn: async (): Promise<Edition[]> => {
      const { data, error } = await supabase.from('sorro_news').select('id,kind,edition,title,body,items,created_at,read_at').eq('edition', day).order('created_at');
      if (error) throw error;
      return (data ?? []) as Edition[];
    },
  });
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
