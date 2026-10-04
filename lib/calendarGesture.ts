export const CALENDAR_HOLD_MS = 380;
export const CALENDAR_SLOP_PX = 8;
export type CalendarPoint = { x: number; y: number };

/** Touch scrolls until held. A held gesture never becomes a tap on release. */
export function calendarGesture(touch: boolean, locked = false) {
  let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
  let moved = false;
  return {
    get active() { return phase === 'dragging'; },
    get cancelled() { return phase === 'cancelled'; },
    hold() { if (phase === 'pending' && !locked) phase = 'dragging'; },
    move(distance: number) {
      if (phase === 'pending' && distance > CALENDAR_SLOP_PX) {
        phase = touch || locked ? 'cancelled' : 'dragging';
      }
      if (phase === 'dragging' && distance > CALENDAR_SLOP_PX) moved = true;
    },
    cancel() { phase = 'cancelled'; },
    end(): 'tap' | 'drop' | 'cancel' {
      return phase === 'pending' ? 'tap' : phase === 'dragging' && moved ? 'drop' : 'cancel';
    },
  };
}

/** Native non-passive touchmove keeps a held drag from turning into browser pan. */
export function startCalendarGesture(event: PointerEvent, target: HTMLElement, options: {
  locked: boolean;
  onStart: () => void;
  onMove: (point: CalendarPoint) => void;
  onFrame?: (point: CalendarPoint) => void;
  onFinish: (result: 'tap' | 'drop' | 'cancel', point: CalendarPoint) => void;
}) {
  const touch = event.pointerType === 'touch' || event.pointerType === 'pen';
  const gesture = calendarGesture(touch, options.locked);
  const origin = { x: event.clientX, y: event.clientY };
  let point = origin;
  let frame = 0;
  let finished = false;
  let started = false;
  const activate = () => {
    if (!gesture.active || started) return;
    started = true;
    try { target.setPointerCapture(event.pointerId); } catch { /* The touch may have been cancelled. */ }
    options.onStart();
  };
  const timer = touch ? window.setTimeout(() => { gesture.hold(); activate(); }, CALENDAR_HOLD_MS) : undefined;
  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return;
    point = { x: e.clientX, y: e.clientY };
    gesture.move(Math.hypot(point.x - origin.x, point.y - origin.y));
    activate();
    if (gesture.active) { if (e.cancelable) e.preventDefault(); options.onMove(point); }
  };
  const touchmove = (e: TouchEvent) => {
    if (e.touches.length > 1) { finish('cancel'); return; }
    if (gesture.active && e.cancelable) e.preventDefault();
  };
  const contextmenu = (e: Event) => {
    if (touch && target.contains(e.target as Node)) { e.preventDefault(); e.stopPropagation(); }
  };
  const scroll = () => { if (touch && !gesture.active) gesture.cancel(); };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return;
    point = { x: e.clientX, y: e.clientY };
    gesture.move(Math.hypot(point.x - origin.x, point.y - origin.y));
    if (gesture.active) options.onMove(point);
    finish(gesture.end());
  };
  const cancel = () => finish('cancel');
  const tick = () => {
    if (gesture.active) options.onFrame?.(point);
    frame = requestAnimationFrame(tick);
  };
  const finish = (result: 'tap' | 'drop' | 'cancel') => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('touchmove', touchmove, { capture: true });
    document.removeEventListener('contextmenu', contextmenu, { capture: true });
    document.removeEventListener('scroll', scroll, { capture: true });
    try { if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); } catch { /* Detached target. */ }
    options.onFinish(result, point);
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('touchmove', touchmove, { passive: false, capture: true });
  document.addEventListener('contextmenu', contextmenu, true);
  document.addEventListener('scroll', scroll, { passive: true, capture: true });
  frame = requestAnimationFrame(tick);
  return cancel;
}
