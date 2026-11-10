/** The window event the Month widget sends so a Calendar already on screen opens the picked day. */
export const OPEN_DAY = 'sorro-open-day';

/**
 * How full a day looks in the Month widget, 0 to 4, from its events plus open tasks.
 * Scaled to the busiest day shown, so a packed month still has light and dark days.
 * A month where no day passes 4 items counts them one for one.
 */
export function dayLoad(n: number, busiest: number): number {
  if (n <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((4 * n) / Math.max(busiest, 4))));
}
