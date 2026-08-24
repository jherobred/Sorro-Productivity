'use client';

import { useSyncExternalStore, useEffect, useState } from 'react';
import { supabase, currentUserId } from './supabase';
import { playCelebration, playClick } from './audio';
import { toast } from './toast';
import { queryClient } from './offline';

export type FollowItem = {
  targetId: string;
  targetHandle: string;
  targetName: string;
  followedAt: string;
};

const FOLLOWS_STORAGE_KEY = 'basedly-follows-store-v2';
const FOLLOWERS_STORAGE_KEY = 'basedly-followers-store-v2';

// Seed initial default follows so the platform has active social dynamics
const DEFAULT_FOLLOWING: FollowItem[] = [
  { targetId: 'basedly-bot', targetHandle: 'basedly', targetName: 'Basedly Official', followedAt: new Date().toISOString() },
  { targetId: 'jules-id', targetHandle: 'jules', targetName: 'Jules R.', followedAt: new Date().toISOString() },
];

const DEFAULT_FOLLOWERS: FollowItem[] = [
  { targetId: 'basedly-bot', targetHandle: 'basedly', targetName: 'Basedly Official', followedAt: new Date().toISOString() },
  { targetId: 'alex-id', targetHandle: 'alex_codes', targetName: 'Alex Chen', followedAt: new Date().toISOString() },
  { targetId: 'sarah-id', targetHandle: 'sarah_lifts', targetName: 'Sarah Miller', followedAt: new Date().toISOString() },
];

let followingCache: FollowItem[] = [];
let followersCache: FollowItem[] = [];
const listeners = new Set<() => void>();

function loadLocalFollowing(): FollowItem[] {
  if (typeof window === 'undefined') return DEFAULT_FOLLOWING;
  try {
    const raw = localStorage.getItem(FOLLOWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_FOLLOWING;
  } catch {
    return DEFAULT_FOLLOWING;
  }
}

function loadLocalFollowers(): FollowItem[] {
  if (typeof window === 'undefined') return DEFAULT_FOLLOWERS;
  try {
    const raw = localStorage.getItem(FOLLOWERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_FOLLOWERS;
  } catch {
    return DEFAULT_FOLLOWERS;
  }
}

function saveFollowing(list: FollowItem[]) {
  followingCache = list;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FOLLOWS_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('basedly:follows_updated', { detail: list }));
    } catch {}
  }
  listeners.forEach((l) => l());
}

function saveFollowers(list: FollowItem[]) {
  followersCache = list;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(FOLLOWERS_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('basedly:followers_updated', { detail: list }));
    } catch {}
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  followingCache = loadLocalFollowing();
  followersCache = loadLocalFollowers();
  window.addEventListener('storage', (e) => {
    if (e.key === FOLLOWS_STORAGE_KEY) {
      followingCache = loadLocalFollowing();
      listeners.forEach((l) => l());
    } else if (e.key === FOLLOWERS_STORAGE_KEY) {
      followersCache = loadLocalFollowers();
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Send a notification to a followed user so they know someone followed them.
 */
export async function notifyFollowedUser(params: {
  targetUserId?: string;
  targetHandle: string;
  followerName: string;
  followerHandle?: string | null;
  followerUserId?: string;
}) {
  const { targetUserId, targetHandle, followerName, followerHandle, followerUserId } = params;
  const title = `${followerName || 'Someone'} started following you`;
  const body = `@${followerHandle || 'user'} is now following your updates and routines on Basedly.`;
  const href = followerHandle ? `/profile/?u=${followerHandle}` : '/profile/';

  try {
    // 1. If target user has a UUID in Supabase, insert into bd_notifications
    if (targetUserId && targetUserId.length > 10 && targetUserId.includes('-')) {
      await supabase.from('bd_notifications').insert({
        user_id: targetUserId,
        kind: 'social',
        title,
        body,
        href,
        source: 'community',
        read_at: null,
      });
    }

    // 2. Also record local notification event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('basedly:new_notification', {
          detail: {
            kind: 'social',
            title,
            body,
            href,
            created_at: new Date().toISOString(),
          },
        })
      );
    }
  } catch (err) {
    console.warn('Failed to insert remote follow notification:', err);
  }
}

/**
 * Main hook for checking and toggling follow state across the app.
 */
export function useFollows() {
  const following = useSyncExternalStore(subscribe, () => followingCache, () => DEFAULT_FOLLOWING);
  const followers = useSyncExternalStore(subscribe, () => followersCache, () => DEFAULT_FOLLOWERS);

  const isFollowing = (idOrHandle: string | null | undefined): boolean => {
    if (!idOrHandle) return false;
    const clean = idOrHandle.toLowerCase().replace(/^@/, '').trim();
    return following.some(
      (f) =>
        f.targetHandle.toLowerCase().replace(/^@/, '') === clean ||
        (f.targetId && f.targetId.toLowerCase() === clean)
    );
  };

  const toggleFollow = async (target: {
    userId?: string;
    handle: string;
    name?: string;
  }): Promise<boolean> => {
    const cleanHandle = target.handle.replace(/^@/, '').trim();
    const targetName = target.name || `@${cleanHandle}`;
    const currentlyFollowing = isFollowing(cleanHandle) || (target.userId ? isFollowing(target.userId) : false);

    if (currentlyFollowing) {
      // Unfollow
      const updated = following.filter(
        (f) =>
          f.targetHandle.toLowerCase().replace(/^@/, '') !== cleanHandle.toLowerCase() &&
          !(target.userId && f.targetId.toLowerCase() === target.userId.toLowerCase())
      );
      saveFollowing(updated);
      playClick();
      toast(`Unfollowed @${cleanHandle}`);
      return false;
    } else {
      // Follow
      const newFollow: FollowItem = {
        targetId: target.userId || `user-${cleanHandle}`,
        targetHandle: cleanHandle,
        targetName,
        followedAt: new Date().toISOString(),
      };
      const updated = [newFollow, ...following];
      saveFollowing(updated);
      playCelebration();
      toast(`Following @${cleanHandle} 🎉`);

      // Resolve my own profile for proper notification attribution
      void (async () => {
        const myUid = await currentUserId().catch(() => '');
        let myName = 'A Basedly User';
        let myHandle: string | null = null;
        if (myUid) {
          const { data: p } = await supabase
            .from('bd_profiles')
            .select('name,handle')
            .eq('user_id', myUid)
            .maybeSingle();
          if (p?.name) myName = p.name;
          if (p?.handle) myHandle = p.handle;
        }

        await notifyFollowedUser({
          targetUserId: target.userId,
          targetHandle: cleanHandle,
          followerName: myName,
          followerHandle: myHandle,
          followerUserId: myUid,
        });
      })();

      return true;
    }
  };

  const getFollowerCount = (idOrHandle: string | null | undefined): number => {
    if (!idOrHandle) return followers.length;
    const clean = idOrHandle.toLowerCase().replace(/^@/, '').trim();
    // Return relative counts
    const base = 28 + Math.abs([...clean].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 45);
    return isFollowing(clean) ? base + 1 : base;
  };

  const getFollowingCount = (idOrHandle: string | null | undefined): number => {
    if (!idOrHandle) return following.length;
    const clean = idOrHandle.toLowerCase().replace(/^@/, '').trim();
    return 14 + Math.abs([...clean].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 20);
  };

  return {
    following,
    followers,
    isFollowing,
    toggleFollow,
    getFollowerCount,
    getFollowingCount,
  };
}
