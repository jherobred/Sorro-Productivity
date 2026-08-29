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
import { useEvents, type Ev, hhmm, hoursOf } from '@/lib/events';
import { PhoneHomeSkeleton } from './Skeleton';
import { BuddyCompanion } from './BuddyCompanion';
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

  if (isPending) {
    return (
      <div style={{ padding: '6px 14px 26px' }}>
        <PhoneHomeSkeleton />
      </div>
    );
  }

  return (
    <div style={{ padding: '6px 14px 26px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={() => router.push('/habits/')}
          className="glowring"
          title="Habit rings"
          style={{
            position: 'relative',
            width: 38,
            height: 38,
            borderRadius: '50%',
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            background: `color-mix(in srgb, ${prefs.accent} 18%, transparent)`,
            border: `1px solid color-mix(in srgb, ${prefs.accent} 40%, transparent)`,
          }}
        >
          <span
            className="glowspin"
            aria-hidden
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              background: `conic-gradient(from 0deg, transparent, ${prefs.accent}, transparent)`,
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
          <Icon name="habit" size={16} color="var(--accTx)" />
        </button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.04em' }}>basedly</div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginTop: -1 }}>
            {greeting()}{name ? `, ${name.split(' ')[0]}` : ''}
          </div>
        </div>

        <button
          onClick={() => setFocusOpen(true)}
          className="k-squish"
          title="Focus Station"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            background: 'color-mix(in srgb, var(--acc) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--acc) 35%, transparent)',
            color: 'var(--accTx)',
          }}
        >
          <Icon name="clock" size={16} color="var(--accTx)" />
        </button>
      </div>

      {/* Expandable Today's Rings Widget (Replaces TabRail) */}
      <div
        style={{
          ...CARD,
          marginBottom: 12,
          padding: '12px 14px 6px',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
        }}
      >
        <AnimatePresence initial={false}>
          {!ringsExpanded ? (
            /* Collapsed Grid of Rings */
            <motion.div
              key="collapsed-rings"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
                gap: '8px 4px',
                paddingBottom: 4,
              }}
            >
              {rings.map((r) => {
                const circ = 2 * Math.PI * 26;
                return (
                  <button
                    key={r.id}
                    onClick={r.go}
                    title={r.n}
                    className="k-squish"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <span
                      style={{
                        position: 'relative',
                        width: 50,
                        height: 50,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <svg
                        viewBox="0 0 64 64"
                        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
                      >
                        <circle
                          cx="32"
                          cy="32"
                          r="26"
                          fill="none"
                          stroke="rgba(150,165,200,.14)"
                          strokeWidth="5"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r="26"
                          fill="none"
                          stroke={r.c}
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={circ}
                          strokeDashoffset={circ * (1 - r.pct)}
                          style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.22,1,.36,1)' }}
                        />
                      </svg>
                      <Icon name={r.ic} size={15} color={r.c} />
                    </span>
                    <span
                      style={{
                        fontSize: 8.5,
                        fontWeight: 700,
                        color: 'var(--tx3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {r.n}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : (
            /* Expanded Vertical Layout with Progress Bars & Details */
            <motion.div
              key="expanded-rings"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 6 }}
            >
              {rings.map((r) => (
                <button
                  key={r.id}
                  onClick={r.go}
                  className="hov k-squish"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: 'var(--card2)',
                    border: '1px solid var(--line)',
                    textAlign: 'left',
                    width: '100%',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: `color-mix(in srgb, ${r.c} 18%, transparent)`,
                      display: 'grid',
                      placeItems: 'center',
                      flex: 'none',
                    }}
                  >
                    <Icon name={r.ic} size={16} color={r.c} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)' }}>{r.n}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: r.pct >= 1 ? PAL.mint : 'var(--tx3)' }}>
                        {r.pct >= 1 ? '100%' : `${Math.round(r.pct * 100)}%`}
                      </span>
                    </div>

                    <div style={{ height: 4, borderRadius: 2, background: 'var(--line2)', marginTop: 5, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.round(r.pct * 100))}%`,
                          background: r.c,
                          borderRadius: 2,
                          transition: 'width .4s ease-out',
                        }}
                      />
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>{r.detail}</div>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wide partially invisible chevron button at the bottom */}
        <button
          type="button"
          onClick={() => setRingsExpanded(!ringsExpanded)}
          aria-label={ringsExpanded ? 'Collapse rings' : 'Expand rings'}
          className="k-squish"
          style={{
            width: '100%',
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            opacity: 0.5,
            cursor: 'pointer',
            marginTop: 2,
          }}
        >
          {ringsExpanded ? <ChevronUp size={14} color="var(--tx3)" /> : <ChevronDown size={14} color="var(--tx3)" />}
        </button>
      </div>

      {/* Up Next Card */}
      <button
        onClick={() => router.push('/calendar/')}
        className="hov k-squish"
        style={{
          ...CARD,
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
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

          {next && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                padding: '3px 8px',
                borderRadius: 7,
                background: `color-mix(in srgb, ${next.color || PAL.sky} 15%, var(--card2))`,
                border: `1px solid color-mix(in srgb, ${next.color || PAL.sky} 30%, transparent)`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--tx)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <Icon name="clock" size={11} color={next.color || PAL.sky} style={{ marginRight: 2 }} />
              <PhoneCountdown startsAt={next.starts_at} endsAt={next.ends_at} color={next.color || PAL.sky} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
      </button>

      {/* Smaller "Rest of the Day" compact timeline under "Up next" */}
      {todaysEvents.length > 0 && (
        <div
          style={{
            ...CARD,
            marginTop: 8,
            padding: '10px 12px',
            background: 'var(--card2)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ ...KICKER, fontSize: 8.5 }}>Rest of the day</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--tx3)' }}>{todaysEvents.length} events</span>
          </div>

          <div
            style={{
              display: 'flex',
              height: 14,
              borderRadius: 6,
              background: 'var(--card)',
              overflow: 'hidden',
              gap: 2,
            }}
          >
            {todaysEvents.map((ev) => {
              const startH = hoursOf(ev.starts_at);
              const endH = hoursOf(ev.ends_at);
              const durH = Math.max(0.5, endH - startH);
              return (
                <div
                  key={ev.id}
                  title={`${ev.title} (${hhmm(startH)} - ${hhmm(endH)})`}
                  style={{
                    flex: durH,
                    background: ev.color || PAL.sky,
                    borderRadius: 3,
                    opacity: new Date(ev.ends_at).getTime() < now ? 0.4 : 0.9,
                  }}
                />
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 2 }} className="navsb">
            {todaysEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  borderRadius: 5,
                  background: 'var(--card)',
                  border: `1px solid color-mix(in srgb, ${ev.color || PAL.sky} 35%, transparent)`,
                  fontSize: 10,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: ev.color || PAL.sky }} />
                <span style={{ color: 'var(--tx)' }}>{ev.title}</span>
                <span style={{ color: 'var(--tx3)', fontSize: 9 }}>{hhmm(hoursOf(ev.starts_at))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Tasks Sliding Carousel */}
      <UpcomingTasksCarousel
        tasks={tasks}
        todayISO={today}
        style={{ width: '100%', minHeight: 165, marginTop: 10 }}
      />

      {/* Companion (level & mascot) on mobile home */}
      <div style={{ marginTop: 10 }}>
        <BuddyCompanion
          streak={bestStreak}
          xp={tasks.filter((t) => t.done).length * 20 + ticks.length * 10}
          onStartFocus={() => setFocusOpen(true)}
        />
      </div>

      {/* Tasks List (No Titles, Auto adjust to fit 4 with Show More) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {displayedTasks.map((t) => (
          <div key={t.id} className={leaving.has(t.id) ? 'leaving' : ''} style={{ borderRadius: 14, overflow: 'hidden' }}>
            <SwipeableRow
              onSwipeRight={() => complete(t)}
              onSwipeLeft={() => TA.removeWithUndo(t)}
              rightActionIcon="check"
              rightActionColor="var(--pal-mint)"
              leftActionIcon="trash"
              leftActionColor="var(--pal-coral)"
            >
              <div
                className="lensrow"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 13px',
                  background: 'var(--card)',
                  boxShadow: 'var(--sh)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                }}
              >
                <button
                  onClick={() => router.push('/tasks/')}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--tx)',
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <span
                        key={v}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          background: v <= (t.stars || 0) ? 'var(--accTx)' : 'var(--line2)',
                        }}
                      />
                    ))}
                  </div>
                </button>
                <button
                  onClick={() => complete(t)}
                  title="Complete"
                  className="k-squish"
                  style={{
                    width: 24,
                    height: 24,
                    flex: 'none',
                    borderRadius: '50%',
                    border: '1.6px solid var(--line2)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    background: 'transparent',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent' }} />
                </button>
              </div>
            </SwipeableRow>
          </div>
        ))}

        {open.length > 4 && (
          <button
            type="button"
            onClick={() => setTasksExpanded(!tasksExpanded)}
            className="hov k-squish"
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              background: 'var(--card2)',
              border: '1px solid var(--line2)',
              color: 'var(--tx2)',
              fontSize: 11.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <span>{tasksExpanded ? 'Show Less' : `Show More (${open.length - 4})`}</span>
            {tasksExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}

        {open.length === 0 && <Empty>Nothing on your plate.</Empty>}
      </div>

      {/* Note Journal Shortcut in Home Phone View using MorphingPopover & MorphingDialog */}
      <div style={{ marginTop: 12 }}>
        <PhoneJournalShortcut
          scratch={scratch}
          onSave={(text, title, photo_url) => {
            SA.add.mutate({
              id: crypto.randomUUID(),
              title: title || undefined,
              text,
              photo_url,
              tag: 'Journal',
              color: TAG_COLOR.Journal,
            });
            toast('Note saved to Journal ✨');
          }}
          onDelete={(id) => {
            const item = scratch.find((s) => s.id === id);
            if (item) {
              SA.removeWithUndo(item);
              toast('Journal entry removed');
            }
          }}
        />
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
  return a.slice(0, 10) === b.slice(0, 10);
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

  return (
    <>
      {hrs > 0 && <span>{hrs}h </span>}
      <span>{String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m </span>
      <span style={{ color }}>{String(total % 60).padStart(2, '0')}s</span>
    </>
  );
}
