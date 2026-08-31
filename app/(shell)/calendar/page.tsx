'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { CalendarSkeleton } from '@/components/Skeleton';
import { ScheduleImport } from '@/components/ScheduleImport';
import { CalPopover, PopoverActions } from '@/components/CalPopover';
import { K, SECHUE } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { useTasks, useTaskActions, getTaskAlert, formatTaskCountdown, type Task } from '@/lib/tasks';
import {
  useEvents, useEventActions, weekStart, hoursOf, dayIndex, hhmm, at, spanRuns, dayLabels, chipInk,
  isReadOnly, liveEventIds, GRID_START, GRID_END, formatEventCountdown, layoutOverlappingEvents, type Ev, type Span,
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

type View = 'month' | 'week' | 'day' | 'agenda' | 'countdown';

const VIEW_ICON: Record<View, IconName> = {
  month: 'month', week: 'week', day: 'day', agenda: 'agenda', countdown: 'clock',
};

export default function CalendarPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [ws, setWs] = useState(() => weekStart(new Date(), prefs.weekStart));
  const [focusDay, setFocusDay] = useState(() => dayIndex(new Date().toISOString(), weekStart(new Date(), prefs.weekStart)));
  const [sel, setSel] = useState<string | null>(null);
  /**
   * One bubble at a time: `event` when you click something, `slot` when you
   * click empty space. Both carry the click point so the bubble opens there.
   */
  const [pop, setPop] = useState<
    | { kind: 'event'; ev: Ev; span?: Span | null; x: number; y: number }
    | { kind: 'task'; task: Task; x: number; y: number }
    | { kind: 'slot'; day: number; hour: number; endHour?: number; allDay: boolean; initialTab?: 'event' | 'task'; x: number; y: number }
    | null>(null);
  const [edit, setEdit] = useState<Ev | null>(null);

  // Week is the desktop default, Day the phone-portrait default.
  const [view, setView] = useState<View>(prefs.calView);
  const [importing, setImporting] = useState(false);
  useEffect(() => { if (phone && prefs.calView === 'week') setView('day'); }, [phone, prefs.calView]);

  // Month needs six weeks of events, not one — the window follows the view.
  const windowDays = view === 'month' ? 42 : 7;
  const windowStart = useMemo(() => {
    if (view !== 'month') return ws;
    const first = new Date(ws.getFullYear(), ws.getMonth(), 1);
    return weekStart(first, prefs.weekStart);
  }, [view, ws, prefs.weekStart]);

  const { data: events = [], isPending } = useEvents(windowStart, windowDays);
  const { data: tasks = [] } = useTasks();
  const A = useEventActions(ws);
  const TA = useTaskActions();

  const setCalView = useCallback((v: View) => {
    setView(v);
    void update({ calView: v });
  }, [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/input|textarea/i.test((e.target as HTMLElement)?.tagName ?? '')) return;
      if (e.key === 'ArrowLeft') shift(-1);
      if (e.key === 'ArrowRight') shift(1);
      // "T" is owned by Shell's global Quick Create Task shortcut. This
      // listener (child) mounts before Shell's (parent), so it always runs
      // first — checking e.defaultPrevented here would never see Shell's
      // preventDefault in time, and a bare binding fired both actions at once.
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (pop && pop.kind === 'event') {
          e.preventDefault();
          A.removeWithUndo(pop.ev);
          setPop(null);
          setSel(null);
        } else if (sel) {
          const targetEv = events.find((ev) => ev.id === sel);
          if (targetEv) {
            e.preventDefault();
            A.removeWithUndo(targetEv);
            setSel(null);
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ------------------------------------------------------------ paging */

  /** Prev/next moves by whatever the view actually shows. */
  const shift = (dir: number) => {
    const n = new Date(ws);
    if (view === 'month') n.setMonth(n.getMonth() + dir);
    else if (view === 'day') n.setDate(n.getDate() + dir);
    else n.setDate(n.getDate() + dir * 7);
    if (view === 'day') {
      // Day paging walks days, so recompute both the week and the focused column.
      setWs(weekStart(n, prefs.weekStart));
      setFocusDay(dayIndex(n.toISOString(), weekStart(n, prefs.weekStart)));
    } else {
      setWs(view === 'month' ? weekStart(new Date(n.getFullYear(), n.getMonth(), 1), prefs.weekStart) : n);
    }
  };

  const goToday = () => {
    const today = new Date();
    const w = weekStart(today, prefs.weekStart);
    setWs(w);
    setFocusDay(dayIndex(today.toISOString(), w));
  };

  const heading = view === 'month'
    ? ws.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : view === 'day'
      ? new Date(at(ws, focusDay, 12)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(at(ws, 6, 12)).toLocaleDateString(undefined, { day: 'numeric' })}`;

  /* Tasks that belong on this calendar: anything dated inside the window. */
  const windowTasks = useMemo(() => {
    const from = windowStart.getTime();
    const to = from + windowDays * 86_400_000;
    return tasks.filter((t) => {
      if (t.done || !t.due_on) return false;
      const d = new Date(`${t.due_on}T00:00:00`).getTime();
      return d >= from && d < to;
    });
  }, [tasks, windowStart, windowDays]);

  const schedule = (t: Task, day: number, hour: number | null) => {
    const date = new Date(at(ws, day, hour ?? 9));
    const due_on = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // due_on always follows, because the Tasks page groups by it — letting the
    // two drift is how a task ends up in Tuesday's list and Wednesday's grid.
    TA.update.mutate({ id: t.id, patch: { due_at: hour === null ? null : date.toISOString(), due_on } });
    toast(hour === null ? `${t.title} — no set time` : `${t.title} at ${hhmm(hour)}`);
  };

  /**
   * Empty the calendar, behind three doors.
   *
   * This is the one control on the screen that can undo a whole term of
   * imports, so it asks three times and the last one wants the word typed —
   * a fat thumb cannot get through that, and a person who means it barely
   * notices. It is still a soft delete with an Undo in the toast.
   */
  const clearEverything = async () => {
    const ids = await liveEventIds().catch(() => null);
    if (!ids) { toast('Could not read your calendar'); return; }
    if (!ids.length) { toast('Nothing to clear'); return; }

    const first = await confirmAsk(`Clear all ${ids.length} event${ids.length === 1 ? '' : 's'}?`, {
      message: 'Everything on your calendar, in every week — not only what is on screen.',
      confirmLabel: 'Continue', danger: true,
    });
    if (!first) return;

    const second = await confirmAsk('Are you sure?', {
      message: 'Imported classes, things you typed in, all of it. Undo is offered once, in the toast that follows.',
      confirmLabel: 'Yes, clear them', danger: true,
    });
    if (!second) return;

    const typed = await ask('Last check', {
      message: 'Type CLEAR to empty the calendar.', placeholder: 'CLEAR', confirmLabel: 'Clear everything',
    });
    if ((typed ?? '').trim().toUpperCase() !== 'CLEAR') { toast('Left as it was'); return; }

    A.wipe(ids);
  };

  /**
   * `span` is passed when the press landed on a multi-day bar, so the bubble
   * can offer "all N days" alongside the single day you actually clicked.
   * Without it, the only delete on offer acted on the first day of the run —
   * which is never the one you meant when you clicked the middle.
   */
  const openEvent = (ev: Ev, x: number, y: number, span?: Span | null) =>
    setPop({ kind: 'event', ev, x, y, span: span ?? null });
  const openTask = (task: Task, x: number, y: number) =>
    setPop({ kind: 'task', task, x, y });
  const openSlot = (day: number, hour: number, x: number, y: number, allDay = false, endHour?: number, initialTab: 'event' | 'task' = 'event') => {
    if (initialTab === 'task') {
      const dueDate = new Date(ws);
      dueDate.setDate(dueDate.getDate() + day);
      const dueOn = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
      const dueAt = allDay ? null : at(ws, day, hour);
      const newTaskId = crypto.randomUUID();
      const newTask: Task = {
        id: newTaskId,
        title: '(No title)',
        notes: '',
        due_on: dueOn,
        due_at: dueAt,
        priority: null,
        stars: 0,
        position: 0,
        done: false,
        list_id: null,
        deleted_at: null,
      };
      TA.create.mutate(newTask);
      setPop({ kind: 'task', task: newTask, x, y });
      return;
    }

    // Immediately add the (No title) event first, then let the user edit it after
    const newId = A.addAt(day, hour, prefs.accent, allDay, '(No title)', endHour);
    const eH = allDay ? 23.98 : (endHour !== undefined ? endHour : hour + 1);
    const createdEv: Ev = {
      id: newId,
      title: '(No title)',
      starts_at: at(ws, day, allDay ? 0 : hour),
      ends_at: at(ws, day, eH),
      all_day: allDay,
      color: prefs.accent,
      location: '',
      remind_minutes: 10,
      snoozed_until: null,
      deleted_at: null,
    };
    setPop({ kind: 'event', ev: createdEv, x, y });
  };

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && Math.abs(deltaX) > 40 && elapsed < 600) {
      if (deltaX < 0) {
        shift(1);
      } else {
        shift(-1);
      }
    }
  };

  const showHeading = !phone || view === 'month' || view === 'agenda';
  const showPager = !phone || view !== 'day';

  return (
    <div style={{
      padding: phone ? '6px 12px 12px' : '18px 22px 20px',
      height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: phone ? 9 : 16, flexWrap: 'wrap', flex: 'none' }}>
        {showHeading && (
          <h1 style={{ fontSize: phone ? 17 : 24, fontWeight: 800, letterSpacing: '-.028em' }}>{heading}</h1>
        )}

        <div style={{ marginLeft: showHeading ? 'auto' : 0, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', width: showHeading ? undefined : '100%' }}>
          {showPager && (
            <>
              <button onClick={() => shift(-1)} className="hov k-squish" aria-label={`Previous ${view}`}
                style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34 }}>
                <Icon name="back" size={15} color="var(--tx2)" />
              </button>
              <button onClick={goToday} className="hov k-squish"
                style={{ padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 34 }}>
                Today
              </button>
              <button onClick={() => shift(1)} className="hov k-squish" aria-label={`Next ${view}`}
                style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34, transform: 'rotate(180deg)' }}>
                <Icon name="back" size={15} color="var(--tx2)" />
              </button>
              {!phone && <div style={{ width: 1, height: 20, background: 'var(--line2)', margin: '0 5px' }} />}
            </>
          )}

          {/* Lock pins every event where it is — useful once a timetable is set
              and you are only reading it, especially on a phone where a scroll
              can be read as a drag. */}
          <button
            onClick={() => { void update({ lockEvents: !prefs.lockEvents }); toast(prefs.lockEvents ? 'Events unlocked' : 'Events locked in place'); }}
            className="hov k-squish" aria-pressed={prefs.lockEvents}
            title={prefs.lockEvents ? 'Events are locked — tap to allow dragging' : 'Lock events in place'}
            aria-label={prefs.lockEvents ? 'Unlock events' : 'Lock events in place'}
            style={{
              marginLeft: showPager ? 0 : 'auto',
              width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
              border: `1px solid ${prefs.lockEvents ? 'var(--acc)' : 'var(--line2)'}`,
              background: prefs.lockEvents ? 'color-mix(in srgb, var(--acc) 18%, transparent)' : 'transparent',
            }}>
            <Icon name="lock" size={15} color={prefs.lockEvents ? 'var(--accTx)' : 'var(--tx3)'} />
          </button>

          {/* A timetable arrives as a photograph far more often than as a
              calendar file. This reads one and shows you what it read. */}
          <button onClick={() => setImporting(true)} className="hov k-squish"
            title="Read a schedule from a photo" aria-label="Import a schedule from a photo"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: phone ? 0 : '0 11px',
              width: phone ? 34 : undefined, justifyContent: 'center',
              borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
            }}>
            <Icon name="spark" size={15} color="var(--tx3)" />
            {!phone && 'Import'}
          </button>

          <button onClick={() => void clearEverything()} className="hov k-squish"
            title="Clear every event" aria-label="Clear every event"
            style={{
              width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
              border: '1px solid var(--line2)',
            }}>
            <Icon name="trash" size={15} color="var(--pal-coral)" />
          </button>

          <div data-tour="calendar-view-toggle" className="k-pillrail" style={{ position: 'relative', display: 'flex', gap: 2, padding: 3, borderRadius: 11, background: 'var(--card)', marginLeft: 'auto' }}>
            {(['month', 'week', 'day', 'agenda', 'countdown'] as View[]).map((v) => (
              <button key={v} onClick={() => setCalView(v)} className="k-chip"
                aria-pressed={view === v} aria-label={v[0].toUpperCase() + v.slice(1)} title={v[0].toUpperCase() + v.slice(1)}
                style={{
                  width: phone ? 30 : 34, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
                  background: view === v ? 'var(--acc)' : 'transparent',
                }}>
                <Icon name={VIEW_ICON[v]} size={15} color={view === v ? 'var(--ink)' : 'var(--tx3)'} />
              </button>
            ))}
          </div>
        </div>
      </header>

      {importing && <ScheduleImport onClose={() => setImporting(false)} />}

      <div
        data-tour="calendar-grid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', touchAction: 'pan-y' }}
      >
        <div key={view} className="k-zoomfade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* The chrome above is not data-dependent and paints immediately;
              only the grid waits, so only the grid is outlined. */}
          {isPending && (
            <div style={{ padding: phone ? '0 14px 14px' : '0 22px 16px' }}>
              <CalendarSkeleton days={view === 'day' ? 1 : 7} />
            </div>
          )}
          {!isPending && view === 'week' && (
            <Grid days={7} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA} nowMs={nowMs}
              sel={sel} setSel={setSel} openEvent={openEvent} openTask={openTask} openSlot={openSlot} onSchedule={schedule} />
          )}
          {!isPending && view === 'day' && (
            <>
              <DayStrip ws={ws} focus={focusDay} onPick={setFocusDay} onJump={(w, d) => { setWs(w); setFocusDay(d); }} />
              <Grid days={1} dayOffset={focusDay} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA} nowMs={nowMs}
                sel={sel} setSel={setSel} openEvent={openEvent} openTask={openTask} openSlot={openSlot} onSchedule={schedule} />
            </>
          )}
          {!isPending && view === 'month' && (
            <Month ws={windowStart} month={ws.getMonth()} events={events} tasks={windowTasks} nowMs={nowMs}
              onPickDay={(date) => {
                // Open the week that actually contains the clicked date. The
                // old version reused the current week and only moved the
                // column, so clicking the 25th showed a day in this week.
                const w = weekStart(date, prefs.weekStart);
                setWs(w);
                setFocusDay(dayIndex(date.toISOString(), w));
                setCalView('day');
              }} />
          )}
          {!isPending && view === 'agenda' && <Agenda ws={ws} events={events} tasks={windowTasks} nowMs={nowMs} />}
          {!isPending && view === 'countdown' && <Countdown events={events} A={A} />}
        </div>
      </div>

      {pop?.kind === 'event' && (
        <EventPopover ev={pop.ev} x={pop.x} y={pop.y} nowMs={nowMs}
          runDays={pop.span && pop.span.days > 1 ? pop.span.days : 0}
          onClose={() => setPop(null)}
          onEdit={() => { setEdit(pop.ev); setPop(null); }}
          onDuplicate={() => { A.duplicate(pop.ev); setPop(null); }}
          onDelete={() => { A.removeWithUndo(pop.ev); setPop(null); }}
          onDeleteRun={() => {
            const run = pop.span;
            if (!run) return;
            A.wipeRun(events.filter((e) => run.ids.includes(e.id)));
            setPop(null);
          }}
          onUpdateTitle={(title) => {
            A.update.mutate({ id: pop.ev.id, patch: { title } });
            setPop((prev) => prev && prev.kind === 'event' ? { ...prev, ev: { ...prev.ev, title } } : prev);
          }}
        />
      )}

      {pop?.kind === 'task' && (
        <TaskPopover
          task={pop.task}
          x={pop.x}
          y={pop.y}
          onClose={() => setPop(null)}
          onComplete={() => {
            TA.complete.mutate({ id: pop.task.id, done: !pop.task.done });
            setPop(null);
          }}
          onDelete={() => {
            TA.removeWithUndo(pop.task);
            setPop(null);
          }}
          onUpdateTitle={(title) => {
            TA.update.mutate({ id: pop.task.id, patch: { title } });
            setPop((prev) => prev && prev.kind === 'task' ? { ...prev, task: { ...prev.task, title } } : prev);
          }}
        />
      )}

      {pop?.kind === 'slot' && (
        <QuickCreate
          x={pop.x} y={pop.y} ws={ws} day={pop.day} hour={pop.hour} endHour={pop.endHour} allDay={pop.allDay}
          initialTab={pop.initialTab || 'event'}
          accent={prefs.accent}
          onClose={() => setPop(null)}
          onCreateTask={(title, notes) => {
            const dueDate = new Date(ws);
            dueDate.setDate(dueDate.getDate() + pop.day);
            const dueOn = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
            const dueAt = pop.allDay ? null : at(ws, pop.day, pop.hour);
            TA.create.mutate({
              id: crypto.randomUUID(),
              title: title.trim() || '(No title)',
              notes: notes || '',
              due_on: dueOn,
              due_at: dueAt,
              priority: null,
            });
            setPop(null);
          }}
          onCreate={(title, loc, desc, sName) => {
            const id = crypto.randomUUID();
            const eH = pop.allDay ? 23.98 : (pop.endHour !== undefined ? pop.endHour : pop.hour + 1);
            A.create.mutate({
              id,
              title: title.trim() || (pop.allDay ? 'All-day item' : '(No title)'),
              short_name: sName?.trim() || undefined,
              starts_at: at(ws, pop.day, pop.allDay ? 0 : pop.hour),
              ends_at: at(ws, pop.day, eH),
              all_day: pop.allDay,
              color: prefs.accent,
            });
            toast(pop.allDay ? 'New all-day item' : `New event: ${hhmm(pop.hour)} – ${hhmm(eH)}`);
            setPop(null);
          }}
          onMoreOptions={(title, sName) => {
            const startIso = at(ws, pop.day, pop.allDay ? 0 : pop.hour);
            const endIso = at(ws, pop.day, pop.allDay ? 23.98 : (pop.endHour ?? pop.hour + 1));
            const draftEv: Ev = {
              id: crypto.randomUUID(),
              title: title?.trim() || '(No title)',
              short_name: sName?.trim() || undefined,
              starts_at: startIso,
              ends_at: endIso,
              color: prefs.accent,
              location: '',
              all_day: pop.allDay,
              remind_minutes: 10,
              snoozed_until: null,
              deleted_at: null,
            };
            setEdit(draftEv);
            setPop(null);
          }}
        />
      )}

      {edit && (
        <EditSheet
          ev={edit}
          onClose={() => setEdit(null)}
          onSave={(patch) => {
            const exists = events.some((e) => e.id === edit.id);
            if (exists) {
              A.update.mutate({ id: edit.id, patch });
            } else {
              A.create.mutate({
                id: edit.id,
                title: patch.title || '(No title)',
                short_name: patch.short_name,
                starts_at: patch.starts_at || edit.starts_at,
                ends_at: patch.ends_at || edit.ends_at,
                color: patch.color || edit.color,
                all_day: patch.all_day ?? edit.all_day,
              });
            }
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- week/day */

function Grid({
  days, dayOffset = 0, ws, events, tasks, A, TA, sel, setSel, openEvent, openTask, openSlot, onSchedule, nowMs = Date.now(),
}: {
  days: number;
  dayOffset?: number;
  ws: Date;
  events: Ev[];
  tasks: Task[];
  A: ReturnType<typeof useEventActions>;
  TA: ReturnType<typeof useTaskActions>;
  sel: string | null;
  setSel: (id: string | null) => void;
  openEvent: (ev: Ev, x: number, y: number, span?: Span | null) => void;
  openTask: (task: Task, x: number, y: number) => void;
  openSlot: (day: number, hour: number, x: number, y: number, allDay?: boolean, endHour?: number, initialTab?: 'event' | 'task') => void;
  onSchedule: (t: Task, day: number, hour: number | null) => void;
  nowMs?: number;
}) {
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';
  const { phone } = useLayout();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; day: number; hour: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; end: number } | null>(null);
  /** Google Calendar style Drag-to-Create automatic event slot */
  const [slotDrag, setSlotDrag] = useState<{
    day: number;
    startHour: number;
    currentHour: number;
    startX: number;
    startY: number;
  } | null>(null);
  /** A whole run being dragged, as an offset in days and hours from where it is. */
  /** Which *one* day of a run is being dragged, and by how much. */
  const [spanDrag, setSpanDrag] = useState<
    { key: string; id: string; fromDay: number; day: number; hour: number } | null>(null);
  const [taskDrag, setTaskDrag] = useState<{ task: Task; day: number; hour: number | null } | null>(null);

  const hours = Array.from({ length: SPAN + 1 }, (_, i) => GRID_START + i);

  const onSlotPointerDown = (e: React.PointerEvent, day: number, rawStartHour: number) => {
    if (phone || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const snapHour = Math.floor(rawStartHour * 2) / 2;

    setSlotDrag({
      day,
      startHour: snapHour,
      currentHour: snapHour + 1,
      startX,
      startY,
    });

    const onMove = (m: PointerEvent) => {
      const rawH = GRID_START + ((m.clientY - rect.top) / rect.height) * SPAN;
      const snappedH = Math.max(GRID_START, Math.min(GRID_END, Math.round(rawH * 2) / 2));
      setSlotDrag((prev) => (prev ? { ...prev, currentHour: snappedH } : null));
    };

    const onUp = (m: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      setSlotDrag((curr) => {
        if (!curr) return null;
        const s = Math.min(curr.startHour, curr.currentHour);
        const rawE = Math.max(curr.startHour, curr.currentHour);
        const eHour = (rawE === s || Math.abs(rawE - s) < 0.25) ? s + 1 : Math.max(s + 0.5, rawE);

        openSlot(curr.day, s, m.clientX, m.clientY, false, eHour);
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

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
    el.scrollTop = ((SCROLL_TO_HOUR - GRID_START) / SPAN) * GRID_H;
  }, []);

  const DAYS_SHORT = dayLabels(prefs.weekStart);
  const colOf = (i: number) => (days === 1 ? dayOffset : i);
  const daysSpanned = Math.max(1, Math.min(7, days));
  const dayIndices = Array.from({ length: daysSpanned }, (_, i) => i);
  const dayDates = dayIndices.map((i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + dayOffset + i);
    return d;
  });

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
  const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();

  /**
   * Multi-day runs, drawn as one bar rather than N chips.
   *
   * Only whole days that meet at the same hour count: `spanRuns` handles the
   * grouping, and `spanned` is the set of IDs it took so the single-day pass
   * skips them.
   */
  const spans = useMemo(() => (days > 1 ? spanRuns(events, ws, days) : []), [events, ws, days]);
  const spanned = useMemo(() => new Set(spans.filter((s) => s.days > 1).flatMap((s) => s.ids)), [spans]);

  const spanHit = (s: Span, clientX: number) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 1;
    const col = Math.max(0, Math.min(days - 1, Math.floor(((clientX - (rect?.left ?? 0)) / w) * days)));
    const hitEv = s.members.find((m) => m.day === col)?.ev ?? s.ev;
    return { day: col, ev: hitEv };
  };

  const press = (e: React.PointerEvent, ev: Ev, action: 'move' | 'resize') => {
    const isTouch = phone || e.pointerType === 'touch';
    if (!isTouch) {
      e.preventDefault();
    }
    e.stopPropagation();
    setSel(ev.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const origDay = dayIndex(ev.starts_at, ws);
    const origHour = hoursOf(ev.starts_at);
    const origEnd = hoursOf(ev.ends_at);
    const len = origEnd - origHour;
    const locked = isReadOnly(ev) || prefs.lockEvents;

    let holdTriggered = !isTouch || action === 'resize';
    let moved = false;

    const holdTimer = isTouch && action === 'move'
      ? window.setTimeout(() => {
          if (moved || locked) return;
          holdTriggered = true;
          if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
          setDrag({ id: ev.id, day: origDay, hour: origHour });
        }, 380)
      : null;

    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (isTouch && action === 'move' && !holdTriggered) {
        if (dist > 8) {
          if (holdTimer) clearTimeout(holdTimer);
          moved = true;
        }
        return;
      }

      if (!moved && dist > K.longPressCancelPx) {
        moved = true;
      }

      if (locked) return;

      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect) return;

      const steps = Math.round(dy / (GRID_H / SPAN / 2));

      if (action === 'move') {
        const d = days === 1 ? dayOffset : Math.max(0, Math.min(days - 1, Math.floor(((m.clientX - rect.left) / rect.width) * days)));
        const rawH = origHour + steps * 0.5;
        const h = Math.max(GRID_START, Math.min(GRID_END - len, Math.round(rawH * 2) / 2));
        setDrag({ id: ev.id, day: d, hour: h });
      } else {
        const rawE = origEnd + steps * 0.5;
        const end = Math.max(origHour + 0.5, Math.min(GRID_END, Math.round(rawE * 2) / 2));
        setResize({ id: ev.id, end });
      }
    };

    const onUp = (m: PointerEvent) => {
      if (holdTimer) clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (locked) {
        if (moved) toast(isReadOnly(ev) ? 'Synced from Google — edit it there' : 'Events are locked — unlock to move them');
        return;
      }

      if (isTouch && !holdTriggered) {
        if (Math.hypot(m.clientX - startX, m.clientY - startY) < 10) {
          openEvent(ev, startX, startY);
        }
        return;
      }

      setDrag((d) => {
        if (d && d.id === ev.id && (d.day !== origDay || d.hour !== origHour)) {
          A.moveTo(ev, d.day, d.hour);
        }
        return null;
      });
      setResize((r) => {
        if (r && r.id === ev.id && r.end !== origEnd) {
          A.resizeTo(ev, r.end);
        }
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /**
   * The same gesture on a run of days.
   */
  const pressSpan = (e: React.PointerEvent, s: Span) => {
    const isTouch = phone || e.pointerType === 'touch';
    if (!isTouch) {
      e.preventDefault();
    }
    e.stopPropagation();

    const colW = (bodyRef.current?.clientWidth ?? 322) / days;
    const hit = spanHit(s, e.clientX);
    const ev = hit.ev;

    setSel(ev.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origDay = hit.day;
    const origHour = hoursOf(ev.starts_at);
    const locked = isReadOnly(ev) || prefs.lockEvents;

    let holdTriggered = !isTouch;
    let moved = false;

    const holdTimer = isTouch
      ? window.setTimeout(() => {
          if (moved || locked) return;
          holdTriggered = true;
          if (prefs.haptics) navigator.vibrate?.(K.hapticMs);
          setSpanDrag({ key: s.key, id: ev.id, fromDay: origDay, day: 0, hour: 0 });
        }, 380)
      : null;

    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      const dist = Math.hypot(dx, dy);

      if (isTouch && !holdTriggered) {
        if (dist > 8) {
          if (holdTimer) clearTimeout(holdTimer);
          moved = true;
        }
        return;
      }

      if (!moved && dist > K.longPressCancelPx) {
        moved = true;
      }

      if (locked) return;

      const steps = Math.round(dy / (GRID_H / SPAN / 2));
      const dayStep = Math.max(-origDay, Math.min(days - 1 - origDay, Math.round(dx / colW)));
      setSpanDrag({ key: s.key, id: ev.id, fromDay: origDay, day: dayStep, hour: steps * 0.5 });
    };

    const onUp = (m: PointerEvent) => {
      if (holdTimer) clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (locked) {
        if (moved) toast(isReadOnly(ev) ? 'Synced from Google — edit it there' : 'Events are locked — unlock to move them');
        return;
      }

      if (isTouch && !holdTriggered) {
        if (Math.hypot(m.clientX - startX, m.clientY - startY) < 10) {
          openEvent(ev, startX, startY, s);
        }
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
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - startX, m.clientY - startY) > 5) {
        moved = true;
      }
      const r = rect();
      if (!r || !moved) return;
      const inside = m.clientY > r.top && m.clientY < r.bottom;
      const day = days === 1 ? dayOffset : Math.max(0, Math.min(days - 1, Math.floor(((m.clientX - r.left) / r.width) * days)));
      const hour = inside
        ? Math.round(((GRID_START + ((m.clientY - r.top) / r.height) * SPAN) * 2)) / 2
        : null;
      setTaskDrag({ task: t, day, hour });
    };

    const onUp = (m: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTaskDrag((d) => {
        if (d && moved) onSchedule(d.task, d.day, d.hour);
        else if (!moved) openTask(t, m.clientX, m.clientY);
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

                <button onClick={(p) => openSlot(idx, GRID_START, p.clientX, p.clientY, true, undefined, 'task')} className="hov"
                  title="Add a task or all-day item" aria-label="Add a task or all-day item"
                  style={{ display: 'block', width: '100%', minHeight: 16, fontSize: 9.5, color: 'var(--tx3)', textAlign: 'left', padding: '2px 4px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
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
        {/* Hour axis */}
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
                {/* Google Calendar Drag-to-Create Live Preview Block (Desktop only) */}
                {!phone && slotDrag && slotDrag.day === idx && (() => {
                  const s = Math.min(slotDrag.startHour, slotDrag.currentHour);
                  const rawE = Math.max(slotDrag.startHour, slotDrag.currentHour);
                  const e = (rawE === s || Math.abs(rawE - s) < 0.25) ? s + 1 : Math.max(s + 0.5, rawE);
                  return (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 3,
                        right: 3,
                        top: `${pct(s)}%`,
                        height: `${Math.max((0.5 / SPAN) * 100, pct(e) - pct(s))}%`,
                        borderRadius: 8,
                        padding: '4px 7px',
                        background: 'color-mix(in srgb, var(--acc, #A8C7FA) 35%, var(--card))',
                        border: '1.5px solid var(--acc, #A8C7FA)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                        zIndex: 10,
                        pointerEvents: 'none',
                        color: 'var(--tx)',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        (No title)
                      </span>
                      <span style={{ fontSize: 9.5, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
                        {hhmm(s)} – {hhmm(e)}
                      </span>
                    </div>
                  );
                })()}

                {hours.slice(0, -1).map((h, hi) => (
                  <div
                    key={h}
                    onPointerDown={phone ? undefined : (p) => onSlotPointerDown(p, idx, h)}
                    onClick={phone ? (p) => openSlot(idx, h, p.clientX, p.clientY, false, h + 1) : undefined}
                    className={phone ? '' : 'hov'}
                    aria-label={`Add event at ${hhmm(h)}`}
                    style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `${(hi / SPAN) * 100}%`, height: `${(1 / SPAN) * 100}%`,
                      background: 'transparent', cursor: 'pointer', zIndex: 1,
                    }}
                  />
                ))}

                {/* Events for this day, packed into non-obstructing sub-columns if overlapping */}
                {(() => {
                  const dayColEvents = events
                    .filter((e) => !e.all_day && !spanned.has(e.id)
                      && (dayIndex(e.starts_at, ws) === idx || (drag?.id === e.id && drag.day === idx)))
                    .map((e) => {
                      const isDrag = drag?.id === e.id;
                      const isResize = resize?.id === e.id;
                      const start = isDrag ? drag.hour : hoursOf(e.starts_at);
                      const end = isResize ? resize.end : isDrag ? drag.hour + (hoursOf(e.ends_at) - hoursOf(e.starts_at)) : hoursOf(e.ends_at);
                      return { ev: e, start, end };
                    });

                  const positioned = layoutOverlappingEvents(dayColEvents);

                  return positioned.map((pos) => {
                    const isDrag = drag?.id === pos.ev.id;
                    const isResize = resize?.id === pos.ev.id;
                    if (isDrag && drag.day !== idx) return null;

                    const leftPct = (pos.colIndex / pos.totalCols) * 100;
                    const widthPct = (1 / pos.totalCols) * 100;
                    const leftStyle = pos.totalCols > 1 ? `calc(${leftPct}% + 2px)` : '3px';
                    const widthStyle = pos.totalCols > 1 ? `calc(${widthPct}% - 4px)` : 'calc(100% - 6px)';

                    return (
                      <EventChip key={pos.ev.id} ev={pos.ev} top={pct(pos.start)} height={Math.max((0.5 / SPAN) * 100, pct(pos.end) - pct(pos.start))}
                        left={leftStyle} width={widthStyle}
                        label={hhmm(pos.start)} lifted={isDrag || isResize} selected={sel === pos.ev.id}
                        onPointerDown={(p) => press(p, pos.ev, 'move')}
                        onResize={(p) => press(p, pos.ev, 'resize')}
                        dark={dark}
                        nowMs={nowMs}
                        onOpen={(p) => openEvent(pos.ev, p.clientX, p.clientY)} />
                    );
                  });
                })()}

                {/* Tasks with a time render dashed */}
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

          {/* Multi-day runs */}
          <div aria-hidden={false} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {spans.filter((s) => s.days > 1).map((s) => (
              <SpanChip key={s.key} span={s} days={days} dark={dark}
                nowMs={nowMs}
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
  ev, top, height, left = '3px', width = 'calc(100% - 6px)', label, lifted, selected, dark, nowMs = Date.now(), onPointerDown, onResize, onOpen,
}: {
  ev: Ev; top: number; height: number; left?: string | number; width?: string | number; label: string; lifted: boolean; selected: boolean;
  dark: boolean; nowMs?: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  onOpen: (e: React.MouseEvent) => void;
}) {
  const locked = isReadOnly(ev);
  const ink = chipInk(ev, dark);
  const cd = formatEventCountdown(ev.starts_at, ev.ends_at, nowMs);

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className={selected ? 'pop' : undefined}
      style={{
        position: 'absolute', left, width, top: `${top}%`, height: `${height}%`,
        borderRadius: 8, padding: '4px 7px', overflow: 'hidden',
        background: `color-mix(in srgb, ${ev.color} 26%, var(--card))`,
        borderLeft: `2px solid ${ev.color}`,
        color: ink,
        boxShadow: lifted ? 'var(--shl)' : undefined,
        transform: lifted ? 'scale(1.02)' : undefined,
        cursor: locked ? 'default' : 'grab', touchAction: 'pan-y', zIndex: lifted ? 5 : 1,
        outline: selected ? `1px solid ${ev.color}` : undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
      <div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden' }}>
          {locked && <Icon name="lock" size={9} color={ink} />}
          {ev.title?.trim() || '(No title)'}
        </span>
        <span style={{ display: 'block', fontSize: 9.5, opacity: 0.72, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
          {label} {ev.location}
        </span>
      </div>

      {/* Countdown timer right inside the event slot itself */}
      {cd && cd.status !== 'past' && (
        <div style={{
          marginTop: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 8.5,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          padding: '1px 5px',
          borderRadius: 4,
          background: cd.status === 'ongoing'
            ? 'color-mix(in srgb, var(--pal-mint) 28%, var(--card))'
            : 'color-mix(in srgb, var(--pal-sky) 26%, var(--card))',
          color: cd.status === 'ongoing' ? 'var(--pal-mint)' : 'var(--pal-sky)',
          border: `1px solid ${cd.status === 'ongoing' ? 'color-mix(in srgb, var(--pal-mint) 45%, transparent)' : 'color-mix(in srgb, var(--pal-sky) 45%, transparent)'}`,
          width: 'fit-content',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span>{cd.status === 'ongoing' ? '🟢' : '⏱️'}</span>
          <span>{cd.badge}</span>
        </div>
      )}

      {/* bottom edge resizes the end time in 30-min steps */}
      {!locked && (
        <div onPointerDown={onResize}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, cursor: 'ns-resize', touchAction: 'none' }} />
      )}
    </div>
  );
}

/** The horizontal bar Google draws for a run of identical days. */
function SpanChip({ span: s, days, offset, dark, nowMs = Date.now(), onPointerDown, onOpen }: {
  span: Span; days: number;
  dark: boolean; nowMs?: number;
  offset: { day: number; fromDay: number; hour: number } | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpen: (x: number, y: number) => void;
}) {
  const lifted = !!offset;
  const shift = offset?.hour ?? 0;
  const start = hoursOf(s.ev.starts_at) + shift;
  const end = hoursOf(s.ev.ends_at) + shift;
  const firstDay = lifted ? offset!.fromDay + offset!.day : s.firstDay;
  const width = lifted ? 1 : s.days;
  const ink = chipInk(s.ev, dark);
  const cd = formatEventCountdown(s.ev.starts_at, s.ev.ends_at, nowMs);

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => onOpen(e.clientX, e.clientY)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{
        position: 'absolute',
        left: `calc(${(firstDay / days) * 100}% + 3px)`,
        width: `calc(${(width / days) * 100}% - 6px)`,
        top: `${pct(start)}%`, height: `${Math.max((0.5 / SPAN) * 100, pct(end) - pct(start))}%`,
        borderRadius: 8, padding: '4px 9px', overflow: 'hidden', pointerEvents: 'auto',
        background: `color-mix(in srgb, ${s.ev.color} 26%, var(--card))`,
        borderLeft: `2px solid ${s.ev.color}`,
        color: ink,
        boxShadow: lifted ? 'var(--shl)' : 'inset 0 0 0 1px color-mix(in srgb, ' + s.ev.color + ' 30%, transparent)',
        transform: lifted ? 'scale(1.01)' : undefined,
        zIndex: lifted ? 5 : 2, cursor: isReadOnly(s.ev) ? 'default' : 'grab', touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, lineHeight: 1.25 }}>
        {s.ev.title?.trim() || '(No title)'}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: 9.5, opacity: 0.72, fontVariantNumeric: 'tabular-nums' }}>
          {hhmm(start)}–{hhmm(end)} · {s.ev.location}
        </span>
        {cd && cd.status !== 'past' && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 8.5,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            background: cd.status === 'ongoing'
              ? 'color-mix(in srgb, var(--pal-mint) 28%, var(--card))'
              : 'color-mix(in srgb, var(--pal-sky) 26%, var(--card))',
            color: cd.status === 'ongoing' ? 'var(--pal-mint)' : 'var(--pal-sky)',
            border: `1px solid ${cd.status === 'ongoing' ? 'color-mix(in srgb, var(--pal-mint) 45%, transparent)' : 'color-mix(in srgb, var(--pal-sky) 45%, transparent)'}`,
            whiteSpace: 'nowrap',
          }}>
            <span>{cd.status === 'ongoing' ? '🟢' : '⏱️'}</span>
            <span>{cd.badge}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function TaskChip({ task, onPointerDown, style, compact }: {
  task: Task; onPointerDown: (e: React.PointerEvent) => void; style?: React.CSSProperties; compact?: boolean;
}) {
  const alert = getTaskAlert(task);
  const hue = task.priority === 'high' ? 'var(--pal-coral)' : task.priority === 'med' ? 'var(--pal-amber)' : 'var(--acc)';
  const alertClass = alert ? `task-alert-${alert.tier}` : '';

  return (
    <div onPointerDown={onPointerDown} title={`${task.title} — drag to a time slot`}
      className={alertClass}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'grab', touchAction: 'none',
        borderRadius: 8, padding: compact ? '2px 6px' : '4px 8px', marginBottom: compact ? 2 : 0,
        border: `1.5px dashed ${alert?.tier === 'red' ? 'var(--pal-coral)' : alert?.tier === 'orange' ? '#FF9A3C' : alert?.tier === 'yellow' ? 'var(--pal-amber)' : `color-mix(in srgb, ${hue} 62%, transparent)`}`,
        background: `color-mix(in srgb, ${hue} 12%, var(--card))`,
        fontSize: compact ? 10 : 10.5, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap',
        ...style,
      }}>
      {alert ? (
        <span className="task-alarm-emoji" style={{ fontSize: 11, flex: 'none', lineHeight: 1 }}>{alert.emoji}</span>
      ) : (
        <span style={{ width: 9, height: 9, flex: 'none', borderRadius: '50%', border: `1.5px solid ${hue}` }} />
      )}
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

/**
 * A continuous rail of days rather than one fixed week.
 *
 * This replaces the "< Today >" pager: scroll sideways to reach next week and
 * the week after, tap a day to open it. Today carries a filled marker, the
 * selected day the accent border, and a month divider appears where the month
 * turns over so a long scroll stays legible.
 */
const STRIP_BACK = 7;      // days of history you can scroll back to
const STRIP_AHEAD = 60;    // ~two months forward

function DayStrip({ ws, focus, onPick, onJump }: {
  ws: Date; focus: number;
  onPick: (d: number) => void;
  onJump: (weekStartDate: Date, dayIndex: number) => void;
}) {
  const { prefs } = usePrefs();
  const rail = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => { const d = new Date(ws); d.setDate(d.getDate() + focus); d.setHours(0, 0, 0, 0); return d; }, [ws, focus]);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const days = useMemo(() => Array.from({ length: STRIP_BACK + STRIP_AHEAD }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - STRIP_BACK + i);
    return d;
  }), [today]);

  // Keep the chosen day on screen when it changes from anywhere else.
  useEffect(() => {
    rail.current?.querySelector('[data-sel="1"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  return (
    <div ref={rail} className="hbar" style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2, scrollSnapType: 'x proximity' }}>
      {days.map((date, i) => {
        const on = date.getTime() === selected.getTime();
        const isToday = date.getTime() === today.getTime();
        const newMonth = i === 0 || date.getDate() === 1;
        return (
          <div key={date.toISOString()} style={{ display: 'flex', alignItems: 'stretch', gap: 6, flex: 'none' }}>
            {newMonth && (
              <span aria-hidden style={{
                alignSelf: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
                color: 'var(--tx3)', writingMode: 'vertical-rl', padding: '2px 0',
              }}>
                {date.toLocaleDateString(undefined, { month: 'short' })}
              </span>
            )}
            <button
              data-sel={on ? '1' : '0'}
              onClick={() => {
                const w = weekStart(date, prefs.weekStart);
                if (w.getTime() === ws.getTime()) onPick(dayIndex(date.toISOString(), w));
                else onJump(w, dayIndex(date.toISOString(), w));
              }}
              className="tt k-chip"
              aria-current={on ? 'date' : undefined}
              aria-label={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{
                width: 48, minHeight: 52, borderRadius: 12, padding: '6px 0', flex: 'none', scrollSnapAlign: 'center',
                border: `1px solid ${on ? SECHUE.calendar : 'var(--line)'}`,
                background: on ? 'color-mix(in srgb, var(--pal-sky) 14%, transparent)' : 'transparent',
                color: on ? SECHUE.calendar : 'var(--tx3)',
                fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em',
              }}>
              {dayLabels(prefs.weekStart)[dayIndex(date.toISOString(), weekStart(date, prefs.weekStart))]}
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 1, color: on ? 'var(--tx)' : 'var(--tx2)' }}>{date.getDate()}</div>
              <span aria-hidden style={{
                display: 'block', width: 4, height: 4, borderRadius: 2, margin: '3px auto 0',
                background: isToday ? 'var(--pal-coral)' : 'transparent',
              }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Six weeks from `ws`, with the days outside `month` dimmed. */
function Month({ ws, month, events, tasks, onPickDay, nowMs = Date.now() }: {
  ws: Date; month: number; events: Ev[]; tasks: Task[]; onPickDay: (d: Date) => void; nowMs?: number;
}) {
  const { prefs } = usePrefs();

  const byDay = useMemo(() => {
    const m = new Map<string, { title: string; color: string; starts_at?: string; ends_at?: string; task?: boolean }[]>();
    const push = (k: string, v: { title: string; color: string; starts_at?: string; ends_at?: string; task?: boolean }) =>
      m.set(k, [...(m.get(k) ?? []), v]);
    for (const e of events) push(new Date(e.starts_at).toDateString(), { title: e.title, color: e.color, starts_at: e.starts_at, ends_at: e.ends_at });
    for (const t of tasks) {
      if (!t.due_on) continue;
      push(new Date(`${t.due_on}T12:00:00`).toDateString(), { title: t.title, color: 'var(--acc)', task: true });
    }
    return m;
  }, [events, tasks]);

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, boxShadow: 'var(--sh)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {dayLabels(prefs.weekStart).map((d) => (
          <div key={d} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', color: 'var(--tx3)', textAlign: 'center', paddingBottom: 5 }}>{d}</div>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const date = new Date(ws);
          date.setDate(date.getDate() + i);
          const items = byDay.get(date.toDateString()) ?? [];
          const today = date.toDateString() === new Date().toDateString();
          const inMonth = date.getMonth() === month;
          return (
            <button key={i} onClick={() => onPickDay(date)} className="hov k-squish"
              aria-label={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{
                minHeight: 74, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 3,
                padding: '5px 6px', textAlign: 'left', overflow: 'hidden',
                border: `1px solid ${today ? SECHUE.calendar : 'transparent'}`,
                background: today ? 'color-mix(in srgb, var(--pal-sky) 10%, transparent)' : 'transparent',
                opacity: inMonth ? 1 : 0.38,
              }}>
              <span style={{ fontSize: 11.5, fontWeight: today ? 800 : 600, color: today ? SECHUE.calendar : 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
                {date.getDate()}
              </span>
              {items.slice(0, 3).map((it, n) => {
                const cd = it.starts_at && it.ends_at ? formatEventCountdown(it.starts_at, it.ends_at, nowMs) : null;
                return (
                  <span key={n} style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                    background: `color-mix(in srgb, ${it.color} 22%, transparent)`,
                    border: it.task ? '1px dashed color-mix(in srgb, var(--acc) 50%, transparent)' : undefined,
                    color: 'var(--tx2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 3,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                    {cd && cd.status !== 'past' && (
                      <span style={{
                        fontSize: 8,
                        fontWeight: 800,
                        flex: 'none',
                        color: cd.status === 'ongoing' ? 'var(--pal-mint)' : 'var(--pal-sky)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {cd.status === 'ongoing' ? '🟢' : '⏱️'}{cd.text}
                      </span>
                    )}
                  </span>
                );
              })}
              {items.length > 3 && <span style={{ fontSize: 8.5, color: 'var(--tx3)' }}>+{items.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Agenda — one block per day, each row a colour bar, 44px time, title, location. */
function Agenda({ ws, events, tasks, nowMs = Date.now() }: { ws: Date; events: Ev[]; tasks: Task[]; nowMs?: number }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div>
      {days.map((d, i) => {
        type AgendaItem = {
          id: string;
          time: number;
          starts_at?: string | null;
          ends_at?: string | null;
          title: string;
          meta: string;
          color: string;
          task: boolean;
        };

        const evItems: AgendaItem[] = events
          .filter((e) => dayIndex(e.starts_at, ws) === i)
          .map((e) => ({
            id: e.id, time: hoursOf(e.starts_at), starts_at: e.starts_at, ends_at: e.ends_at,
            title: e.title, meta: e.location, color: e.color, task: false,
          }));

        const taskItems: AgendaItem[] = tasks
          .filter((t) => dayIndex(`${t.due_on}T12:00:00`, ws) === i)
          .map((t) => ({
            id: t.id, time: t.due_at ? hoursOf(t.due_at) : 23.9, starts_at: t.due_at ?? null, ends_at: null,
            title: t.title, meta: t.due_at ? 'Task' : 'Task · no set time', color: '#7C6CFF', task: true,
          }));

        const items = [...evItems, ...taskItems].sort((a, b) => a.time - b.time);
        if (!items.length) return null;
        const today = d.toDateString() === new Date().toDateString();
        return (
          <div key={d.toISOString()} className="lensrow" style={{
            background: 'var(--card)', borderRadius: 16, padding: '13px 16px',
            marginBottom: 10, boxShadow: 'var(--sh)',
            border: `1px solid ${today ? `color-mix(in srgb, ${SECHUE.calendar} 34%, transparent)` : 'var(--line)'}`,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase',
              color: today ? SECHUE.calendar : 'var(--tx3)', marginBottom: 6,
            }}>
              {d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            {items.map((a) => {
              const cd = a.starts_at && a.ends_at ? formatEventCountdown(a.starts_at, a.ends_at, nowMs) : null;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                  <span style={{
                    width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, flex: 'none',
                    background: a.color, opacity: a.task ? 0.6 : 1,
                  }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', width: 62, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                    {a.time >= 23.5 && a.task ? '—' : hhmm(a.time)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{a.title}</span>
                    {cd && cd.status !== 'past' && (
                      <span style={{
                        flex: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '1px 7px',
                        borderRadius: 5,
                        fontSize: 9.5,
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        background: cd.status === 'ongoing'
                          ? 'color-mix(in srgb, var(--pal-mint) 20%, var(--card2))'
                          : 'color-mix(in srgb, var(--pal-sky) 18%, var(--card2))',
                        border: `1px solid ${cd.status === 'ongoing' ? 'color-mix(in srgb, var(--pal-mint) 40%, transparent)' : 'color-mix(in srgb, var(--pal-sky) 40%, transparent)'}`,
                        color: cd.status === 'ongoing' ? 'var(--pal-mint)' : 'var(--pal-sky)',
                      }}>
                        <span>{cd.status === 'ongoing' ? '🟢' : '⏱️'}</span>
                        <span>{cd.badge}</span>
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--tx3)', flex: 'none' }}>{a.meta}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      {events.length + tasks.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing scheduled this week.</p>}
    </div>
  );
}

function Countdown({ events, A }: { events: Ev[]; A: ReturnType<typeof useEventActions> }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), K.countdownTickMs);
    return () => clearInterval(t);
  }, []);

  const next = events
    .filter((e) => new Date(e.starts_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  if (!next) {
    return <p style={{ fontSize: 13.5, color: 'var(--tx3)', textAlign: 'center', padding: 40 }}>Nothing else scheduled this week.</p>;
  }

  const ms = new Date(next.starts_at).getTime() - Date.now();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const due = ms < 60_000;

  return (
    <div className="rise" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 34, textAlign: 'center', boxShadow: 'var(--sh)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 12 }}>Up next</div>
      <div className={due ? 'arrive' : undefined} style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 7 }}>{next.title}</div>
      <div className="glowring" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 14, background: 'var(--card2)', fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', color: SECHUE.calendar, fontVariantNumeric: 'tabular-nums' }}>
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tx2)' }}>{hhmm(hoursOf(next.starts_at))}{next.location && ` · ${next.location}`}</div>
      <button onClick={() => A.snooze.mutate({ id: next.id })} className="hov k-squish"
        style={{ marginTop: 18, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 44 }}>
        Snooze 10 min
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- the sheet */

/** Local-time value for `<input type="datetime-local">`-style fields. */
const dateValue = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const timeValue = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function EditSheet({ ev, onClose, onSave }: { ev: Ev; onClose: () => void; onSave: (p: Partial<Ev>) => void }) {
  const [title, setTitle] = useState(ev.title);
  const [shortName, setShortName] = useState(ev.short_name ?? '');
  const [location, setLocation] = useState(ev.location);
  const [color, setColor] = useState(ev.color);
  const [date, setDate] = useState(dateValue(ev.starts_at));
  const [from, setFrom] = useState(timeValue(ev.starts_at));
  const [to, setTo] = useState(timeValue(ev.ends_at));
  const [allDay, setAllDay] = useState(ev.all_day);

  useOverlayBack(true, onClose);

  const [textColor, setTextColor] = useState<string | null>(ev.text_color ?? null);
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';

  /**
   * The whole spread, not eight of them.
   *
   * Google Calendar ships eleven named colours and every calendar app since has
   * copied the idea, because "the blue one" is how people actually refer to a
   * block on a grid. The custom well below is the escape hatch for a course
   * colour that has to match something else.
   */
  const swatches = [
    '#FF6B6B', '#FF8A4C', '#FFC24B', '#A3E635', '#34D9A0', '#38D6F2',
    '#38BDF8', '#7C8CFF', '#B07CFF', '#FF6FA8', '#8A86A6', '#3A3550',
  ];
  /** Label colours. `null` is "read it off the background" — see chipInk. */
  const inks: { v: string | null; n: string }[] = [
    { v: null, n: 'Auto' },
    { v: '#F4F2FB', n: 'Light' },
    { v: '#141220', n: 'Dark' },
    { v: '#FFC24B', n: 'Amber' },
    { v: '#34D9A0', n: 'Mint' },
    { v: '#FF6B6B', n: 'Coral' },
  ];

  const save = () => {
    // Native date/time inputs give local wall-clock strings; `new Date(...)`
    // reads them in the browser's zone, which is what we want stored.
    const starts = new Date(`${date}T${allDay ? '00:00' : from}`);
    const ends = new Date(`${date}T${allDay ? '23:59' : to}`);
    if (ends <= starts) { toast('The end time has to be after the start'); return; }
    onSave({
      title, short_name: shortName.trim(), location, color, text_color: textColor, all_day: allDay,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    });
  };

  if (typeof document === 'undefined') return null;

  // Portalled: `main` carries the zoom pref and the page-entry transform, so a
  // fixed sheet rendered inside it is positioned against `main`, not the
  // viewport (HANDOFF fact 2) — the same reason CalPopover portals.
  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" role="dialog" aria-modal="true" aria-label="Edit event"
        style={{ width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: '14px 14px 0 0', border: '1px solid var(--line2)', padding: 24, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 16 }}>Edit event</h2>

        <span style={LABEL}>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" style={FIELD} />
        <span style={LABEL}>Short Name (Optional — 1-2 words for home timeline)</span>
        <input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="e.g. CS101, Gym, Calc" aria-label="Short Name" style={FIELD} />
        <span style={LABEL}>Location</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" style={FIELD} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '4px 0 10px', fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)', minHeight: 40 }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--acc)' }} />
          All day
        </label>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <label style={{ flex: 2, minWidth: 0 }}>
            <span style={LABEL}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...FIELD, marginBottom: 0 }} />
          </label>
          {!allDay && (
            <>
              <label style={{ flex: 1, minWidth: 0 }}>
                <span style={LABEL}>From</span>
                <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...FIELD, marginBottom: 0 }} />
              </label>
              <label style={{ flex: 1, minWidth: 0 }}>
                <span style={LABEL}>To</span>
                <input type="time" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...FIELD, marginBottom: 0 }} />
              </label>
            </>
          )}
        </div>

        <span style={LABEL}>Background</span>
        <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {swatches.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}
              className={`k-swatch${color === c ? ' on' : ''}`}
              style={{ width: 26, height: 26, borderRadius: 7, background: c, outline: color === c ? '2px solid var(--tx)' : undefined, outlineOffset: 2 }} />
          ))}
          <label title="Any colour" aria-label="Custom background colour"
            style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', border: '1px dashed var(--line2)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
            <Icon name="pen" size={12} color="var(--tx3)" />
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#7C8CFF'}
              onChange={(e) => setColor(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>

        <span style={LABEL}>Text</span>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {inks.map((k) => (
            <button key={k.n} onClick={() => setTextColor(k.v)} aria-pressed={textColor === k.v}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8,
                fontSize: 11, fontWeight: 700, minHeight: 30,
                border: `1px solid ${textColor === k.v ? 'var(--acc)' : 'var(--line2)'}`,
                color: textColor === k.v ? 'var(--tx)' : 'var(--tx2)',
              }}>
              {k.v && <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: k.v, border: '1px solid var(--line2)' }} />}
              {k.n}
            </button>
          ))}
          <label title="Any colour" aria-label="Custom text colour"
            style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', border: '1px dashed var(--line2)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
            <Icon name="pen" size={12} color="var(--tx3)" />
            <input type="color" value={textColor && /^#[0-9a-f]{6}$/i.test(textColor) ? textColor : '#F4F2FB'}
              onChange={(e) => setTextColor(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>

        {/* What it will look like, before you close the sheet. */}
        <div style={{
          marginBottom: 18, padding: '7px 10px', borderRadius: 8,
          background: `color-mix(in srgb, ${color} 26%, var(--card))`,
          borderLeft: `2px solid ${color}`,
          color: chipInk({ color, text_color: textColor }, dark),
          fontSize: 11, fontWeight: 700,
        }}>
          {title || 'Untitled'}
          <span style={{ display: 'block', fontSize: 9.5, opacity: 0.72, marginTop: 2 }}>{from}–{to}</span>
        </div>
        <div style={{ display: 'none' }}>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onClose} className="hov k-squish" style={{ flex: 1, minHeight: 44, borderRadius: 14, border: '1px solid var(--line2)', fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)' }}>Cancel</button>
          <button onClick={save} className="acc k-squish"
            style={{ flex: 1, minHeight: 44, borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>Save</button>
        </div>
      </div>
    </div>
  ), document.body);
}

const FIELD: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 9,
  border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)',
  fontSize: 13.5, marginBottom: 10,
};
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
  textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 4,
};

/* ------------------------------------------------------------- the bubbles */

/**
 * What Google shows when you click an event: the thing itself, then the small
 * number of actions worth having at that moment. Everything else lives behind
 * Edit, which opens the full sheet.
 */
function EventPopover({
  ev, x, y, runDays, onClose, onEdit, onDuplicate, onDelete, onDeleteRun, onUpdateTitle, nowMs = Date.now(),
}: {
  ev: Ev; x: number; y: number;
  /** How many days this event's run covers, or 0 when it stands alone. */
  runDays: number;
  onClose: () => void; onEdit: () => void; onDuplicate: () => void;
  onDelete: () => void; onDeleteRun: () => void;
  onUpdateTitle?: (title: string) => void;
  nowMs?: number;
}) {
  const locked = isReadOnly(ev);
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const when = ev.all_day
    ? start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${hhmm(hoursOf(ev.starts_at))} – ${hhmm(hoursOf(ev.ends_at))}`;
  const dayName = start.toLocaleDateString(undefined, { weekday: 'long' });
  const isNoTitle = !ev.title || ev.title.trim() === '' || ev.title === '(No title)';
  const [editingTitle, setEditingTitle] = useState(isNoTitle);
  const [titleInput, setTitleInput] = useState(isNoTitle ? '' : ev.title);

  const saveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== ev.title) {
      onUpdateTitle?.(trimmed);
    } else if (!trimmed) {
      onUpdateTitle?.('(No title)');
    }
  };

  return (
    <CalPopover x={x} y={y} onClose={onClose} label={ev.title || '(No title)'} width={340}>
      <PopoverActions onClose={onClose}>
        {!locked && (
          <>
            <button onClick={onEdit} className="hov k-squish" aria-label="Edit event" title="Edit"
              style={ACT}><Icon name="edit" size={15} color="var(--tx2)" /></button>
            <button onClick={onDelete} className="hov k-squish"
              aria-label={runDays > 1 ? 'Delete this day' : 'Delete event'}
              title={runDays > 1 ? 'Delete this day' : 'Delete'}
              style={ACT}><Icon name="trash" size={15} color="var(--pal-coral)" /></button>
            <button onClick={onDuplicate} className="hov k-squish" aria-label="Duplicate event" title="Duplicate"
              style={ACT}><Icon name="copy" size={15} color="var(--tx2)" /></button>
            <button onClick={onEdit} className="hov k-squish" aria-label="More options" title="More options"
              style={ACT}><Icon name="dots" size={15} color="var(--tx2)" /></button>
          </>
        )}
      </PopoverActions>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: ev.color, flex: 'none', marginTop: 4 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          {editingTitle && !locked ? (
            <input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={() => { saveTitle(); setEditingTitle(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveTitle();
                  setEditingTitle(false);
                }
              }}
              placeholder="Add title"
              style={{
                width: '100%',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--tx)',
                background: 'var(--card2)',
                border: '1px solid var(--acc)',
                borderRadius: 8,
                padding: '5px 9px',
                outline: 'none',
                marginBottom: 2,
              }}
            />
          ) : (
            <div
              onClick={() => !locked && setEditingTitle(true)}
              title={locked ? undefined : 'Click to edit title'}
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-.02em',
                lineHeight: 1.3,
                color: isNoTitle ? 'var(--tx3)' : 'var(--tx)',
                overflowWrap: 'anywhere',
                cursor: locked ? 'default' : 'pointer',
              }}
            >
              {ev.title?.trim() || '(No title)'}
            </div>
          )}
          {ev.short_name && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 7px', borderRadius: 6, background: 'color-mix(in srgb, var(--acc) 14%, var(--card2))', border: '1px solid color-mix(in srgb, var(--acc) 30%, transparent)', fontSize: 11, fontWeight: 700, color: 'var(--accTx, var(--tx))' }}>
              <Icon name="tag" size={10} color="inherit" />
              <span>Short name: {ev.short_name}</span>
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 4, lineHeight: 1.45 }}>{when}</div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>Weekly on {dayName}</div>

          {/* Live Countdown Badge */}
          {(() => {
            const cd = formatEventCountdown(ev.starts_at, ev.ends_at, nowMs);
            if (!cd || cd.status === 'past') return null;
            return (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 8,
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                background: cd.status === 'ongoing'
                  ? 'color-mix(in srgb, var(--pal-mint) 22%, var(--card2))'
                  : 'color-mix(in srgb, var(--pal-sky) 20%, var(--card2))',
                color: cd.status === 'ongoing' ? 'var(--pal-mint)' : 'var(--pal-sky)',
                border: `1px solid ${cd.status === 'ongoing' ? 'color-mix(in srgb, var(--pal-mint) 45%, transparent)' : 'color-mix(in srgb, var(--pal-sky) 45%, transparent)'}`,
              }}>
                <span>{cd.status === 'ongoing' ? '🟢' : '⏱️'}</span>
                <span>{cd.badge}</span>
              </div>
            );
          })()}

          {/* Meeting Notes Section */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 14,
            padding: '9px 12px', borderRadius: 12,
            background: 'var(--card2)', border: '1px solid var(--line2)',
          }}>
            <Icon name="files" size={15} color="var(--pal-sky)" style={{ marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pal-sky)' }}>Take meeting notes</div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Start a new document to capture notes</div>
            </div>
          </div>

          {/* Notification Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--tx2)', marginTop: 12 }}>
            <Icon name="bell" size={14} color="var(--tx3)" />
            <span>{ev.remind_minutes ? `${ev.remind_minutes} minutes before` : '10 minutes before'}</span>
          </div>

          {/* Calendar Account Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--tx2)', marginTop: 8 }}>
            <Icon name="cal" size={14} color="var(--tx3)" />
            <span>{ev.location || 'Basedly Calendar'}</span>
          </div>

          {locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
              <Icon name="lock" size={12} color="var(--tx3)" />Synced — edit it where it came from
            </div>
          )}

          {runDays > 1 && !locked && (
            <button onClick={onDeleteRun} className="hov"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '7px 10px',
                width: '100%', borderRadius: 9, border: '1px solid var(--line2)',
                fontSize: 11.5, fontWeight: 700, color: 'var(--pal-coral)',
              }}>
              <Icon name="trash" size={13} color="var(--pal-coral)" />
              Delete all {runDays} days of this
            </button>
          )}
        </div>
      </div>
    </CalPopover>
  );
}

/**
 * Google Tasks / Calendar style Task Details Popover
 */
function TaskPopover({
  task, x, y, onClose, onComplete, onDelete, onUpdateTitle,
}: {
  task: Task; x: number; y: number;
  onClose: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onUpdateTitle?: (title: string) => void;
}) {
  const [done, setDone] = useState(task.done);
  const hue = task.priority === 'high' ? 'var(--pal-coral)' : task.priority === 'med' ? 'var(--pal-amber)' : 'var(--acc)';
  const isNoTitle = !task.title || task.title.trim() === '' || task.title === '(No title)';
  const [editingTitle, setEditingTitle] = useState(isNoTitle);
  const [titleInput, setTitleInput] = useState(isNoTitle ? '' : task.title);
  const alert = getTaskAlert(task);
  const countdown = formatTaskCountdown(task);

  const saveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdateTitle?.(trimmed);
    } else if (!trimmed) {
      onUpdateTitle?.('(No title)');
    }
  };

  let when = 'No date';
  if (task.due_at) {
    const d = new Date(task.due_at);
    when = `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${hhmm(hoursOf(task.due_at))}`;
  } else if (task.due_on) {
    const d = new Date(`${task.due_on}T12:00:00`);
    when = `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · all day`;
  }

  const router = useRouter();

  return (
    <CalPopover x={x} y={y} onClose={onClose} label={task.title || '(No title)'} width={340}>
      <PopoverActions onClose={onClose}>
        <button
          onClick={() => {
            onClose();
            router.push(`/tasks/?detail=${task.id}`);
          }}
          className="hov k-squish"
          aria-label="Edit task details"
          title="Open in Tasks editor"
          style={ACT}
        >
          <Icon name="edit" size={15} color="var(--tx2)" />
        </button>
        <button
          onClick={() => {
            setDone(!done);
            onComplete();
          }}
          className="hov k-squish"
          aria-label={done ? 'Mark incomplete' : 'Mark completed'}
          title={done ? 'Mark incomplete' : 'Mark completed'}
          style={ACT}
        >
          <Icon name={done ? 'check' : 'task'} size={15} color={done ? 'var(--pal-mint)' : 'var(--tx2)'} />
        </button>
        <button
          onClick={onDelete}
          className="hov k-squish"
          aria-label="Delete task"
          title="Delete"
          style={ACT}
        >
          <Icon name="trash" size={15} color="var(--pal-coral)" />
        </button>
      </PopoverActions>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <button
          type="button"
          onClick={() => {
            setDone(!done);
            onComplete();
          }}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: `2px solid ${done ? 'var(--pal-mint)' : hue}`,
            background: done ? 'var(--pal-mint)' : 'transparent',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            flex: 'none',
            marginTop: 3,
            padding: 0,
          }}
        >
          {done && <Icon name="check" size={11} color="var(--ink)" />}
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={() => { saveTitle(); setEditingTitle(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveTitle();
                  setEditingTitle(false);
                }
              }}
              placeholder="Add title"
              style={{
                width: '100%',
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--tx)',
                background: 'var(--card2)',
                border: '1px solid var(--acc)',
                borderRadius: 8,
                padding: '5px 9px',
                outline: 'none',
                marginBottom: 2,
              }}
            />
          ) : (
            <div
              onClick={() => setEditingTitle(true)}
              title="Click to edit title"
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-.02em',
                lineHeight: 1.3,
                color: done ? 'var(--tx3)' : isNoTitle ? 'var(--tx3)' : 'var(--tx)',
                textDecoration: done ? 'line-through' : 'none',
                overflowWrap: 'anywhere',
                cursor: 'pointer',
              }}
            >
              {task.title?.trim() || '(No title)'}
            </div>
          )}

          {/* Countdown timer badge in calendar popover */}
          {countdown && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4,
              fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              padding: '2px 7px', borderRadius: 6,
              background: countdown.isOverdue || alert?.tier === 'red'
                ? 'color-mix(in srgb, var(--pal-coral) 20%, var(--card2))'
                : alert?.tier === 'orange'
                ? 'color-mix(in srgb, #FF9A3C 20%, var(--card2))'
                : 'color-mix(in srgb, var(--pal-amber) 16%, var(--card2))',
              color: countdown.isOverdue || alert?.tier === 'red' ? 'var(--pal-coral)' : 'var(--tx)',
              border: `1px solid ${countdown.isOverdue || alert?.tier === 'red' ? 'var(--pal-coral)' : 'var(--line2)'}`,
            }}>
              <span>{alert?.emoji || '⏱️'}</span>
              <span>{countdown.text}</span>
            </div>
          )}

          <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 4, lineHeight: 1.45 }}>
            {when}
          </div>

          {task.notes && (
            <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 10, lineHeight: 1.5, background: 'var(--card2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line2)' }}>
              {task.notes}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--tx2)', marginTop: 12 }}>
            <Icon name="task" size={14} color="var(--tx3)" />
            <span>My Tasks</span>
          </div>
        </div>
      </div>
    </CalPopover>
  );
}

/**
 * Google Calendar style QuickCreate popover with Event / Task / Out of office / Working location tabs.
 */
function QuickCreate({
  x, y, ws, day, hour, endHour, allDay, initialTab = 'event', accent, onClose, onCreate, onCreateTask, onMoreOptions,
}: {
  x: number; y: number; ws: Date; day: number; hour: number; endHour?: number; allDay: boolean;
  initialTab?: 'event' | 'task' | 'out_of_office' | 'working_location';
  accent: string; onClose: () => void;
  onCreate: (title: string, loc?: string, desc?: string, shortName?: string) => void;
  onCreateTask?: (title: string, notes?: string) => void;
  onMoreOptions?: (title: string, shortName?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'event' | 'task' | 'out_of_office' | 'working_location'>(initialTab);
  const [title, setTitle] = useState('');
  const [shortName, setShortName] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const d = new Date(ws);
  d.setDate(d.getDate() + day);
  const eH = endHour !== undefined ? endHour : hour + 1;
  const when = allDay
    ? `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`
    : `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${hhmm(hour)} – ${hhmm(eH)}`;

  const handleSave = () => {
    if (activeTab === 'task') {
      onCreateTask?.(title.trim() || '(No title)', notes);
    } else {
      onCreate(title.trim() || '(No title)', location, notes, shortName.trim());
    }
  };

  return (
    <CalPopover x={x} y={y} onClose={onClose} label="New event" width={380}>
      {/* Top Header with Drag Handle & Close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Icon name="more" size={16} color="var(--tx3)" style={{ opacity: 0.6 }} />
        <button
          onClick={onClose}
          className="hov k-squish"
          aria-label="Close"
          title="Close"
          style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="close" size={15} color="var(--tx2)" />
        </button>
      </div>

      {/* Large Title Input with Underline */}
      <div style={{ marginBottom: 14 }}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Add title and time"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid var(--acc)',
            padding: '4px 0 8px',
            color: 'var(--tx)',
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: '-.015em',
            outline: 'none',
          }}
        />
      </div>

      {/* Segmented Tab Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
        {[
          { id: 'event', label: 'Event' },
          { id: 'task', label: 'Task' },
          { id: 'out_of_office', label: 'Out of office' },
          { id: 'working_location', label: 'Working location' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={{
                padding: '6px 14px',
                borderRadius: 18,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${isActive ? 'var(--acc)' : 'transparent'}`,
                background: isActive ? 'color-mix(in srgb, var(--acc) 22%, var(--card))' : 'transparent',
                color: isActive ? 'var(--accTx, var(--tx))' : 'var(--tx2)',
                whiteSpace: 'nowrap',
                transition: 'all .15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Date & Time Row with Add Time pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="clock" size={15} color="var(--tx3)" style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{when}</div>
            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>Does not repeat</div>
          </div>
        </div>
        {allDay && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 12, border: '1px solid var(--line2)', color: 'var(--tx2)' }}>
            All day
          </span>
        )}
      </div>

      {activeTab === 'task' ? (
        <>
          {/* Task Description */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="text" size={15} color="var(--tx3)" />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add description or notes"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--line2)',
                padding: '4px 0',
                fontSize: 13,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          {/* Task List Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Icon name="task" size={15} color="var(--tx3)" />
            <div style={{ fontSize: 13, color: 'var(--tx2)' }}>My Tasks</div>
          </div>
        </>
      ) : (
        <>
          {/* Short Name Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="tag" size={15} color="var(--tx3)" />
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="Short name (optional — 1-2 words e.g. CS101, Gym)"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--line2)',
                padding: '4px 0',
                fontSize: 13,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          {/* Add Guests */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="people" size={15} color="var(--tx3)" />
            <span style={{ fontSize: 13, color: 'var(--tx3)' }}>Add guests</span>
          </div>

          {/* Video Conferencing */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="spark" size={15} color="var(--pal-amber)" />
            <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Add Google Meet video conferencing</span>
          </div>

          {/* Location Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="pin" size={15} color="var(--tx3)" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add rooms or location"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--line2)',
                padding: '4px 0',
                fontSize: 13,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          {/* Description Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Icon name="text" size={15} color="var(--tx3)" />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add description or a Google Drive attachment"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--line2)',
                padding: '4px 0',
                fontSize: 13,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          {/* Calendar User Profile row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Icon name="cal" size={15} color="var(--tx3)" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
                Basedly Calendar
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1 }}>
                Free · Default visibility · Do not notify
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 4 }}>
        <button
          type="button"
          onClick={() => onMoreOptions?.(title, shortName)}
          className="hov k-squish"
          style={{
            padding: '7px 12px',
            borderRadius: 16,
            border: 'none',
            background: 'transparent',
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--tx2)',
            cursor: 'pointer',
          }}
        >
          More options
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="acc k-squish"
          style={{
            padding: '8px 24px',
            borderRadius: 18,
            background: 'var(--acc)',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
            boxShadow: 'var(--sh)',
          }}
        >
          Save
        </button>
      </div>
    </CalPopover>
  );
}

const ACT: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' };
