'use client';

import { animalOf, type Animal, type Mood } from '@/lib/mascot';

/**
 * A competitor, drawn.
 *
 * Eight animals, one head each, built from the same parts: ears behind, a head,
 * a muzzle, two eyes, two brows and a mouth. Sharing the skeleton is what keeps
 * this at one file instead of eight, and the ears plus the muzzle are enough to
 * tell a fox from a bear at 26 pixels — which is the size it is usually drawn.
 *
 * Cute, and *competitive*: every one of them wears a sweatband in its person's
 * colour and has its brows down. A gym mascot with a soft neutral face is a
 * sticker; the brows are what make it look like it came to do something.
 *
 * **The mood never comes from the standings** — see `lib/mascot.ts`. It comes
 * from whether that person did the thing recently, so the animal belonging to
 * whoever is last but went this morning is as bright as the leader's.
 *
 * Everything moves a little and nothing moves much. The bob is under two
 * pixels, the blink is four frames in six seconds, and both run on
 * `--anim`, the variable the motion preference sets to `paused` — so a person
 * who has asked the app to hold still gets a picture that holds still.
 */

/** Ink for the eyes and the line work. Dark enough to read on every fur colour. */
const INK = '#20232E';

type Skin = {
  /** Fur, and the lighter belly/muzzle patch. */
  coat: string;
  muzzle: string;
  ear: string;
  /** Drawn behind the head. */
  ears: (mood: Mood) => React.ReactNode;
  /** Nose, whiskers, beak — whatever makes it that animal. */
  face?: React.ReactNode;
  /** Big round eye discs, for the owl. */
  goggles?: boolean;
};

const point = (cx: number, tilt: number) => (
  `M${cx - 7} 17 L${cx + tilt} ${3 + Math.abs(tilt) * 0.2} L${cx + 7} 17 Z`
);

const SKINS: Record<Animal, Skin> = {
  fox: {
    coat: '#F0894A', muzzle: '#FFF1E2', ear: '#C75C2E',
    ears: () => (
      <>
        <path d={point(13, -3)} fill="#F0894A" />
        <path d={point(35, 3)} fill="#F0894A" />
        <path d="M9 15 L11 8 L16 15 Z" fill="#C75C2E" />
        <path d="M39 15 L37 8 L32 15 Z" fill="#C75C2E" />
      </>
    ),
    face: <ellipse cx="24" cy="32" rx="2.6" ry="2" fill={INK} />,
  },
  cat: {
    coat: '#9AA6C4', muzzle: '#EDF1FA', ear: '#7A86A6',
    ears: () => (
      <>
        <path d={point(14, -2)} fill="#9AA6C4" />
        <path d={point(34, 2)} fill="#9AA6C4" />
      </>
    ),
    face: (
      <>
        <path d="M22 32 h4 l-2 2 z" fill={INK} />
        <g stroke={INK} strokeWidth="1" strokeLinecap="round" opacity=".55">
          <path d="M10 30 h6M10 33.5 h6M38 30 h-6M38 33.5 h-6" />
        </g>
      </>
    ),
  },
  bear: {
    coat: '#B07A55', muzzle: '#EBD9C6', ear: '#8C5B3C',
    ears: () => (
      <>
        <circle cx="11" cy="12" r="7" fill="#B07A55" />
        <circle cx="37" cy="12" r="7" fill="#B07A55" />
        <circle cx="11" cy="12" r="3.4" fill="#8C5B3C" />
        <circle cx="37" cy="12" r="3.4" fill="#8C5B3C" />
      </>
    ),
    face: <ellipse cx="24" cy="31.5" rx="3" ry="2.2" fill={INK} />,
  },
  owl: {
    coat: '#8E7BC4', muzzle: '#E6DEFA', ear: '#6B58A0',
    goggles: true,
    ears: () => (
      <>
        <path d="M11 14 L14 6 L20 13 Z" fill="#8E7BC4" />
        <path d="M37 14 L34 6 L28 13 Z" fill="#8E7BC4" />
      </>
    ),
    face: <path d="M24 29 l3.2 3.4 -3.2 3.4 -3.2 -3.4 z" fill="#FFC24B" />,
  },
  frog: {
    coat: '#5FC46E', muzzle: '#DFF6E2', ear: '#3E9A4C',
    ears: () => (
      <>
        <circle cx="14" cy="12" r="6.6" fill="#5FC46E" />
        <circle cx="34" cy="12" r="6.6" fill="#5FC46E" />
      </>
    ),
    face: (
      <>
        <circle cx="20.5" cy="29" r="0.9" fill={INK} opacity=".6" />
        <circle cx="27.5" cy="29" r="0.9" fill={INK} opacity=".6" />
      </>
    ),
  },
  panda: {
    coat: '#F2F3F7', muzzle: '#FFFFFF', ear: '#2C3040',
    ears: () => (
      <>
        <circle cx="11" cy="12" r="6.6" fill="#2C3040" />
        <circle cx="37" cy="12" r="6.6" fill="#2C3040" />
      </>
    ),
    face: (
      <>
        <ellipse cx="16.5" cy="26" rx="5.4" ry="6" fill="#2C3040" transform="rotate(-14 16.5 26)" />
        <ellipse cx="31.5" cy="26" rx="5.4" ry="6" fill="#2C3040" transform="rotate(14 31.5 26)" />
        <ellipse cx="24" cy="31.5" rx="2.8" ry="2" fill={INK} />
      </>
    ),
  },
  rabbit: {
    coat: '#F0C7D4', muzzle: '#FFF0F4', ear: '#D794A8',
    ears: () => (
      <>
        <ellipse cx="17" cy="7" rx="3.6" ry="10" fill="#F0C7D4" transform="rotate(-9 17 7)" />
        <ellipse cx="31" cy="7" rx="3.6" ry="10" fill="#F0C7D4" transform="rotate(9 31 7)" />
        <ellipse cx="17" cy="8" rx="1.7" ry="6.4" fill="#D794A8" transform="rotate(-9 17 8)" />
        <ellipse cx="31" cy="8" rx="1.7" ry="6.4" fill="#D794A8" transform="rotate(9 31 8)" />
      </>
    ),
    face: <path d="M22.4 31 h3.2 l-1.6 1.8 z" fill="#C4607F" />,
  },
  wolf: {
    coat: '#7E8796', muzzle: '#DCE2EC', ear: '#5C6472',
    ears: () => (
      <>
        <path d={point(13, -4)} fill="#7E8796" />
        <path d={point(35, 4)} fill="#7E8796" />
        <path d="M9.5 15 L11.5 8.5 L16 15 Z" fill="#5C6472" />
        <path d="M38.5 15 L36.5 8.5 L32 15 Z" fill="#5C6472" />
      </>
    ),
    face: <path d="M21.6 30.6 h4.8 l-2.4 2.4 z" fill={INK} />,
  },
};

/** Brow angle by mood. Down and in reads as effort; level reads as curiosity. */
const BROW: Record<Mood, { drop: number; tilt: number }> = {
  blazing: { drop: 0, tilt: 4.5 },
  keen: { drop: 1, tilt: 3 },
  waiting: { drop: 2.5, tilt: -1.5 },
  resting: { drop: 3, tilt: 0.5 },
};

export function Mascot({
  id, mood, hue, size = 34, crown = false, animal,
}: {
  id: string;
  mood: Mood;
  /** Their colour, worn as a sweatband so a row of foxes is still a row of people. */
  hue: string;
  size?: number;
  crown?: boolean;
  /** Override the derived creature. Only the fixtures do this. */
  animal?: Animal;
}) {
  const kind = animal ?? animalOf(id);
  const skin = SKINS[kind];
  const brow = BROW[mood];
  const asleep = mood === 'resting';

  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img"
      aria-label={`${kind}, ${LABEL[mood]}`}
      style={{ overflow: 'visible', flex: 'none' }}>
      <g className={`mc${mood === 'blazing' ? ' quick' : asleep ? ' slow' : ''}`}>
        <g className="mc-ears">{skin.ears(mood)}</g>

        {/* head */}
        <ellipse cx="24" cy="26" rx="15.5" ry="14.5" fill={skin.coat} />
        <ellipse cx="24" cy="32.5" rx="9" ry="7" fill={skin.muzzle} opacity=".95" />

        {/* the sweatband — their colour, and the reason a team reads as people */}
        <path d="M9.6 21.5 a15.5 14.5 0 0 1 28.8 0 a15.5 14.5 0 0 0 -28.8 0 z" fill={hue} opacity=".95" />
        <rect x="8.8" y="18.4" width="30.4" height="4.6" rx="2.3" fill={hue} />

        {skin.goggles && (
          <>
            <circle cx="17.5" cy="27" r="6.4" fill={skin.muzzle} opacity=".9" />
            <circle cx="30.5" cy="27" r="6.4" fill={skin.muzzle} opacity=".9" />
          </>
        )}

        {skin.face}

        {/* eyes */}
        {asleep ? (
          <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none">
            <path d="M14 27 q3.5 3 7 0" />
            <path d="M27 27 q3.5 3 7 0" />
          </g>
        ) : (
          <g className="mc-eyes">
            <ellipse cx="17.5" cy="27" rx="2.7" ry="3.1" fill={INK} />
            <ellipse cx="30.5" cy="27" rx="2.7" ry="3.1" fill={INK} />
            <circle cx="18.5" cy="25.9" r="1" fill="#FFFFFF" opacity=".9" />
            <circle cx="31.5" cy="25.9" r="1" fill="#FFFFFF" opacity=".9" />
          </g>
        )}

        {/* brows — the whole difference between cute and competitive */}
        <g stroke={INK} strokeWidth="1.9" strokeLinecap="round" opacity={asleep ? 0.4 : 0.9}>
          <path d={`M13.4 ${22.6 + brow.drop} L21 ${22.6 + brow.drop + brow.tilt}`} />
          <path d={`M34.6 ${22.6 + brow.drop} L27 ${22.6 + brow.drop + brow.tilt}`} />
        </g>

        {/* mouth */}
        {mood === 'blazing' && (
          <path d="M20 34.6 q4 4.4 8 0 q-4 1.6 -8 0 z" fill={INK} />
        )}
        {mood === 'keen' && (
          <path d="M20.6 34.8 q3.4 2.8 6.8 0" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
        )}
        {mood === 'waiting' && (
          <circle cx="24" cy="35.6" r="1.5" fill={INK} opacity=".8" />
        )}
        {asleep && (
          <path d="M21.5 35.6 q2.5 1.6 5 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".6" />
        )}
      </g>

      {/* one small thing per mood, outside the head, so it reads at a glance */}
      {mood === 'blazing' && (
        <g className="mc-spark" fill="#FFC24B">
          <path d="M42 12 l1.5 3.4 3.4 1.5 -3.4 1.5 -1.5 3.4 -1.5 -3.4 -3.4 -1.5 3.4 -1.5 z" />
        </g>
      )}
      {asleep && (
        <g className="mc-z" fill={INK} opacity=".5" fontSize="9" fontWeight="800">
          <text x="37" y="14">z</text>
        </g>
      )}
      {crown && (
        <g className="mc-crown">
          <path d="M15 6 l3.6 4.4 L24 3.4 l5.4 7 L33 6 l-1.4 7.4 h-16.2 z"
            fill="#FFC24B" stroke="#B8862B" strokeWidth=".8" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

const LABEL: Record<Mood, string> = {
  blazing: 'on a run and out in front',
  keen: 'went today',
  waiting: 'not started yet',
  resting: 'resting',
};
