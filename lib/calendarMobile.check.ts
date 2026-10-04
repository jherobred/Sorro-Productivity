import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { moveCalendarDate, calendarStripDates } from './calendarNavigation.ts';
import { calendarGesture, startCalendarGesture } from './calendarGesture.ts';

test('day arrows advance the selected Sunday across the week and month boundary', () => {
  let date = new Date(2026, 9, 4, 23, 30);
  date = moveCalendarDate(date, 'day', 1);
  assert.deepEqual([date.getMonth(), date.getDate()], [9, 5]);
  date = moveCalendarDate(date, 'day', 1);
  assert.equal(date.getDate(), 6);
  date = moveCalendarDate(date, 'day', -1);
  assert.equal(date.getDate(), 5);
  assert.equal(moveCalendarDate(new Date(2026, 9, 31), 'day', 1).getMonth(), 10);
});

test('month arrows do not skip February or get stuck on a leading week in the previous month', () => {
  const next = moveCalendarDate(new Date(2026, 0, 31), 'month', 1);
  assert.deepEqual([next.getMonth(), next.getDate()], [1, 1]);
  const back = moveCalendarDate(next, 'month', -1);
  assert.deepEqual([back.getMonth(), back.getDate()], [0, 1]);
  assert.equal(moveCalendarDate(new Date(2026, 9, 4), 'week', 1).getDate(), 11);
});

test('the date strip includes a selected date far from today without an unbounded rail', () => {
  const date = new Date(2028, 1, 29);
  const days = calendarStripDates(date);
  assert.equal(days.length, 76);
  assert.equal(days.filter(d => d.toDateString() === date.toDateString()).length, 1);
  assert.equal((days[1].getTime() - days[0].getTime()) / 3600_000, 24);
});

test('an ordinary touch swipe scrolls without rescheduling or opening a popup', () => {
  const gesture = calendarGesture(true);
  gesture.move(30);
  gesture.hold();
  assert.equal(gesture.active, false);
  assert.equal(gesture.end(), 'cancel');
});

test('hold then move drops, while holding still never opens a blocking popup', () => {
  const gesture = calendarGesture(true);
  gesture.move(3);
  gesture.hold();
  assert.equal(gesture.active, true);
  assert.equal(gesture.end(), 'cancel');
  gesture.move(70);
  assert.equal(gesture.end(), 'drop');
});

test('tap opens once, mouse drag needs no hold, and locked or cancelled gestures never move', () => {
  assert.equal(calendarGesture(true).end(), 'tap');
  const mouse = calendarGesture(false);
  mouse.move(30);
  assert.equal(mouse.end(), 'drop');
  const locked = calendarGesture(true, true);
  locked.hold(); locked.move(70);
  assert.equal(locked.end(), 'cancel');
  const cancelled = calendarGesture(true);
  cancelled.hold(); cancelled.move(70); cancelled.cancel();
  assert.equal(cancelled.end(), 'cancel');
});

test('native touch adapter prevents scrolling and context menus only during a held drag, and cleans up on cancel', () => {
  const saved = new Map(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const win = new EventTarget();
  const doc = new EventTarget();
  let hold: () => void = () => {};
  Object.assign(win, { setTimeout: (fn: () => void) => { hold = fn; return 1; } });
  Object.defineProperties(globalThis, {
    window: { value: win, configurable: true }, document: { value: doc, configurable: true },
    requestAnimationFrame: { value: () => 1, configurable: true }, cancelAnimationFrame: { value: () => {}, configurable: true },
  });
  const target = { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {}, contains: () => true } as unknown as HTMLElement;
  const results: string[] = [];
  let starts = 0, moves = 0;
  const pointer = (type: string, y: number) => Object.assign(new Event(type, { cancelable: true }), { pointerType: 'touch', pointerId: 1, clientX: 10, clientY: y }) as PointerEvent;
  try {
    const cancel = startCalendarGesture(pointer('pointerdown', 10), target, {
      locked: false, onStart: () => { starts++; }, onMove: () => { moves++; }, onFinish: result => results.push(result),
    });
    const before = Object.assign(new Event('touchmove', { cancelable: true }), { touches: [{}] });
    doc.dispatchEvent(before);
    assert.equal(before.defaultPrevented, false);
    hold();
    const active = Object.assign(new Event('touchmove', { cancelable: true }), { touches: [{}] });
    doc.dispatchEvent(active);
    assert.equal(active.defaultPrevented, true);
    const menu = new Event('contextmenu', { cancelable: true });
    doc.dispatchEvent(menu);
    assert.equal(menu.defaultPrevented, true);
    win.dispatchEvent(pointer('pointermove', 70));
    win.dispatchEvent(pointer('pointerup', 70));
    cancel();
    assert.deepEqual(results, ['drop']);
    assert.equal(starts, 1);
    assert.ok(moves > 0);
    const after = Object.assign(new Event('touchmove', { cancelable: true }), { touches: [{}] });
    doc.dispatchEvent(after);
    assert.equal(after.defaultPrevented, false);
    startCalendarGesture(pointer('pointerdown', 10), target, { locked: false, onStart() {}, onMove() {}, onFinish: result => results.push(result) });
    hold(); win.dispatchEvent(pointer('pointercancel', 10)); win.dispatchEvent(pointer('pointerup', 10));
    assert.deepEqual(results, ['drop', 'cancel']);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
