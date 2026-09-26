'use client';

/**
 * The week/day grid, lifted out of app/(shell)/calendar/page.tsx so Home can
 * show the real day rather than a lookalike list of times.
 *
 * Nothing about the grid changed in the move except `parkHour`: the calendar
 * still opens on the morning, but a dashboard band is only ~420px tall, so
 * Home parks it on the current hour instead of 7 a.m. and the user sees the
 * part of the day they are actually in.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { K, SECHUE } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useTapGuard } from '@/lib/tapGuard';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { useTaskActions, type Task } from '@/lib/tasks';
import {
  useEventActions, weekStart, hoursOf, dayIndex, hhmm, at, spanRuns, dayLabels, chipInk,
  isReadOnly, GRID_START, GRID_END, type Ev, type Span,
} from '@/lib/events';

/**
 * The week/day grid runs midnight to midnight, at a fixed height per hour, and
 * scrolls. It used to be a 760px band squeezed from 07:00 to 22:00 — which
 * fitted on screen without scrolling, at the cost of the fourteen hours it
 * refused to draw. Anything at 6 a.m. or 11 p.m. was simply invisible.
 *
 * A per-hour height rather than a percentage of a fixed band is what makes the
 * whole day affordable: 24 hours at 48px is 1152px, so the container scrolls
 * and every hour keeps a usable size. Chips are still positioned by percentage
 * of the band, so the geometry survives any container width.
 */
const SPAN = GRID_END - GRID_START;   // 24 intervals, 25 labels
const GUTTER = 52;
const HOUR_H = 48;
const GRID_H = HOUR_H * SPAN;
/** Where the day is first parked — early enough to see a 7 a.m. class. */
const SCROLL_TO_HOUR = 7;
const pct = (hour: number) => ((hour - GRID_START) / SPAN) * 100;

/* ---------------------------------------------------------------- week/day */

export function CalendarGrid({
  days, dayOffset = 0, ws, events, tasks, A, TA, sel, setSel, openEvent, openSlot, onSchedule,
  parkHour = SCROLL_TO_HOUR,
}: {
  days: number;
  dayOffset?: number;
  /** Hour the scroll parks on at mount. Calendar wants the morning, Home now. */
  parkHour?: number;
  ws: Date;
  events: Ev[];
  tasks: Task[];
  A: ReturnType<typeof useEventActions>;
  TA: ReturnType<typeof useTaskActions>;
  sel: string | null;
  setSel: (id: string | null) => void;
  openEvent: (ev: Ev, x: number, y: number, span?: Span | null) => void;
  openSlot: (day: number, hour: number, x: number, y: number, allDay?: boolean) => void;
  onSchedule: (t: Task, day: number, hour: number | null) => void;
}) {
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';
  const { phone } = useLayout();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; day: number; hour: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; end: number } | null>(null);
  /** A whole run being dragged, as an offset in days and hours from where it is. */
  /** Which *one* day of a run is being dragged, and by how much. */
  const [spanDrag, setSpanDrag] = useState<
    { key: string; id: string; fromDay: number; day: number; hour: number } | null>(null);
  const [taskDrag, setTaskDrag] = useState<{ task: Task; day: number; hour: number | null } | null>(null);

  const hours = Array.from({ length: SPAN + 1 }, (_, i) => GRID_START + i);

  /**
   * Park the scroll on the morning, once. Opening a full-day grid at midnight
   * shows eight empty hours and hides the working day; every calendar that
   * covers 24 hours does this.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const parked = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || parked.current) return;
    parked.current = true;
    el.scrollTop = Math.max(0, ((parkHour - GRID_START) / SPAN) * GRID_H);
  }, [parkHour]);

  /** A drag that scrolls the day past a slot is not a tap on that slot. */
  const slot = useTapGuard();

  const DAYS_SHORT = dayLabels(prefs.weekStart);
  const colOf = (i: number) => (days === 1 ? dayOffset : i);

  /**
   * Which row of a run a pointer at `clientX` is over.
   *
   * The bar covers several columns and each is a separate event. Every path
   * that acts on a run — the click, the long press, the drag — has to ask this
   * first, or it acts on `s.ev`, which is always the *first* day. That is the
   * whole bug: clicking Thursday of a Wed–Fri class and pressing delete removed
   * Wednesday.
   */
  const spanHit = (s: Span, clientX: number) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    const colW = (bodyRef.current?.clientWidth ?? 322) / days;
    const col = rect ? Math.floor((clientX - rect.left) / colW) : s.firstDay;
    return s.members.find((m) => m.day === col) ?? s.members[0];
  };

  /** Multi-day runs draw as one bar; their members are skipped per column. */
  const spans = useMemo(() => (days > 1 ? spanRuns(events, ws, days) : []), [events, ws, days]);
  const spanned = useMemo(() => new Set(spans.filter((s) => s.days > 1).flatMap((s) => s.ids)), [spans]);

  const press = (e: React.PointerEvent, ev: Ev, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setSel(ev.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origDay = dayIndex(ev.starts_at, ws);
    const origHour = hoursOf(ev.starts_at);
    const origEnd = hoursOf(ev.ends_at);
    const colW = (bodyRef.current?.clientWidth ?? 322) / days;
    // Locked by the toolbar toggle, or read-only because Google owns it.
    const locked = isReadOnly(ev) || prefs.lockEvents;
    let moved = false;

    const timer = window.setTimeout(() => {
      if (moved) return;
      if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
      openEvent(ev, startX, startY);
    }, K.longPressMs);

    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > K.longPressCancelPx) { moved = true; clearTimeout(timer); }
      if (!moved || locked) return;

      // 30-min step, derived from the real row height so the chip tracks the pointer.
      const steps = Math.round(dy / (GRID_H / SPAN / 2));
      if (mode === 'resize') setResize({ id: ev.id, end: origEnd + steps * 0.5 });
      else {
        const dayStep = days === 1 ? 0 : Math.round(dx / colW);
        setDrag({ id: ev.id, day: Math.max(0, Math.min(6, origDay + dayStep)), hour: origHour + steps * 0.5 });
      }
    };

    const onUp = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (locked) {
        if (moved) toast(isReadOnly(ev) ? 'Synced from Google — edit it there' : 'Events are locked — unlock to move them');
        return;
      }
      // Commit on drop, not per frame.
      setDrag((d) => { if (d && d.id === ev.id) A.moveTo(ev, d.day, d.hour); return null; });
      setResize((r) => { if (r && r.id === ev.id) A.resizeTo(ev, r.end); return null; });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /**
   * The same gesture on a run of days.
   *
   * A class that meets Mon–Fri at 09:00 is five rows drawn as one bar, and the
   * bar used to swallow the pointer without offering anything in return — the
   * one thing on the grid you could look at and not move. It drags by the same
   * rules as a single chip and commits as one patch per member.
   */
  const pressSpan = (e: React.PointerEvent, s: Span) => {
    e.preventDefault();
    e.stopPropagation();

    const colW = (bodyRef.current?.clientWidth ?? 322) / days;

    /**
     * Which day of the run was actually touched.
     *
     * The bar spans several columns and every one of them is a separate row.
     * Acting on `s.ev` — the first day's — is why deleting from the middle of a
     * run deleted Monday, and why dragging it took all five days with it. The
     * pointer's x against the grid says which column, and `members` says which
     * row is in that column.
     */
    const hit = spanHit(s, e.clientX);
    const ev = hit.ev;

    setSel(ev.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origDay = hit.day;
    const origHour = hoursOf(ev.starts_at);
    const origEnd = hoursOf(ev.ends_at);
    const locked = isReadOnly(ev) || prefs.lockEvents;
    let moved = false;

    const timer = window.setTimeout(() => {
      if (moved) return;
      if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
      openEvent(ev, startX, startY, s);
    }, K.longPressMs);

    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > K.longPressCancelPx) { moved = true; clearTimeout(timer); }
      if (!moved || locked) return;
      const steps = Math.round(dy / (GRID_H / SPAN / 2));
      // One day moves, so it may go anywhere in the week — the run's own ends
      // stopped mattering the moment the whole bar stopped moving together.
      const dayStep = Math.max(-origDay, Math.min(days - 1 - origDay, Math.round(dx / colW)));
      setSpanDrag({ key: s.key, id: ev.id, fromDay: origDay, day: dayStep, hour: steps * 0.5 });
    };

    const onUp = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (locked) {
        if (moved) toast(isReadOnly(ev) ? 'Synced from Google — edit it there' : 'Events are locked — unlock to move them');
        return;
      }
      setSpanDrag((d) => {
        if (d && d.key === s.key && (d.day !== 0 || d.hour !== 0)) {
          A.moveTo(ev, origDay + d.day, origHour + d.hour);
        }
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Dragging a task between the tray and a time slot is how it gets a time. */
  const pressTask = (e: React.PointerEvent, t: Task, fromTray: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = () => bodyRef.current?.getBoundingClientRect();
    let moved = false;

    const onMove = (m: PointerEvent) => {
      moved = true;
      const r = rect();
      if (!r) return;
      const inside = m.clientY > r.top && m.clientY < r.bottom;
      const day = days === 1 ? dayOffset : Math.max(0, Math.min(days - 1, Math.floor(((m.clientX - r.left) / r.width) * days)));
      const hour = inside
        ? Math.round(((GRID_START + ((m.clientY - r.top) / r.height) * SPAN) * 2)) / 2
        : null;
      setTaskDrag({ task: t, day, hour });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTaskDrag((d) => {
        if (d && moved) onSchedule(d.task, d.day, d.hour);
        else if (!moved) TA.complete.mutate({ id: t.id, done: !t.done });
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    void fromTray;
  };

  const trayTasks = (col: number) =>
    tasks.filter((t) => !t.due_at && dayIndex(`${t.due_on}T12:00:00`, ws) === col);
  const slotTasks = (col: number) =>
    tasks.filter((t) => t.due_at && dayIndex(t.due_at, ws) === col);

  return (
    // Header row and all-day strip stay put; only the hours scroll. Google
    // Calendar's arrangement, and the only one that works once the grid covers
    // a full day: you must be able to reach 23:00 without losing the date you
    // are looking at.
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--sh)' }}>
      <div style={{ display: 'flex', flex: 'none', position: 'relative' }}>
        <div style={{ width: GUTTER, flex: 'none', borderBottom: '1px solid var(--line)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
        {/* day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days}, 1fr)`, height: 30, borderBottom: '1px solid var(--line)' }}>
          {Array.from({ length: days }, (_, i) => {
            const idx = colOf(i);
            const d = new Date(ws);
            d.setDate(d.getDate() + idx);
            const today = d.toDateString() === new Date().toDateString();
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: today ? SECHUE.calendar : 'var(--tx3)' }}>
                {DAYS_SHORT[idx]} <span style={{ opacity: .7 }}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* all-day strip: whole-day events plus every undated task for that day */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--line2)', minHeight: 34 }}>
          <div aria-hidden style={{
            position: 'absolute', left: 0, width: GUTTER, marginTop: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--tx3)', textAlign: 'right', paddingRight: 8, pointerEvents: 'none',
          }}>
            All-day
          </div>
          {Array.from({ length: days }, (_, i) => {
            const idx = colOf(i);
            const allDay = events.filter((e) => e.all_day && dayIndex(e.starts_at, ws) === idx);
            const untimed = trayTasks(idx);
            const dropping = taskDrag?.hour === null && taskDrag.day === idx;
            return (
              <div key={i} style={{
                flex: 1, minWidth: 0, padding: '4px 3px',
                borderRight: i < days - 1 ? '1px solid var(--line)' : undefined,
                background: dropping ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : undefined,
                transition: 'background .2s',
              }}>
                {allDay.map((e) => (
                  <div key={e.id} onPointerDown={(p) => press(p, e, 'move')} style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, marginBottom: 2, cursor: 'grab',
                    background: `color-mix(in srgb, ${e.color} 26%, var(--card))`, color: 'var(--tx)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{e.title}</div>
                ))}

                {untimed.map((t) => (
                  <TaskChip key={t.id} task={t} onPointerDown={(p) => pressTask(p, t, true)} compact />
                ))}

                <button onPointerDown={slot.press} onClick={(p) => { if (slot.tapped(p)) openSlot(idx, GRID_START, p.clientX, p.clientY, true); }} className="hov"
                  title="Add an all-day item" aria-label="Add an all-day item"
                  style={{ display: 'block', width: '100%', minHeight: 16, fontSize: 9.5, color: 'var(--tx3)', textAlign: 'left', padding: '2px 4px' }}>
                  {allDay.length + untimed.length === 0 ? '+ task or all-day item' : ''}
                </button>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* the scrolling day */}
      <div ref={scroller} className="navsb" style={{ display: 'flex', overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 }}>
        {/* Hour axis. Labels sit ON their rule, centred — except the first and
            last, which would then hang half outside the column and be clipped:
            12 AM was simply missing, and midnight at the bottom was sheared in
            half. Those two align to the inside edge instead. */}
        <div style={{ width: GUTTER, flex: 'none', position: 'relative', height: GRID_H }}>
          {hours.map((h, i) => {
            const first = i === 0;
            const last = i === hours.length - 1;
            return (
            <div key={h} style={{
              position: 'absolute', right: 8, top: `${(i / SPAN) * 100}%`,
              transform: first ? 'none' : last ? 'translateY(-100%)' : 'translateY(-50%)',
              fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            }}>
              {hhmm(h)}
            </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={bodyRef} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${days}, 1fr)`, height: GRID_H }}>
          {hours.map((h, i) => (
            <div key={`r${h}`} aria-hidden style={{
              position: 'absolute', left: 0, right: 0, top: `${(i / SPAN) * 100}%`,
              height: 1, background: 'var(--line)', pointerEvents: 'none',
            }} />
          ))}

          <NowLine ws={ws} days={days} dayOffset={dayOffset} />

          {Array.from({ length: days }, (_, i) => {
            const idx = colOf(i);
            return (
              <div key={i} style={{ position: 'relative', borderRight: i < days - 1 ? '1px solid var(--line)' : undefined }}>
                {hours.slice(0, -1).map((h, hi) => (
                  <button
                    key={h}
                    // Clicking used to create "New event" on the spot and leave
                    // you to find and rename it. It now opens a bubble that
                    // asks what the thing is, which is the only question worth
                    // asking at that moment.
                    onPointerDown={slot.press}
                    onClick={(p) => { if (slot.tapped(p)) openSlot(idx, h, p.clientX, p.clientY); }}
                    className="hov"
                    aria-label={`Add event at ${hhmm(h)}`}
                    style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `${(hi / SPAN) * 100}%`, height: `${(1 / SPAN) * 100}%`,
                    }}
                  />
                ))}

                {events
                  .filter((e) => !e.all_day && !spanned.has(e.id)
                    && (dayIndex(e.starts_at, ws) === idx || (drag?.id === e.id && drag.day === idx)))
                  .map((e) => {
                    const isDrag = drag?.id === e.id;
                    const isResize = resize?.id === e.id;
                    if (isDrag && drag.day !== idx) return null;
                    const start = isDrag ? drag.hour : hoursOf(e.starts_at);
                    const end = isResize ? resize.end : isDrag ? drag.hour + (hoursOf(e.ends_at) - hoursOf(e.starts_at)) : hoursOf(e.ends_at);
                    return (
                      <EventChip key={e.id} ev={e} top={pct(start)} height={Math.max((0.5 / SPAN) * 100, pct(end) - pct(start))}
                        label={`${hhmm(start)} – ${hhmm(end)}`} lifted={isDrag || isResize} selected={sel === e.id}
                        onPointerDown={(p) => press(p, e, 'move')}
                        onResize={(p) => press(p, e, 'resize')}
                        dark={dark}
                        onOpen={(p) => openEvent(e, p.clientX, p.clientY)} />
                    );
                  })}

                {/* Tasks with a time render dashed, so they read as a deadline
                    rather than a booking — the same distinction the design makes. */}
                {slotTasks(idx).map((t) => {
                  const h = hoursOf(t.due_at!);
                  const ghost = taskDrag?.task.id === t.id;
                  return (
                    <TaskChip key={t.id} task={t}
                      onPointerDown={(p) => pressTask(p, t, false)}
                      style={{
                        position: 'absolute', left: 3, right: 3, top: `${pct(h)}%`, height: `${(1.5 / SPAN) * 100}%`,
                        opacity: ghost ? 0.4 : 1,
                      }} />
                  );
                })}

                {taskDrag && taskDrag.hour !== null && taskDrag.day === idx && (
                  <div aria-hidden style={{
                    position: 'absolute', left: 3, right: 3, top: `${pct(taskDrag.hour)}%`, height: `${(1.5 / SPAN) * 100}%`,
                    borderRadius: 8, border: '2px dashed var(--acc)',
                    background: 'color-mix(in srgb, var(--acc) 14%, transparent)',
                    display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accTx)',
                  }}>
                    {hhmm(taskDrag.hour)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Multi-day runs, drawn over the columns. The layer ignores the
              pointer so clicking an empty slot underneath still creates. */}
          <div aria-hidden={false} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {spans.filter((s) => s.days > 1).map((s) => (
              <SpanChip key={s.key} span={s} days={days} dark={dark}
                offset={spanDrag?.key === s.key ? spanDrag : null}
                onPointerDown={(p) => pressSpan(p, s)}
                onOpen={(x, y) => openEvent(spanHit(s, x).ev, x, y, s)} />
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function EventChip({
  ev, top, height, label, lifted, selected, dark, onPointerDown, onResize, onOpen,
}: {
  ev: Ev; top: number; height: number; label: string; lifted: boolean; selected: boolean;
  dark: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  onOpen: (e: React.MouseEvent) => void;
}) {
  const locked = isReadOnly(ev);
  const ink = chipInk(ev, dark);
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onOpen(e); }}
      className={selected ? 'pop' : undefined}
      style={{
        position: 'absolute', left: 3, right: 'max(16px, 5%)', top: `${top}%`, height: `${height}%`,
        borderRadius: 8, padding: '4px 7px', overflow: 'hidden',
        background: `color-mix(in srgb, ${ev.color} 26%, var(--card))`,
        borderLeft: `2px solid ${ev.color}`,
        color: ink,
        boxShadow: lifted ? 'var(--shl)' : undefined,
        transform: lifted ? 'scale(1.02)' : undefined,
        cursor: locked ? 'default' : 'grab', touchAction: 'none', zIndex: lifted ? 5 : 1,
        outline: selected ? `1px solid ${ev.color}` : undefined,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden' }}>
        {locked && <Icon name="lock" size={9} color={ink} />}
        {ev.title}
      </span>
      <span style={{ display: 'block', fontSize: 9.5, opacity: 0.72, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {label} {ev.location}
      </span>
      {/* bottom edge resizes the end time in 30-min steps */}
      {!locked && (
        <div onPointerDown={onResize}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, cursor: 'ns-resize', touchAction: 'none' }} />
      )}
    </div>
  );
}

/** The horizontal bar Google draws for a run of identical days. */
function SpanChip({ span: s, days, offset, dark, onPointerDown, onOpen }: {
  span: Span; days: number;
  dark: boolean;
  offset: { day: number; fromDay: number; hour: number } | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpen: (x: number, y: number) => void;
}) {
  const lifted = !!offset;
  const shift = offset?.hour ?? 0;
  const start = hoursOf(s.ev.starts_at) + shift;
  const end = hoursOf(s.ev.ends_at) + shift;
  /**
   * Picking one day out of the run.
   *
   * The bar used to slide bodily — five days moving because you grabbed one of
   * them. Now the moment a drag starts it shrinks to the single column you took
   * hold of and follows the pointer, which is both what happens on drop and the
   * only honest picture of it. Let go and the run redraws itself around what is
   * left, because `spanRuns` is a grouping pass over the rows, not a record.
   */
  const firstDay = lifted ? offset!.fromDay + offset!.day : s.firstDay;
  const width = lifted ? 1 : s.days;
  const ink = chipInk(s.ev, dark);
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => onOpen(e.clientX, e.clientY)}
      onContextMenu={(e) => { e.preventDefault(); onOpen(e.clientX, e.clientY); }}
      style={{
        position: 'absolute',
        left: `calc(${(firstDay / days) * 100}% + 3px)`,
        width: `calc(${(width / days) * 100}% - 20px)`,
        top: `${pct(start)}%`, height: `${Math.max((0.5 / SPAN) * 100, pct(end) - pct(start))}%`,
        borderRadius: 8, padding: '4px 9px', overflow: 'hidden', pointerEvents: 'auto',
        background: `color-mix(in srgb, ${s.ev.color} 26%, var(--card))`,
        borderLeft: `2px solid ${s.ev.color}`,
        color: ink,
        boxShadow: lifted ? 'var(--shl)' : 'inset 0 0 0 1px color-mix(in srgb, ' + s.ev.color + ' 30%, transparent)',
        transform: lifted ? 'scale(1.01)' : undefined,
        zIndex: lifted ? 5 : 2, cursor: isReadOnly(s.ev) ? 'default' : 'grab', touchAction: 'none',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, lineHeight: 1.25 }}>
        {s.ev.title}
        {!lifted && (
          <span style={{
            marginLeft: 'auto', flex: 'none', padding: '1px 7px', borderRadius: 999,
            background: `color-mix(in srgb, ${s.ev.color} 42%, var(--card))`,
            fontSize: 9, fontWeight: 800,
          }}>
            {s.days} days
          </span>
        )}
      </span>
      <span style={{ display: 'block', fontSize: 9.5, opacity: 0.72, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {hhmm(start)}–{hhmm(end)} · {s.ev.location}
      </span>
    </div>
  );
}

function TaskChip({ task, onPointerDown, style, compact }: {
  task: Task; onPointerDown: (e: React.PointerEvent) => void; style?: React.CSSProperties; compact?: boolean;
}) {
  const hue = task.priority === 'high' ? 'var(--pal-coral)' : task.priority === 'med' ? 'var(--pal-amber)' : 'var(--acc)';
  return (
    <div onPointerDown={onPointerDown} title={`${task.title} — drag to a time slot`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'grab', touchAction: 'none',
        borderRadius: 8, padding: compact ? '2px 6px' : '4px 8px', marginBottom: compact ? 2 : 0,
        border: `1.5px dashed color-mix(in srgb, ${hue} 62%, transparent)`,
        background: `color-mix(in srgb, ${hue} 12%, var(--card))`,
        fontSize: compact ? 10 : 10.5, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap',
        ...style,
      }}>
      <span style={{ width: 9, height: 9, flex: 'none', borderRadius: '50%', border: `1.5px solid ${hue}` }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</span>
    </div>
  );
}

/** The "you are here" rule. Only drawn when today is one of the visible columns. */
function NowLine({ ws, days, dayOffset }: { ws: Date; days: number; dayOffset: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const col = dayIndex(now.toISOString(), ws);
  const hour = now.getHours() + now.getMinutes() / 60;
  const visible = days === 1 ? col === dayOffset : col >= 0 && col < days;
  if (!visible || hour < GRID_START || hour > GRID_END) return null;

  const left = days === 1 ? 0 : (col / days) * 100;
  const width = days === 1 ? 100 : (1 / days) * 100;

  return (
    <div aria-hidden style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: `${pct(hour)}%`, zIndex: 6, pointerEvents: 'none' }}>
      <div style={{ height: 2, background: 'var(--pal-coral)', boxShadow: '0 0 8px color-mix(in srgb, var(--pal-coral) 60%, transparent)' }} />
      <div style={{ position: 'absolute', left: -3, top: -3, width: 8, height: 8, borderRadius: 4, background: 'var(--pal-coral)' }} />
    </div>
  );
}
