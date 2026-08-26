'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import {
  useEvents, useEventActions, weekStart, hoursOf, dayIndex, hhmm, at, spanRuns, dayLabels, chipInk,
  isReadOnly, liveEventIds, GRID_START, GRID_END, type Ev, type Span,
} from '@/lib/events';
import { CalendarGrid } from '@/components/calendar/DayGrid';


type View = 'month' | 'week' | 'day' | 'agenda' | 'countdown';

const VIEW_ICON: Record<View, IconName> = {
  month: 'month', week: 'week', day: 'day', agenda: 'agenda', countdown: 'clock',
};

export default function CalendarPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [ws, setWs] = useState(() => weekStart(new Date(), prefs.weekStart));
  const [focusDay, setFocusDay] = useState(() => dayIndex(new Date().toISOString(), weekStart(new Date(), prefs.weekStart)));
  const [sel, setSel] = useState<string | null>(null);
  /**
   * One bubble at a time: `event` when you click something, `slot` when you
   * click empty space. Both carry the click point so the bubble opens there.
   */
  const [pop, setPop] = useState<
    | { kind: 'event'; ev: Ev; span?: Span | null; x: number; y: number }
    | { kind: 'slot'; day: number; hour: number; allDay: boolean; x: number; y: number }
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
  const openSlot = (day: number, hour: number, x: number, y: number, allDay = false) =>
    setPop({ kind: 'slot', day, hour, allDay, x, y });

  /**
   * The phone header is deliberately thin. Day view already highlights the day
   * you are on and the strip scrolls to any other, so a heading repeating that
   * date, and a "< Today >" pager for a thing you can just tap, were both
   * spending scarce vertical space to say what the grid already says.
   */
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

      <div data-tour="calendar-grid" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div key={view} className="k-zoomfade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* The chrome above is not data-dependent and paints immediately;
              only the grid waits, so only the grid is outlined. */}
          {isPending && (
            <div style={{ padding: phone ? '0 14px 14px' : '0 22px 16px' }}>
              <CalendarSkeleton days={view === 'day' ? 1 : 7} />
            </div>
          )}
          {!isPending && view === 'week' && (
            <CalendarGrid days={7} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA}
              sel={sel} setSel={setSel} openEvent={openEvent} openSlot={openSlot} onSchedule={schedule} />
          )}
          {!isPending && view === 'day' && (
            <>
              <DayStrip ws={ws} focus={focusDay} onPick={setFocusDay} onJump={(w, d) => { setWs(w); setFocusDay(d); }} />
              <CalendarGrid days={1} dayOffset={focusDay} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA}
                sel={sel} setSel={setSel} openEvent={openEvent} openSlot={openSlot} onSchedule={schedule} />
            </>
          )}
          {!isPending && view === 'month' && (
            <Month ws={windowStart} month={ws.getMonth()} events={events} tasks={windowTasks}
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
          {!isPending && view === 'agenda' && <Agenda ws={ws} events={events} tasks={windowTasks} />}
          {!isPending && view === 'countdown' && <Countdown events={events} A={A} />}
        </div>
      </div>

      {pop?.kind === 'event' && (
        <EventPopover ev={pop.ev} x={pop.x} y={pop.y}
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
          }} />
      )}

      {pop?.kind === 'slot' && (
        <QuickCreate x={pop.x} y={pop.y} ws={ws} day={pop.day} hour={pop.hour} allDay={pop.allDay}
          accent={prefs.accent}
          onClose={() => setPop(null)}
          onCreate={(title) => { A.addAt(pop.day, pop.hour, prefs.accent, pop.allDay, title); setPop(null); }} />
      )}

      {edit && (
        <EditSheet ev={edit} onClose={() => setEdit(null)}
          onSave={(patch) => { A.update.mutate({ id: edit.id, patch }); setEdit(null); }} />
      )}
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
function Month({ ws, month, events, tasks, onPickDay }: {
  ws: Date; month: number; events: Ev[]; tasks: Task[]; onPickDay: (d: Date) => void;
}) {
  const { prefs } = usePrefs();

  const byDay = useMemo(() => {
    const m = new Map<string, { title: string; color: string; task?: boolean }[]>();
    const push = (k: string, v: { title: string; color: string; task?: boolean }) =>
      m.set(k, [...(m.get(k) ?? []), v]);
    for (const e of events) push(new Date(e.starts_at).toDateString(), { title: e.title, color: e.color });
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
              {items.slice(0, 3).map((it, n) => (
                <span key={n} style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                  background: `color-mix(in srgb, ${it.color} 22%, transparent)`,
                  border: it.task ? '1px dashed color-mix(in srgb, var(--acc) 50%, transparent)' : undefined,
                  color: 'var(--tx2)',
                }}>{it.title}</span>
              ))}
              {items.length > 3 && <span style={{ fontSize: 8.5, color: 'var(--tx3)' }}>+{items.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Agenda — one block per day, each row a colour bar, 44px time, title, location. */
function Agenda({ ws, events, tasks }: { ws: Date; events: Ev[]; tasks: Task[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div>
      {days.map((d, i) => {
        const items = events
          .filter((e) => dayIndex(e.starts_at, ws) === i)
          .map((e) => ({ id: e.id, time: hoursOf(e.starts_at), title: e.title, meta: e.location, color: e.color, task: false }))
          .concat(tasks
            .filter((t) => dayIndex(`${t.due_on}T12:00:00`, ws) === i)
            .map((t) => ({
              id: t.id, time: t.due_at ? hoursOf(t.due_at) : 23.9, title: t.title,
              meta: t.due_at ? 'Task' : 'Task · no set time', color: '#7C6CFF', task: true,
            })))
          .sort((a, b) => a.time - b.time);
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
            {items.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                <span style={{
                  width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, flex: 'none',
                  background: a.color, opacity: a.task ? 0.6 : 1,
                }} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', width: 62, fontVariantNumeric: 'tabular-nums' }}>
                  {a.time >= 23.5 && a.task ? '—' : hhmm(a.time)}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{a.meta}</span>
              </div>
            ))}
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
      title, location, color, text_color: textColor, all_day: allDay,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    });
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" role="dialog" aria-modal="true" aria-label="Edit event"
        style={{ width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: '14px 14px 0 0', border: '1px solid var(--line2)', padding: 24, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 16 }}>Edit event</h2>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" style={FIELD} />
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
  );
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
  ev, x, y, runDays, onClose, onEdit, onDuplicate, onDelete, onDeleteRun,
}: {
  ev: Ev; x: number; y: number;
  /** How many days this event's run covers, or 0 when it stands alone. */
  runDays: number;
  onClose: () => void; onEdit: () => void; onDuplicate: () => void;
  onDelete: () => void; onDeleteRun: () => void;
}) {
  const locked = isReadOnly(ev);
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const when = ev.all_day
    ? start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${hhmm(hoursOf(ev.starts_at))} – ${hhmm(hoursOf(ev.ends_at))}`;

  return (
    <CalPopover x={x} y={y} onClose={onClose} label={ev.title}>
      <PopoverActions onClose={onClose}>
        {!locked && (
          <>
            <button onClick={onEdit} className="hov k-squish" aria-label="Edit event" title="Edit"
              style={ACT}><Icon name="edit" size={14} color="var(--tx2)" /></button>
            <button onClick={onDuplicate} className="hov k-squish" aria-label="Duplicate event" title="Duplicate"
              style={ACT}><Icon name="copy" size={14} color="var(--tx2)" /></button>
            <button onClick={onDelete} className="hov k-squish"
              aria-label={runDays > 1 ? 'Delete this day' : 'Delete event'}
              title={runDays > 1 ? 'Delete this day' : 'Delete'}
              style={ACT}><Icon name="trash" size={14} color="var(--pal-coral)" /></button>
          </>
        )}
      </PopoverActions>

      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <span aria-hidden style={{ width: 13, height: 13, borderRadius: 4, background: ev.color, flex: 'none', marginTop: 3 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            {ev.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4, lineHeight: 1.5 }}>{when}</div>
          {ev.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx2)', marginTop: 7 }}>
              <Icon name="pin" size={13} color="var(--tx3)" />{ev.location}
            </div>
          )}
          {locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--tx3)', marginTop: 9 }}>
              <Icon name="lock" size={12} color="var(--tx3)" />Synced — edit it where it came from
            </div>
          )}

          {/* A repeating class is N rows drawn as one bar. Everything above
              acts on the day you clicked; this is the way to reach all of it,
              and it says how many so it can never be a surprise. */}
          {runDays > 1 && !locked && (
            <button onClick={onDeleteRun} className="hov"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, padding: '7px 10px',
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
 * Clicking an empty slot asks the one question worth asking — what is this? —
 * and gets out of the way. It used to create "New event" immediately and leave
 * you to hunt for it and rename it.
 */
function QuickCreate({
  x, y, ws, day, hour, allDay, accent, onClose, onCreate,
}: {
  x: number; y: number; ws: Date; day: number; hour: number; allDay: boolean;
  accent: string; onClose: () => void; onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const d = new Date(ws);
  d.setDate(d.getDate() + day);
  const when = allDay
    ? `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · all day`
    : `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${hhmm(hour)} – ${hhmm(hour + 1)}`;

  return (
    <CalPopover x={x} y={y} onClose={onClose} label="New event">
      <PopoverActions onClose={onClose} />
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCreate(title); }}
        placeholder="Add a title"
        style={{
          width: '100%', minHeight: 40, padding: '9px 11px', borderRadius: 10,
          border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)',
          fontSize: 14, fontWeight: 600,
        }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--tx2)', margin: '11px 0 13px' }}>
        <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: accent, flex: 'none' }} />
        <Icon name="clock" size={13} color="var(--tx3)" />{when}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onCreate(title)} className="acc k-squish"
          style={{ flex: 1, minHeight: 38, borderRadius: 10, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800 }}>
          Save
        </button>
        <button onClick={onClose} className="hov k-squish"
          style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
          Cancel
        </button>
      </div>
    </CalPopover>
  );
}

const ACT: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center' };
