'use client';

import { useSyncExternalStore } from 'react';
import { toast } from './toast';
import { playCelebration, playClick } from './audio';

export type StorySticker = {
  id: string;
  type: 'poll' | 'question' | 'streak' | 'mention' | 'location' | 'habit';
  data: {
    question?: string;
    options?: string[];
    votes?: Record<number, number>;
    userVote?: number;
    streakCount?: number;
    habitName?: string;
    mentionHandle?: string;
    locationName?: string;
  };
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
};

export type StoryTextOverlay = {
  id: string;
  text: string;
  color: string;
  fontSize: number;
  bgChip?: boolean;
  align: 'left' | 'center' | 'right';
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
};

export type StoryViewerEntry = {
  userId: string;
  viewedAt: string;
  reaction?: string;
};

export type StorySlide = {
  id: string;
  userId: string;
  mediaUrl?: string;
  bgGradient?: string;
  filter?: string;
  caption?: string;
  textOverlays: StoryTextOverlay[];
  stickers: StorySticker[];
  createdAt: string; // ISO
  expiresAt: string; // ISO (24h after createdAt)
  viewers: StoryViewerEntry[];
  isCloseFriends?: boolean;
  isArchived?: boolean;
};

export type Highlight = {
  id: string;
  userId: string;
  title: string;
  coverUrl?: string;
  storyIds: string[];
  createdAt: string;
  updatedAt: string;
};

const STORIES_LS_KEY = 'basedly-stories-v1';
const HIGHLIGHTS_LS_KEY = 'basedly-highlights-v1';

// Seed demo stories so the tray looks lively from day 1
const DEFAULT_STORIES: StorySlide[] = [
  {
    id: 'story-seed-1',
    userId: 'u1', // Jhems
    mediaUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&auto=format&fit=crop&q=80',
    bgGradient: 'linear-gradient(135deg, #FF6B6B, #FFC24B)',
    filter: 'normal',
    caption: 'Shipping the 2026 redesign today! 🚀',
    textOverlays: [
      { id: 't1', text: 'Shipping Basedly v2.0 Today! 🔥', color: '#ffffff', fontSize: 20, bgChip: true, align: 'center', x: 50, y: 25 },
    ],
    stickers: [
      { id: 's1', type: 'streak', data: { streakCount: 42, habitName: 'Daily Coding' }, x: 50, y: 75 },
    ],
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 21 * 3600 * 1000).toISOString(),
    viewers: [],
  },
  {
    id: 'story-seed-2',
    userId: 'u1',
    mediaUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80',
    bgGradient: 'linear-gradient(135deg, #10B981, #059669)',
    filter: 'clarendon',
    caption: 'Morning workout complete 💪',
    textOverlays: [
      { id: 't2', text: '5:30 AM Gym Grind 🏋️‍♂️', color: '#ffffff', fontSize: 22, bgChip: true, align: 'center', x: 50, y: 30 },
    ],
    stickers: [
      { id: 's2', type: 'poll', data: { question: 'Did you hit your workout today?', options: ['Hell Yeah 🔥', 'Later Today ⏳'], votes: { 0: 18, 1: 5 } }, x: 50, y: 65 },
    ],
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
    viewers: [],
  },
  {
    id: 'story-seed-3',
    userId: 'u2', // Alex Focus
    mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    bgGradient: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
    filter: 'juno',
    caption: 'Deep work sprint with ocean view',
    textOverlays: [
      { id: 't3', text: '4 hours of uninterrupted flow state 🧘', color: '#ffffff', fontSize: 18, bgChip: true, align: 'center', x: 50, y: 40 },
    ],
    stickers: [],
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
    viewers: [],
  },
  {
    id: 'story-seed-4',
    userId: 'u3', // Sarah Sprint
    mediaUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    bgGradient: 'linear-gradient(135deg, #A855F7, #6366F1)',
    filter: 'lark',
    caption: 'Reading 1 chapter every morning',
    textOverlays: [
      { id: 't4', text: 'Atomic Habits Review 📚', color: '#ffffff', fontSize: 20, bgChip: true, align: 'center', x: 50, y: 35 },
    ],
    stickers: [
      { id: 's3', type: 'habit', data: { habitName: 'Read 20 mins daily', streakCount: 89 }, x: 50, y: 70 },
    ],
    createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 16 * 3600 * 1000).toISOString(),
    viewers: [],
  },
];

const DEFAULT_HIGHLIGHTS: Highlight[] = [
  {
    id: 'hl-1',
    userId: 'u1',
    title: 'Workouts 🏋️',
    coverUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400&auto=format&fit=crop&q=80',
    storyIds: ['story-seed-2'],
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'hl-2',
    userId: 'u1',
    title: 'Code 🚀',
    coverUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&auto=format&fit=crop&q=80',
    storyIds: ['story-seed-1'],
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

const listeners = new Set<() => void>();

/**
 * `undefined` means "not read yet", which `localStorage.getItem` can never
 * return — so the first read always misses the cache. The miss used to be
 * detected with `cachedSnapshot.length > 0` instead, and that made an *empty*
 * list permanently uncacheable: delete your last story or highlight and every
 * `getSnapshot` call re-parsed `"[]"` into a fresh array. useSyncExternalStore
 * compares snapshots by identity, so a new array each call is an infinite
 * render loop.
 */
let cachedStoriesRaw: string | null | undefined;
let cachedStoriesSnapshot: StorySlide[] = [];

let cachedHighlightsRaw: string | null | undefined;
let cachedHighlightsSnapshot: Highlight[] = [];

function emit() {
  for (const l of listeners) l();
}

function readStoriesStorage(): StorySlide[] {
  if (typeof window === 'undefined') return DEFAULT_STORIES;
  try {
    const raw = localStorage.getItem(STORIES_LS_KEY);
    if (raw === cachedStoriesRaw) return cachedStoriesSnapshot;
    cachedStoriesRaw = raw;
    if (!raw) {
      // Seed, and cache the string that was seeded — not the null that was
      // read. This is a getSnapshot: React calls it repeatedly and requires
      // the same reference back each time. Caching null meant the very next
      // call read back the JSON just written here, missed the cache, and
      // parsed a brand new array, so the snapshot changed identity under
      // React and it warned about an infinite loop.
      const seeded = JSON.stringify(DEFAULT_STORIES);
      localStorage.setItem(STORIES_LS_KEY, seeded);
      cachedStoriesRaw = seeded;
      cachedStoriesSnapshot = DEFAULT_STORIES;
      return cachedStoriesSnapshot;
    }
    cachedStoriesSnapshot = JSON.parse(raw);
    return cachedStoriesSnapshot;
  } catch {
    return DEFAULT_STORIES;
  }
}

function writeStoriesStorage(items: StorySlide[]) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(items);
    localStorage.setItem(STORIES_LS_KEY, raw);
    cachedStoriesRaw = raw;
    cachedStoriesSnapshot = items;
    emit();
  } catch {
    // quota
  }
}

function readHighlightsStorage(): Highlight[] {
  if (typeof window === 'undefined') return DEFAULT_HIGHLIGHTS;
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_LS_KEY);
    if (raw === cachedHighlightsRaw) return cachedHighlightsSnapshot;
    cachedHighlightsRaw = raw;
    if (!raw) {
      // Seed, and cache the string that was seeded — not the null that was
      // read. This is a getSnapshot: React calls it repeatedly and requires
      // the same reference back each time. Caching null meant the very next
      // call read back the JSON just written here, missed the cache, and
      // parsed a brand new array, so the snapshot changed identity under
      // React and it warned about an infinite loop.
      const seeded = JSON.stringify(DEFAULT_HIGHLIGHTS);
      localStorage.setItem(HIGHLIGHTS_LS_KEY, seeded);
      cachedHighlightsRaw = seeded;
      cachedHighlightsSnapshot = DEFAULT_HIGHLIGHTS;
      return cachedHighlightsSnapshot;
    }
    cachedHighlightsSnapshot = JSON.parse(raw);
    return cachedHighlightsSnapshot;
  } catch {
    return DEFAULT_HIGHLIGHTS;
  }
}

function writeHighlightsStorage(items: Highlight[]) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(items);
    localStorage.setItem(HIGHLIGHTS_LS_KEY, raw);
    cachedHighlightsRaw = raw;
    cachedHighlightsSnapshot = items;
    emit();
  } catch {
    // quota
  }
}

// ----------------------------------------------------
// HOOKS
// ----------------------------------------------------


/**
 * Hoisted, not inline arrows. useSyncExternalStore re-subscribes whenever
 * subscribe changes identity, so arrows at the call sites made every render
 * of every consumer drop the listener, re-add it and re-read the snapshot.
 */
const subscribeStories = (onStoreChange: () => void) => {
      listeners.add(onStoreChange);
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORIES_LS_KEY) {
          cachedStoriesRaw = undefined;   // null is a real getItem() value; undefined is the only true "unknown"
          onStoreChange();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
      };
};
const storiesServer = () => DEFAULT_STORIES;

const subscribeHighlights = (onStoreChange: () => void) => {
      listeners.add(onStoreChange);
      const onStorage = (e: StorageEvent) => {
        if (e.key === HIGHLIGHTS_LS_KEY) {
          cachedHighlightsRaw = undefined;
          onStoreChange();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
      };
};
const highlightsServer = () => DEFAULT_HIGHLIGHTS;

export function useAllStories(): StorySlide[] {
  return useSyncExternalStore(
    subscribeStories,
    readStoriesStorage,
    storiesServer
  );
}

export function useActiveStories(userId?: string): StorySlide[] {
  const all = useAllStories();
  const now = new Date().toISOString();
  return all.filter((s) => {
    const isActive = !s.isArchived && s.expiresAt > now;
    return userId ? isActive && s.userId === userId : isActive;
  });
}

export function useUserStoryArchive(userId: string): StorySlide[] {
  const all = useAllStories();
  return all.filter((s) => s.userId === userId);
}

export function useHighlights(userId?: string): Highlight[] {
  const all = useSyncExternalStore(
    subscribeHighlights,
    readHighlightsStorage,
    highlightsServer
  );

  return userId ? all.filter((h) => h.userId === userId) : all;
}

// ----------------------------------------------------
// CRUDL MUTATION ACTIONS
// ----------------------------------------------------

export function createStory(payload: {
  userId: string;
  mediaUrl?: string;
  bgGradient?: string;
  filter?: string;
  caption?: string;
  textOverlays?: StoryTextOverlay[];
  stickers?: StorySticker[];
  isCloseFriends?: boolean;
}): StorySlide {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 3600 * 1000);

  const newStory: StorySlide = {
    id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: payload.userId,
    mediaUrl: payload.mediaUrl,
    bgGradient: payload.bgGradient,
    filter: payload.filter || 'normal',
    caption: payload.caption,
    textOverlays: payload.textOverlays || [],
    stickers: payload.stickers || [],
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    viewers: [],
    isCloseFriends: payload.isCloseFriends,
  };

  const current = readStoriesStorage();
  writeStoriesStorage([newStory, ...current]);
  playCelebration();
  toast('Added to Your Story ✨');
  return newStory;
}

export function deleteStory(storyId: string) {
  const current = readStoriesStorage();
  const next = current.filter((s) => s.id !== storyId);
  writeStoriesStorage(next);

  // Also remove from any highlights referencing it
  const highlights = readHighlightsStorage();
  const updatedHls = highlights.map((h) => ({
    ...h,
    storyIds: h.storyIds.filter((id) => id !== storyId),
  })).filter((h) => h.storyIds.length > 0);
  writeHighlightsStorage(updatedHls);

  playClick();
  toast('Story deleted');
}

export function recordStoryView(storyId: string, viewerUserId: string, reaction?: string) {
  if (!storyId || !viewerUserId) return;
  const current = readStoriesStorage();
  const idx = current.findIndex((s) => s.id === storyId);
  if (idx === -1) return;

  const story = current[idx];
  // Do not record own view as viewer entry
  if (story.userId === viewerUserId) return;

  const existingIdx = story.viewers.findIndex((v) => v.userId === viewerUserId);
  const now = new Date().toISOString();

  let nextViewers = [...story.viewers];
  if (existingIdx >= 0) {
    if (reaction) {
      nextViewers[existingIdx] = { ...nextViewers[existingIdx], reaction };
    }
  } else {
    nextViewers.push({ userId: viewerUserId, viewedAt: now, reaction });
  }

  const updatedStory = { ...story, viewers: nextViewers };
  const next = [...current];
  next[idx] = updatedStory;
  writeStoriesStorage(next);
}

export function voteOnStoryPoll(storyId: string, stickerId: string, optionIndex: number) {
  const current = readStoriesStorage();
  const idx = current.findIndex((s) => s.id === storyId);
  if (idx === -1) return;

  const story = current[idx];
  const stickers = story.stickers.map((stk) => {
    if (stk.id === stickerId && stk.type === 'poll') {
      const votes = { ...(stk.data.votes || {}) };
      votes[optionIndex] = (votes[optionIndex] || 0) + 1;
      return {
        ...stk,
        data: {
          ...stk.data,
          votes,
          userVote: optionIndex,
        },
      };
    }
    return stk;
  });

  const updatedStory = { ...story, stickers };
  const next = [...current];
  next[idx] = updatedStory;
  writeStoriesStorage(next);
  playClick();
}

// ----------------------------------------------------
// HIGHLIGHTS CRUDL
// ----------------------------------------------------

export function createHighlight(payload: {
  userId: string;
  title: string;
  coverUrl?: string;
  storyIds: string[];
}): Highlight {
  const now = new Date().toISOString();
  const newHl: Highlight = {
    id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: payload.userId,
    title: payload.title.trim() || 'Highlight',
    coverUrl: payload.coverUrl,
    storyIds: payload.storyIds,
    createdAt: now,
    updatedAt: now,
  };

  const current = readHighlightsStorage();
  writeHighlightsStorage([...current, newHl]);
  playCelebration();
  toast(`Created "${newHl.title}" Highlight 🎉`);
  return newHl;
}

export function updateHighlight(highlightId: string, payload: {
  title?: string;
  coverUrl?: string;
  storyIds?: string[];
}) {
  const current = readHighlightsStorage();
  const idx = current.findIndex((h) => h.id === highlightId);
  if (idx === -1) return;

  const target = current[idx];
  const updated: Highlight = {
    ...target,
    title: payload.title !== undefined ? payload.title.trim() : target.title,
    coverUrl: payload.coverUrl !== undefined ? payload.coverUrl : target.coverUrl,
    storyIds: payload.storyIds !== undefined ? payload.storyIds : target.storyIds,
    updatedAt: new Date().toISOString(),
  };

  const next = [...current];
  next[idx] = updated;
  writeHighlightsStorage(next);
  playClick();
  toast('Highlight updated');
}

export function deleteHighlight(highlightId: string) {
  const current = readHighlightsStorage();
  const next = current.filter((h) => h.id !== highlightId);
  writeHighlightsStorage(next);
  playClick();
  toast('Highlight removed');
}

export function addStoryToHighlight(highlightId: string, storyId: string) {
  const current = readHighlightsStorage();
  const idx = current.findIndex((h) => h.id === highlightId);
  if (idx === -1) return;

  const target = current[idx];
  if (target.storyIds.includes(storyId)) {
    toast('Already in this Highlight');
    return;
  }

  const updated: Highlight = {
    ...target,
    storyIds: [...target.storyIds, storyId],
    updatedAt: new Date().toISOString(),
  };

  const next = [...current];
  next[idx] = updated;
  writeHighlightsStorage(next);
  playCelebration();
  toast(`Added to ${target.title}`);
}
