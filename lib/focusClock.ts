export type FocusClock = { duration: number; remaining: number; endsAt: number | null };
export function secondsLeft(clock: FocusClock, now: number) {
  return clock.endsAt === null ? clock.remaining : Math.max(0, Math.ceil((clock.endsAt - now) / 1000));
}
export function startClock(clock: FocusClock, now: number): FocusClock {
  const remaining = secondsLeft(clock, now) || clock.duration;
  return { ...clock, remaining, endsAt: now + remaining * 1000 };
}
export function pauseClock(clock: FocusClock, now: number): FocusClock {
  return { ...clock, remaining: secondsLeft(clock, now), endsAt: null };
}
/**
 * Add time to the run in progress, keeping it running or paused as it was. A
 * run that has already reached zero has nothing to extend, so it becomes a new
 * run of that length, started now.
 */
export function extendClock(clock: FocusClock, seconds: number, now: number): FocusClock {
  const left = secondsLeft(clock, now);
  if (left > 0 && clock.endsAt !== null) return { duration: clock.duration + seconds, remaining: left + seconds, endsAt: clock.endsAt + seconds * 1000 };
  if (left > 0) return { duration: clock.duration + seconds, remaining: left + seconds, endsAt: null };
  return { duration: seconds, remaining: seconds, endsAt: now + seconds * 1000 };
}
/**
 * Change how long the run is without forgetting the time already spent in it.
 * Shortening below what has elapsed leaves one minute, rather than ending a run
 * the person is still sitting in.
 */
export function retimeClock(clock: FocusClock, minutes: number, now: number): FocusClock {
  const elapsed = Math.max(0, clock.duration - secondsLeft(clock, now));
  const duration = Math.max(minutes * 60, elapsed + 60);
  const remaining = duration - elapsed;
  return { duration, remaining, endsAt: clock.endsAt === null ? null : now + remaining * 1000 };
}
/** How much of the run is still to come, from 1 at the start to 0 at the end. */
export function remainingShare(clock: FocusClock, now: number) {
  return clock.duration > 0 ? Math.min(1, Math.max(0, secondsLeft(clock, now) / clock.duration)) : 0;
}
