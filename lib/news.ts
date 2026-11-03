'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export const NEWS_KINDS = ['ai-digest', 'dev-stack', 'trending', 'hackathons', 'jobs', 'research', 'gaming', 'ph-brief', 'weekly'] as const;
export type NewsKind = typeof NEWS_KINDS[number];
export const KIND_NAMES: Record<NewsKind, string> = {
  'ai-digest': 'AI digest', 'dev-stack': 'Dev stack', trending: 'Trending repos', hackathons: 'Hackathons and scholarships',
  jobs: 'Internships and jobs', research: 'Research', gaming: 'Unreal and games', 'ph-brief': 'Metro Manila brief', weekly: 'Your week',
};

export type NewsItem = { headline: string; summary: string; link: string };
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
