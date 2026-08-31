/**
 * Water, judged rather than counted.
 *
 * A cup counter tells you a number you already knew. The question it does not
 * answer is the one worth asking: *is this the right amount, right now?* Eight
 * cups is good at 22:00 and impossible at 08:00; a litre is fine across an
 * afternoon and a genuine problem inside ten minutes.
 *
 * So three inputs — how much today, how much in the last rolling hour, and what
 * time it is — resolve to one of six states, each with its own colour, wave
 * speed and sentence. Two of those states are warnings, and they exist because
 * over-drinking is a real failure mode, not a joke:
 *
 *   Adequate intake. US National Academies (IOM, 2004): 3.7 L/day total water
 *   for men and 2.7 L for women, roughly 80% of it from drinks. EFSA (2010):
 *   2.5 L/day men, 2.0 L women. `GOAL_ML` sits at the top of that band.
 *
 *   Maximum renal free-water clearance is about 0.8–1.0 L per hour in healthy
 *   adults. Drinking faster than the kidney can excrete is the mechanism behind
 *   dilutional hyponatraemia, so `HOUR_CAP` is the loudest rule here and beats
 *   every other state including "you already hit your goal".
 *
 * Two honesties the UI has to carry with it: these are population references
 * for healthy adults, not a prescription — needs rise with heat, exercise and
 * body mass and fall with kidney or heart conditions — and the app only knows
 * what was logged, so an unlogged bottle is invisible to all of it.
 *
 * Pure, so it can be checked without a DOM: lib/hydration.check.ts.
 */

/** One cup, as the Fuel tab draws it. Ten of them make the daily goal. */
export const CUP_ML = 250;

/** The daily target — the upper end of the EFSA band for an adult. */
export const GOAL_ML = 2500;

/** What the kidneys clear in an hour. Drinking past this is the warning. */
export const HOUR_CAP = 1000;

/** Sustained intake this far past any reference has no upside. */
export const DAY_MAX = 4000;

/** The waking window pace is measured across. */
export const WAKE_H = 7;
export const BED_H = 22;

/** Below this share of the expected-by-now figure you are behind. */
const BEHIND_AT = 0.6;
/** Above this share you are ahead. Between the two is simply fine. */
const AHEAD_AT = 1.15;

export type HydrationKey = 'behind' | 'pace' | 'ahead' | 'done' | 'fast' | 'over';

export type Hydration = {
  key: HydrationKey;
  /** The chip. Two words at most — it sits in 40px. */
  label: string;
  hue: string;
  /** Seconds for one wave rotation. Faster reads as more urgent. */
  waveSec: number;
  /** Whether the chip should pulse. Reserved for the two warnings. */
  alarm: boolean;
  /** The headline of the message. */
  head: string;
  /** Why the app thinks so, with the numbers in it. */
  why: string;
  /** What to actually do. Never empty — a state with no action is noise. */
  act: string;
};

const litres = (ml: number) => (ml / 1000).toFixed(2);

const clock = (hour: number) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
};

/**
 * How much you would expect to have drunk by this hour, ramping across the
 * waking window. Nothing at 07:00 is normal; nothing at 17:00 is not.
 */
export function expectedBy(hour: number): number {
  const frac = Math.min(1, Math.max(0, (hour - WAKE_H) / (BED_H - WAKE_H)));
  return GOAL_ML * frac;
}

/**
 * @param totalMl    everything logged so far in this lived day
 * @param lastHourMl what was logged in the last rolling 60 minutes
 * @param hour       hour of day as a decimal, e.g. 15.75 for 15:45
 */
export function hydration(totalMl: number, lastHourMl: number, hour: number): Hydration {
  const total = Math.max(0, Number.isFinite(totalMl) ? totalMl : 0);
  const lastHour = Math.max(0, Number.isFinite(lastHourMl) ? lastHourMl : 0);
  const h = Number.isFinite(hour) ? hour : WAKE_H;

  const expected = expectedBy(h);
  // Early enough that the expected figure is still noise, anything short of a
  // burst is simply "fine" — dividing by a near-zero target would call one cup
  // at 07:05 a triumph and no cups at 07:00 a failure.
  const ratio = expected > 60 ? total / expected : total > 600 ? 2 : 1;

  if (lastHour > HOUR_CAP) {
    return {
      key: 'fast', label: 'Too fast', hue: '#FF6B6B', waveSec: 2.6, alarm: true,
      head: 'Slow down',
      why: `${litres(lastHour)} L in the last hour. Kidneys clear about a litre an hour, so the rest is diluting your blood sodium.`,
      act: 'Stop for 45 minutes. Nothing is wrong yet — this is the point at which to pause.',
    };
  }

  if (total > DAY_MAX) {
    return {
      key: 'over', label: 'Over', hue: '#FF6B6B', waveSec: 2, alarm: true,
      head: 'Well past the daily reference',
      why: `${litres(total)} L today against a 2.5 L reference. Past this, extra water does nothing useful and carries real risk.`,
      act: 'Stop for the rest of the day unless you are training hard or ill.',
    };
  }

  if (total >= GOAL_ML) {
    return {
      key: 'done', label: 'Goal met', hue: '#A3E635', waveSec: 8, alarm: false,
      head: 'You are done for today',
      why: `You have hit ${litres(total)} L. That is the whole daily target.`,
      act: 'You do not need more unless you are training or it is unusually hot.',
    };
  }

  if (ratio < BEHIND_AT) {
    const cups = Math.max(0, Math.round((expected - total) / CUP_ML));
    return {
      key: 'behind', label: 'Behind', hue: '#FFC24B', waveSec: 12, alarm: false,
      head: cups > 0 ? `${cups} cup${cups === 1 ? '' : 's'} behind` : 'Behind pace',
      why: `By ${clock(h)} you would normally be at ${litres(expected)} L. You are at ${litres(total)} L.`,
      act: 'Catch up over the next few hours, not in one go — four cups at once trips the hourly ceiling.',
    };
  }

  if (ratio > AHEAD_AT) {
    return {
      key: 'ahead', label: 'Ahead', hue: '#38BDF8', waveSec: 5.5, alarm: false,
      head: 'Ahead of pace',
      why: `You are at ${litres(total)} L, above the ${litres(expected)} L expected by ${clock(h)}.`,
      act: 'Nothing to do. At this rate you will reach 2.5 L early and can stop there.',
    };
  }

  return {
    key: 'pace', label: 'On pace', hue: '#34D9A0', waveSec: 7, alarm: false,
    head: 'On pace',
    why: `Right where you should be for ${clock(h)}.`,
    act: 'Nothing to do. Keep going at this rate.',
  };
}

/**
 * How full to draw the column, 0–100.
 *
 * Drawn against a scale above the goal, not against the goal itself: a glass
 * that tops out at 2.5 L can never show overshoot, which is the one thing the
 * column exists to warn about. The goal line then sits at `GOAL_MARK`.
 */
export const SCALE_ML = 3200;
export const GOAL_MARK = (GOAL_ML / SCALE_ML) * 100;

/**
 * `Math.min`/`Math.max` both propagate NaN rather than clamping it, so an
 * unguarded percentage reaches the DOM as `height: NaN%` — an invalid
 * declaration the browser drops, leaving the fill frozen wherever it was. A
 * bar that silently stops moving is worse than one that reads zero.
 */
const pct = (ml: number, scale: number) =>
  Number.isFinite(ml) ? Math.min(100, Math.max(0, (ml / scale) * 100)) : 0;

export const fillPct = (ml: number) => pct(ml, SCALE_ML);

/** Progress toward the goal, for the bar rather than the glass. */
export const goalPct = (ml: number) => pct(ml, GOAL_ML);

/** Hour of day as the decimal `hydration` wants. */
export const hourOf = (d: Date = new Date()) => d.getHours() + d.getMinutes() / 60;

/**
 * How much of `entries` landed inside the last hour, for the rolling window the
 * `fast` rule needs. Entries are `[isoTimestamp, ml]`.
 */
export function inLastHour(entries: ReadonlyArray<readonly [string, number]>, now: Date = new Date()): number {
  const from = now.getTime() - 3600_000;
  let sum = 0;
  for (const [at, ml] of entries) {
    const t = new Date(at).getTime();
    if (Number.isFinite(t) && t > from && t <= now.getTime()) sum += ml;
  }
  return sum;
}
