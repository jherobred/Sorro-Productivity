'use client';

import { useState, useEffect, useCallback } from 'react';
import { TAB_ONBOARDINGS, type TabOnboardingConfig } from './onboardingData';
import { supabase, currentUserId } from './supabase';
import { queryClient } from './offline';
import { playCelebration } from './audio';
import { toast } from './toast';

const LS_SEEN_ONBOARDINGS_KEY = 'basedly-seen-onboardings-v1';

export function getSeenOnboardings(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LS_SEEN_ONBOARDINGS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveSeenOnboardings(seen: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_SEEN_ONBOARDINGS_KEY, JSON.stringify(Array.from(seen)));
  } catch {}
}

export function useTabOnboarding() {
  const [seen, setSeen] = useState<Set<string>>(() => getSeenOnboardings());
  const [activeTour, setActiveTour] = useState<TabOnboardingConfig | null>(null);

  // Sync initial state on mount
  useEffect(() => {
    setSeen(getSeenOnboardings());
  }, []);

  const markTabSeen = useCallback((tabId: string) => {
    setSeen((prev) => {
      const next = new Set(prev);
      next.add(tabId);
      saveSeenOnboardings(next);
      return next;
    });
  }, []);

  const startTour = useCallback((tabId: string) => {
    const config = TAB_ONBOARDINGS[tabId];
    if (config) {
      setActiveTour(config);
    }
  }, []);

  const finishTour = useCallback(async (tabId: string, awardBonus = true) => {
    markTabSeen(tabId);
    setActiveTour(null);

    if (awardBonus) {
      playCelebration();
      toast(`+15 RP Tour Completed! You mastered ${TAB_ONBOARDINGS[tabId]?.tabTitle || 'this feature'} 🎉`);

      try {
        const me = await currentUserId();
        // Filtered to the caller's own row: maybeSingle() errors outright if the
        // select ever returns more than one, and reads back somebody else's
        // totals if it does not.
        const { data: cur } = await supabase.from('bd_ranked')
          .select('rp,peak_rp,wins,losses').eq('user_id', me).maybeSingle();
        const rp = (cur?.rp ?? 0) + 15;
        // A refused upsert comes back in `error`, not as a throw, so `catch {}`
        // never saw it: the toast above promised +15 RP that was never written.
        const { error } = await supabase.from('bd_ranked').upsert({
          user_id: me,
          rp,
          peak_rp: Math.max(cur?.peak_rp ?? 0, rp),
          wins: cur?.wins ?? 0,
          losses: cur?.losses ?? 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['ranked'] });
      } catch (e) {
        toast('Tour bonus could not be saved');
        console.warn('Tour RP not banked:', e);
      }
    }
  }, [markTabSeen]);

  const closeTour = useCallback((tabId?: string) => {
    if (tabId) markTabSeen(tabId);
    setActiveTour(null);
  }, [markTabSeen]);

  const resetAllTours = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LS_SEEN_ONBOARDINGS_KEY);
    }
    setSeen(new Set());
    toast('All feature tour guides reset! Explore any tab to see its walkthrough.');
  }, []);

  const checkAutoTrigger = useCallback((tabId: string) => {
    const currentSeen = getSeenOnboardings();
    if (!currentSeen.has(tabId) && TAB_ONBOARDINGS[tabId]) {
      // Short delay for smooth UI mounting
      const timer = setTimeout(() => {
        setActiveTour(TAB_ONBOARDINGS[tabId]);
      }, 550);
      return () => clearTimeout(timer);
    }
  }, []);

  return {
    seen,
    activeTour,
    startTour,
    finishTour,
    closeTour,
    markTabSeen,
    resetAllTours,
    checkAutoTrigger,
  };
}
