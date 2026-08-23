'use client';

import React, { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { useActiveStories, type StorySlide } from '@/lib/stories';
import { useProfiles, displayOf } from '@/lib/people';

const INSTA_RING = 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)';
const SEEN_RING = 'var(--line2)';

export function StoriesTray({
  me,
  onOpenViewer,
  onCreateStory,
}: {
  me: string;
  onOpenViewer: (userId: string, initialIndex?: number) => void;
  onCreateStory: () => void;
}) {
  const activeStories = useActiveStories();
  const { data: profiles = {} } = useProfiles();

  // Group stories by userId
  const storiesByUser = useMemo(() => {
    const map = new Map<string, StorySlide[]>();
    for (const s of activeStories) {
      const arr = map.get(s.userId) || [];
      arr.push(s);
      map.set(s.userId, arr);
    }
    return map;
  }, [activeStories]);

  const myStories = storiesByUser.get(me) || [];
  const hasMyStories = myStories.length > 0;

  // List of other users who have active stories
  const otherUserIds = useMemo(() => {
    const ids = Array.from(storiesByUser.keys()).filter((uid) => uid !== me);
    return ids;
  }, [storiesByUser, me]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      overflowX: 'auto',
      padding: '12px 16px',
      background: 'var(--card)',
      borderBottom: '1px solid var(--line)',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }} className="navsb">
      {/* 1. "Your Story" Item */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        flex: 'none',
        cursor: 'pointer',
      }}>
        <div
          onClick={() => {
            if (hasMyStories) {
              onOpenViewer(me);
            } else {
              onCreateStory();
            }
          }}
          className="k-squish hov"
          style={{
            position: 'relative',
            width: 62,
            height: 62,
            borderRadius: '50%',
            padding: 2.5,
            background: hasMyStories ? INSTA_RING : 'transparent',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'var(--card)',
            padding: 2,
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}>
            <StoryUserAvatar userId={me} profiles={profiles} me={me} />
          </div>

          {/* Plus Add Button Badge */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateStory();
            }}
            title="Create new story"
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#0095F6',
              border: '2px solid var(--card)',
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            }}
          >
            <Icon name="plus" size={11} color="#ffffff" />
          </button>
        </div>

        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--tx2)',
          maxWidth: 64,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          Your story
        </span>
      </div>

      {/* 2. Active Stories from Other Community Members */}
      {otherUserIds.map((userId) => {
        const userStories = storiesByUser.get(userId) || [];
        const isSeen = userStories.every((s) => s.viewers.some((v) => v.userId === me));
        const who = displayOf(profiles, userId, me);

        return (
          <div
            key={userId}
            onClick={() => onOpenViewer(userId)}
            className="k-squish hov"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              flex: 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 62,
              height: 62,
              borderRadius: '50%',
              padding: 2.5,
              background: isSeen ? SEEN_RING : INSTA_RING,
              display: 'grid',
              placeItems: 'center',
              transition: 'transform 0.15s ease',
            }}>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'var(--card)',
                padding: 2,
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
              }}>
                <StoryUserAvatar userId={userId} profiles={profiles} me={me} />
              </div>
            </div>

            <span style={{
              fontSize: 11,
              fontWeight: isSeen ? 500 : 700,
              color: isSeen ? 'var(--tx3)' : 'var(--tx)',
              maxWidth: 64,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {who.label.split(' ')[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StoryUserAvatar({
  userId,
  profiles,
  me,
}: {
  userId: string;
  profiles: Record<string, import('@/lib/people').Person>;
  me: string;
}) {
  const who = displayOf(profiles, userId, me);
  const p = profiles[userId];

  if (p?.photo_url) {
    return <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />;
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      background: `color-mix(in srgb, ${who.hue} 18%, var(--card2))`,
      color: who.hue,
      display: 'grid',
      placeItems: 'center',
      fontSize: 22,
    }}>
      {who.animal || '🦝'}
    </div>
  );
}
