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
