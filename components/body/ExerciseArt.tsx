'use client';

import type { Art } from '@/lib/lift';

/**
 * The exercise demonstration.
 *
 * openGym shows an animated GIF per movement, pulled from
 * `hasaneyldrm/exercises-dataset` — about 140 MB downloaded on first launch,
 * with its own licence terms. Basedly ships as a Capacitor APK off a static
 * export and its pages are served under a strict origin, so neither a 140 MB
 * first-run download nor a hotlink to somebody else's image host is a thing
 * this app can do. What the picture is *for* survives the swap: black line
 * work on white, the worked muscle in red, at a glance from arm's length.
 *
 * So they are drawn here — nine movement patterns rather than 1,324
 * exercises, because a bench press and an incline press are the same picture
 * with the bench at a different angle, and the catalogue maps every entry onto
 * one of them.
 *
 * ponytail: if the dataset is ever bundled with the app (licence permitting),
 * swap this component's body for an <img> and keep the `art` field as the key.
 */

const INK = 'var(--tx, #15161A)';
const RED = 'var(--pal-coral, #E23B3B)';
const BENCH = 'var(--card2, #D8DBE0)';

/** Where the effort is, per pattern — the red wash the dataset images use. */
function Muscle({ d }: { d: string }) {
  return <path d={d} fill={RED} opacity={0.85} />;
}

const STROKE = {
  fill: 'none', stroke: INK, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;
const THIN = {
  fill: 'none', stroke: INK, strokeWidth: 3.4, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.65,
} as const;

/** A loaded barbell: the bar, and a plate stack at each end. */
function Bar({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const plate = (cx: number, cy: number, flip: number) => (
    <>
      <rect x={cx - 3 + flip * 5} y={cy - 15} width={6} height={30} rx={2.5} fill={INK} />
      <rect x={cx - 3 + flip * 13} y={cy - 11} width={6} height={22} rx={2.5} fill={INK} />
    </>
  );
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      {plate(x1, y1, -1)}
      {plate(x2, y2, 1)}
    </g>
  );
}

const FIGURES: Record<Art, React.ReactNode> = {
  /* Lying on a bench, pressing. The picture openGym opens on. */
  bench: (
    <>
      {/* bench */}
      <rect x="52" y="96" width="118" height="13" rx="6" fill={BENCH} />
      <path d="M74 109v22M150 109v22" {...THIN} />
      {/* body */}
      <circle cx="60" cy="82" r="13" {...STROKE} />
      <path d="M74 90h62" {...STROKE} />
      <Muscle d="M84 78c14-9 32-9 44 0 5 4 5 12 0 16-14 8-30 8-44 0-5-4-5-12 0-16z" />
      <path d="M88 90c14 6 30 6 44 0" {...THIN} />
      {/* arms up to the bar */}
      <path d="M92 88 90 56M132 88l2-32" {...STROKE} />
      {/* legs */}
      <path d="M136 92l26 6 6 26" {...STROKE} />
      <Bar x1={62} y1={50} x2={162} y2={50} />
    </>
  ),

  /* Same press, bench raked up. */
  incline: (
    <>
      <path d="M56 122 158 78" stroke={BENCH} strokeWidth={13} strokeLinecap="round" fill="none" />
      <path d="M70 126v14M144 100v40" {...THIN} />
      <circle cx="150" cy="70" r="13" {...STROKE} />
      <path d="M138 78 84 104" {...STROKE} />
      <Muscle d="M118 72c9-13 25-19 36-14 6 3 7 11 2 17-10 12-25 17-34 12-5-3-6-10-4-15z" />
      <path d="M76 108l-14 16" {...STROKE} />
      <path d="M128 84 118 52M110 92 102 58" {...STROKE} />
      <Bar x1={72} y1={46} x2={158} y2={46} />
    </>
  ),

  /* Standing, pressing overhead. */
  ohp: (
    <>
      <circle cx="110" cy="66" r="13" {...STROKE} />
      <path d="M110 79v38" {...STROKE} />
      <Muscle d="M92 84c0-8 6-13 13-13s13 5 13 13-6 12-13 12-13-4-13-12z" />
      <path d="M96 84 84 50M124 84l12-34" {...STROKE} />
      <path d="M110 117l-14 30M110 117l14 30" {...STROKE} />
      <Bar x1={64} y1={42} x2={156} y2={42} />
      <path d="M78 150h64" {...THIN} />
    </>
  ),

  /* Bent over, pulling to the waist. */
  row: (
    <>
      <circle cx="54" cy="70" r="12" {...STROKE} />
      <path d="M66 76 128 92" {...STROKE} />
      <Muscle d="M84 74c16-4 32 0 42 10 4 4 2 11-4 12-16 3-32-1-40-9-4-4-3-11 2-13z" />
      <path d="M128 92l6 32M128 92l-4 34" {...STROKE} />
      <path d="M92 84 88 116" {...STROKE} />
      <Bar x1={48} y1={120} x2={130} y2={120} />
      <path d="M66 150h72" {...THIN} />
    </>
  ),

  /* Hanging, pulling up. */
  pull: (
    <>
      <path d="M40 30h140" stroke={INK} strokeWidth={6} strokeLinecap="round" fill="none" />
      <circle cx="110" cy="72" r="13" {...STROKE} />
      <Muscle d="M88 88c14-8 30-8 44 0 5 3 6 11 1 15-15 8-31 8-46 0-5-4-4-12 1-15z" />
      <path d="M110 85v32" {...STROKE} />
      <path d="M98 84 84 34M122 84l14-50" {...STROKE} />
      <path d="M110 117l-16 26M110 117l16 26" {...STROKE} />
    </>
  ),

  /* Bar on the back, knees bent. */
  squat: (
    <>
      <circle cx="110" cy="56" r="12" {...STROKE} />
      <path d="M110 68v30" {...STROKE} />
      <Muscle d="M92 116c12-6 24-6 36 0 5 3 6 12 2 18-11 8-29 8-40 0-4-6-3-15 2-18z" />
      <path d="M110 98l-18 22 4 28M110 98l18 22-4 28" {...STROKE} />
      <path d="M96 148h-12M124 148h12" {...THIN} />
      <Bar x1={62} y1={74} x2={158} y2={74} />
    </>
  ),

  /* Bar at the shins, back flat. */
  hinge: (
    <>
      <circle cx="60" cy="62" r="12" {...STROKE} />
      <path d="M72 68 126 84" {...STROKE} />
      <Muscle d="M92 104c14-6 28-4 36 6 4 5 1 13-6 14-14 2-28-3-33-9-3-5-1-9 3-11z" />
      <path d="M126 84l6 34-4 30" {...STROKE} />
      <path d="M92 78v42" {...STROKE} />
      <Bar x1={52} y1={124} x2={134} y2={124} />
      <path d="M70 150h74" {...THIN} />
    </>
  ),

  /* Standing curl. */
  curl: (
    <>
      <circle cx="110" cy="54" r="12" {...STROKE} />
      <path d="M110 66v40" {...STROKE} />
      <Muscle d="M84 84c7-4 15-2 18 5 2 6-2 12-9 13s-13-3-13-9c0-4 2-7 4-9z" />
      <path d="M98 74 84 92l20 12M122 74l14 18-20 12" {...STROKE} />
      <path d="M110 106l-12 40M110 106l12 40" {...STROKE} />
      <Bar x1={70} y1={106} x2={150} y2={106} />
    </>
  ),

  /* On the floor, curling up. */
  core: (
    <>
      <path d="M34 132h152" stroke={BENCH} strokeWidth={9} strokeLinecap="round" fill="none" />
      <circle cx="74" cy="76" r="12" {...STROKE} />
      <path d="M84 84 118 106" {...STROKE} />
      <Muscle d="M92 96c12-4 24 0 30 9 3 5-1 11-7 11-12 0-23-4-27-10-2-4 0-8 4-10z" />
      <path d="M118 106l30-6 8 26" {...STROKE} />
      <path d="M86 88 96 104" {...THIN} />
    </>
  ),

  /* Running. */
  cardio: (
    <>
      <circle cx="118" cy="46" r="12" {...STROKE} />
      <path d="M116 58 106 96" {...STROKE} />
      <Muscle d="M92 112c10-5 21-3 26 5 3 5 0 12-6 13-11 2-22-3-25-8-2-4 1-8 5-10z" />
      <path d="M108 70l22 10M112 76 84 88" {...STROKE} />
      <path d="M106 96l22 18 4 30M106 96 78 112l-16 22" {...STROKE} />
      <path d="M34 148h152" {...THIN} />
      <path d="M52 60h26M44 78h20" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={0.35} fill="none" />
    </>
  ),
};

export function ExerciseArt({ art, compact }: { art: Art; compact?: boolean }) {
  return (
    <svg viewBox="0 0 220 160" role="img" aria-label="Exercise demonstration"
      preserveAspectRatio="xMidYMid meet"
      style={compact ? undefined : undefined}>
      <rect width="220" height="160" fill="var(--card, #FFFFFF)" />
      {FIGURES[art]}
    </svg>
  );
}
