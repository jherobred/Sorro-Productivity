'use client';

import { useState, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, type IconName } from './Icon';
import { PAL, K } from '@/lib/pal';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { useOverlayBack } from '@/lib/nav';
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { useHabits, useTicks, useHabitActions, ymd, streak } from '@/lib/habits';
import { useScratch, useScratchActions, TAG_COLOR, ago } from '@/lib/scratch';
import { useTransactions, useBudgets } from '@/lib/money';
import { useEvents, useEventActions, type Ev, hhmm, hoursOf } from '@/lib/events';
import { PhoneHomeSkeleton } from './Skeleton';
import { UpcomingTasksCarousel } from './UpcomingTasksCarousel';
import { FocusHub } from './FocusHub';
import { playTick } from '@/lib/audio';
import { toast } from '@/lib/toast';
import { SwipeableRow } from './SwipeableRow';
import {
  MorphingPopover,
  MorphingPopoverTrigger,
  MorphingPopoverContent,
} from '@/components/core/morphing-popover';
import {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContent,
  MorphingDialogTitle,
  MorphingDialogImage,
  MorphingDialogSubtitle,
  MorphingDialogClose,
  MorphingDialogDescription,
  MorphingDialogContainer,
} from '@/components/core/morphing-dialog';
import { ArrowLeftIcon, ChevronDown, ChevronUp, Plus, Camera, PlusIcon } from 'lucide-react';
import { AsciiBar } from './AsciiBar';

const CARD: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 16,
  padding: '14px 15px',
  boxShadow: 'var(--sh)',
};

const KICKER: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.11em',
  textTransform: 'uppercase',
  color: 'var(--tx3)',
};

export function PhoneHome({ name }: { name: string }) {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [focusOpen, setFocusOpen] = useState(false);
  const [ringsExpanded, setRingsExpanded] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [restExpanded, setRestExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('bd_today_schedule_expanded') === 'true';
      } catch {}
    }
    return false;
  });

  const toggleRestExpanded = () => {
    setRestExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('bd_today_schedule_expanded', String(next));
      } catch {}
      return next;
    });
  };

  useOverlayBack(focusOpen, () => setFocusOpen(false));

  const today = ymd(new Date());
  const { data: tasks = [], isPending } = useTasks();
  const TA = useTaskActions();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(7);
  const HA = useHabitActions(7);
  const { data: scratch = [] } = useScratch();
  const SA = useScratchActions();
  const { data: txns = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();

  const from = startOfToday();
  const { data: events = [] } = useEvents(from, 7);
  const EA = useEventActions(from);

  const open = tasks.filter((t) => !t.done);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const month = new Date().toISOString().slice(0, 7);
  const spent = txns.filter((t) => t.occurred_at.startsWith(month)).reduce((s, t) => s + Math.abs(t.amount_centavos), 0);
  const budget = budgets.reduce((s, b) => s + b.amount_centavos, 0);

  // 15s, not 1s. `next` only has to change when an event ends, and the kicker
  // only has to flip when one starts. The seconds are rendered by
  // PhoneCountdown, which owns its own timer — ticking here once a second
  // re-rendered the whole phone home screen, every task and event row on it,
  // to move two digits.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const dueToday = open.filter((t) => t.due_on === today);
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const todaysEvents = events.filter((e) => sameDay(e.starts_at, today));
  const next = events
    .filter((e) => new Date(e.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;

  const isNextOngoing = next ? new Date(next.starts_at).getTime() <= now : false;

  // Eight rings
  type Ring = { id: string; n: string; c: string; pct: number; detail: string; ic: IconName; go: () => void };

  const habitRings: Ring[] = habits.slice(0, 6).map((h) => {
    const isDone = ticks.some((t) => t.habit_id === h.id && t.on_date === today);
    const curStreak = streak(ticks, h.id);
    return {
      id: h.id,
      n: h.name,
      c: h.color,
      ic: 'habit',
      pct: isDone ? 1 : 0,
      detail: `${curStreak} day streak · ${isDone ? 'Completed today' : 'Tap to tick'}`,
      go: () => {
        playTick();
        HA.tick.mutate({ habitId: h.id, date: today });
      },
    };
  });

  const standing: Ring[] = [
    {
      id: 'tasks',
      n: 'Tasks',
      c: PAL.mint,
      ic: 'task',
      pct: tasks.length ? 1 - open.length / tasks.length : 0,
      detail: `${tasks.length - open.length} of ${tasks.length} closed`,
      go: () => router.push('/tasks/'),
    },
    {
      id: 'money',
      n: 'Money',
      c: PAL.amber,
      ic: 'money',
      pct: budget ? Math.min(1, spent / budget) : 0,
      detail: budget ? `₱${Math.round(spent / 100)} of ₱${Math.round(budget / 100)} spent` : 'No budget set',
      go: () => router.push('/money/'),
    },
  ];

  const rings: Ring[] = [...habitRings, ...standing].slice(0, 8);
  const ringsDone = rings.filter((r) => r.pct >= 1).length;

  const complete = (t: Task) => {
    playTick();
    setLeaving((s) => new Set(s).add(t.id));
    setTimeout(() => {
      TA.complete.mutate({ id: t.id, done: true });
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
    }, K.taskExitMs);
  };

  const bestStreak = habits.reduce((m, h) => Math.max(m, streak(ticks, h.id)), 0);

  const displayedTasks = tasksExpanded ? open : open.slice(0, 4);

  const homeHabits = habits.filter((h) => !h.archived_at && h.show_in_home !== false);

  if (isPending) {
    return (
      <div style={{ padding: '6px 14px 26px' }}>
        <PhoneHomeSkeleton />
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 14px 28px' }}>
      {/* 1. Upcoming Tasks Sliding Carousel */}
      <UpcomingTasksCarousel
        tasks={tasks}
        todayISO={today}
        style={{ width: '100%', minHeight: 165, marginBottom: 12 }}
      />

      {/* 2. Happening now / Up next Card */}
      <div
        style={{
          ...CARD,
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 10,
          padding: '13px 15px',
          border: `1.5px solid color-mix(in srgb, ${next?.color || PAL.sky} 35%, var(--line2))`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ position: 'relative', width: 6, height: 6, flex: 'none' }}>
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: next ? (isNextOngoing ? PAL.mint : next.color || PAL.sky) : 'var(--tx3)',
                }}
              />
              {next && (
                <span
                  className="halo"
                  style={{
                    position: 'absolute',
                    inset: -2,
                    borderRadius: '50%',
                    border: `1.5px solid ${isNextOngoing ? PAL.mint : next.color || PAL.sky}`,
                  }}
                />
              )}
            </span>
            <span
              style={{
                ...KICKER,
                color: next ? (isNextOngoing ? PAL.mint : next.color || PAL.sky) : 'var(--tx3)',
              }}
            >
              {next ? (isNextOngoing ? 'Happening Now' : 'Up next') : 'Today'}
            </span>
          </div>
        </div>

        <div
          onClick={() => router.push('/calendar/')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontSize: 14.5,
                fontWeight: 800,
                letterSpacing: '-.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: 'var(--tx)',
              }}
            >
              {next ? next.title : 'Nothing scheduled'}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
              {next
                ? `${hhmm(hoursOf(next.starts_at))} – ${hhmm(hoursOf(next.ends_at))}${
                    next.location ? ' · ' + next.location : ''
                  }`
                : `${todaysEvents.length} today · ${dueToday.length} due`}
            </span>
          </span>
          <Icon name="chev" size={14} color="var(--tx3)" />
        </div>

        {/* Full-Width Animated Progress Bar with Centered Countdown */}
        {next && (() => {
          const startMs = new Date(next.starts_at).getTime();
          const endMs = new Date(next.ends_at).getTime();
          let pct = 0;
          if (isNextOngoing) {
            const duration = Math.max(1000, endMs - startMs);
            const elapsed = Math.max(0, now - startMs);
            pct = Math.min(100, Math.round((elapsed / duration) * 100));
          } else if (startMs > now) {
            const startOfDay = new Date(next.starts_at);
            startOfDay.setHours(0, 0, 0, 0);
            const totalWait = Math.max(1000, startMs - startOfDay.getTime());
            const elapsedWait = Math.max(0, now - startOfDay.getTime());
            pct = Math.min(100, Math.max(0, Math.round((elapsedWait / totalWait) * 100)));
          }
          return (
            <div
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                width: '100%',
                height: 24,
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--line2) 40%, var(--card2))',
                border: '1px solid var(--line2)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                margin: '3px 0 2px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: 'radial-gradient(circle, var(--line2) 1.25px, transparent 1.25px)',
                  backgroundSize: '7px 7px',
                  opacity: 0.65,
                }}
              />
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${isNextOngoing ? PAL.mint : next.color || PAL.sky} 80%, transparent) 0%, ${isNextOngoing ? PAL.mint : next.color || PAL.sky} 100%)`,
                  boxShadow: `0 0 12px color-mix(in srgb, ${isNextOngoing ? PAL.mint : next.color || PAL.sky} 50%, transparent)`,
                  borderRadius: pct >= 99 ? 5 : '5px 0 0 5px',
                  transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div
                  className="ascii-fill-shimmer"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                  }}
                />
              </div>

              {/* Centered Live Countdown Badge */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  zIndex: 3,
                  pointerEvents: 'none',
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: 'var(--tx)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Icon name="clock" size={12} color="var(--tx)" />
                <PhoneCountdown startsAt={next.starts_at} endsAt={next.ends_at} color="var(--tx)" />
                <span style={{ fontSize: 10, opacity: 0.9, fontWeight: 700, marginLeft: 2 }}>
                  ({Math.round(pct)}%)
                </span>
              </div>
            </div>
          );
        })()}

        {/* Schedule & Snooze Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4, width: '100%' }}>
          <button
            type="button"
            onClick={() => router.push('/calendar/')}
            className="acc k-squish"
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              background: 'var(--acc)',
              color: '#0C0F16',
              fontSize: 11.5,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              width: '100%',
              textAlign: 'center',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => {
              if (!next) {
                toast('Nothing to snooze');
                return;
              }
              EA.snooze.mutate({ id: next.id });
              toast(`Reminder for “${next.title}” pushed 10 minutes`);
            }}
            className="hov k-squish"
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: 'var(--tx2)',
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              width: '100%',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            Snooze
          </button>
        </div>
      </div>

      {/* 3. Today's Schedule: Vertical 3h preview with 5h expand chevron */}
      {todaysEvents.length > 0 && (
        <div
          style={{
            ...CARD,
            marginBottom: 14,
            padding: '12px 14px',
            background: 'color-mix(in srgb, var(--panel) 62%, transparent)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={KICKER}>Today's Schedule</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--tx3)' }}>
              {todaysEvents.length} event{todaysEvents.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Vertical hour preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(() => {
              const curH = new Date().getHours();
              const hoursCount = restExpanded ? 5 : 3;
              const startH = Math.max(0, Math.min(24 - hoursCount, curH - 1));
              const hourList = Array.from({ length: hoursCount }, (_, i) => startH + i);

              return hourList.map((h) => {
                const isNow = h === curH;
                const hStr = h % 12 === 0 ? '12' : String(h % 12);
                const ampm = h < 12 ? 'AM' : 'PM';
                const hourEvents = todaysEvents.filter((e) => {
                  const startHour = hoursOf(e.starts_at);
                  const endHour = hoursOf(e.ends_at);
                  const startsInHour = startHour >= h && startHour < h + 1;
                  const endsInHour = endHour > h && endHour <= h + 1;
                  const spansHour = startHour <= h && endHour >= h + 1;
                  const overlapsHour = startHour < h + 1 && endHour > h;
                  return startsInHour || endsInHour || spansHour || overlapsHour;
                }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

                return (
                  <div
                    key={h}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 9px',
                      borderRadius: 8,
                      background: isNow ? 'color-mix(in srgb, var(--acc) 14%, var(--card))' : 'var(--card2)',
                      border: isNow ? '1px solid color-mix(in srgb, var(--acc) 38%, transparent)' : '1px solid var(--line)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 38, flex: 'none' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: isNow ? 'var(--accTx)' : 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>
                        {hStr} {ampm}
                      </span>
                      {isNow && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--accTx)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                          NOW
                        </span>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {hourEvents.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {hourEvents.map((ev) => (
                            <div
                              key={ev.id}
                              onClick={() => router.push('/calendar/')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: ev.color || PAL.sky, flex: 'none' }} />
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ev.title}
                                </span>
                              </div>
                              <span style={{ fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                                {hhmm(hoursOf(ev.starts_at))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 10.5, color: 'var(--tx3)', fontStyle: 'italic' }}>
                          No events
                        </span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Expand/Collapse Chevron Button */}
          <button
            type="button"
            onClick={toggleRestExpanded}
            className="hov k-squish"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 7,
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              color: 'var(--tx2)',
              fontSize: 10.5,
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <span>{restExpanded ? 'Show 3-hour preview' : 'Expand 5-hour today calendar'}</span>
            <Icon name={restExpanded ? 'chevronUp' : 'chevronDown'} size={11} />
          </button>
        </div>
      )}

      {/* 3b. The Rest of Today Horizontal Timeline Bar */}
      <div
        style={{
          ...CARD,
          marginBottom: 14,
          padding: '12px 14px',
          background: 'color-mix(in srgb, var(--panel) 62%, transparent)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={KICKER}>The rest of today</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--tx3)' }}>
            {todaysEvents.length} event{todaysEvents.length === 1 ? '' : 's'} scheduled
          </span>
        </div>

        <div style={{ position: 'relative', height: 36, marginBlock: 4 }}>
          {/* 24h Background Line */}
          <div style={{ position: 'absolute', top: 17, left: 0, right: 0, height: 2, background: 'var(--line2)' }} />

          {/* 24 Vertical Hour Ticks */}
          {Array.from({ length: 25 }, (_, h) => {
            const isMajor = h % 3 === 0;
            return (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  left: `${(h / 24) * 100}%`,
                  top: isMajor ? 10 : 14,
                  width: isMajor ? 1.5 : 1,
                  height: isMajor ? 14 : 7,
                  background: isMajor ? 'var(--tx3)' : 'var(--line2)',
                  transform: 'translateX(-50%)',
                  opacity: isMajor ? 0.75 : 0.45,
                  zIndex: 1,
                }}
              />
            );
          })}

          {/* All 24h Event Blocks */}
          {todaysEvents.map((e) => {
            const s = hoursOf(e.starts_at);
            let len = hoursOf(e.ends_at) - s;
            if (len <= 0) len = 0.5;
            const leftPct = (s / 24) * 100;
            const widthPct = Math.max(2.5, (len / 24) * 100);
            return (
              <div
                key={e.id}
                title={`${e.title} (${hhmm(hoursOf(e.starts_at))} - ${hhmm(hoursOf(e.ends_at))})`}
                onClick={() => router.push('/calendar/')}
                style={{
                  position: 'absolute',
                  top: 7,
                  left: `${Math.max(0, Math.min(100 - widthPct, leftPct))}%`,
                  width: `${Math.min(100, widthPct)}%`,
                  height: 20,
                  borderRadius: 5,
                  background: e.color || PAL.sky,
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'hidden',
                  padding: '0 4px',
                  boxShadow: `0 2px 8px color-mix(in srgb, ${e.color || PAL.sky} 30%, transparent)`,
                  cursor: 'pointer',
                  zIndex: 2,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, color: '#0A0912', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.title}
                </span>
              </div>
            );
          })}

          {/* Current Time Cursor Marker */}
          <div
            style={{
              position: 'absolute',
              top: 3,
              left: `${Math.max(0, Math.min(100, ((new Date().getHours() + new Date().getMinutes() / 60) / 24) * 100))}%`,
              width: 2.5,
              height: 28,
              background: 'var(--acc)',
              boxShadow: '0 0 8px var(--acc)',
              zIndex: 4,
              transform: 'translateX(-50%)',
              borderRadius: 2,
            }}
          />
        </div>

        {/* 24h Time Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', paddingInline: 2 }}>
          <span>12A</span><span>3A</span><span>6A</span><span>9A</span><span>12P</span><span>3P</span><span>6P</span><span>9P</span><span>12A</span>
        </div>

        {/* Event Labels List */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
          {todaysEvents.slice(0, 3).map((e) => (
            <span
              key={e.id}
              onClick={() => router.push('/calendar/')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: 'var(--card2)', border: '1px solid var(--line)',
                color: 'var(--tx2)', cursor: 'pointer',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: e.color || PAL.sky, flex: 'none' }} />
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
              <span style={{ fontSize: 9, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{hhmm(hoursOf(e.starts_at))}</span>
            </span>
          ))}
          {todaysEvents.length > 3 && (
            <span style={{ fontSize: 9.5, color: 'var(--tx3)', alignSelf: 'center' }}>+{todaysEvents.length - 3} more</span>
          )}
          {todaysEvents.length === 0 && (
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>No events scheduled for today</span>
          )}
        </div>
      </div>

      {/* 4. Habits: 2 Columns of Square Buttons */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingInline: 2 }}>
          <span style={KICKER}>Habits</span>
          <button
            onClick={() => router.push('/habits/')}
            style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: 'var(--tx3)', cursor: 'pointer' }}
          >
            View all →
          </button>
        </div>

        {homeHabits.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {homeHabits.map((h) => {
              const isDone = ticks.some((t) => t.habit_id === h.id && t.on_date === today);
              const displayName = h.short_name?.trim() || h.name.split(' ')[0] || h.name;
              return (
                <button
                  key={h.id}
                  onClick={() => {
                    playTick();
                    HA.tick.mutate({ habitId: h.id, date: today });
                  }}
                  className="hov k-squish"
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 18,
                    border: `1.5px solid ${isDone ? h.color : 'color-mix(in srgb, ' + h.color + ' 30%, var(--line2))'}`,
                    background: isDone
                      ? `color-mix(in srgb, ${h.color} 22%, var(--card))`
                      : 'var(--card)',
                    boxShadow: isDone
                      ? `0 0 20px color-mix(in srgb, ${h.color} 30%, transparent), var(--sh)`
                      : 'var(--sh)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: 12,
                    position: 'relative',
                    transition: 'all 0.25s ease',
                  }}
                >
                  {isDone ? (
                    <>
                      <motion.div
                        key="checked"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 450, damping: 22 }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: h.color,
                          display: 'grid',
                          placeItems: 'center',
                          color: '#0C0F16',
                          boxShadow: `0 3px 14px color-mix(in srgb, ${h.color} 45%, transparent)`,
                        }}
                      >
                        <Icon name="check" size={24} color="#0C0F16" />
                      </motion.div>
                      <span
                        style={{
                          fontSize: 14.5,
                          fontWeight: 800,
                          letterSpacing: '-.02em',
                          color: 'var(--tx)',
                          textAlign: 'center',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {displayName}
                      </span>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 13,
                          background: `color-mix(in srgb, ${h.color} 18%, transparent)`,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name={(h.icon as IconName) || 'spark'} size={20} color={h.color} />
                      </div>
                      <span
                        style={{
                          fontSize: 14.5,
                          fontWeight: 800,
                          letterSpacing: '-.02em',
                          color: 'var(--tx)',
                          textAlign: 'center',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {displayName}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => router.push('/habits/')}
            className="hov k-squish"
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 16,
              background: 'var(--card2)',
              border: '1px dashed var(--line2)',
              textAlign: 'center',
              color: 'var(--tx3)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Add or configure habits for Home
          </button>
        )}
      </div>

      {/* Focus Hub Modal */}
      {focusOpen &&
        createPortal(
          <div
            onClick={() => setFocusOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Focus station"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 140,
              background: 'rgba(0,0,0,.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440 }}>
              <FocusHub onClose={() => setFocusOpen(false)} />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function PhoneJournalShortcut({
  scratch = [],
  onSave,
  onDelete,
}: {
  scratch: any[];
  onSave: (text: string, title?: string, photo_url?: string) => void;
  onDelete?: (id: string) => void;
}) {
  const uniqueId = useId();
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeMenu = () => {
    setNote('');
    setTitle('');
    setPhoto(null);
    setIsOpen(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhoto(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() && !title.trim() && !photo) return;
    onSave(note.trim(), title.trim(), photo || undefined);
    closeMenu();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '11px 12px',
          borderRadius: 14,
          background: 'color-mix(in srgb, #FFF9E6 10%, var(--card))',
          border: '1px solid color-mix(in srgb, #F5B33C 32%, var(--line))',
          boxShadow: '0 4px 20px rgba(245, 179, 60, 0.05), var(--sh)',
        }}
      >
        <span
          style={{
            width: 3,
            alignSelf: 'stretch',
            minHeight: 36,
            borderRadius: 2,
            background: 'var(--pal-amber)',
            flex: 'none',
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ ...KICKER, color: 'var(--pal-amber)' }}>Journal</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--tx3)' }}>{scratch.length}</span>
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--tx2)',
              marginTop: 3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {scratch[0]?.text || scratch[0]?.title || 'Nothing kept yet'}
          </span>
        </span>

        {/* Morphing Popover for Quick Journal Entry */}
        <MorphingPopover
          transition={{
            type: 'spring',
            bounce: 0.05,
            duration: 0.3,
          }}
          open={isOpen}
          onOpenChange={setIsOpen}
        >
          <MorphingPopoverTrigger className="flex h-8 items-center rounded-lg bg-[var(--pal-amber)] px-3 text-xs font-bold text-[#0A0912] shadow-sm">
            <motion.span layoutId={`popover-label-${uniqueId}`} className="flex items-center gap-1">
              <Plus size={12} />
              <span>Add Note</span>
            </motion.span>
          </MorphingPopoverTrigger>

          <MorphingPopoverContent className="rounded-xl border border-[var(--line2)] bg-[var(--card)] p-0 shadow-2xl">
            <div className="h-[250px] w-[310px] sm:w-[350px]">
              <form className="flex h-full flex-col" onSubmit={handleSubmit}>
                <div className="p-3 pb-0 flex items-center justify-between gap-2 border-b border-[var(--line)]">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title (optional)..."
                    className="w-full bg-transparent text-xs font-bold text-[var(--tx)] placeholder-[var(--tx3)] focus:outline-none pb-1.5"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach photo"
                    className="flex items-center gap-1 text-[11px] font-bold text-[var(--pal-amber)] bg-[var(--card2)] px-2 py-1 rounded-md border border-[var(--line)]"
                  >
                    <Camera size={12} />
                    <span>{photo ? 'Photo ✓' : 'Photo'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                </div>

                {photo && (
                  <div className="relative mx-3 mt-2 h-16 w-24 overflow-hidden rounded-md border border-[var(--line)] flex-none">
                    <img loading="lazy" decoding="async" src={photo} alt="Upload preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <textarea
                  className="h-full w-full resize-none bg-transparent px-3 py-2 text-xs text-[var(--tx)] placeholder-[var(--tx3)] focus:outline-none"
                  autoFocus
                  value={note}
                  placeholder="Capture your thoughts or moments of your day..."
                  onChange={(e) => setNote(e.target.value)}
                />

                <div key="close" className="flex justify-between items-center py-2.5 px-3 border-t border-[var(--line)] bg-[var(--card2)]">
                  <button
                    type="button"
                    className="flex items-center rounded-lg bg-[var(--card)] px-2 py-1 text-xs text-[var(--tx)] hover:bg-[var(--line)]"
                    onClick={closeMenu}
                    aria-label="Close popover"
                  >
                    <ArrowLeftIcon size={14} className="text-[var(--tx)]" />
                  </button>
                  <button
                    className="flex h-7 items-center justify-center rounded-lg bg-[var(--pal-amber)] px-3 text-xs font-bold text-[#0A0912] active:scale-95"
                    type="submit"
                    aria-label="Submit note"
                  >
                    Submit
                  </button>
                </div>
              </form>
            </div>
          </MorphingPopoverContent>
        </MorphingPopover>
      </div>

      {/* Journal entries cards in phone view using MorphingDialog */}
      {scratch.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scratch.slice(0, 4).map((entry) => (
            <MorphingDialog
              key={entry.id}
              transition={{
                type: 'spring',
                bounce: 0.05,
                duration: 0.25,
              }}
            >
              <MorphingDialogTrigger
                style={{ borderRadius: '12px' }}
                className="flex items-center gap-3 overflow-hidden border border-zinc-800/60 bg-[var(--card2)] p-2.5 text-left transition-all hover:border-zinc-700/80 shadow-sm"
              >
                {entry.photo_url ? (
                  <MorphingDialogImage
                    src={entry.photo_url}
                    alt={entry.title || entry.text}
                    className="h-12 w-12 rounded-lg object-cover flex-none"
                  />
                ) : (
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-[var(--card)] text-base">
                    📔
                  </div>
                )}
                <div className="flex grow flex-col min-w-0">
                  <MorphingDialogTitle className="text-xs font-bold text-[var(--tx)] truncate">
                    {entry.title || entry.text}
                  </MorphingDialogTitle>
                  <MorphingDialogSubtitle className="text-[10.5px] text-[var(--tx3)] truncate">
                    {entry.title ? entry.text : 'Journal entry'}
                  </MorphingDialogSubtitle>
                </div>
              </MorphingDialogTrigger>

              <MorphingDialogContainer>
                <MorphingDialogContent
                  style={{ borderRadius: '18px' }}
                  className="relative h-auto max-h-[85vh] w-[92vw] max-w-[420px] border border-zinc-800 bg-[var(--card)] p-5 overflow-y-auto shadow-2xl"
                >
                  {entry.photo_url && (
                    <MorphingDialogImage
                      src={entry.photo_url}
                      alt={entry.title || entry.text}
                      className="h-48 w-full rounded-xl object-cover mb-4"
                    />
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'color-mix(in srgb, var(--pal-amber) 20%, transparent)',
                        color: 'var(--pal-amber)',
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    >
                      {entry.tag || 'Journal'}
                    </span>
                    <span className="text-[10px] text-[var(--tx3)]">
                      {new Date(entry.created_at || Date.now()).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <MorphingDialogTitle className="text-base font-bold text-[var(--tx)] mb-2">
                    {entry.title || 'Journal Entry'}
                  </MorphingDialogTitle>

                  <MorphingDialogDescription
                    disableLayoutAnimation
                    variants={{
                      initial: { opacity: 0, y: 10 },
                      animate: { opacity: 1, y: 0 },
                      exit: { opacity: 0, y: 10 },
                    }}
                    className="text-xs leading-relaxed text-[var(--tx2)] whitespace-pre-wrap mb-4"
                  >
                    {entry.text}
                  </MorphingDialogDescription>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(entry.id)}
                        className="text-xs text-[var(--pal-coral)] font-bold hover:underline"
                      >
                        Delete entry
                      </button>
                    )}
                    <MorphingDialogClose className="ml-auto rounded-lg bg-[var(--card2)] px-3 py-1.5 text-xs font-bold text-[var(--tx)]" />
                  </div>
                </MorphingDialogContent>
              </MorphingDialogContainer>
            </MorphingDialog>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...CARD,
        textAlign: 'center',
        padding: '24px 16px',
        color: 'var(--tx3)',
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Night falls';
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b.includes('T') ? b : `${b}T00:00:00`);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

/**
 * The phone home countdown digits, with their own timer. Lifted out of
 * PhoneHome so a per-second tick re-renders three spans instead of the whole
 * screen.
 */
function PhoneCountdown({ startsAt, endsAt, color }: { startsAt: string; endsAt: string; color: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ongoing = new Date(startsAt).getTime() <= now;
  const target = ongoing ? new Date(endsAt).getTime() : new Date(startsAt).getTime();
  const total = Math.floor(Math.max(0, target - now) / 1000);
  const hrs = Math.floor(total / 3600);
  const prefix = ongoing ? 'ENDS IN:' : 'STARTS IN:';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.06em', opacity: 0.95 }}>
        {prefix}
      </span>
      <span>
        {hrs > 0 && <span>{hrs}h </span>}
        <span>{String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m </span>
        <span style={{ color }}>{String(total % 60).padStart(2, '0')}s</span>
      </span>
    </span>
  );
}
