'use client';

import { useEffect, useState } from 'react';
import { Mascot } from './challenges/Mascot';
import { currentUserId } from '@/lib/supabase';
import { hueOf } from '@/lib/people';
import { moodOf, type Mood } from '@/lib/mascot';

/**
 * Your own creature, outside Challenges.
 *
 * The animals only existed on the challenge board, which is the one place a
 * student visits least. They are derived from a user id and nothing else
 * (`lib/mascot.ts`), so the same person is the same animal on every screen for
 * free — no column, no fetch, no decision to make.
 *
 * The rule the moods are built on carries over unchanged and is the reason
 * this is safe to put on a page somebody opens every morning: the face comes
 * from whether you did the thing recently, never from how you compare to
 * anyone. A habits page that pulls a disappointed face at somebody on day four
 * is a habits page that finishes the job of making them quit.
 *
 * `daysSince` is whole days since you last did whatever this page is about, or
 * null if you never have — the same shape `moodOf` takes on the challenge
 * board, so the two can never drift apart.
 */
export function Buddy({
  daysSince, size = 44, racing = false, note, variant = 'head', accessory = 'sweatband',
}: {
  daysSince: number | null;
  size?: number;
  /** On a page about momentum, let it run. */
  racing?: boolean;
  /** A line beside it. Nothing when there is nothing worth saying. */
  note?: string;
  variant?: 'head' | 'full';
  accessory?: 'none' | 'sweatband' | 'headphones' | 'crown' | 'cape' | 'glasses' | 'hoodie';
}) {
  const [me, setMe] = useState('');
  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);

  // Before the id lands there is no animal to draw and no sensible guess: a
  // creature that changes species on the second render is worse than a beat of
  // nothing.
  if (!me) return null;

  const mood: Mood = moodOf({ daysSince, leading: daysSince === 0 });

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <Mascot
        id={me}
        mood={mood}
        hue={hueOf(me)}
        size={size}
        racing={racing && mood !== 'resting'}
        variant={variant}
        accessory={accessory}
      />
      {note && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', lineHeight: 1.4, textWrap: 'pretty' }}>
          {note}
        </span>
      )}
    </span>
  );
}
