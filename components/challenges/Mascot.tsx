'use client';

import { animalOf, type Animal, type Mood, type Accessory } from '@/lib/mascot';
import { useProfiles } from '@/lib/people';

/**
 * Mascot renderer for Basedly.
 *
 * 14 distinct species with expressive mood states, gear customization,
 * and support for both classic compact head and expressive full-body rendering.
 */

const INK = '#20232E';

type Skin = {
  coat: string;
  muzzle: string;
  ear: string;
  ears: (mood: Mood) => React.ReactNode;
  face?: React.ReactNode;
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
  shiba: {
    coat: '#EBA052', muzzle: '#FFF6EB', ear: '#C8782E',
    ears: () => (
      <>
        <path d={point(13, -3)} fill="#EBA052" />
        <path d={point(35, 3)} fill="#EBA052" />
        <path d="M10 15 L12 9 L15 15 Z" fill="#FFF6EB" />
        <path d="M38 15 L36 9 L33 15 Z" fill="#FFF6EB" />
      </>
    ),
    face: (
      <>
        <circle cx="16.5" cy="23.5" r="1.4" fill="#FFF6EB" />
        <circle cx="31.5" cy="23.5" r="1.4" fill="#FFF6EB" />
        <ellipse cx="24" cy="31.5" rx="2.6" ry="2" fill={INK} />
      </>
    ),
  },
  capybara: {
    coat: '#9A7150', muzzle: '#D2AB8B', ear: '#6E492E',
    ears: () => (
      <>
        <circle cx="10" cy="17" r="4.8" fill="#6E492E" />
        <circle cx="38" cy="17" r="4.8" fill="#6E492E" />
        <circle cx="10" cy="17" r="2.2" fill="#4B311E" />
        <circle cx="38" cy="17" r="2.2" fill="#4B311E" />
      </>
    ),
    face: (
      <>
        <rect x="18" y="27" width="12" height="7" rx="3.5" fill="#D2AB8B" />
        <ellipse cx="24" cy="31" rx="3" ry="1.8" fill={INK} />
      </>
    ),
  },
  dragon: {
    coat: '#2EB8A6', muzzle: '#C2F5EE', ear: '#FF9F1C',
    ears: () => (
      <>
        <path d="M10 17 L7 5 L17 12 Z" fill="#FF9F1C" />
        <path d="M38 17 L41 5 L31 12 Z" fill="#FF9F1C" />
      </>
    ),
    face: (
      <>
        <circle cx="21" cy="31" r="1" fill={INK} />
        <circle cx="27" cy="31" r="1" fill={INK} />
      </>
    ),
  },
  raccoon: {
    coat: '#636E80', muzzle: '#EAEFF8', ear: '#424A59',
    ears: () => (
      <>
        <circle cx="12" cy="13" r="6" fill="#424A59" />
        <circle cx="36" cy="13" r="6" fill="#424A59" />
        <circle cx="12" cy="13" r="3" fill="#EAEFF8" />
        <circle cx="36" cy="13" r="3" fill="#EAEFF8" />
      </>
    ),
    face: (
      <>
        <path d="M10 24 q14 -2 28 0 q-4 8 -14 7 q-10 1 -14 -7 z" fill="#252A36" opacity=".92" />
        <ellipse cx="24" cy="32" rx="2.5" ry="1.8" fill={INK} />
      </>
    ),
  },
  penguin: {
    coat: '#22283A', muzzle: '#FFFFFF', ear: '#1A1E2C',
    ears: () => null,
    face: (
      <>
        <ellipse cx="24" cy="27" rx="11" ry="12" fill="#FFFFFF" />
        <path d="M20 29 l4 4 l4 -4 z" fill="#FFB703" />
      </>
    ),
  },
  otter: {
    coat: '#82593E', muzzle: '#F0E5DB', ear: '#5C3822',
    ears: () => (
      <>
        <circle cx="10" cy="16" r="4.5" fill="#5C3822" />
        <circle cx="38" cy="16" r="4.5" fill="#5C3822" />
      </>
    ),
    face: (
      <>
        <ellipse cx="24" cy="31.5" rx="3.2" ry="2.2" fill={INK} />
        <g stroke={INK} strokeWidth="0.8" opacity=".5" strokeLinecap="round">
          <path d="M12 33 h5M12 35 h5M36 33 h-5M36 35 h-5" />
        </g>
      </>
    ),
  },
};

const BROW: Record<Mood, { drop: number; tilt: number }> = {
  blazing: { drop: 0, tilt: 4.5 },
  keen: { drop: 1, tilt: 3 },
  waiting: { drop: 2.5, tilt: -1.5 },
  resting: { drop: 3, tilt: 0.5 },
  grinding: { drop: 1.5, tilt: 4 },
  celebrating: { drop: -1.5, tilt: 1 },
  coffee: { drop: 2, tilt: 0 },
};

export function Mascot({
  id, mood = 'keen', hue = '#7C6CFF', size = 34, crown = false, animal, racing = false,
  variant = 'head', accessory = 'sweatband',
}: {
  id: string;
  mood?: Mood;
  hue?: string;
  size?: number;
  crown?: boolean;
  animal?: Animal;
  racing?: boolean;
  variant?: 'head' | 'full';
  accessory?: Accessory;
}) {
  const { data: profiles = {} } = useProfiles();
  const kind = (animal ?? (profiles[id]?.animal as Animal) ?? animalOf(id));
  const skin = SKINS[kind] ?? SKINS.fox;
  const brow = BROW[mood] ?? BROW.keen;
  const asleep = mood === 'resting';
  const running = racing && !asleep;
  const isFull = variant === 'full';

  const viewBox = isFull ? '0 0 48 64' : '0 0 48 48';
  const height = isFull ? Math.round(size * 1.33) : size;

  return (
    <svg viewBox={viewBox} width={size} height={height} role="img"
      aria-label={`${kind}, ${LABEL[mood] ?? mood}`}
      style={{ overflow: 'visible', flex: 'none' }}>
      
      {/* Running particles */}
      {running && (
        <>
          <g className="mc-zoom" stroke={hue} strokeWidth="2.2" strokeLinecap="round" opacity=".55">
            <path d="M2 22 h7" />
            <path d="M-1 29 h10" />
            <path d="M2 36 h6" />
          </g>
          <g className="mc-dust" fill={hue} opacity=".38">
            <circle cx="7" cy="42" r="3.4" />
            <circle cx="1" cy="44" r="2.4" style={{ animationDelay: '.45s' }} />
          </g>
        </>
      )}

      {/* Shadow for full body */}
      {isFull && (
        <ellipse cx="24" cy="61" rx="14" ry="3" fill="#000000" opacity=".24" />
      )}

      <g className={`mc${running ? ' race' : ''}${mood === 'blazing' ? ' quick' : asleep ? ' slow' : ''}`}>
        
        {/* Full-body torso, arms, legs */}
        {isFull && (
          <g className="mc-body">
            {/* Legs */}
            <rect x="16" y="50" width="5.5" height="9" rx="2.7" fill={skin.coat} />
            <rect x="26.5" y="50" width="5.5" height="9" rx="2.7" fill={skin.coat} />
            {/* Shoes */}
            <ellipse cx="18" cy="58.5" rx="3.8" ry="2.2" fill={hue} />
            <ellipse cx="29.5" cy="58.5" rx="3.8" ry="2.2" fill={hue} />

            {/* Torso */}
            <rect x="12" y="34" width="24" height="20" rx="9" fill={skin.coat} />
            {/* Chest patch */}
            <ellipse cx="24" cy="44" rx="7.5" ry="8" fill={skin.muzzle} opacity=".95" />

            {/* Arms / Pose */}
            {mood === 'celebrating' ? (
              <>
                <path d="M12 39 Q5 27 6 22" stroke={skin.coat} strokeWidth="5" strokeLinecap="round" fill="none" />
                <path d="M36 39 Q43 27 42 22" stroke={skin.coat} strokeWidth="5" strokeLinecap="round" fill="none" />
              </>
            ) : mood === 'coffee' ? (
              <>
                <path d="M12 42 Q18 48 22 47" stroke={skin.coat} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M36 42 Q30 48 26 47" stroke={skin.coat} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                {/* Coffee Mug */}
                <rect x="21" y="44" width="6" height="7" rx="1.5" fill="#FFFFFF" />
                <path d="M27 46 h2 v3 h-2" stroke="#FFFFFF" strokeWidth="1" fill="none" />
                <path d="M23 42 q1 -2 0 -4 M25 42 q1 -2 0 -4" stroke="#FFF" strokeWidth="0.8" fill="none" opacity=".7" />
              </>
            ) : mood === 'grinding' ? (
              <>
                <path d="M12 43 Q18 49 22 50" stroke={skin.coat} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M36 43 Q30 49 26 50" stroke={skin.coat} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                {/* Book / Laptop */}
                <rect x="19" y="48" width="10" height="5" rx="1" fill={hue} />
              </>
            ) : (
              <>
                <path d="M13 40 Q8 48 10 52" stroke={skin.coat} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <path d="M35 40 Q40 48 38 52" stroke={skin.coat} strokeWidth="4.5" strokeLinecap="round" fill="none" />
              </>
            )}
          </g>
        )}

        {/* Ears */}
        <g className="mc-ears">{skin.ears(mood)}</g>

        {/* Head */}
        <ellipse cx="24" cy="26" rx="15.5" ry="14.5" fill={skin.coat} />
        <ellipse cx="24" cy="32.5" rx="9" ry="7" fill={skin.muzzle} opacity=".95" />

        {/* Sweatband */}
        {accessory === 'sweatband' && (
          <>
            <path d="M9.6 21.5 a15.5 14.5 0 0 1 28.8 0 a15.5 14.5 0 0 0 -28.8 0 z" fill={hue} opacity=".95" />
            <rect x="8.8" y="18.4" width="30.4" height="4.6" rx="2.3" fill={hue} />
          </>
        )}

        {/* Headphones accessory */}
        {accessory === 'headphones' && (
          <>
            <path d="M8 25 A16 16 0 0 1 40 25" stroke="#1A1C24" strokeWidth="3" fill="none" />
            <rect x="6" y="21" width="5" height="10" rx="2.5" fill={hue} />
            <rect x="37" y="21" width="5" height="10" rx="2.5" fill={hue} />
          </>
        )}

        {/* Glasses / Shades accessory */}
        {accessory === 'glasses' && (
          <g>
            <rect x="10" y="24" width="13" height="7" rx="2" fill="#111319" stroke={hue} strokeWidth="1.2" />
            <rect x="25" y="24" width="13" height="7" rx="2" fill="#111319" stroke={hue} strokeWidth="1.2" />
            <line x1="23" y1="27" x2="25" y2="27" stroke={hue} strokeWidth="1.5" />
            <line x1="7" y1="26" x2="10" y2="26" stroke={hue} strokeWidth="1.2" />
            <line x1="38" y1="26" x2="41" y2="26" stroke={hue} strokeWidth="1.2" />
          </g>
        )}

        {skin.goggles && (
          <>
            <circle cx="17.5" cy="27" r="6.4" fill={skin.muzzle} opacity=".9" />
            <circle cx="30.5" cy="27" r="6.4" fill={skin.muzzle} opacity=".9" />
          </>
        )}

        {skin.face}

        {/* Eyes */}
        {asleep ? (
          <g stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none">
            <path d="M14 27 q3.5 3 7 0" />
            <path d="M27 27 q3.5 3 7 0" />
          </g>
        ) : mood === 'celebrating' ? (
          <g fill="#FFC24B" stroke={INK} strokeWidth="0.8">
            <polygon points="17.5,23 18.5,26 21.5,26.5 19,28.5 20,31.5 17.5,29.5 15,31.5 16,28.5 13.5,26.5 16.5,26" />
            <polygon points="30.5,23 31.5,26 34.5,26.5 32,28.5 33,31.5 30.5,29.5 28,31.5 29,28.5 26.5,26.5 29.5,26" />
          </g>
        ) : (
          <g className="mc-eyes">
            <ellipse cx="17.5" cy="27" rx="2.7" ry="3.1" fill={INK} />
            <ellipse cx="30.5" cy="27" rx="2.7" ry="3.1" fill={INK} />
            <circle cx="18.5" cy="25.9" r="1" fill="#FFFFFF" opacity=".9" />
            <circle cx="31.5" cy="25.9" r="1" fill="#FFFFFF" opacity=".9" />
          </g>
        )}

        {/* Eyebrows */}
        <g stroke={INK} strokeWidth="1.9" strokeLinecap="round" opacity={asleep ? 0.4 : 0.9}>
          <path d={`M13.4 ${22.6 + brow.drop} L21 ${22.6 + brow.drop + brow.tilt}`} />
          <path d={`M34.6 ${22.6 + brow.drop} L27 ${22.6 + brow.drop + brow.tilt}`} />
        </g>

        {/* Mouth */}
        {(mood === 'blazing' || mood === 'celebrating') && (
          <path d="M20 34.6 q4 4.4 8 0 q-4 1.6 -8 0 z" fill={INK} />
        )}
        {(mood === 'keen' || mood === 'grinding') && (
          <path d="M20.6 34.8 q3.4 2.8 6.8 0" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
        )}
        {(mood === 'waiting' || mood === 'coffee') && (
          <circle cx="24" cy="35.6" r="1.5" fill={INK} opacity=".8" />
        )}
        {asleep && (
          <path d="M21.5 35.6 q2.5 1.6 5 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".6" />
        )}
      </g>

      {/* Mood badges / particles */}
      {mood === 'blazing' && (
        <g className="mc-spark" fill="#FFC24B">
          <path d="M42 12 l1.5 3.4 3.4 1.5 -3.4 1.5 -1.5 3.4 -1.5 -3.4 -3.4 -1.5 3.4 -1.5 z" />
        </g>
      )}
      {mood === 'celebrating' && (
        <g className="mc-spark" fill="#FF6B6B">
          <circle cx="43" cy="10" r="2" fill="#FFC24B" />
          <circle cx="5" cy="12" r="1.8" fill="#38D6F2" />
          <circle cx="39" cy="4" r="1.5" fill="#FF6FA8" />
        </g>
      )}
      {asleep && (
        <g className="mc-z" fill={INK} opacity=".5" fontSize="9" fontWeight="800">
          <text x="37" y="14">z</text>
        </g>
      )}
      {(crown || accessory === 'crown') && (
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
  grinding: 'deep in focus',
  celebrating: 'celebrating milestone',
  coffee: 'taking a coffee recharge',
};
