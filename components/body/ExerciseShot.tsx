'use client';

import { useEffect, useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { ExerciseArt } from './ExerciseArt';
import { shotOf, artOf } from '@/lib/lift';

/**
 * A movement, demonstrated.
 *
 * openGym pulls a GIF per exercise from a dataset on first launch. A Capacitor
 * APK off a static export cannot do that — there is no first-launch download
 * step and no server to proxy one — so the previous pass drew nine line-art
 * patterns instead, which meant a bench press and a dumbbell fly were the same
 * picture and neither showed you what to do.
 *
 * These are photographs. Two per movement, the start and the finish, crossfaded
 * on a slow beat: that is what the GIF was actually communicating, at 5 MB for
 * the whole catalogue rather than 140. They ship in `public/ex/` so the phone
 * needs no signal and no bucket policy has to be right for a picture to appear.
 *
 * Both frames are in the DOM from the start and only their opacity changes.
 * Swapping one `src` would show a flash of nothing on the first cycle, every
 * time, which is exactly the moment someone is looking at it.
 *
 * Anything typed in by hand has no photograph, so the drawn art is still here
 * as the fallback — and it is the fallback for a missing file too, because a
 * broken image icon in the middle of a workout is worse than a diagram.
 */
export function ExerciseShot({
  exercise, compact, still,
}: {
  exercise: string;
  /** The 50px list thumbnail rather than the demo card. */
  compact?: boolean;
  /** Hold frame 0. Used by the list, where twenty pulsing thumbnails is noise. */
  still?: boolean;
}) {
  const { prefs } = usePrefs();
  const id = shotOf(exercise);
  const [frame, setFrame] = useState(0);
  const [broken, setBroken] = useState(false);

  const animate = !!id && !broken && !still && !compact && prefs.motion;

  useEffect(() => {
    if (!animate) { setFrame(0); return; }
    const t = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1150);
    return () => clearInterval(t);
  }, [animate]);

  if (!id || broken) return <ExerciseArt art={artOf(exercise)} compact={compact} />;

  return (
    // `og-shot` is what gym.css sizes: a bare `> span` selector would also
    // catch the two hint pills sitting in the same card and stretch them to
    // 320px tall.
    <span className="og-shot" style={{ position: 'relative', display: 'block' }}>
      {[0, 1].map((n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src={`/ex/${id}-${n}.jpg`}
          alt={n === 0 ? `${exercise}, starting position` : ''}
          aria-hidden={n === 1 || undefined}
          onError={() => setBroken(true)}
          style={{
            position: n === 0 ? 'relative' : 'absolute',
            inset: n === 0 ? undefined : 0,
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: frame === n ? 1 : 0,
            transition: prefs.motion ? 'opacity .5s ease' : 'none',
          }}
        />
      ))}
    </span>
  );
}
