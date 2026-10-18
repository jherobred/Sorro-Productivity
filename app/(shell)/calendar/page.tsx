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
const GoogleCalendarSheet = dynamic(() => import('@/components/calendar/GoogleCalendar').then((m) => m.GoogleCalendarSheet), { ssr: false });
import { EventBubble } from '@/components/calendar/EventBubble';
import { EventAppearance, EVENT_COLORS } from '@/components/calendar/EventColors';
import { GoogleEventDelete } from '@/components/calendar/GoogleEventDelete';
import { saveGoogleEdit } from '@/components/calendar/googleEdit';
import { useIntegrations } from '@/lib/integrations';
import { CalendarSourceIcon } from '@/components/calendar/CalendarSourceIcon';
import { CanvasConnections } from '@/components/calendar/CanvasConnections';
import { calendarTask, isOriginalTaskSlot, sameCalendarTime, taskDropHour, calendarPointerHour, snapCalendarHour, slotClickCreates } from '@/lib/calendarPlanning';
import { useCalendarClock } from '@/lib/useCalendarClock';
import { calendarStripDates, moveCalendarDate } from '@/lib/calendarNavigation';
import { startCalendarGesture, type CalendarPoint } from '@/lib/calendarGesture';
import { getPrefs, setPrefs } from '@/lib/prefs';
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
import { useTapGuard } from '@/lib/tapGuard';
import { GoogleCalendarButton } from '@/components/calendar/GoogleCalendar';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { useTasks, useTaskActions, useLists, getTaskAlert, type Task } from '@/lib/tasks';
import {
  useEvents, useEventActions, weekStart, hoursOf, dayIndex, hhmm, at, spanRuns, dayLabels, chipInk,
  isReadOnly, importedSeriesKey, scanSeriesIds, liveEventIds, GRID_START, GRID_END, formatEventCountdown, layoutOverlappingEvents,
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

const useSecond = useCalendarClock;

export default function CalendarPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const nowMs = useCalendarClock(15_000);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const main = pageRef.current?.closest<HTMLElement>('.studio-main');
    const nav = document.querySelector<HTMLElement>('.studio-bottom-nav');
    if (!main || !nav) return;
    const measure = () => {
      const scale = main.getBoundingClientRect().width / main.offsetWidth || 1;
      const height = nav.getBoundingClientRect().height;
      const clearance = `${height ? (height + 12) / scale : 14}px`;
      if (main.style.getPropertyValue('--calendar-nav-clearance') !== clearance) main.style.setProperty('--calendar-nav-clearance', clearance);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(nav); observer.observe(main); measure();
    return () => { observer.disconnect(); main.style.removeProperty('--calendar-nav-clearance'); };
  }, []);
  const [googleDelete, setGoogleDelete] = useState<Ev | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [focusFrom, setFocusFrom] = useState('08:00');
  const [focusTo, setFocusTo] = useState('18:00');
  const [effectiveHourHeight, setEffectiveHourHeight] = useState(56);
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number; key: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const ws = useMemo(() => weekStart(selectedDate, prefs.weekStart), [selectedDate, prefs.weekStart]);
  const focusDay = dayIndex(selectedDate.toISOString(), ws);
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

  // Week fits all seven days on phones too, so keep the user's saved view.
  const [view, setView] = useState<View>(prefs.calView);
  const pickedView = useRef(false);
  const [importing, setImporting] = useState(false);
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    if (!pickedView.current) setView(prefs.calView);
  }, [prefs.calView]);

  // Month needs six weeks of events, not one — the window follows the view.
  const windowDays = view === 'month' ? 42 : 7;
  const windowStart = useMemo(() => {
    if (view !== 'month') return ws;
    const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    return weekStart(first, prefs.weekStart);
  }, [view, ws, selectedDate, prefs.weekStart]);

  const { data: events = [], isPending } = useEvents(windowStart, windowDays);
  const { data: tasks = [] } = useTasks();
  const { data: lists = [] } = useLists();
  const { data: notebooks = [] } = useNotebooks();
  const A = useEventActions(ws);
  const { data: integrations = [] } = useIntegrations();
  const gcalUrl = integrations.find((r) => r.kind === 'gcal_ics')?.config.ics_url ?? '';
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
    pickedView.current = true;
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
          requestDelete(pop.ev);
          setPop(null);
          setSel(null);
        } else if (!pop && sel) {
          const targetEv = events.find((ev) => ev.id === sel);
          if (targetEv) {
            e.preventDefault();
            requestDelete(targetEv);
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

  const requestDelete = (ev: Ev) => {
    if (isReadOnly(ev)) setGoogleDelete(ev);
    else if (ev.is_recurring_instance || ev.recurrence || importedSeriesKey(ev)) setRecModal({ action: 'delete', ev });
    else A.removeWithUndo(ev);
  };
  const returnedFromGoogle = useRef(false);
  useEffect(() => {
    if (returnedFromGoogle.current || isPending) return;
    const id = new URL(window.location.href).searchParams.get('googleDelete');
    if (!id) return;
    const event = events.find(e => e.id === id);
    if (event) setGoogleDelete(event);
    returnedFromGoogle.current = true;
    const url = new URL(window.location.href); url.searchParams.delete('googleDelete');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  }, [events, isPending]);

  /* ------------------------------------------------------------ paging */

  /** Prev/next moves by whatever the view actually shows. */
  const shift = (dir: number) => setSelectedDate(date => moveCalendarDate(date, view, dir));
  shiftRef.current = shift;
  const goToday = () => setSelectedDate(new Date());

  /* The title names the month; the line under it says which days and how much is on them. */
  const weekEnd = new Date(at(ws, 6, 12));
  const monthShown = selectedDate;
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

  const plannedTasks = useMemo(() => tasks.map(t => calendarTask(t, prefs.calendarTaskPlans)), [tasks, prefs.calendarTaskPlans]);
  /* Include both planned times and original Canvas deadlines in the window. */
  const windowTasks = useMemo(() => {
    const from = windowStart.getTime();
    const to = from + windowDays * 86_400_000;
    return plannedTasks.filter((t) => {
      if (t.done || t.deleted_at || !t.due_on) return false;
      const d = new Date(`${t.due_on}T00:00:00`).getTime();
      const original = t.calendar_original_due_at ? Date.parse(t.calendar_original_due_at) : NaN;
      return (d >= from && d < to) || (original >= from && original < to);
    });
  }, [plannedTasks, windowStart, windowDays]);

  const schedule = (t: Task, day: number, hour: number | null) => {
    const date = new Date(at(ws, day, hour ?? 9));
    const due_on = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // due_on always follows, because the Tasks page groups by it — letting the
    // two drift is how a task ends up in Tuesday's list and Wednesday's grid.
    if (t.source === 'canvas_lms') {
      const before = getPrefs().calendarTaskPlans?.[t.id];
      const next = { date: due_on, starts_at: hour === null ? null : date.toISOString() };
      const original = { ...t, due_on: t.calendar_planned ? t.calendar_original_due_on ?? t.due_on : t.due_on, due_at: t.calendar_planned ? t.calendar_original_due_at : t.due_at };
      const restored = isOriginalTaskSlot(original, next);
      const plans = { ...getPrefs().calendarTaskPlans };
      if (restored) delete plans[t.id]; else plans[t.id] = next;
      setPrefs({ calendarTaskPlans: plans });
      toast(restored ? 'Returned to the Canvas deadline.' : 'Study time moved. Canvas deadline kept.', () => {
        const plans = { ...getPrefs().calendarTaskPlans };
        if (before) plans[t.id] = before; else delete plans[t.id];
        setPrefs({ calendarTaskPlans: plans });
      });
      return;
    }
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
    if (draftEventRef.current) { A.remove.mutate({ id: draftEventRef.current }); draftEventRef.current = null; }
    if (draftTaskRef.current) { TA.remove.mutate({ id: draftTaskRef.current.id }); draftTaskRef.current = null; }
    hour = snapCalendarHour(hour, .5);
    if (endHour !== undefined) endHour = Math.min(24, Math.max(hour + .5, endHour));
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
    const newId = A.addAt(day, hour, '#039be5', allDay, '(No title)', endHour);
    const eH = allDay ? 23.98 : Math.min(24, endHour ?? hour + 1);
    const createdEv: Ev = {
      id: newId,
      title: '(No title)',
      starts_at: at(ws, day, allDay ? 0 : hour),
      ends_at: at(ws, day, eH),
      all_day: allDay,
      color: '#039be5',
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
    if ((e.target as HTMLElement).closest('.cal-day-strip')) { touchStartRef.current = null; return; }
    const viewport = (e.target as HTMLElement).closest('.cal-grid-viewport');
    if (viewport && viewport.scrollWidth > viewport.clientWidth + 1) { touchStartRef.current = null; return; }
    if ((e.target as HTMLElement).closest('.cal-task,.cal-event,.cal-all-day-event,.cal-deadline-ghost')) { touchStartRef.current = null; return; }
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
        { label: 'Layout & focus hours', icon: 'cal', run: () => setLayoutOpen(v => !v) },
        { label: 'Up next and Today ends timers', icon: 'clock', checked: showTimers, run: toggleTimers },
        { label: 'Free time between events', icon: 'eye', checked: showVacant, run: toggleVacant },
        { label: 'Free-time arrows', icon: 'arrowRight', checked: !!prefs.calendarFreeTimeArrows, run: () => void update({ calendarFreeTimeArrows: !prefs.calendarFreeTimeArrows }) },
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
        { label: 'Google Calendar', icon: 'cal', run: () => setGoogle(true) },
      ],
    },
    { label: 'Bar placement', items: [
      { label: 'Timers at the bottom', icon: 'clock', checked: prefs.calendarTimersPosition === 'bottom', run: () => void update({ calendarTimersPosition: prefs.calendarTimersPosition === 'bottom' ? 'top' : 'bottom' }) },
      { label: 'Date & view bar at the bottom', icon: 'cal', checked: prefs.calendarToolbarPosition === 'bottom', run: () => void update({ calendarToolbarPosition: prefs.calendarToolbarPosition === 'bottom' ? 'top' : 'bottom' }) },
    ] },
    { items: [{ label: 'Clear every event', icon: 'trash', danger: true, run: () => void clearEverything() }] },
  ];

  return (
    <div ref={pageRef} className="calendar-page" style={{
      height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <header className="cal-head" style={{ order: prefs.calendarToolbarPosition === 'bottom' ? 30 : 0 }}>
        <div className="cal-date-navigation">
        <div className="cal-head-title">
          <h1>{heading}</h1>
          <p>{subline}{prefs.lockEvents && <span className="cal-head-lock"><Icon name="lock" size={11} />Locked</span>}</p>
        </div>
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

        </div>
        <div className="cal-head-nav">
          <ViewSwitcher view={view} onChange={setCalView} phone={phone} />
          {(view === 'week' || view === 'day') && <div className="cal-zoom" role="group" aria-label="Calendar zoom">
            <button aria-label="Zoom out calendar" title="Zoom out" disabled={(!zoomRange && prefs.calendarHourHeight === 0) || effectiveHourHeight <= 16} onClick={() => { setZoomRange(null); void update({ calendarHourHeight: Math.max(16, effectiveHourHeight - 8) }); }}>−</button>
            <button className="cal-zoom-fit" aria-pressed={!zoomRange && prefs.calendarHourHeight === 0} onClick={() => { setZoomRange(null); void update({ calendarHourHeight: !zoomRange && prefs.calendarHourHeight === 0 ? 56 : 0 }); }}>{!zoomRange && prefs.calendarHourHeight === 0 ? 'Reset zoom' : 'Fit day'}</button>
            <button aria-label="Zoom in calendar" title="Zoom in" disabled={effectiveHourHeight >= 128} onClick={() => { setZoomRange(null); void update({ calendarHourHeight: Math.min(128, effectiveHourHeight + 8) }); }}>+</button>
          </div>}
        </div>

        <div className="cal-head-actions">
          <a className="studio-button" href="/tasks/?plan=week" aria-label="Plan this week"><Icon name="week" size={16}/><span>Plan week</span></a><GoogleCalendarButton onOpen={() => setGoogle(true)} />
          <button type="button" className="cal-new" aria-label="New event" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); newEvent(r.left, r.bottom); }}>
            <Icon name="plus" size={16} /><span>New</span>
          </button>
          <button type="button" className="cal-icon-button cal-more" aria-label="Calendar options" title="Calendar options"
            aria-haspopup="menu" aria-expanded={!!menu}
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: Math.max(8, r.right - 260), y: r.bottom + 6 }); }}>
            <Icon name="dots" size={18} />
          </button>
        </div>
      </header>

      {layoutOpen && <section className="cal-layout-panel" aria-label="Calendar layout" style={{ order: 1 }}>
        <div><strong>Focus hours</strong><label>From<input aria-label="Focus hours start" type="time" value={focusFrom} onChange={e => setFocusFrom(e.target.value)}/></label><label>To<input aria-label="Focus hours end" type="time" value={focusTo} onChange={e => setFocusTo(e.target.value)}/></label>
          <button className="studio-button" onClick={() => {
            const hour = (value: string) => { const [h, m] = value.split(':').map(Number); return h + m / 60; };
            const start = hour(focusFrom), end = hour(focusTo);
            if (!Number.isFinite(start + end) || end <= start) { toast('Choose an end time after the start'); return; }
            if (view !== 'day' && view !== 'week') setCalView('day');
            setZoomRange({ start, end, key: Date.now() });
          }}>Fit these hours</button></div>
        <label>Timers<select value={prefs.calendarTimersPosition ?? 'top'} onChange={e => void update({ calendarTimersPosition: e.target.value as 'top' | 'bottom' })}><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
        <label>Date & view bar<select value={prefs.calendarToolbarPosition ?? 'top'} onChange={e => void update({ calendarToolbarPosition: e.target.value as 'top' | 'bottom' })}><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
        <label>Calendar style<select value={prefs.calendarSurfaceStyle ?? 'solid'} disabled={prefs.reduceTransparency} onChange={e => void update({ calendarSurfaceStyle: e.target.value as 'solid' | 'translucent' })}><option value="solid">Solid</option><option value="translucent">Translucent</option></select></label>
        <label className="cal-layout-check"><input type="checkbox" checked={!!prefs.calendarFreeTimeArrows} onChange={e => void update({ calendarFreeTimeArrows: e.target.checked })}/>Free-time arrows</label>
        <button className="cal-icon-button" aria-label="Close layout controls" onClick={() => setLayoutOpen(false)}><Icon name="close" size={16}/></button>
      </section>}

      {showTimers && view !== 'countdown' && (
        <div className="cal-timers-position" style={{ order: prefs.calendarTimersPosition === 'bottom' ? 20 : 2 }}><CalendarTimers events={liveEvents} time24={prefs.time24} onOpen={(ev, x, y) => openEvent(ev, x, y)} /></div>
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="calendar" label="Calendar options"
          accent={prefs.accent} dark={prefs.theme === 'dark'} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {importing && <ScheduleImport onClose={() => setImporting(false)} />}
      {google && <GoogleCalendarSheet onClose={() => setGoogle(false)} />}

      <div
        data-tour="calendar-grid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="cal-content" style={{ order: 10, flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column' }}
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
            <Grid zoomRange={zoomRange} onHourHeightChange={setEffectiveHourHeight} days={7} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA} nowMs={nowMs} nextEventId={nextEventId} showVacant={showVacant}
              onPickDay={date => { setSelectedDate(date); setCalView('day'); }}
              sel={sel} setSel={setSel} openEvent={openEvent} openTask={openTask} openSlot={openSlot} onSchedule={schedule} openMenu={(ev, x, y, span) => setCtx({ ev, x, y, span })} />
          )}
          {!isPending && view === 'day' && (
            <>
              <DayStrip selectedDate={selectedDate} onPick={setSelectedDate} />
              <Grid zoomRange={zoomRange} onHourHeightChange={setEffectiveHourHeight} days={1} dayOffset={focusDay} ws={ws} events={events} tasks={windowTasks} A={A} TA={TA} nowMs={nowMs} nextEventId={nextEventId} showVacant={showVacant}
                sel={sel} setSel={setSel} openEvent={openEvent} openTask={openTask} openSlot={openSlot} onSchedule={schedule} openMenu={(ev, x, y, span) => setCtx({ ev, x, y, span })} />
            </>
          )}
          {!isPending && view === 'month' && (
            <Month ws={windowStart}
              // The month being displayed, not the week-start's month: the
              // week that contains the 1st can begin in the previous month,
              // and reading the month off `ws` dimmed the first rows of the
              // real month. ws+6 days always lands inside it.
              month={selectedDate.getMonth()}
              events={events} tasks={windowTasks} nextEventId={nextEventId}

              onPickDay={(date) => {
                // Open the week that actually contains the clicked date. The
                // old version reused the current week and only moved the
                // column, so clicking the 25th showed a day in this week.
                setSelectedDate(date);
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
          runDays={0}
          draft={draftEventRef.current === pop.ev.id}
          previousEnd={previousEndOf(pop.ev)}
          time24={prefs.time24}
          onClose={closePop}
          onEdit={() => { commitDraft(); setEdit(pop.ev); setPop(null); }}
          onDuplicate={() => { commitDraft(); A.duplicate(pop.ev); setPop(null); }}
          onDelete={() => {
            commitDraft();
            requestDelete(pop.ev);
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
            if (before.source === 'canvas_lms' && ('due_on' in patch || 'due_at' in patch)) {
              const due_on = patch.due_on ?? before.due_on;
              if (!due_on) return;
              const starts_at = patch.due_at !== undefined ? patch.due_at : before.due_at ?? null;
              setPrefs({ calendarTaskPlans: { ...getPrefs().calendarTaskPlans, [before.id]: { date: due_on, starts_at } } });
              setPop(prev => prev?.kind === 'task' ? { ...prev, task: { ...before, ...patch, calendar_planned: true, calendar_original_due_at: before.calendar_original_due_at ?? before.due_at } } : prev);
              return;
            }
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
          onClearPlan={pop.task.calendar_planned ? () => {
            const plans = { ...getPrefs().calendarTaskPlans }; delete plans[pop.task.id];
            setPrefs({ calendarTaskPlans: plans }); setPop(null); toast('Back at the Canvas deadline');
          } : undefined}
          onSwitchToEvent={switchDraft}
        />
      )}

      {edit && (
        <EditSheet
          ev={edit}
          onClose={() => setEdit(null)}
          onSave={(patch) => {
            if (isReadOnly(edit)) {
              void saveGoogleEdit(edit, patch, gcalUrl, (p) => A.update.mutate({ id: edit.id, patch: p }));
              setEdit(null);
              return;
            }
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
            // A scanned timetable is one row per class meeting, not a rule, so
            // "following" and "all" are a batch soft delete with one Undo.
            if (action === 'delete' && !ev.recurrence && !ev.is_recurring_instance && importedSeriesKey(ev)) {
              if (choice === 'this') A.removeWithUndo(ev);
              else void scanSeriesIds(ev, choice === 'following' ? ev.starts_at : undefined)
                .then((ids) => A.wipeRun(ids.map((id) => ({ ...ev, id }))))
                .catch(() => toast('Could not delete the series. Try again.'));
              setRecModal(null);
              return;
            }
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

      {googleDelete && <GoogleEventDelete event={googleDelete} onClose={() => setGoogleDelete(null)}
        onHide={(series) => { (series ? A.hideSeries : A.hideGoogle)(googleDelete); setGoogleDelete(null); }}
        onDeleted={(series) => { (series ? A.hideSeries : A.hideGoogle)(googleDelete, false); if (!series) A.remove.mutate({ id: googleDelete.id }); setGoogleDelete(null); toast(series ? 'Deleted the series from Google Calendar and Basedly' : 'Deleted this event from Google Calendar and Basedly'); }}/>}

      {/* Right-click menu. Left click already opens the bubble; right click is
          for people who already know what they want, so it is all actions:
          jump straight to edit, recolour without opening the sheet, delete. */}
      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y} kind="event" label={chipLabel(ctx.ev)}
          accent={prefs.accent} dark={prefs.theme === 'dark'}
          items={contextItems(ctx.ev, ctx.span, A, setEdit, setRecModal, requestDelete)}
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
    <div className="cal-view-switcher" data-tour="calendar-view-toggle"
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
  requestDelete: (ev: Ev) => void,
): CtxGroup[] {
  const current = resolveCategory(ev.color);
  const multiDay = !!span && span.days > 1;
  const del = () => {
    requestDelete(ev);
  };
  return [
    {
      items: [
        { label: 'Edit', icon: 'edit' as const, run: () => setEdit(ev) },
        { label: 'Duplicate', icon: 'copy', run: () => A.duplicate(ev) },
      ],
    },
    {
      label: 'Color',
      items: EVENT_COLORS.slice(0, 12).map(([name, c]) => ({
        label: name,
        icon: 'spark' as IconName,
        swatch: c,
        checked: ev.color.toLowerCase() === c.toLowerCase(),
        run: () => A.update.mutate({ id: ev.master_id || ev.id, patch: { color: c } }),
      })),
    },
    {
      items: [
        multiDay
          ? { label: `Delete all ${span!.days} days`, icon: 'trash' as IconName, danger: true, run: del }
          : { label: isReadOnly(ev) ? 'Hide or Super Delete…' : 'Delete', icon: 'trash' as IconName, danger: true, run: del },
      ],
    },
  ];
}

function Grid({
  days, dayOffset = 0, zoomRange, onHourHeightChange, ws, events, tasks, A, TA, sel, setSel, openEvent, openTask, openSlot, onSchedule, openMenu, onPickDay, nowMs = Date.now(), nextEventId, showVacant = true,
}: {
  days: number;
  onPickDay?: (date: Date) => void;
  dayOffset?: number;
  zoomRange: { start: number; end: number; key: number } | null;
  onHourHeightChange: (height: number) => void;
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
  const trayRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ height: 600, width: 800 });
  const HOUR_H = zoomRange ? viewport.height / (zoomRange.end - zoomRange.start) : prefs.calendarHourHeight === 0 ? Math.max(6, viewport.height / SPAN) : Math.max(12, Math.min(128, prefs.calendarHourHeight ?? 56));
  const GRID_H = HOUR_H * SPAN;
  useEffect(() => onHourHeightChange(HOUR_H), [HOUR_H, onHourHeightChange]);
  const oldHourHeight = useRef(HOUR_H);
  const pendingHour = useRef<number | null>(SCROLL_TO_HOUR);
  const suppressClick = useRef(false);
  const lastTouch = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockReleaseClick = () => {
    suppressClick.current = true;
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => { suppressClick.current = false; }, 500);
  };
  useEffect(() => () => { if (suppressTimer.current) clearTimeout(suppressTimer.current); }, []);
  const gestureCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => gestureCleanup.current?.(), []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport({ height: el.clientHeight, width: bodyRef.current?.clientWidth ?? 800 }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const anchor = zoomRange?.start ?? pendingHour.current ?? (el.scrollTop / oldHourHeight.current);
    el.scrollTop = !zoomRange && prefs.calendarHourHeight === 0 ? 0 : anchor * HOUR_H;
    pendingHour.current = null; oldHourHeight.current = HOUR_H;
  }, [HOUR_H, prefs.calendarHourHeight, zoomRange]);
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
    gestureCleanup.current?.();
    e.preventDefault();
    e.stopPropagation();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const slotTarget = e.currentTarget.getBoundingClientRect();
    const relY = Math.max(0, Math.min(0.99, (e.clientY - slotTarget.top) / slotTarget.height));
    const slotOffset = relY >= 0.5 ? 0.5 : 0;
    const snapHour = rawStartHour + slotOffset;

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
      cleanup();

      const curr = slotDragRef.current;
      slotDragRef.current = null;
      setSlotDrag(null);

      if (curr) {
        const s = Math.min(curr.startHour, curr.currentHour);
        const rawE = Math.max(curr.startHour, curr.currentHour);
        const eHour = (rawE === s || Math.abs(rawE - s) < 0.25) ? s + 1 : Math.max(s + 0.5, rawE);
        openSlot(curr.day, Math.min(23.5, s), m.clientX, m.clientY, false, Math.min(24, eHour));
      }
    };

    const cancel = () => { cleanup(); slotDragRef.current = null; setSlotDrag(null); };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      gestureCleanup.current = null;
    };
    gestureCleanup.current = cancel;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
  };

  /**
   * Park the scroll on the morning, once. Opening a full-day grid at midnight
   * shows eight empty hours and hides the working day; every calendar that
   * covers 24 hours does this.
   */
  /**
   * A drag that scrolls the day past a slot is not a tap on that slot. On a
   * phone the slots are the only thing under the finger when the day is
   * dragged, so every scroll to reach the evening used to leave a new event
   * behind.
   */
  const slot = useTapGuard();
  const touchSlot = useRef(false);

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
  // Multi-day extending time events removed per Google Calendar standard
  const spans: Span[] = [];
  const spanned = new Set<string>();

  const spanHit = (s: Span, clientX: number) => {
    const rect = bodyRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 1;
    const col = Math.max(0, Math.min(days - 1, Math.floor(((clientX - (rect?.left ?? 0)) / w) * days)));
    const hitEv = s.members.find((m) => m.day === col)?.ev ?? s.ev;
    return { day: col, ev: hitEv };
  };

  const lastDragFrame = useRef(0);
  const scrollDuringDrag = (point: CalendarPoint, locate: () => void) => {
    const el = scroller.current, r = el?.getBoundingClientRect();
    if (!el || !r || point.y < r.top || point.y > r.bottom) return;
    const now = performance.now();
    const seconds = Math.min(32, now - lastDragFrame.current) / 1000;
    lastDragFrame.current = now;
    const edge = point.y > r.bottom - 32 ? (point.y - r.bottom + 32) / 32 : point.y < r.top + 32 ? (point.y - r.top - 32) / 32 : 0;
    const delta = edge * 120 * seconds;
    if (delta) { el.scrollTop += delta; locate(); }
  };

  const press = (e: React.PointerEvent, ev: Ev, action: 'move' | 'resize') => {
    lastTouch.current = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (e.button !== 0) return;
    e.stopPropagation(); gestureCleanup.current?.(); suppressClick.current = false;
    setSel(ev.id);
    const originalBounds = bodyRef.current?.getBoundingClientRect();
    if (!originalBounds) return;
    const origDay = dayIndex(ev.starts_at, ws), origHour = hoursOf(ev.starts_at);
    const origEnd = gridRange(ev.starts_at, ev.ends_at).end;
    const length = ev.all_day ? 1 : Math.max(.5, origEnd - origHour);
    const grabOffset = ev.all_day ? 0 : calendarPointerHour(e.clientY, originalBounds.top, originalBounds.height) - origHour;
    const resizeOffset = calendarPointerHour(e.clientY, originalBounds.top, originalBounds.height) - origEnd;
    let target: { day: number; hour: number | null } | null = null;
    let targetEnd: number | null = null;
    const locate = (point: CalendarPoint) => {
      const r = bodyRef.current?.getBoundingClientRect(), visible = scroller.current?.getBoundingClientRect(), tray = trayRef.current?.getBoundingClientRect();
      if (!r || !visible || !tray) return;
      const inTray = point.y >= tray.top && point.y <= tray.bottom;
      if (point.x < r.left || point.x > r.right || (!inTray && (point.y < visible.top || point.y > visible.bottom))) { target = null; targetEnd = null; return; }
      const day = days === 1 ? dayOffset : Math.max(0, Math.min(days - 1, Math.floor((point.x - r.left) / r.width * days)));
      const pointerHour = calendarPointerHour(point.y, r.top, r.height);
      if (action === 'resize') {
        targetEnd = Math.max(origHour + .5, Math.min(24, Math.round((pointerHour - resizeOffset) * 2) / 2));
        setResize({ id: ev.id, end: targetEnd });
      } else {
        const hour = inTray ? null : snapCalendarHour(pointerHour - grabOffset, length);
        target = { day, hour };
        setDrag({ id: ev.id, day, hour: hour ?? origHour });
      }
    };
    gestureCleanup.current = startCalendarGesture(e.nativeEvent, e.currentTarget as HTMLElement, {
      locked: isReadOnly(ev) || prefs.lockEvents,
      onStart: () => {
        if (prefs.haptics && lastTouch.current) navigator.vibrate?.(K.hapticMs);
        setDrag({ id: ev.id, day: origDay, hour: origHour });
      },
      onMove: locate,
      onFrame: point => scrollDuringDrag(point, () => locate(point)),
      onFinish: (result, point) => {
        blockReleaseClick(); gestureCleanup.current = null;
        setDrag(null); setResize(null);
        if (result === 'tap') { openEvent(ev, point.x, point.y); return; }
        if (result !== 'drop') return;
        if (action === 'resize' && targetEnd !== null && targetEnd !== origEnd) A.resizeTo(ev, targetEnd);
        if (action !== 'move' || !target) return;
        if (target.hour === null) {
          if (!ev.all_day || target.day !== origDay) A.update.mutate({ id: ev.id, patch: { all_day: true, starts_at: at(ws, target.day, 0), ends_at: at(ws, target.day + 1, 0) } });
        } else if (ev.all_day) A.update.mutate({ id: ev.id, patch: { all_day: false, starts_at: at(ws, target.day, target.hour), ends_at: at(ws, target.day, target.hour + 1) } });
        else if (target.day !== origDay || target.hour !== origHour) A.moveTo(ev, target.day, target.hour);
      },
    });
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

  /** Dragging between the tray and the visible time grid assigns/removes time. */
  const pressTask = (e: React.PointerEvent, t: Task, fromTray: boolean) => {
    lastTouch.current = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (e.button !== 0) return;
    e.stopPropagation(); gestureCleanup.current?.(); suppressClick.current = false;
    const gridBounds = bodyRef.current?.getBoundingClientRect();
    const grabOffset = fromTray || !t.due_at || !gridBounds ? 0 : calendarPointerHour(e.clientY, gridBounds.top, gridBounds.height) - hoursOf(t.due_at);
    const original = t.source === 'canvas_lms' ? (t.calendar_planned ? t.calendar_original_due_at : t.due_at) : null;
    const origin = original ? { day: dayIndex(original, ws), hour: hoursOf(original) } : null;
    let target: { day: number; hour: number | null } | null = null;
    const locate = (point: CalendarPoint) => {
      const r = bodyRef.current?.getBoundingClientRect(), visible = scroller.current?.getBoundingClientRect(), tray = trayRef.current?.getBoundingClientRect();
      if (!r || !visible || !tray) return;
      const inTray = point.y >= tray.top && point.y <= tray.bottom;
      if (point.x < r.left || point.x > r.right || (!inTray && (point.y < visible.top || point.y > visible.bottom))) { target = null; setTaskDrag(null); return; }
      const day = days === 1 ? dayOffset : Math.max(0, Math.min(days - 1, Math.floor((point.x - r.left) / r.width * days)));
      const hour = inTray ? null : taskDropHour(calendarPointerHour(point.y, r.top, r.height), grabOffset, day, origin);
      target = { day, hour };
      setTaskDrag(prev => prev?.task.id === t.id && prev.day === day && prev.hour === hour ? prev : { task: t, day, hour });
    };
    gestureCleanup.current = startCalendarGesture(e.nativeEvent, e.currentTarget as HTMLElement, {
      locked: prefs.lockEvents,
      onStart: () => {
        if (prefs.haptics && lastTouch.current) navigator.vibrate?.(K.hapticMs);
        setTaskDrag({ task: t, day: dayIndex(`${t.due_on}T12:00:00`, ws), hour: t.due_at ? hoursOf(t.due_at) : null });
      },
      onMove: locate,
      onFrame: point => scrollDuringDrag(point, () => locate(point)),
      onFinish: (result, point) => {
        blockReleaseClick(); gestureCleanup.current = null; setTaskDrag(null);
        if (result === 'tap') openTask(t, point.x, point.y);
        else if (result === 'drop' && target) onSchedule(t, target.day, target.hour);
      },
    });
  };

  const trayTasks = (col: number) =>
    tasks.filter((t) => !t.due_at && dayIndex(`${t.due_on}T12:00:00`, ws) === col);
  const slotTasks = (col: number) =>
    tasks.filter((t) => t.due_at && dayIndex(t.due_at, ws) === col);

  return (
    <div className="cal-grid-viewport" onContextMenuCapture={e => { if (lastTouch.current) { e.preventDefault(); e.stopPropagation(); } }} role="region" aria-label="Calendar days" tabIndex={0}
      onScroll={e => e.currentTarget.style.setProperty('--calendar-scroll-x', `${e.currentTarget.scrollLeft}px`)}
      onKeyDown={e => { if (e.target === e.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation(); }}>
    <div className={"cal-grid-surface" + (days === 7 ? ' is-week' : '') + (prefs.calendarSurfaceStyle === 'translucent' && !prefs.reduceTransparency ? ' is-translucent' : '')}>
      <div style={{ display: 'flex', flex: 'none', position: 'relative' }}>
        <div className="cal-axis-corner" style={{ width: GUTTER, flex: 'none', borderBottom: '1px solid var(--line)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
        {/* day headers */}
        <div className={'cal-dayheads' + (days === 1 ? ' is-single' : '')} style={{ gridTemplateColumns: `repeat(${days}, 1fr)` }}>
          {Array.from({ length: days }, (_, i) => {
            const idx = colOf(i);
            const d = new Date(ws);
            d.setDate(d.getDate() + idx);
            const today = d.toDateString() === new Date().toDateString();
            const past = !today && d.getTime() < new Date().setHours(0, 0, 0, 0);
            const headingClass = 'cal-dayhead' + (today ? ' is-today' : past ? ' is-past' : '');
            if (days === 7) return <button key={i} type="button" className={headingClass} aria-current={today ? 'date' : undefined}
              aria-label={`Show ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`} onClick={() => onPickDay?.(d)}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>{d.getDate()}</b>
            </button>;
            return (
              <div key={i} className={headingClass} aria-current={today ? 'date' : undefined}>
                <span>{DAYS_SHORT[idx]}</span>
                <b>{d.getDate()}</b>
              </div>
            );
          })}
        </div>

        {/* all-day strip: whole-day events plus every undated task for that day */}
        <div ref={trayRef} className="cal-all-day-tray">
          <div className="cal-all-day-label" aria-hidden style={{
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
              <div key={i} className="cal-all-day-column" style={{
                flex: 1, minWidth: 0, padding: '4px 3px',
                borderRight: i < days - 1 ? '1px solid var(--line)' : undefined,
                background: dropping ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : undefined,
                transition: 'background .2s',
              }}>
                {allDay.map((e) => (
                  <div key={e.id} className={"cal-all-day-event" + (Date.parse(e.ends_at) < nowMs ? " is-past" : "")} role="button" tabIndex={0} onClick={p => { if (suppressClick.current) return; openEvent(e, p.clientX, p.clientY); }} onKeyDown={p => { if (p.key === 'Enter') { const r = p.currentTarget.getBoundingClientRect(); openEvent(e, r.left, r.top); } }} onPointerDown={(p) => press(p, e, 'move')}
                    onContextMenu={(p) => { p.preventDefault(); p.stopPropagation(); if (!lastTouch.current) openMenu(e, p.clientX, p.clientY); }}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, marginBottom: 2, cursor: 'grab',
                      background: e.color, color: e.title_color || chipInk(e),
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}><CalendarSourceIcon source={e.source}/><span>{chipLabel(e)}</span></div>
                ))}

                {untimed.map((t) => (
                  <TaskChip key={t.id} task={t} onPointerDown={(p) => pressTask(p, t, true)} onOpen={(x, y) => { if (!suppressClick.current) openTask(t, x, y); }} compact nowMs={nowMs} />
                ))}

                <button className="cal-all-day-create" onPointerDown={slot.press}
                  onClick={p => { if (suppressClick.current) return; if (slot.tapped(p)) openSlot(idx, GRID_START, p.clientX, p.clientY, true, undefined, 'task'); }}
                  title="Create an all-day task or event" aria-label={`Create an all-day task or event on ${new Date(at(ws, idx, 12)).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`} />
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* the scrolling day */}
      <div ref={scroller} className="navsb cal-time-scroller" style={{ display: 'flex', overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 }}>
        {/* Hour axis */}
        <div className="cal-hour-axis" style={{ width: GUTTER, flex: 'none', position: 'relative', height: GRID_H }}>
          {hours.map((h, i) => {
            const first = i === 0;
            const last = i === hours.length - 1;
            return (
            <div key={h} className="cal-hour-label" style={{
              position: 'absolute', right: 8, top: `${(i / SPAN) * 100}%`,
              transform: first ? 'none' : last ? 'translateY(-100%)' : 'translateY(-50%)',
              fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            }}>
              {days === 7 ? hhmm(h).replace(':00', '') : hhmm(h)}
            </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={bodyRef} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${days}, 1fr)`, height: GRID_H }}>
          {hours.map((h, i) => (
            <div key={`r${h}`} className="cal-hour-line" aria-hidden style={{
              position: 'absolute', left: 0, right: 0, top: `${(i / SPAN) * 100}%`,
              height: 1, background: 'var(--line)', pointerEvents: 'none',
            }} />
          ))}

          <NowLine ws={ws} days={days} dayOffset={dayOffset} />

          {Array.from({ length: days }, (_, i) => {
            const idx = colOf(i);
            return (
              <div key={i} className="cal-day-column" style={{ position: 'relative', borderRight: i < days - 1 ? '1px solid var(--line)' : undefined }}>
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
                    onPointerDown={p => { touchSlot.current = p.pointerType !== 'mouse'; if (phone || touchSlot.current) slot.press(p); else onSlotPointerDown(p, idx, h); }}
                    onClick={(p) => {
                      if (!suppressClick.current && slotClickCreates(phone || touchSlot.current, p.detail) && (!(phone || touchSlot.current) || slot.tapped(p))) {
                        const targetRect = p.currentTarget.getBoundingClientRect();
                        const relY = Math.max(0, Math.min(0.99, (p.clientY - targetRect.top) / targetRect.height));
                        const startH = h + (relY >= 0.5 ? 0.5 : 0);
                        openSlot(idx, startH, p.clientX, p.clientY, false, startH + 1);
                      }
                    }}
                    onContextMenu={phone ? undefined : (p) => {
                      p.preventDefault();
                      const targetRect = p.currentTarget.getBoundingClientRect();
                      const relY = Math.max(0, Math.min(0.99, (p.clientY - targetRect.top) / targetRect.height));
                      const startH = h + (relY >= 0.5 ? 0.5 : 0);
                      openSlot(idx, startH, p.clientX, p.clientY, false, startH + 1);
                    }}
                    className={'cal-hour-slot' + (phone ? '' : ' hov')}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); openSlot(idx, h, r.left, r.top, false, Math.min(24, h + 1)); } }}
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
                        ...gridRange(e.starts_at, e.ends_at),
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

                  const todayStart = new Date(nowMs); todayStart.setHours(0, 0, 0, 0);
                  const vacantList = computeVacantIntervals(dayItems, isColToday, nowHour, nextEventId, GRID_START, GRID_END, colDate < todayStart);

                  return vacantList.map((v) => (
                    <VacantTimeIndicator
                      key={v.id}
                      startHour={v.startHour}
                      endHour={v.endHour}
                      targetStartsAt={v.targetStartsAt}
                      isNext={v.isNext}
                      showArrows={!!prefs.calendarFreeTimeArrows} pixelHeight={(v.endHour - v.startHour) * HOUR_H}
                    />
                  ));
                })()}

                {/* Events and timed tasks for this day, packed together into non-obstructing sub-columns */}
                {(() => {
                  type ScheduleItem =
                    | { kind: 'event'; ev: Ev; id: string }
                    | { kind: 'task'; task: Task; id: string };

                  const dayColEvents = events
                    .filter((e) => (!e.all_day || drag?.id === e.id && drag.day === idx) && !e.deleted_at
                      // A multi-day run is drawn as one bar by SpanChip; the
                      // per-day pass skips its members so the run does not
                      // also appear as N separate chips. (The `spanned` set
                      // existed for exactly this and was never consulted —
                      // that is why run bars never appeared.)
                      && !spanned.has(e.id)
                      && (dayIndex(e.starts_at, ws) === idx || drag?.id === e.id && drag.day === idx))
                    .map((e) => {
                      const isDrag = drag?.id === e.id;
                      const isResize = resize?.id === e.id;
                      // gridRange keeps a midnight-crossing event inside the
                      // day it starts on instead of folding it to a negative
                      // height.
                      const range = gridRange(e.starts_at, e.ends_at);
                      const len = e.all_day ? 1 : Math.max(0.5, range.end - range.start);
                      const start = isDrag && drag.day === idx ? drag.hour : range.start;
                      const end = isResize ? resize.end : isDrag && drag.day === idx ? drag.hour + len : range.end;
                      return {
                        ev: { kind: 'event' as const, ev: e, id: e.id },
                        start,
                        end,
                      };
                    });

                  const dayColTasks = slotTasks(idx).map(t => ({
                    ev: { kind: 'task' as const, task: t, id: t.id }, start: hoursOf(t.due_at!), end: Math.min(24, hoursOf(t.due_at!) + 1),
                  }));
                  const ghosts = tasks.flatMap(t => {
                    if (t.source !== 'canvas_lms') return [];
                    const original = t.calendar_planned ? t.calendar_original_due_at : t.due_at;
                    const destination = taskDrag?.task.id === t.id ? (taskDrag.hour === null ? null : at(ws, taskDrag.day, taskDrag.hour)) : t.due_at;
                    if (!original || dayIndex(original, ws) !== idx || sameCalendarTime(original, destination)) return [];
                    const start = hoursOf(original), end = Math.min(24, start + 1);
                    return [{ task: t, start, end, obstructed: [...dayColEvents, ...dayColTasks].some(item => item.start < end && item.end > start) }];
                  });
                  const allItems = [...dayColEvents, ...dayColTasks];
                  const positioned = layoutOverlappingEvents<ScheduleItem>(allItems);
                  // A narrow week column needs its width for text. Reserve an
                  // arrow lane only where an original Canvas deadline needs it.
                  const connectionSpace = days === 7 ? (ghosts.length ? 12 : 0) : 18;

                  return <>{ghosts.map(({ task, start, end, obstructed }) => <div key={`ghost-${task.id}`} data-calendar-ghost-id={task.id}
                    className={"cal-deadline-ghost" + (obstructed ? " is-obstructed" : "")}
                    style={{ position: 'absolute', left: 3, right: 3, top: `${Math.min(pct(start), 100 - 24 / GRID_H * 100)}%`, height: Math.max(24, (end - start) * HOUR_H) }}>
                    <button type="button" className="cal-deadline-label" aria-label={`Canvas deadline: ${task.title} · ${hhmm(start)}`}
                      title={`${task.title} · Canvas deadline ${hhmm(start)} · Drag study time here to restore`}
                      onClick={p => openTask(task, p.clientX, p.clientY)}>
                      <CalendarSourceIcon source="canvas_lms"/><span><b>{task.title}</b><small>Due {hhmm(start)}</small></span>
                    </button>
                  </div>)}{positioned.map((pos) => {
                    const item = pos.ev;
                    const leftPct = (pos.colIndex / pos.totalCols) * 100;
                    const widthPct = (1 / pos.totalCols) * 100;
                    const leftStyle = `calc(${leftPct}% - ${connectionSpace * pos.colIndex / pos.totalCols}px + 2px)`;
                    const widthStyle = `calc(${widthPct}% - ${connectionSpace / pos.totalCols + 4}px)`;

                    if (item.kind === 'event') {
                      const e = item.ev;
                      const isDrag = drag?.id === e.id;
                      const isResize = resize?.id === e.id;
                      const hiddenOrigin = isDrag && drag.day !== idx;

                      return (
                        <EventChip
                          key={`ev-${e.id}`}
                          ev={e}
                          pixelHeight={(pos.end - pos.start) * HOUR_H}
                          top={Math.min(pct(pos.start), 100 - 20 / GRID_H * 100)}
                          height={Math.max(20 / GRID_H * 100, pct(pos.end) - pct(pos.start))}
                          left={leftStyle}
                          width={widthStyle}
                          label={`${hhmm(pos.start)} – ${hhmm(pos.end)}`}
                          lifted={isDrag || isResize} hiddenOrigin={hiddenOrigin}
                          selected={sel === e.id}
                          isNext={e.id === nextEventId}
                          onPointerDown={(p) => press(p, e, 'move')}
                          onResize={(p) => press(p, e, 'resize')}
                          dark={dark} nowMs={nowMs}
                          onOpen={(p) => { if (suppressClick.current) return; openEvent(e, p.clientX, p.clientY); }}
                          onContext={(p) => { p.preventDefault(); p.stopPropagation(); if (!lastTouch.current) openMenu(e, p.clientX, p.clientY); }}
                        />
                      );
                    } else {
                      const t = item.task;
                      return (
                        <TaskChip
                          key={`task-${t.id}`}
                          task={t}
                          onPointerDown={(p) => pressTask(p, t, false)} onOpen={(x, y) => { if (!suppressClick.current) openTask(t, x, y); }}
                          timeLabel={`${hhmm(pos.start)} – ${hhmm(pos.end)}`}
                          pixelHeight={Math.max(24, (pos.end - pos.start) * HOUR_H)}
                          nowMs={nowMs}
                          style={{
                            position: 'absolute',
                            left: leftStyle,
                            width: widthStyle,
                            top: `${Math.min(pct(pos.start), 100 - 24 / GRID_H * 100)}%`,
                            height: Math.max(24, (pos.end - pos.start) * HOUR_H),
                            zIndex: 2, opacity: taskDrag?.task.id === t.id ? 0 : undefined,
                          }}
                        />
                      );
                    }
                  })}</>;
                })()}

                {taskDrag && taskDrag.hour !== null && taskDrag.day === idx && <TaskChip task={taskDrag.task}
                  onPointerDown={() => {}} nowMs={nowMs} pixelHeight={Math.max(24, HOUR_H)} timeLabel={`${hhmm(taskDrag.hour)} – ${hhmm(taskDrag.hour + 1)}`}
                  style={{ position: 'absolute', left: 2, right: days === 7 ? 2 : 20, top: `${pct(taskDrag.hour)}%`, height: `${100 / SPAN}%`, zIndex: 8, pointerEvents: 'none', boxShadow: '0 6px 20px #0003' }}/>}
              </div>
            );
          })}

          <CanvasConnections root={bodyRef} layoutKey={JSON.stringify([ws, days, dayOffset, HOUR_H, viewport.width, taskDrag, drag, resize, tasks.map(t => [t.id, t.due_at, t.calendar_original_due_at]), events.map(e => [e.id, e.starts_at, e.ends_at])])}/>

        </div>
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
  ev, top, height, pixelHeight, left = '3px', width = 'calc(100% - 21px)', label, lifted, hiddenOrigin, selected, dark, isNext, nowMs = Date.now(), onPointerDown, onResize, onOpen, onContext,
}: {
  ev: Ev; top: number; height: number; pixelHeight: number; left?: string | number; width?: string | number; label: string; lifted: boolean; hiddenOrigin?: boolean; selected: boolean;
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
  // Under ~45 minutes there is one line of room, so the time sits beside the title.
  const short = pixelHeight < 42 || Date.parse(ev.ends_at) - Date.parse(ev.starts_at) <= 30 * 60_000;
  const tiny = pixelHeight < 24;
  const className = [
    'cal-event', short && 'is-short', tiny && 'is-tiny', selected && 'is-selected',
    isPast && 'is-past', lifted && 'is-lifted', locked && 'is-locked',
  ].filter(Boolean).join(' ');

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContext?.(e); }}
      className={className}
      role="button" tabIndex={0} aria-label={`${chipLabel(ev)} · ${label}`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
      style={{ opacity: hiddenOrigin ? 0 : undefined, pointerEvents: hiddenOrigin ? 'none' : undefined, left, width, top: `${top}%`, height: `${height}%`, '--hue': ev.color, '--event-title-ink': ev.title_color || ink, '--event-detail-ink': ev.detail_color || ink, background: ev.color, color: ink } as React.CSSProperties}
      title={`${chipLabel(ev)} · ${label}`}>
      <span className="cal-event-title">
        <CalendarSourceIcon source={ev.source}/>
        <b>{chipLabel(ev)}</b>

      </span>
      <span className="cal-event-meta"><span className="cal-event-times-full"><span>{label.split(' – ')[0]}</span><span>– {label.split(' – ')[1]}</span></span><span className="cal-event-times-compact" aria-hidden="true">{label.replace(/\s?[AP]M/g, '').replace(' – ', '–')}</span></span>
      {!short && ev.location && <span className="cal-event-location">{ev.location}</span>}
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
  isNext, showArrows, pixelHeight,
}: {
  showArrows: boolean; pixelHeight: number;
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
    <div aria-hidden className={'cal-free' + (isNext ? ' is-next' : '') + (showArrows ? ' has-arrows' : '')} style={{ top: `${topPct}%`, height: `${heightPct}%` }}>
      {durationHours >= 0.5 && (
        <span className="cal-free-label">
          <b>{formatDurationHours(durationHours)} free</b>
          {pixelHeight >= 52 && <small>{hhmm(startHour)} – {hhmm(endHour)}</small>}
          {isNext && targetStartsAt && pixelHeight >= 76 && <VacantCountdown targetStartsAt={targetStartsAt} />}
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
        width: `calc(${(width / days) * 100}% - 21px)`,
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

function TaskChip({ task, onPointerDown, onOpen, style, compact, timeLabel, pixelHeight, nowMs = Date.now() }: {
  task: Task; onPointerDown: (e: React.PointerEvent) => void; onOpen?: (x: number, y: number) => void; style?: React.CSSProperties; compact?: boolean; timeLabel?: string; pixelHeight?: number; nowMs?: number;
}) {
  const alert = getTaskAlert(task);
  const hue = task.source === 'canvas_lms' ? '#3f51b5' : '#0b8043';
  const isPast = (task.due_at ? Date.parse(task.due_at) + 3600_000 : new Date(`${task.due_on}T23:59:59`).getTime()) < nowMs;
  return (
    <div data-calendar-task-id={task.id} onContextMenu={e => e.preventDefault()} onPointerDown={onPointerDown} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}
      aria-label={`${task.title}${timeLabel ? ` · ${timeLabel}` : " · All day"}`}
      onKeyDown={e => { if (onOpen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); onOpen(r.left, r.top); } }} title={`${task.title} · drag it to a time`}
      className={'cal-task' + (isPast ? ' is-past' : '') + (pixelHeight !== undefined && pixelHeight < 42 ? ' is-short' : '') + (compact ? ' is-compact' : '') + (style?.position === 'absolute' ? ' is-timed' : '') + (alert?.tier === 'red' ? ' is-due' : '')}
      style={{ '--hue': hue, color: '#fff', ...style } as React.CSSProperties}>
      {task.source !== 'canvas_lms' && <span className="cal-task-ring" aria-hidden="true" />}
      <span className="cal-task-copy"><span className="cal-task-title"><CalendarSourceIcon source={task.source}/>{task.title}</span>{timeLabel && <small className="cal-task-time-label"><span className="cal-task-time-full">{timeLabel}</span><span className="cal-task-time-compact" aria-hidden="true">{timeLabel.replace(/\s?[AP]M/g, '').replace(' – ', '–')}</span></small>}{task.calendar_planned && !compact && (pixelHeight === undefined || pixelHeight >= 72) && <small className="cal-task-plan-label">Study time</small>}</span>
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
    <div className="cal-now-line" aria-hidden style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: `${pct(hour)}%`, zIndex: 6, pointerEvents: 'none' }}>
      <div style={{ height: 2, background: 'var(--calendar-now,var(--pal-coral))' }} />
      <div className="k-breathe" style={{ position: 'absolute', left: -3, top: -3, width: 8, height: 8, borderRadius: 4, background: 'var(--calendar-now,var(--pal-coral))' }} />
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
function DayStrip({ selectedDate, onPick }: { selectedDate: Date; onPick: (date: Date) => void }) {
  const { prefs } = usePrefs();
  const rail = useRef<HTMLDivElement>(null);
  const tap = useTapGuard();
  const selected = useMemo(() => { const d = new Date(selectedDate); d.setHours(0, 0, 0, 0); return d; }, [selectedDate]);
  const today = new Date();
  const year = selected.getFullYear(), month = selected.getMonth();
  const days = useMemo(() => calendarStripDates(new Date(year, month, 1)), [year, month]);
  useEffect(() => {
    const el = rail.current;
    const button = el?.querySelector<HTMLElement>('[data-sel="1"]');
    if (!el || !button) return;
    const scale = el.getBoundingClientRect().width / el.clientWidth;
    const box = button.getBoundingClientRect(), bounds = el.getBoundingClientRect();
    el.scrollTo({ left: el.scrollLeft + (box.left + box.width / 2 - bounds.left - bounds.width / 2) / scale, behavior: 'auto' });
  }, [selected]);

  return (
    <div ref={rail} className="hbar cal-day-strip" role="region" aria-label="Choose a date" onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation(); }}>
      {days.map((date, i) => {
        const on = date.toDateString() === selected.toDateString();
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
              onPointerDown={tap.press}
              onClick={e => { if (tap.tapped(e)) onPick(date); }}
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
    const m = new Map<string, { id?: string; title: string; short_name?: string | null; color: string; text_color?: string | null; title_color?: string | null; detail_color?: string | null; starts_at?: string; ends_at?: string; source?: string | null; task?: boolean }[]>();
    const push = (k: string, v: { id?: string; title: string; short_name?: string | null; color: string; text_color?: string | null; title_color?: string | null; detail_color?: string | null; starts_at?: string; ends_at?: string; source?: string | null; task?: boolean }) =>
      m.set(k, [...(m.get(k) ?? []), v]);
    for (const e of events) push(new Date(e.starts_at).toDateString(), { id: e.id, title: e.title, short_name: e.short_name, color: e.color, text_color: e.text_color, title_color: e.title_color, detail_color: e.detail_color, starts_at: e.starts_at, ends_at: e.ends_at, source: e.source });
    for (const t of tasks) {
      if (!t.due_on) continue;
      push(new Date(`${t.due_on}T12:00:00`).toDateString(), { id: t.id, title: t.title, color: t.source === 'canvas_lms' ? '#3f51b5' : '#0b8043', source: t.source, task: true });
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
                    className={'cal-month-event' + (isPast ? ' is-past' : '') + (urgent ? ' red-alert-pulse' : '')}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, flex: 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                      background: it.color,
                      border: it.task ? '1px dashed currentColor' : undefined,
                      color: it.title_color || chipInk(it),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 3,
                    }}>
                    <CalendarSourceIcon source={it.source}/>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: urgent ? 800 : 700 }}>
                      {chipLabel(it)}
                    </span>
                    {cd && cd.status !== 'past' && (
                      <span style={{
                        fontSize: 8,
                        fontWeight: 900,
                        flex: 'none',
                        color: it.detail_color || chipInk(it),
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
          text_color?: string | null; title_color?: string | null; detail_color?: string | null; all_day?: boolean;
          task: boolean;
          source?: string | null;
        };

        const evItems: AgendaItem[] = events
          .filter((e) => dayIndex(e.starts_at, ws) === i)
          .map((e) => ({
            id: e.id, time: hoursOf(e.starts_at), starts_at: e.starts_at, ends_at: e.ends_at,
            title: e.title, short_name: e.short_name, meta: e.location, color: e.color, text_color: e.text_color, title_color: e.title_color, detail_color: e.detail_color, all_day: e.all_day, source: e.source, task: false,
          }));

        const taskItems: AgendaItem[] = tasks
          .filter((t) => dayIndex(`${t.due_on}T12:00:00`, ws) === i)
          .map((t) => ({
            id: t.id, time: t.due_at ? hoursOf(t.due_at) : 23.9, starts_at: t.due_at ?? null, ends_at: null,
            title: t.title, meta: t.due_at ? 'Task' : 'Task · no set time', color: t.source === 'canvas_lms' ? '#3f51b5' : '#0b8043', source: t.source, task: true,
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
                <div key={a.id} className={"cal-agenda-event" + (isPast ? " is-past" : "")} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px', marginTop: 4, borderRadius: 4,
                  background: a.color, color: chipInk(a),
                }}>
                  <CalendarSourceIcon source={a.source}/>
                  <span
                    className={urgent ? 'red-alert-pulse' : undefined}
                    style={{
                      width: 3.5, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, flex: 'none',
                      background: a.color, opacity: a.task ? 0.6 : 1,
                    }}
                  />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: a.detail_color || chipInk(a), width: 116, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                    {a.all_day || !a.starts_at ? 'All day' : `${hhmm(a.time)}${a.ends_at ? ` – ${hhmm(hoursOf(a.ends_at))}` : ''}`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: urgent ? 700 : 600, color: a.title_color || chipInk(a) }}>
                      {chipLabel(a)}
                    </span>
                    {cd && cd.status !== 'past' && <CdBadge cd={cd} />}
                  </div>
                  <span style={{ fontSize: 11, color: a.detail_color || chipInk(a), flex: '0 1 auto', maxWidth: '25%', overflowWrap: 'anywhere' }}>{a.meta}</span>
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
  const [titleColor, setTitleColor] = useState(ev.title_color ?? null);
  const [detailColor, setDetailColor] = useState(ev.detail_color ?? null);
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
      title, short_name: shortName.trim(), location, color, text_color: textColor, title_color: titleColor, detail_color: detailColor, all_day: allDay,
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

        <EventAppearance event={{ color, text_color: textColor, title_color: titleColor, detail_color: detailColor }} onChange={patch => {
          if (patch.color !== undefined) setColor(patch.color);
          if (patch.text_color !== undefined) setTextColor(patch.text_color);
          if (patch.title_color !== undefined) setTitleColor(patch.title_color);
          if (patch.detail_color !== undefined) setDetailColor(patch.detail_color);
        }}/>

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
