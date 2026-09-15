'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Icon, type IconName } from '@/components/Icon';
import { CalendarSkeleton } from '@/components/Skeleton';
/* Behind the Import button — nothing draws it until you press that. */
const ScheduleImport = dynamic(() => import('@/components/ScheduleImport').then((m) => m.ScheduleImport), { ssr: false });
import { EventBubble } from '@/components/calendar/EventBubble';
import { TaskBubble } from '@/components/calendar/TaskBubble';
import { CalendarTimers } from '@/components/calendar/CalendarTimers';
import { NextView } from '@/components/calendar/NextView';
import { ContextMenu, type CtxGroup } from '@/components/ContextMenu';
import { useNotebooks, useNoteActions, NOTE_KEY, type Note } from '@/lib/notes';
import { queryClient } from '@/lib/offline';
import './calendar.css';
import { K, SECHUE } from '@/lib/pal';
import { EVENT_CATEGORIES, resolveCategory, isUrgentEvent, chipLabel } from '@/lib/eventCategories';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { useTasks, useTaskActions, useLists, getTaskAlert, type Task } from '@/lib/tasks';
import {
  useEvents, useEventActions, weekStart, hoursOf, dayIndex, hhmm, at, spanRuns, dayLabels, chipInk,
  isReadOnly, liveEventIds, GRID_START, GRID_END, formatEventCountdown, layoutOverlappingEvents,
  computeVacantIntervals, formatVacantCountdown, formatDurationHours, displayedWeekNumber, gridRange,
  DOW_NAMES, type Ev, type Span, type RecurrenceRule, type RecurrenceDay, type RecurrenceFreq,
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

const VIEW_LABEL: Record<View, string> = {
  month: 'Month', week: 'Week', day: 'Day', agenda: 'Agenda', countdown: 'Next',
};

const secondSubs = new Set<(ms: number) => void>();
let secondTimer: ReturnType<typeof setInterval> | null = null;

function useSecond(): number {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    secondSubs.add(setMs);
    secondTimer ??= setInterval(() => {
      const now = Date.now();
      for (const f of secondSubs) f(now);
    }, 1000);
    return () => {
      secondSubs.delete(setMs);
      if (!secondSubs.size && secondTimer) { clearInterval(secondTimer); secondTimer = null; }
    };
  }, []);
  return ms;
}


export default function CalendarPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  // 15s, not 1s. See useSecond above for what this pays for and what it does
  // not: the seconds are rendered by the badges, which own their own timer.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15_000);
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
  /**
   * Draft tracking for the Google-style flow that creates the event the moment
   * you click a slot. If the bubble closes without a title ever being typed,
   * the draft is removed — closing a bubble you opened by accident must not
   * sprinkle "(No title)" ghosts across the database.
   */
  const draftEventRef = useRef<string | null>(null);
  const draftTaskRef = useRef<Task | null>(null);
  const [recModal, setRecModal] = useState<{
    action: 'edit' | 'delete';
    ev: Ev;
    patch?: Partial<Ev>;
  } | null>(null);
  /** Right-click target. The context menu reads everything it needs from here. */
  const [ctx, setCtx] = useState<{ ev: Ev; span?: Span | null; x: number; y: number } | null>(null);

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
  const { data: lists = [] } = useLists();
  const { data: notebooks = [] } = useNotebooks();
  const A = useEventActions(ws);
  const TA = useTaskActions();
  const NA = useNoteActions();
  const router = useRouter();
  // The timers follow the real week, whichever week the grid is paged to. On
  // the current week this is the same cached window the grid already reads.
  const liveWeek = useMemo(() => weekStart(new Date(), prefs.weekStart), [prefs.weekStart]);
  const { data: liveEvents = [] } = useEvents(liveWeek, 7);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTimers, setShowTimers] = useState(() => {
    try { return localStorage.getItem('cal_show_timers') !== 'false'; } catch { return true; }
  });

  // Only the single immediate next event (or currently ongoing event) displays the countdown timer
  const nextEventId = useMemo(() => {
    const nonAllDay = events.filter((e) => !e.all_day && !e.deleted_at);
    const ongoing = nonAllDay
      .filter((e) => new Date(e.starts_at).getTime() <= nowMs && nowMs <= new Date(e.ends_at).getTime())
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
    if (ongoing) return ongoing.id;

    const upcoming = nonAllDay
      .filter((e) => new Date(e.starts_at).getTime() > nowMs)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
    return upcoming?.id ?? null;
  }, [events, nowMs]);

  const [showVacant, setShowVacant] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cal_show_vacant');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  // The toast is sent outside the state setter: React may run a setter twice,
  // and a toast from inside one was shown twice and warned about.
  const toggleVacant = () => {
    const next = !showVacant;
    setShowVacant(next);
    try { localStorage.setItem('cal_show_vacant', String(next)); } catch { /* the choice lasts for this visit */ }
    toast(next ? 'Free time shown between events' : 'Free time hidden');
  };

  const toggleTimers = () => {
    const next = !showTimers;
    setShowTimers(next);
    try { localStorage.setItem('cal_show_timers', String(next)); } catch { /* the choice lasts for this visit */ }
    toast(next ? 'Timers shown' : 'Timers hidden');
  };

  const setCalView = useCallback((v: View) => {
    setView(v);
    void update({ calView: v });
  }, [update]);

  // `shift` is rebuilt every render (it closes over ws/view), so the keyboard
  // effect reads it through a ref and keeps a stable subscription — the old
  // version re-subscribed on every render, which meant tearing down and
  // re-adding the listener once a second while the clock ticks.
  const shiftRef = useRef<(dir: number) => void>(() => {});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/input|textarea|select/i.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (pop && pop.kind === 'event') {
          e.preventDefault();
          A.removeWithUndo(pop.ev);
          setPop(null);
          setSel(null);
        } else if (!pop && sel) {
          const targetEv = events.find((ev) => ev.id === sel);
          if (targetEv) {
            e.preventDefault();
            A.removeWithUndo(targetEv);
            setSel(null);
          }
        }
        return;
      }
      // An open bubble owns the arrow keys: paging the week underneath a
      // popover it is anchored to reads as the popover teleporting. (The same
      // guard stops a focused <select> from paging as a side effect — the
      // input guard above catches it first now.)
      if (pop) return;
      if (e.key === 'ArrowLeft') shiftRef.current(-1);
      if (e.key === 'ArrowRight') shiftRef.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pop, sel, events, A]);

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
  shiftRef.current = shift;

  const goToday = () => {
    const today = new Date();
    const w = weekStart(today, prefs.weekStart);
    setWs(w);
    setFocusDay(dayIndex(today.toISOString(), w));
  };

  /* The title names the month; the line under it says which days and how much is on them. */
  const weekEnd = new Date(at(ws, 6, 12));
  const monthShown = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate() + 6);
  const heading = view === 'countdown'
    ? 'Up next'
    : view === 'day'
      ? new Date(at(ws, focusDay, 12)).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : view === 'month'
        ? monthShown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : ws.getMonth() === weekEnd.getMonth()
          ? ws.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : `${ws.toLocaleDateString(undefined, { month: 'short' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  const [rangeFrom, rangeTo] = view === 'day'
    ? [Date.parse(at(ws, focusDay, 0)), Date.parse(at(ws, focusDay + 1, 0))]
    : view === 'month'
      ? [new Date(monthShown.getFullYear(), monthShown.getMonth(), 1).getTime(), new Date(monthShown.getFullYear(), monthShown.getMonth() + 1, 1).getTime()]
      : [Date.parse(at(ws, 0, 0)), Date.parse(at(ws, 7, 0))];
  const eventsShown = events.filter((e) => !e.deleted_at && Date.parse(e.starts_at) >= rangeFrom && Date.parse(e.starts_at) < rangeTo).length;
  const tasksShown = tasks.filter((t) => !t.done && !t.deleted_at && t.due_on
    && new Date(`${t.due_on}T12:00:00`).getTime() >= rangeFrom && new Date(`${t.due_on}T12:00:00`).getTime() < rangeTo).length;
  const subline = view === 'countdown'
    ? new Date(nowMs).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : [
      view === 'month' ? null : `Week ${displayedWeekNumber(ws, prefs.weekStart)}`,
      view === 'week' || view === 'agenda' ? `${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: ws.getMonth() === weekEnd.getMonth() ? undefined : 'short', day: 'numeric' })}` : null,
      `${eventsShown} ${eventsShown === 1 ? 'event' : 'events'}`,
      tasksShown ? `${tasksShown} ${tasksShown === 1 ? 'task' : 'tasks'} due` : null,
    ].filter(Boolean).join(' · ');

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
      draftTaskRef.current = newTask;
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
    draftEventRef.current = newId;
    setPop({ kind: 'event', ev: createdEv, x, y });
  };

  /** A draft stops being disposable the moment it shows a real title or intent. */
  const commitDraft = () => { draftEventRef.current = null; draftTaskRef.current = null; };

  /**
   * Set when a bubble action leaves the page. The route change closes the
   * bubble while React is committing the next page, where a state update is
   * not allowed, and the page is going away with it anyway.
   */
  const leavingRef = useRef(false);

  const closePop = () => {
    if (leavingRef.current) return;
    const draftId = draftEventRef.current;
    if (draftId) {
      draftEventRef.current = null;
      A.remove.mutate({ id: draftId });
      toast('Empty event discarded');
    }
    const draftTask = draftTaskRef.current;
    if (draftTask) {
      draftTaskRef.current = null;
      TA.remove.mutate({ id: draftTask.id });
      toast('Empty task discarded');
    }
    setPop(null);
  };

  /**
   * The Event and Task switch on a new, untitled item. The draft that was
   * made for the slot is dropped quietly and the other kind is made in the
   * same place, so nothing is left behind whichever one is kept.
   */
  const switchDraft = () => {
    if (!pop || pop.kind === 'slot') return;
    const { x, y } = pop;
    if (pop.kind === 'event' && draftEventRef.current === pop.ev.id) {
      A.remove.mutate({ id: pop.ev.id });
      draftEventRef.current = null;
      const ev = pop.ev;
      openSlot(dayIndex(ev.starts_at, ws), ev.all_day ? GRID_START : hoursOf(ev.starts_at), x, y, ev.all_day, undefined, 'task');
    } else if (pop.kind === 'task' && draftTaskRef.current?.id === pop.task.id) {
      TA.remove.mutate({ id: pop.task.id });
      draftTaskRef.current = null;
      const t = pop.task;
      const day = t.due_on ? dayIndex(`${t.due_on}T12:00:00`, ws) : 0;
      openSlot(day, t.due_at ? hoursOf(t.due_at) : GRID_START, x, y, !t.due_at, undefined, 'event');
    }
  };

  /** When the last event before this one ended on the same day, where the wait for it began. */
  const previousEndOf = (ev: Ev): string | null => {
    const start = Date.parse(ev.starts_at);
    const day = new Date(ev.starts_at).toDateString();
    let best: string | null = null;
    for (const e of events) {
      if (e.id === ev.id || e.all_day || e.deleted_at) continue;
      const end = Date.parse(e.ends_at);
      if (end <= start && new Date(e.ends_at).toDateString() === day && (!best || end > Date.parse(best))) best = e.ends_at;
    }
    return best;
  };

  /**
   * Take notes starts a page for the event in the notebook written in most
   * recently, or in a new Notes notebook when there is none yet, and opens it.
   *
   * The bubble stays open until the route changes. Closing it first sends
   * the browser Back that removes its history entry, and that Back cancels
   * the route push.
   */
  const takeNotes = async (ev: Ev) => {
    commitDraft();
    const recent = (queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [])
      .find((n) => !n.deleted_at && notebooks.some((b) => b.id === n.notebook_id));
    let book = notebooks.find((b) => b.id === recent?.notebook_id) ?? [...notebooks].sort((a, b) => a.position - b.position)[0];
    if (!book) {
      const created = { id: crypto.randomUUID(), name: 'Notes', color: '#345cff', position: 0 };
      try { await NA.newNotebook.mutateAsync(created); } catch { toast('Could not make a notebook for these notes'); return; }
      book = { ...created, created_at: new Date().toISOString() };
    }
    const start = new Date(ev.starts_at);
    const day = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const when = ev.all_day ? day : `${day} · ${hhmm(hoursOf(ev.starts_at))} – ${hhmm(hoursOf(ev.ends_at))}`;
    const label = ev.title?.trim() && ev.title !== '(No title)' ? chipLabel(ev) : 'Event';
    const id = crypto.randomUUID();
    NA.newNote.mutate({
      id, notebook_id: book.id,
      title: `${label} · ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      body: `*${when}${ev.location ? ` · ${ev.location}` : ''}*\n\n`,
    });
    toast(`Notes page started in ${book.name}`);
    leavingRef.current = true;
    router.push(`/notebooks/?open=${id}`);
  };

  /**
   * The New button: an event at the next full hour today when today is on
   * screen, or at 9 AM on the first day that is.
   */
  const newEvent = (x: number, y: number) => {
    const now = new Date();
    const todayIdx = dayIndex(now.toISOString(), ws);
    let day = todayIdx >= 0 && todayIdx < 7 ? todayIdx : 0;
    if (view === 'day') day = focusDay;
    if (view === 'countdown') day = todayIdx;
    if (view === 'month') {
      const shown = new Date(windowStart);
      shown.setDate(shown.getDate() + 6);
      day = now.getMonth() === shown.getMonth() && now.getFullYear() === shown.getFullYear()
        ? todayIdx
        : dayIndex(new Date(shown.getFullYear(), shown.getMonth(), 1).toISOString(), ws);
    }
    const hour = day === todayIdx ? Math.min(23, now.getHours() + 1) : 9;
    openSlot(day, hour, x, y, false, hour + 1);
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

  const buildStudySchedule = () => {
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    const tomYmd = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

    const blocks = [
      { title: 'S1: Wind-down & Hydration', starts_at: `${todayYmd}T14:40:00`, ends_at: `${todayYmd}T15:30:00`, color: '#34D9A0', location: 'Desk' },
      { title: 'S2: Reset Nap (1h 50m)', starts_at: `${todayYmd}T15:30:00`, ends_at: `${todayYmd}T17:20:00`, color: '#8A86A6', location: 'Bed' },
      { title: 'S3: Recovery & Dinner', starts_at: `${todayYmd}T17:20:00`, ends_at: `${todayYmd}T18:00:00`, color: '#FFC24B', location: 'Kitchen' },
      { title: 'S4: Study Session 1 (Difficult Concepts)', starts_at: `${todayYmd}T18:00:00`, ends_at: `${todayYmd}T20:30:00`, color: '#7C8CFF', location: 'Desk' },
      { title: 'S5: Screen-Free Break', starts_at: `${todayYmd}T20:30:00`, ends_at: `${todayYmd}T21:00:00`, color: '#34D9A0', location: 'Room' },
      { title: 'S6: Study Session 2 (Active Recall)', starts_at: `${todayYmd}T21:00:00`, ends_at: `${todayYmd}T23:15:00`, color: '#7C8CFF', location: 'Desk' },
      { title: 'S7: Rest Break', starts_at: `${todayYmd}T23:15:00`, ends_at: `${todayYmd}T23:30:00`, color: '#34D9A0', location: 'Room' },
      { title: 'S8: Study Session 3 (Summary Review)', starts_at: `${todayYmd}T23:30:00`, ends_at: `${tomYmd}T00:30:00`, color: '#7C8CFF', location: 'Desk' },
      { title: 'S9: Core Night Sleep (5h 30m)', starts_at: `${tomYmd}T00:30:00`, ends_at: `${tomYmd}T06:00:00`, color: '#8A86A6', location: 'Bed' },
      { title: 'S10: Breakfast & Travel', starts_at: `${tomYmd}T06:00:00`, ends_at: `${tomYmd}T07:00:00`, color: '#38D6F2', location: 'Transit' },
      { title: 'Class Hours', starts_at: `${tomYmd}T07:00:00`, ends_at: `${tomYmd}T12:00:00`, color: '#7C8CFF', location: 'Campus' },
      { title: 'S11: Final Light Review', starts_at: `${tomYmd}T12:00:00`, ends_at: `${tomYmd}T12:45:00`, color: '#FFC24B', location: 'Library' },
      { title: 'Major Course Exam', starts_at: `${tomYmd}T13:00:00`, ends_at: `${tomYmd}T15:00:00`, color: '#FF6FA8', location: 'Exam Room' },
    ];

    for (const b of blocks) {
      A.create.mutate({
        id: crypto.randomUUID(),
        title: b.title,
        starts_at: new Date(b.starts_at).toISOString(),
        ends_at: new Date(b.ends_at).toISOString(),
        color: b.color,
        location: b.location,
        all_day: false,
      });
    }
    toast('Study & exam schedule built in Basedly calendar');
  };

  const menuItems: CtxGroup[] = [
    {
      label: 'Show',
      items: [
        { label: 'Up next and Today ends timers', icon: 'clock', checked: showTimers, run: toggleTimers },
        { label: 'Free time between events', icon: 'eye', checked: showVacant, run: toggleVacant },
      ],
    },
    {
      items: [
        {
          label: 'Lock events in place', icon: 'lock', checked: prefs.lockEvents,
          hint: 'Stops a scroll from moving an event by mistake',
          run: () => { void update({ lockEvents: !prefs.lockEvents }); toast(prefs.lockEvents ? 'Events can be dragged again' : 'Events locked in place'); },
        },
        { label: 'Build study & exam schedule', icon: 'spark', run: buildStudySchedule },
        { label: 'Import a schedule (photo or .ics)', icon: 'spark', run: () => setImporting(true) },
      ],
    },
    { items: [{ label: 'Clear every event', icon: 'trash', danger: true, run: () => void clearEverything() }] },
  ];

  return (
    <div className="calendar-page" style={{
      height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <header className="cal-head">
        <div className="cal-head-title">
          <h1>{heading}</h1>
          <p>{subline}{prefs.lockEvents && <span className="cal-head-lock"><Icon name="lock" size={11} />Locked</span>}</p>
        </div>

        <div className="cal-head-nav">
          {view !== 'countdown' && (
            <div className="cal-pager" role="group" aria-label="Move through the calendar">
              <button type="button" onClick={() => shift(-1)} aria-label={`Previous ${view}`} title={`Previous ${view}`}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button type="button" className="cal-pager-today" onClick={goToday}>Today</button>
              <button type="button" onClick={() => shift(1)} aria-label={`Next ${view}`} title={`Next ${view}`}>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          )}
          <ViewSwitcher view={view} onChange={setCalView} phone={phone} />
        </div>

        <div className="cal-head-actions">
          <button type="button" className="cal-new" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); newEvent(r.left, r.bottom); }}>
            <Icon name="plus" size={16} /><span>New</span>
          </button>
          <button type="button" className="cal-icon-button cal-more" aria-label="Calendar options" title="Calendar options"
            aria-haspopup="menu" aria-expanded={!!menu}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.max(8, r.right - 260), y: r.bottom + 6 }); }}>
            <Icon name="dots" size={18} />
          </button>
        </div>
      </header>

      {showTimers && view !== 'countdown' && (
        <CalendarTimers events={liveEvents} time24={prefs.time24} onOpen={(ev, x, y) => openEvent(ev, x, y)} />
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="calendar" label="Calendar options"
          accent={prefs.accent} dark={prefs.theme === 'dark'} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {importing && <ScheduleImport onClose={() => setImporting(false)} />}

      <div
        data-tour="calendar-grid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', touchAction: 'pan-y' }}
      >
        <div key={view} className="k-zoomfade" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: view === 'agenda' || view === 'countdown' ? 'auto' : undefined }}>
          {/* The chrome above is not data-dependent and paints immediately;
              only the grid waits, so only the grid is outlined. */}
          {isPending && (
            <div style={{ padding: phone ? '0 14px 14px' : '0 22px 16px' }}>
              <CalendarSkeleton days={view === 'day' ? 1 : 7} />
            </div>
          )}
          {!isPending && view === 'week' && (
            <Grid days={7} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA} nowMs={nowMs} nextEventId={nextEventId} showVacant={showVacant}
              sel={sel} setSel={setSel} openEvent={openEvent} openTask={openTask} openSlot={openSlot} onSchedule={schedule} openMenu={(ev, x, y, span) => setCtx({ ev, x, y, span })} />
          )}
          {!isPending && view === 'day' && (
            <>
              <DayStrip ws={ws} focus={focusDay} onPick={setFocusDay} onJump={(w, d) => { setWs(w); setFocusDay(d); }} />
              <Grid days={1} dayOffset={focusDay} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA} nowMs={nowMs} nextEventId={nextEventId} showVacant={showVacant}
                sel={sel} setSel={setSel} openEvent={openEvent} openTask={openTask} openSlot={openSlot} onSchedule={schedule} openMenu={(ev, x, y, span) => setCtx({ ev, x, y, span })} />
            </>
          )}
          {!isPending && view === 'month' && (
            <Month ws={windowStart}
              // The month being displayed, not the week-start's month: the
              // week that contains the 1st can begin in the previous month,
              // and reading the month off `ws` dimmed the first rows of the
              // real month. ws+6 days always lands inside it.
              month={new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate() + 6).getMonth()}
              events={events} tasks={windowTasks} nextEventId={nextEventId}

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
          {!isPending && view === 'agenda' && <Agenda ws={ws} events={events} tasks={windowTasks} nextEventId={nextEventId} />}
          {!isPending && view === 'countdown' && (
            <NextView events={liveEvents} tasks={tasks} time24={prefs.time24}
              onOpenEvent={(ev, x, y) => openEvent(ev, x, y)} onOpenTask={openTask}
              onSnooze={(ev) => { A.snooze.mutate({ id: ev.master_id || ev.id }); toast(`The reminder for ${chipLabel(ev)} comes 10 minutes later`); }} />
          )}
        </div>
      </div>

      {pop?.kind === 'event' && (
        <EventBubble key={pop.ev.id} ev={pop.ev} x={pop.x} y={pop.y}
          runDays={pop.span && pop.span.days > 1 ? pop.span.days : 0}
          draft={draftEventRef.current === pop.ev.id}
          previousEnd={previousEndOf(pop.ev)}
          time24={prefs.time24}
          onClose={closePop}
          onEdit={() => { commitDraft(); setEdit(pop.ev); setPop(null); }}
          onDuplicate={() => { commitDraft(); A.duplicate(pop.ev); setPop(null); }}
          onDelete={() => {
            commitDraft();
            if (pop.ev.is_recurring_instance || pop.ev.recurrence) {
              setRecModal({ action: 'delete', ev: pop.ev });
            } else {
              A.removeWithUndo(pop.ev);
            }
            setPop(null);
          }}
          onDeleteRun={() => {
            commitDraft();
            const run = pop.span;
            if (!run) return;
            A.wipeRun(events.filter((e) => run.ids.includes(e.id)));
            setPop(null);
          }}
          onUpdateTitle={(title) => {
            if (title.trim() && title.trim() !== '(No title)') commitDraft();
            const targetId = pop.ev.master_id || pop.ev.id;
            A.update.mutate({ id: targetId, patch: { title } });
            setPop((prev) => prev && prev.kind === 'event' ? { ...prev, ev: { ...prev.ev, title } } : prev);
          }}
          onPatch={(patch) => {
            commitDraft();
            A.update.mutate({ id: pop.ev.master_id || pop.ev.id, patch });
            setPop((prev) => prev && prev.kind === 'event' ? { ...prev, ev: { ...prev.ev, ...patch } } : prev);
          }}
          onTakeNotes={() => void takeNotes(pop.ev)}
          onSwitchToTask={switchDraft}
        />
      )}

      {pop?.kind === 'task' && (
        <TaskBubble key={pop.task.id} task={pop.task} x={pop.x} y={pop.y}
          draft={draftTaskRef.current?.id === pop.task.id}
          lists={lists} tags={prefs.tags} time24={prefs.time24}
          onClose={closePop}
          onComplete={() => {
            commitDraft();
            const { id, title } = pop.task;
            const done = !pop.task.done;
            TA.complete.mutate({ id, done });
            if (done) {
              toast(`Done: ${title}`, () => TA.complete.mutate({ id, done: false }));
              setPop(null);
            } else {
              setPop((prev) => prev && prev.kind === 'task' ? { ...prev, task: { ...prev.task, done } } : prev);
            }
          }}
          onDelete={() => {
            commitDraft();
            TA.removeWithUndo(pop.task);
            setPop(null);
          }}
          onUpdateTitle={(title) => {
            if (title.trim() && title.trim() !== '(No title)') commitDraft();
            TA.update.mutate({ id: pop.task.id, patch: { title } });
            setPop((prev) => prev && prev.kind === 'task' ? { ...prev, task: { ...prev.task, title } } : prev);
          }}
          onPatch={(patch) => {
            commitDraft();
            const before = pop.task;
            TA.update.mutate({ id: before.id, patch });
            setPop((prev) => prev && prev.kind === 'task' ? { ...prev, task: { ...prev.task, ...patch } } : prev);
            if ('due_on' in patch) {
              const undo = () => TA.update.mutate({ id: before.id, patch: { due_on: before.due_on, due_at: before.due_at ?? null } });
              toast(patch.due_on
                ? `Moved to ${new Date(`${patch.due_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`
                : 'Date removed', undo);
            }
          }}
          onOpenInTasks={() => { commitDraft(); leavingRef.current = true; router.push(`/tasks/?detail=${pop.task.id}`); }}
          onSwitchToEvent={switchDraft}
        />
      )}

      {edit && (
        <EditSheet
          ev={edit}
          onClose={() => setEdit(null)}
          onSave={(patch) => {
            if (edit.is_recurring_instance) {
              setRecModal({ action: 'edit', ev: edit, patch });
              setEdit(null);
              return;
            }
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
                location: patch.location || '',
                recurrence: patch.recurrence,
              });
            }
            setEdit(null);
          }}
        />
      )}

      {recModal && (
        <RecurrenceChoiceModal
          action={recModal.action}
          onClose={() => setRecModal(null)}
          onChoose={(choice) => {
            const { action, ev, patch } = recModal;
            const masterId = ev.master_id || ev.id;
            const masterEv = events.find((e) => e.id === masterId) || ev;
            const dateStr = ev.starts_at.slice(0, 10);

            if (action === 'delete') {
              if (choice === 'this') {
                const curRule = masterEv.recurrence || { freq: 'daily' };
                const exceptions = [...(curRule.exceptions ?? []), dateStr];
                A.update.mutate({
                  id: masterId,
                  patch: { recurrence: { ...curRule, exceptions } },
                });
                toast('Deleted this recurring occurrence');
              } else if (choice === 'following') {
                const prevDay = new Date(ev.starts_at);
                prevDay.setDate(prevDay.getDate() - 1);
                const untilStr = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
                const curRule = masterEv.recurrence || { freq: 'daily' };
                A.update.mutate({
                  id: masterId,
                  patch: { recurrence: { ...curRule, endType: 'until', until: untilStr } },
                });
                toast('Deleted this and all following events');
              } else if (choice === 'all') {
                A.removeWithUndo(masterEv);
              }
            } else if (action === 'edit' && patch) {
              if (choice === 'this') {
                const curRule = masterEv.recurrence || { freq: 'daily' };
                const exceptions = [...(curRule.exceptions ?? []), dateStr];
                A.update.mutate({
                  id: masterId,
                  patch: { recurrence: { ...curRule, exceptions } },
                });
                const newId = crypto.randomUUID();
                A.create.mutate({
                  id: newId,
                  title: patch.title ?? ev.title,
                  short_name: patch.short_name !== undefined ? patch.short_name : ev.short_name,
                  location: patch.location ?? ev.location,
                  color: patch.color ?? ev.color,
                  text_color: patch.text_color !== undefined ? patch.text_color : ev.text_color,
                  starts_at: patch.starts_at ?? ev.starts_at,
                  ends_at: patch.ends_at ?? ev.ends_at,
                  all_day: patch.all_day ?? ev.all_day,
                });
                toast('Updated this event');
              } else if (choice === 'following') {
                const prevDay = new Date(ev.starts_at);
                prevDay.setDate(prevDay.getDate() - 1);
                const untilStr = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
                const curRule = masterEv.recurrence || { freq: 'daily' };
                A.update.mutate({
                  id: masterId,
                  patch: { recurrence: { ...curRule, endType: 'until', until: untilStr } },
                });
                const newSeriesId = crypto.randomUUID();
                A.create.mutate({
                  id: newSeriesId,
                  title: patch.title ?? ev.title,
                  short_name: patch.short_name !== undefined ? patch.short_name : ev.short_name,
                  location: patch.location ?? ev.location,
                  color: patch.color ?? ev.color,
                  text_color: patch.text_color !== undefined ? patch.text_color : ev.text_color,
                  starts_at: patch.starts_at ?? ev.starts_at,
                  ends_at: patch.ends_at ?? ev.ends_at,
                  all_day: patch.all_day ?? ev.all_day,
                  recurrence: patch.recurrence || curRule,
                });
                toast('Updated this and all following events');
              } else if (choice === 'all') {
                A.update.mutate({
                  id: masterId,
                  patch,
                });
                toast('Updated all recurring events');
              }
            }
            setRecModal(null);
          }}
        />
      )}

      {/* Right-click menu. Left click already opens the bubble; right click is
          for people who already know what they want, so it is all actions:
          jump straight to edit, recolour without opening the sheet, delete. */}
      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y} kind="event" label={chipLabel(ctx.ev)}
          accent={prefs.accent} dark={prefs.theme === 'dark'}
          items={contextItems(ctx.ev, ctx.span, A, setEdit, setRecModal)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

/**
 * The month/week/day/agenda/next switcher. The active pill is a shared element
 * (one `layoutId`) so changing view slides the pill along the rail instead of
 * teleporting — the same treatment the tab rail gets.
 */
function ViewSwitcher({ view, onChange, phone }: { view: View; onChange: (v: View) => void; phone: boolean }) {
  return (
    <div data-tour="calendar-view-toggle"
      style={{ position: 'relative', display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'var(--card2)', border: '1px solid var(--line)' }}>
      {(['month', 'week', 'day', 'agenda', 'countdown'] as View[]).map((v) => {
        const on = view === v;
        return (
          <button key={v} onClick={() => onChange(v)} className="k-chip" aria-pressed={on}
            aria-label={VIEW_LABEL[v]} title={VIEW_LABEL[v]}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: phone ? 32 : undefined, height: 28, padding: phone ? 0 : '0 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 650, color: on ? 'var(--tx)' : 'var(--tx3)' }}>
            {on && (
              <motion.span layoutId="cal-view-pill"
                transition={{ type: 'spring', stiffness: 560, damping: 42 }}
                style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--card)', boxShadow: '0 1px 3px #0002, 0 0 0 1px var(--line)' }} />
            )}
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={VIEW_ICON[v]} size={14} color={on ? 'var(--poster-blue)' : 'var(--tx3)'} />
              {!phone && <span>{VIEW_LABEL[v]}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- week/day */

type RecModalState = { action: 'edit' | 'delete'; ev: Ev; patch?: Partial<Ev> } | null;

/**
 * The right-click menu's rows. Recolouring lives here as a submenu of the nine
 * categories — the one edit people do most often, put one gesture away instead
 * of behind the full editor.
 */
function contextItems(
  ev: Ev,
  span: Span | null | undefined,
  A: ReturnType<typeof useEventActions>,
  setEdit: (ev: Ev) => void,
  setRecModal: (m: RecModalState) => void,
): CtxGroup[] {
  const current = resolveCategory(ev.color);
  const multiDay = !!span && span.days > 1;
  const del = () => {
    if (ev.is_recurring_instance || ev.recurrence) setRecModal({ action: 'delete', ev });
    else A.removeWithUndo(ev);
  };
  return [
    {
      items: [
        { label: 'Edit', icon: 'edit', run: () => setEdit(ev) },
        { label: 'Duplicate', icon: 'copy', run: () => A.duplicate(ev) },
      ],
    },
    {
      label: 'Category',
      items: EVENT_CATEGORIES.map((c) => ({
        label: c.label,
        icon: c.icon,
        checked: current.id === c.id,
        run: () => A.update.mutate({ id: ev.master_id || ev.id, patch: { color: c.color } }),
      })),
    },
    {
      items: [
        multiDay
          ? { label: `Delete all ${span!.days} days`, icon: 'trash' as IconName, danger: true, run: del }
          : { label: 'Delete', icon: 'trash' as IconName, danger: true, run: del },
      ],
    },
  ];
}

function Grid({
  days, dayOffset = 0, ws, events, tasks, A, TA, sel, setSel, openEvent, openTask, openSlot, onSchedule, openMenu, nowMs = Date.now(), nextEventId, showVacant = true,
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
  openMenu: (ev: Ev, x: number, y: number, span?: Span | null) => void;
  nowMs?: number;
  nextEventId?: string | null;
  showVacant?: boolean;
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
  const slotDragRef = useRef<{ day: number; startHour: number; currentHour: number; startX: number; startY: number } | null>(null);
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

    const initDrag = {
      day,
      startHour: snapHour,
      currentHour: snapHour + 1,
      startX,
      startY,
    };
    slotDragRef.current = initDrag;
    setSlotDrag(initDrag);

    const onMove = (m: PointerEvent) => {
      const rawH = GRID_START + ((m.clientY - rect.top) / rect.height) * SPAN;
      const snappedH = Math.max(GRID_START, Math.min(GRID_END, Math.round(rawH * 2) / 2));
      const nextDrag = { day, startHour: snapHour, currentHour: snappedH, startX, startY };
      slotDragRef.current = nextDrag;
      setSlotDrag((prev) => (prev && prev.currentHour !== snappedH ? nextDrag : prev));

    };

    const onUp = (m: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const curr = slotDragRef.current;
      slotDragRef.current = null;
      setSlotDrag(null);

      if (curr) {
        const s = Math.min(curr.startHour, curr.currentHour);
        const rawE = Math.max(curr.startHour, curr.currentHour);
        const eHour = (rawE === s || Math.abs(rawE - s) < 0.25) ? s + 1 : Math.max(s + 0.5, rawE);
        openSlot(curr.day, s, m.clientX, m.clientY, false, eHour);
      }
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

  const isToday = (d?: Date | null) => Boolean(d && typeof d.toDateString === 'function' && d.toDateString() === new Date().toDateString());
  const sameDay = (iso: string, d?: Date | null) => Boolean(d && typeof d.toDateString === 'function' && new Date(iso).toDateString() === d.toDateString());

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
    // Measured once, on press, the way onSlotPointerDown already does it.
    // Reading it inside onMove forced a synchronous layout on every pointer
    // frame, right after the previous frame had written the chip's `top` — the
    // textbook read-after-write thrash. Only .left/.width are used, and the
    // grid does not move sideways mid-drag.
    const rect = bodyRef.current?.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origDay = dayIndex(ev.starts_at, ws);
    const origHour = hoursOf(ev.starts_at);
    const origEnd = hoursOf(ev.ends_at);
    // An event that crosses midnight reports its end before its start in
    // local hours; clamped here so a drag can never ask the grid for a length
    // that overflows the 24-hour band.
    const len = Math.max(0.5, Math.min(origEnd - origHour, GRID_END - origHour));
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

      if (locked || !rect) return;

      const steps = Math.round(dy / (GRID_H / SPAN / 2));

      if (action === 'move') {
        const d = days === 1 ? dayOffset : Math.max(0, Math.min(days - 1, Math.floor(((m.clientX - rect.left) / rect.width) * days)));
        const rawH = origHour + steps * 0.5;
        const h = Math.max(GRID_START, Math.min(GRID_END - len, Math.round(rawH * 2) / 2));
        // Both values are snapped, so most pointer frames land on the square
        // the last one did. Bail out rather than hand React a new object.
        setDrag((p) => (p && p.id === ev.id && p.day === d && p.hour === h ? p : { id: ev.id, day: d, hour: h }));
      } else {
        const rawE = origEnd + steps * 0.5;
        const end = Math.max(origHour + 0.5, Math.min(GRID_END, Math.round(rawE * 2) / 2));
        setResize((p) => (p && p.id === ev.id && p.end === end ? p : { id: ev.id, end }));
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
      const hour = steps * 0.5;
      setSpanDrag((p) => (p && p.key === s.key && p.day === dayStep && p.hour === hour
        ? p : { key: s.key, id: ev.id, fromDay: origDay, day: dayStep, hour }));
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
    // Where the drag last was, kept here rather than read back inside a state
    // updater: opening the bubble from an updater set the page's state while
    // the grid was rendering, which React reports as an error.
    let target: { day: number; hour: number | null } | null = null;

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
      target = { day, hour };
      setTaskDrag((p) => (p && p.task === t && p.day === day && p.hour === hour ? p : { task: t, day, hour }));
    };

    const onUp = (m: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTaskDrag(null);
      const dropped = target as { day: number; hour: number | null } | null;
      if (moved && dropped) onSchedule(t, dropped.day, dropped.hour);
      else if (!moved) openTask(t, m.clientX, m.clientY);
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
        <div className={'cal-dayheads' + (days === 1 ? ' is-single' : '')} style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {Array.from({ length: days }, (_, i) => {
            const idx = colOf(i);
            const d = new Date(ws);
            d.setDate(d.getDate() + idx);
            const today = d.toDateString() === new Date().toDateString();
            const past = !today && d.getTime() < new Date().setHours(0, 0, 0, 0);
            return (
              <div key={i} className={'cal-dayhead' + (today ? ' is-today' : past ? ' is-past' : '')} aria-current={today ? 'date' : undefined}>
                <span>{DAYS_SHORT[idx]}</span>
                <b>{d.getDate()}</b>
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
                  <div key={e.id} onPointerDown={(p) => press(p, e, 'move')}
                    onContextMenu={(p) => { p.preventDefault(); p.stopPropagation(); openMenu(e, p.clientX, p.clientY); }}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, marginBottom: 2, cursor: 'grab',
                      background: `color-mix(in srgb, ${e.color} 26%, var(--card))`, color: 'var(--tx)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{chipLabel(e)}</div>
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
                    onContextMenu={phone ? undefined : (p) => { p.preventDefault(); openSlot(idx, h, p.clientX, p.clientY, false, h + 1); }}
                    className={phone ? '' : 'hov'}
                    aria-label={`Add event at ${hhmm(h)}`}
                    style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `${(hi / SPAN) * 100}%`, height: `${(1 / SPAN) * 100}%`,
                      background: 'transparent', cursor: 'pointer', zIndex: 1,
                    }}
                  />
                ))}

                {/* Vacant / free time intervals with bidirectional arrow & countdown unto next event */}
                {showVacant && (() => {
                  const colDate = new Date(ws);
                  colDate.setDate(colDate.getDate() + idx);
                  const isColToday = isToday(colDate);
                  const nowHour = new Date(nowMs).getHours() + new Date(nowMs).getMinutes() / 60 + new Date(nowMs).getSeconds() / 3600;

                  const dayItems = [
                    ...events
                      .filter((e) => !e.all_day && !e.deleted_at && dayIndex(e.starts_at, ws) === idx)
                      .map((e) => ({
                        id: e.id,
                        title: e.title,
                        start: hoursOf(e.starts_at),
                        end: hoursOf(e.ends_at),
                        starts_at: e.starts_at,
                        ends_at: e.ends_at,
                      })),
                    ...slotTasks(idx).map((t) => ({
                      id: t.id,
                      title: t.title,
                      start: hoursOf(t.due_at!),
                      end: hoursOf(t.due_at!) + 1.0,
                      starts_at: t.due_at!,
                      ends_at: new Date(new Date(t.due_at!).getTime() + 3600000).toISOString(),
                    })),
                  ];

                  const vacantList = computeVacantIntervals(dayItems, isColToday, nowHour, nextEventId, GRID_START, GRID_END);

                  return vacantList.map((v) => (
                    <VacantTimeIndicator
                      key={v.id}
                      startHour={v.startHour}
                      endHour={v.endHour}
                      targetStartsAt={v.targetStartsAt}
                      isNext={v.isNext}
                    />
                  ));
                })()}

                {/* Events and timed tasks for this day, packed together into non-obstructing sub-columns */}
                {(() => {
                  type ScheduleItem =
                    | { kind: 'event'; ev: Ev; id: string }
                    | { kind: 'task'; task: Task; id: string };

                  const dayColEvents = events
                    .filter((e) => !e.all_day && !e.deleted_at
                      // A multi-day run is drawn as one bar by SpanChip; the
                      // per-day pass skips its members so the run does not
                      // also appear as N separate chips. (The `spanned` set
                      // existed for exactly this and was never consulted —
                      // that is why run bars never appeared.)
                      && !spanned.has(e.id)
                      && (dayIndex(e.starts_at, ws) === idx || (drag?.id === e.id && drag.day === idx)))
                    .map((e) => {
                      const isDrag = drag?.id === e.id;
                      const isResize = resize?.id === e.id;
                      // gridRange keeps a midnight-crossing event inside the
                      // day it starts on instead of folding it to a negative
                      // height.
                      const range = gridRange(e.starts_at, e.ends_at);
                      const len = Math.max(0.5, range.end - range.start);
                      const start = isDrag ? drag.hour : range.start;
                      const end = isResize ? resize.end : isDrag ? drag.hour + len : range.end;
                      return {
                        ev: { kind: 'event' as const, ev: e, id: e.id },
                        start,
                        end,
                      };
                    });

                  const dayColTasks = slotTasks(idx).map((t) => {
                    const isTDrag = taskDrag?.task.id === t.id && taskDrag.day === idx && taskDrag.hour !== null;
                    const start = isTDrag ? taskDrag.hour! : hoursOf(t.due_at!);
                    const end = start + 1.0;
                    return {
                      ev: { kind: 'task' as const, task: t, id: t.id },
                      start,
                      end,
                    };
                  });

                  const allItems = [...dayColEvents, ...dayColTasks];
                  const positioned = layoutOverlappingEvents<ScheduleItem>(allItems);

                  return positioned.map((pos) => {
                    const item = pos.ev;
                    const leftPct = (pos.colIndex / pos.totalCols) * 100;
                    const widthPct = (1 / pos.totalCols) * 100;
                    const leftStyle = pos.totalCols > 1 ? `calc(${leftPct}% + 2px)` : '3px';
                    const widthStyle = pos.totalCols > 1 ? `calc(${widthPct}% - 4px)` : 'calc(100% - 6px)';

                    if (item.kind === 'event') {
                      const e = item.ev;
                      const isDrag = drag?.id === e.id;
                      const isResize = resize?.id === e.id;
                      if (isDrag && drag.day !== idx) return null;

                      return (
                        <EventChip
                          key={`ev-${e.id}`}
                          ev={e}
                          top={pct(pos.start)}
                          height={Math.max((0.5 / SPAN) * 100, pct(pos.end) - pct(pos.start))}
                          left={leftStyle}
                          width={widthStyle}
                          label={hhmm(pos.start)}
                          lifted={isDrag || isResize}
                          selected={sel === e.id}
                          isNext={e.id === nextEventId}
                          onPointerDown={(p) => press(p, e, 'move')}
                          onResize={(p) => press(p, e, 'resize')}
                          dark={dark}
                          onOpen={(p) => openEvent(e, p.clientX, p.clientY)}
                          onContext={(p) => { p.preventDefault(); p.stopPropagation(); openMenu(e, p.clientX, p.clientY); }}
                        />
                      );
                    } else {
                      const t = item.task;
                      const ghost = taskDrag?.task.id === t.id;
                      return (
                        <TaskChip
                          key={`task-${t.id}`}
                          task={t}
                          onPointerDown={(p) => pressTask(p, t, false)}
                          compact={pos.totalCols > 1}
                          style={{
                            position: 'absolute',
                            left: leftStyle,
                            width: widthStyle,
                            top: `${pct(pos.start)}%`,
                            height: `${(1 / SPAN) * 100}%`,
                            opacity: ghost ? 0.4 : 1,
                            zIndex: 2,
                          }}
                        />
                      );
                    }
                  });
                })()}

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

          {/* Multi-day runs, drawn as one continuous bar across their columns
              instead of N separate chips. position:absolute against bodyRef,
              which spans every column, so left/width are day fractions. */}
          {days > 1 && spans.filter((s) => s.days > 1).map((s) => (
            <SpanChip key={s.key} span={s} days={days} dark={dark} nowMs={nowMs}
              offset={spanDrag?.key === s.key ? { day: spanDrag.day, fromDay: spanDrag.fromDay, hour: spanDrag.hour } : null}
              onPointerDown={(p) => pressSpan(p, s)}
              onOpen={(x, y) => openEvent(s.ev, x, y, s)}
              onContext={(p) => { p.preventDefault(); p.stopPropagation(); openMenu(s.ev, p.clientX, p.clientY, s); }} />
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The live countdown pill, shared by every view. Drawn marks, not emoji: a
 * solid dot (breathing, via k-pulse) while the event is happening, a hollow
 * one while it is coming. Token colours only, so it survives both themes.
 */
function CdBadge({ cd, subtle }: { cd: { status: string; badge: string }; subtle?: boolean }) {
  const ongoing = cd.status === 'ongoing';
  const HUE = ongoing ? 'var(--pal-mint)' : 'var(--pal-sky)';
  return (
    <span className="k-tagin" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: subtle ? 9 : 9.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
      padding: '2px 7px', borderRadius: 999, flex: 'none', maxWidth: '100%',
      background: `color-mix(in srgb, ${HUE} ${ongoing ? 28 : 24}%, var(--card))`,
      color: ongoing ? 'var(--pal-mint)' : 'var(--pal-sky)',
      border: `1px solid color-mix(in srgb, ${HUE} 55%, transparent)`,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      <span
        aria-hidden
        className={ongoing ? 'k-pulse' : undefined}
        style={{ width: 6, height: 6, borderRadius: 3, flex: 'none', background: HUE }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cd.badge}</span>
    </span>
  );
}

function EventChip({
  ev, top, height, left = '3px', width = 'calc(100% - 6px)', label, lifted, selected, dark, isNext, nowMs = Date.now(), onPointerDown, onResize, onOpen, onContext,
}: {
  ev: Ev; top: number; height: number; left?: string | number; width?: string | number; label: string; lifted: boolean; selected: boolean;
  dark: boolean; isNext?: boolean; nowMs?: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  onOpen: (e: React.MouseEvent) => void;
  onContext?: (e: React.MouseEvent) => void;
}) {
  const locked = isReadOnly(ev);
  const ink = chipInk(ev, dark);
  const isPast = new Date(ev.ends_at).getTime() < nowMs;
  const cd = !isPast && isNext ? formatEventCountdown(ev.starts_at, ev.ends_at, nowMs) : null;
  const urgent = isUrgentEvent(ev.color) && !isPast;
  const cat = resolveCategory(ev.color);
  // Under ~45 minutes there is one line of room, so the time sits beside the title.
  const short = height < 3.2;
  const className = [
    'cal-event', short && 'is-short', selected && 'is-selected', urgent && 'is-urgent red-alert-pulse',
    isPast && 'is-past', lifted && 'is-lifted', locked && 'is-locked',
  ].filter(Boolean).join(' ');

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContext?.(e); }}
      className={className}
      style={{ left, width, top: `${top}%`, height: `${height}%`, '--hue': ev.color, color: ink } as React.CSSProperties}
      title={`${chipLabel(ev)} · ${cat.label}`}>
      <span className="cal-event-title">
        {locked && <Icon name="lock" size={9} color={ink} />}
        <b>{chipLabel(ev)}</b>
        {short && <small>{label}</small>}
      </span>
      {!short && <span className="cal-event-meta">{label}{ev.location ? ` · ${ev.location}` : ''}</span>}
      {cd && cd.status !== 'past' && !short && <span className="cal-event-count"><CdBadge cd={cd} /></span>}
      {/* bottom edge resizes the end time in 30-min steps */}
      {!locked && <div className="cal-event-resize" onPointerDown={onResize} />}
    </div>
  );
}


/**
 * Free time between events: a quiet band with how long it lasts. The band
 * before the next event also counts down to it.
 */
function VacantTimeIndicator({
  startHour,
  endHour,
  targetStartsAt,
  isNext,
}: {
  startHour: number;
  endHour: number;
  targetStartsAt?: string;
  isNext: boolean;
}) {
  const topPct = pct(startHour);
  const heightPct = pct(endHour) - topPct;
  const durationHours = endHour - startHour;
  if (durationHours <= 0.25) return null;
  return (
    <div aria-hidden className={'cal-free' + (isNext ? ' is-next' : '')} style={{ top: `${topPct}%`, height: `${heightPct}%` }}>
      {durationHours >= 0.5 && (
        <span className="cal-free-label">
          <b>{formatDurationHours(durationHours)} free</b>
          {isNext && targetStartsAt && durationHours >= 1 && <VacantCountdown targetStartsAt={targetStartsAt} />}
        </span>
      )}
    </div>
  );
}

/** The countdown on the one free band before the next event. Its own timer. */
function VacantCountdown({ targetStartsAt }: { targetStartsAt: string }) {
  const text = formatVacantCountdown(targetStartsAt, useSecond());
  if (!text) return null;
  return <small>{text}</small>;
}

/** The horizontal bar Google draws for a run of identical days. */
function SpanChip({ span: s, days, offset, dark, nowMs = Date.now(), onPointerDown, onOpen, onContext }: {
  span: Span; days: number;
  dark: boolean; nowMs?: number;
  offset: { day: number; fromDay: number; hour: number } | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpen: (x: number, y: number) => void;
  onContext?: (e: React.MouseEvent) => void;
}) {
  const lifted = !!offset;
  const shift = offset?.hour ?? 0;
  const range = gridRange(s.ev.starts_at, s.ev.ends_at);
  const start = range.start + shift;
  const end = Math.max(start + 0.5, range.end + shift);
  const firstDay = lifted ? offset!.fromDay + offset!.day : s.firstDay;
  const width = lifted ? 1 : s.days;
  const ink = chipInk(s.ev, dark);
  const urgent = isUrgentEvent(s.ev.color);
  const cd = formatEventCountdown(s.ev.starts_at, s.ev.ends_at, nowMs);

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={(e) => onOpen(e.clientX, e.clientY)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContext?.(e); }}
      className={urgent ? 'red-alert-pulse' : undefined}
      style={{
        position: 'absolute',
        left: `calc(${(firstDay / days) * 100}% + 3px)`,
        width: `calc(${(width / days) * 100}% - 6px)`,
        top: `${pct(start)}%`, height: `${Math.max((0.5 / SPAN) * 100, pct(end) - pct(start))}%`,
        borderRadius: 8, padding: '4px 9px', overflow: 'hidden', pointerEvents: 'auto',
        background: `color-mix(in srgb, ${s.ev.color} 26%, var(--card))`,
        borderLeft: urgent ? '3.5px solid var(--pal-coral)' : `2px solid ${s.ev.color}`,
        color: ink,
        boxShadow: lifted ? 'var(--shl)' : `inset 0 0 0 1px color-mix(in srgb, ${s.ev.color} 30%, transparent)`,
        transform: lifted ? 'scale(1.01)' : undefined,
        transition: 'box-shadow var(--k-base) var(--k-spring), transform var(--k-base) var(--k-spring)',
        zIndex: lifted ? 5 : urgent ? 3 : 2, cursor: isReadOnly(s.ev) ? 'default' : 'grab', touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, lineHeight: 1.25 }}>
        {chipLabel(s.ev)}
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
        {cd && cd.status !== 'past' && <CdBadge cd={cd} subtle />}
      </div>
    </div>
  );
}

function TaskChip({ task, onPointerDown, style, compact }: {
  task: Task; onPointerDown: (e: React.PointerEvent) => void; style?: React.CSSProperties; compact?: boolean;
}) {
  const alert = getTaskAlert(task);
  const hue = task.priority === 'high' ? 'var(--pal-coral)' : task.priority === 'med' ? 'var(--pal-amber)' : 'var(--poster-blue)';
  return (
    <div onPointerDown={onPointerDown} title={`${task.title} · drag it to a time`}
      className={'cal-task' + (compact ? ' is-compact' : '') + (style?.position === 'absolute' ? ' is-timed' : '') + (alert?.tier === 'red' ? ' is-due' : '')}
      style={{ '--hue': hue, ...style } as React.CSSProperties}>
      <span className="cal-task-ring" aria-hidden="true" />
      <span className="cal-task-title">{task.title}</span>
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
      <div className="k-breathe" style={{ position: 'absolute', left: -3, top: -3, width: 8, height: 8, borderRadius: 4, background: 'var(--pal-coral)' }} />
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
function Month({ ws, month, events, tasks, onPickDay, nextEventId }: {
  ws: Date; month: number; events: Ev[]; tasks: Task[]; onPickDay: (d: Date) => void; nextEventId?: string | null;
}) {
  const { prefs } = usePrefs();
  // Only one cell in the grid carries a countdown, so the seconds stop here
  // rather than at the page: 42 cells a second beats the whole calendar.
  const nowMs = useSecond();

  const byDay = useMemo(() => {
    const m = new Map<string, { id?: string; title: string; short_name?: string | null; color: string; starts_at?: string; ends_at?: string; task?: boolean }[]>();
    const push = (k: string, v: { id?: string; title: string; short_name?: string | null; color: string; starts_at?: string; ends_at?: string; task?: boolean }) =>
      m.set(k, [...(m.get(k) ?? []), v]);
    for (const e of events) push(new Date(e.starts_at).toDateString(), { id: e.id, title: e.title, short_name: e.short_name, color: e.color, starts_at: e.starts_at, ends_at: e.ends_at });
    for (const t of tasks) {
      if (!t.due_on) continue;
      push(new Date(`${t.due_on}T12:00:00`).toDateString(), { id: t.id, title: t.title, color: 'var(--acc)', task: true });
    }
    return m;
  }, [events, tasks]);

  // The rows stretch to fill the screen, so a tall window has room for more
  // than three events a day. Count how many chips one cell can actually show.
  const grid = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(3);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      const cell = el.querySelector<HTMLElement>('[data-month-cell]');
      if (!cell) return;
      const chip = el.querySelector<HTMLElement>('[data-month-chip]');
      const row = (chip?.offsetHeight ?? 13) + 3;
      setFits(Math.max(1, Math.floor((cell.clientHeight - 30) / row)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="k-stagger" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, boxShadow: 'var(--sh)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div ref={grid} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'auto repeat(6, minmax(96px, 1fr))', gap: 6, flex: 1, minHeight: 0 }}>
        {dayLabels(prefs.weekStart).map((d) => (
          <div key={d} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', color: 'var(--tx3)', textAlign: 'center', paddingBottom: 5 }}>{d}</div>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const date = new Date(ws);
          date.setDate(date.getDate() + i);
          const items = byDay.get(date.toDateString()) ?? [];
          const today = date.toDateString() === new Date().toDateString();
          const inMonth = date.getMonth() === month;
          // `month` is the month the grid is titled with, so leading and
          // trailing out-of-month days dim — the standard month-grid read.
          // (The old bug was different: the title month itself was computed
          // from the week-start, so in-month rows dimmed by mistake.)
          const shown = items.length > fits ? Math.max(0, fits - 1) : fits;
          return (
            <button key={i} data-month-cell onClick={() => onPickDay(date)} className="hov k-squish"
              aria-label={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{
                ['--i' as string]: i * 0.16,   // ~7ms per cell: a sweep, not a parade
                minHeight: 0, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 3,
                padding: '5px 6px', textAlign: 'left', overflow: 'hidden',
                border: `1px solid ${today ? 'color-mix(in srgb, var(--pal-sky) 55%, transparent)' : 'transparent'}`,
                background: today ? 'color-mix(in srgb, var(--pal-sky) 10%, transparent)' : 'transparent',
                boxShadow: today ? 'var(--sh)' : undefined,
                opacity: inMonth ? 1 : 0.38,
              } as React.CSSProperties}>
              <span style={{ fontSize: 11.5, fontWeight: today ? 800 : 600, color: today ? SECHUE.calendar : 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
                {date.getDate()}
              </span>
              {items.slice(0, shown).map((it, n) => {
                const isNext = it.id === nextEventId;
                const isPast = it.ends_at ? new Date(it.ends_at).getTime() < nowMs : (date.getTime() + 86400000 < nowMs);
                const cd = !isPast && isNext && it.starts_at && it.ends_at ? formatEventCountdown(it.starts_at, it.ends_at, nowMs) : null;
                const urgent = isUrgentEvent(it.color) && !isPast;

                return (
                  <span key={n} data-month-chip
                    className={urgent ? 'red-alert-pulse' : undefined}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, flex: 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                      opacity: isPast ? 0.48 : 1,
                      filter: isPast ? 'grayscale(20%)' : undefined,
                      background: `color-mix(in srgb, ${it.color} ${urgent ? 30 : 20}%, transparent)`,
                      border: it.task ? '1px dashed color-mix(in srgb, var(--acc) 50%, transparent)' : undefined,
                      color: 'var(--tx2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 3,
                    }}>
                    <span aria-hidden style={{ width: 5, height: 5, borderRadius: 3, background: it.color, flex: 'none' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: urgent ? 800 : 700 }}>
                      {chipLabel(it)}
                    </span>
                    {cd && cd.status !== 'past' && (
                      <span style={{
                        fontSize: 8,
                        fontWeight: 900,
                        flex: 'none',
                        color: cd.status === 'ongoing' ? 'var(--pal-mint)' : 'var(--pal-sky)',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {cd.text}
                      </span>
                    )}
                  </span>
                );
              })}
              {items.length > shown && <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--tx3)', paddingLeft: 2 }}>+{items.length - shown} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Agenda — one block per day, each row a colour bar, 44px time, title, location. */
function Agenda({ ws, events, tasks, nextEventId }: { ws: Date; events: Ev[]; tasks: Task[]; nextEventId?: string | null }) {
  const nowMs = useSecond();
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
          short_name?: string | null;
          meta: string;
          color: string;
          task: boolean;
        };

        const evItems: AgendaItem[] = events
          .filter((e) => dayIndex(e.starts_at, ws) === i)
          .map((e) => ({
            id: e.id, time: hoursOf(e.starts_at), starts_at: e.starts_at, ends_at: e.ends_at,
            title: e.title, short_name: e.short_name, meta: e.location, color: e.color, task: false,
          }));

        const taskItems: AgendaItem[] = tasks
          .filter((t) => dayIndex(`${t.due_on}T12:00:00`, ws) === i)
          .map((t) => ({
            id: t.id, time: t.due_at ? hoursOf(t.due_at) : 23.9, starts_at: t.due_at ?? null, ends_at: null,
            title: t.title, meta: t.due_at ? 'Task' : 'Task · no set time', color: 'var(--acc)', task: true,
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
              const isNext = a.id === nextEventId;
              const isPast = a.ends_at ? new Date(a.ends_at).getTime() < nowMs : false;
              const cd = !isPast && isNext && a.starts_at && a.ends_at ? formatEventCountdown(a.starts_at, a.ends_at, nowMs) : null;
              const urgent = isUrgentEvent(a.color) && !isPast;

              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0',
                  opacity: isPast ? 0.48 : 1,
                  filter: isPast ? 'grayscale(20%)' : undefined,
                }}>
                  <span
                    className={urgent ? 'red-alert-pulse' : undefined}
                    style={{
                      width: 3.5, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, flex: 'none',
                      background: a.color, opacity: a.task ? 0.6 : 1,
                    }}
                  />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', width: 62, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                    {a.time >= 23.5 && a.task ? '—' : hhmm(a.time)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: urgent ? 700 : 600, color: urgent ? 'var(--pal-coral)' : 'var(--tx)' }}>
                      {chipLabel(a)}
                    </span>
                    {cd && cd.status !== 'past' && <CdBadge cd={cd} />}
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

function RecurrenceChoiceModal({
  action,
  onChoose,
  onClose,
}: {
  action: 'edit' | 'delete';
  onChoose: (choice: 'this' | 'following' | 'all') => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<'this' | 'following' | 'all'>('this');

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet"
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--card)',
          borderRadius: 16,
          border: '1px solid var(--line2)',
          padding: 22,
          boxShadow: 'var(--shl)',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'var(--tx)' }}>
          {action === 'delete' ? 'Delete recurring event' : 'Edit recurring event'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {[
            { id: 'this', label: 'This event' },
            { id: 'following', label: 'This and following events' },
            { id: 'all', label: 'All events' },
          ].map((opt) => (
            <label
              key={opt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 9,
                background: selected === opt.id ? 'var(--card2)' : 'transparent',
                border: `1px solid ${selected === opt.id ? 'var(--acc)' : 'var(--line2)'}`,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--tx)',
              }}
            >
              <input
                type="radio"
                name="rec_choice"
                value={opt.id}
                checked={selected === opt.id}
                onChange={() => setSelected(opt.id as typeof selected)}
                style={{ width: 16, height: 16, accentColor: 'var(--acc)' }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="hov k-squish"
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid var(--line2)',
              background: 'transparent',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onChoose(selected)}
            className="k-squish"
            style={{
              padding: '8px 18px',
              borderRadius: 10,
              border: 'none',
              background: action === 'delete' ? 'var(--pal-coral)' : 'var(--acc)',
              color: action === 'delete' ? '#FFFFFF' : 'var(--ink)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EditSheet({ ev, onClose, onSave }: { ev: Ev; onClose: () => void; onSave: (p: Partial<Ev>) => void }) {
  const [title, setTitle] = useState(ev.title);
  const [shortName, setShortName] = useState(ev.short_name ?? '');
  const [location, setLocation] = useState(ev.location);
  const [color, setColor] = useState(ev.color);
  const [date, setDate] = useState(dateValue(ev.starts_at));
  const [from, setFrom] = useState(timeValue(ev.starts_at));
  const [to, setTo] = useState(timeValue(ev.ends_at));
  const [allDay, setAllDay] = useState(ev.all_day);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(ev.recurrence ?? null);
  const [showCustomRec, setShowCustomRec] = useState(Boolean(ev.recurrence?.freq === 'custom' || (ev.recurrence?.interval && ev.recurrence.interval > 1) || ev.recurrence?.until || ev.recurrence?.count));

  useOverlayBack(true, onClose);

  const [textColor, setTextColor] = useState<string | null>(ev.text_color ?? null);
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';

  /**
   * Categories, not raw swatches.
   *
   * "The indigo one" is how people refer to a block on a grid, so the picker
   * offers the nine named categories and stores each one's colour. The custom
   * well below is the escape hatch for a course colour that has to match
   * something else; picking it simply falls outside every category.
   */
  const selectedCat = resolveCategory(color);
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
      starts_at: starts.toISOString(), ends_at: ends.toISOString(), recurrence,
    });
  };

  if (typeof document === 'undefined') return null;

  // Portalled: `main` carries the zoom pref and the page-entry transform, so a
  // fixed sheet rendered inside it is positioned against `main`, not the
  // viewport (HANDOFF fact 2) — the same reason CalPopover portals.
  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" role="dialog" aria-modal="true" aria-label="Edit event"
        style={{ width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: '14px 14px 0 0', border: '1px solid var(--line2)', padding: 24, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }}>
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

        {/* Google Calendar Recurrence Dropdown */}
        <span style={LABEL}>Repeat</span>
        <div style={{ marginBottom: 14 }}>
          <select
            value={
              !recurrence || !recurrence.freq
                ? 'none'
                : showCustomRec
                ? 'custom'
                : recurrence.freq === 'daily' && (recurrence.interval ?? 1) === 1
                ? 'daily'
                : recurrence.freq === 'weekdays'
                ? 'weekdays'
                : recurrence.freq === 'weekly' && (recurrence.interval ?? 1) === 1
                ? 'weekly'
                : recurrence.freq === 'monthly' && (recurrence.interval ?? 1) === 1
                ? 'monthly'
                : recurrence.freq === 'yearly' && (recurrence.interval ?? 1) === 1
                ? 'yearly'
                : 'custom'
            }
            onChange={(e) => {
              const val = e.target.value;
              const curDate = new Date(`${date}T00:00:00`);
              const dow = DOW_NAMES[curDate.getDay()];
              if (val === 'none') {
                setRecurrence(null);
                setShowCustomRec(false);
              } else if (val === 'daily') {
                setRecurrence({ freq: 'daily', interval: 1, endType: 'never' });
                setShowCustomRec(false);
              } else if (val === 'weekly') {
                setRecurrence({ freq: 'weekly', interval: 1, byDay: [dow], endType: 'never' });
                setShowCustomRec(false);
              } else if (val === 'weekdays') {
                setRecurrence({ freq: 'weekdays', endType: 'never' });
                setShowCustomRec(false);
              } else if (val === 'monthly') {
                setRecurrence({ freq: 'monthly', interval: 1, endType: 'never' });
                setShowCustomRec(false);
              } else if (val === 'yearly') {
                setRecurrence({ freq: 'yearly', interval: 1, endType: 'never' });
                setShowCustomRec(false);
              } else if (val === 'custom') {
                setRecurrence((prev) => prev || { freq: 'weekly', interval: 1, byDay: [dow], endType: 'never' });
                setShowCustomRec(true);
              }
            }}
            style={{
              ...FIELD,
              cursor: 'pointer',
              marginBottom: showCustomRec ? 8 : 14,
            }}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">
              Weekly on {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}
            </option>
            <option value="weekdays">Every weekday (Monday to Friday)</option>
            <option value="monthly">
              Monthly on day {new Date(`${date}T00:00:00`).getDate()}
            </option>
            <option value="yearly">
              Annually on {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </option>
            <option value="custom">Custom...</option>
          </select>

          {/* Custom Recurrence Editor */}
          {showCustomRec && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                marginBottom: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Repeat every N [Unit] */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--tx)', flexWrap: 'wrap' }}>
                <span>Repeat every</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={recurrence?.interval ?? 1}
                  onChange={(e) => setRecurrence({
                    freq: recurrence?.freq ?? 'weekly',
                    ...recurrence,
                    interval: Math.max(1, parseInt(e.target.value) || 1),
                  })}
                  style={{
                    width: 54,
                    padding: '4px 6px',
                    borderRadius: 6,
                    border: '1px solid var(--line2)',
                    background: 'var(--card)',
                    color: 'var(--tx)',
                    textAlign: 'center',
                    fontSize: 13,
                  }}
                />
                <select
                  value={recurrence?.freq === 'weekdays' ? 'weekly' : recurrence?.freq || 'weekly'}
                  onChange={(e) => setRecurrence({
                    interval: recurrence?.interval ?? 1,
                    ...recurrence,
                    freq: e.target.value as RecurrenceFreq,
                  })}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--line2)',
                    background: 'var(--card)',
                    color: 'var(--tx)',
                    fontSize: 13,
                  }}
                >
                  <option value="daily">day{(recurrence?.interval ?? 1) > 1 ? 's' : ''}</option>
                  <option value="weekly">week{(recurrence?.interval ?? 1) > 1 ? 's' : ''}</option>
                  <option value="monthly">month{(recurrence?.interval ?? 1) > 1 ? 's' : ''}</option>
                  <option value="yearly">year{(recurrence?.interval ?? 1) > 1 ? 's' : ''}</option>
                </select>
              </div>

              {/* Repeat on (Days of week) for weekly */}
              {(recurrence?.freq === 'weekly' || !recurrence?.freq) && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', marginBottom: 6 }}>REPEAT ON</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as RecurrenceDay[]).map((d) => {
                      const isSel = (recurrence?.byDay ?? []).includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const cur = recurrence?.byDay ?? [];
                            const next = isSel ? cur.filter((x) => x !== d) : [...cur, d];
                            setRecurrence({
                              freq: 'weekly',
                              interval: 1,
                              ...recurrence,
                              byDay: next.length > 0 ? next : [d],
                            });
                          }}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            border: `1px solid ${isSel ? 'var(--acc)' : 'var(--line2)'}`,
                            background: isSel ? 'var(--acc)' : 'var(--card)',
                            color: isSel ? 'var(--ink)' : 'var(--tx2)',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ends condition */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', marginBottom: 6 }}>ENDS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recurrence_end"
                      checked={!recurrence?.endType || recurrence?.endType === 'never'}
                      onChange={() => setRecurrence({
                        freq: recurrence?.freq || 'weekly',
                        ...recurrence,
                        endType: 'never',
                        until: null,
                        count: null,
                      })}
                      style={{ accentColor: 'var(--acc)' }}
                    />
                    <span>Never</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recurrence_end"
                      checked={recurrence?.endType === 'until'}
                      onChange={() => setRecurrence({
                        freq: recurrence?.freq || 'weekly',
                        ...recurrence,
                        endType: 'until',
                        until: recurrence?.until || date,
                      })}
                      style={{ accentColor: 'var(--acc)' }}
                    />
                    <span>On</span>
                    <input
                      type="date"
                      value={recurrence?.until || date}
                      disabled={recurrence?.endType !== 'until'}
                      onChange={(e) => setRecurrence({
                        freq: recurrence?.freq || 'weekly',
                        ...recurrence,
                        endType: 'until',
                        until: e.target.value,
                      })}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 6,
                        border: '1px solid var(--line2)',
                        background: 'var(--card)',
                        color: 'var(--tx)',
                        fontSize: 12,
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recurrence_end"
                      checked={recurrence?.endType === 'count'}
                      onChange={() => setRecurrence({
                        freq: recurrence?.freq || 'weekly',
                        ...recurrence,
                        endType: 'count',
                        count: recurrence?.count || 10,
                      })}
                      style={{ accentColor: 'var(--acc)' }}
                    />
                    <span>After</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={recurrence?.count || 10}
                      disabled={recurrence?.endType !== 'count'}
                      onChange={(e) => setRecurrence({
                        freq: recurrence?.freq || 'weekly',
                        ...recurrence,
                        endType: 'count',
                        count: parseInt(e.target.value) || 1,
                      })}
                      style={{
                        width: 50,
                        padding: '2px 6px',
                        borderRadius: 6,
                        border: '1px solid var(--line2)',
                        background: 'var(--card)',
                        color: 'var(--tx)',
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    />
                    <span>occurrences</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <span style={LABEL}>Category</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
          {EVENT_CATEGORIES.map((c) => {
            const on = selectedCat.id === c.id;
            return (
              <button key={c.id} onClick={() => setColor(c.color)} aria-pressed={on}
                className="k-chip"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 10,
                  fontSize: 11.5, fontWeight: 700, minHeight: 34, cursor: 'pointer',
                  border: `1px solid ${on ? `color-mix(in srgb, ${c.color} 55%, transparent)` : 'var(--line2)'}`,
                  background: on ? `color-mix(in srgb, ${c.color} 14%, var(--card))` : 'var(--card2)',
                  color: on ? 'var(--tx)' : 'var(--tx2)',
                }}>
                <span aria-hidden style={{
                  width: 11, height: 11, borderRadius: 4, background: c.color, flex: 'none',
                  boxShadow: on ? `0 0 0 2px color-mix(in srgb, ${c.color} 30%, transparent)` : undefined,
                  transition: 'box-shadow var(--k-base) var(--k-spring)',
                }} />
                {c.label}
                {on && <Icon name="check" size={12} color="var(--tx2)" style={{ marginLeft: 'auto' }} />}
              </button>
            );
          })}
          <label title="Any colour" aria-label="Custom background colour"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 10, fontSize: 11.5, fontWeight: 700, minHeight: 34, border: `1px dashed ${selectedCat.id === 'custom' ? 'var(--acc)' : 'var(--line2)'}`, background: selectedCat.id === 'custom' ? 'var(--card)' : 'var(--card2)', color: selectedCat.id === 'custom' ? 'var(--tx)' : 'var(--tx2)', cursor: 'pointer', position: 'relative' }}>
            <Icon name="pen" size={12} color="var(--tx3)" />
            Custom
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
          <span style={{ display: 'block', fontSize: 9.5, opacity: 0.72, marginTop: 2 }}>
            {selectedCat.id !== 'custom' ? `${selectedCat.label} · ` : ''}{from}–{to}
          </span>
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
