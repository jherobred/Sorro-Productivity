'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import dynamic from 'next/dynamic';
import { Icon, type IconName } from '@/components/Icon';
import { RowsSkeleton } from '@/components/Skeleton';
import { SectionLabel, Meter, StatPill, CountUp } from '@/components/Vitals';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { SECHUE } from '@/lib/pal';
import { toast } from '@/lib/toast';
import {
  useHabits,
  useTicks,
  useHabitActions,
  useStreakFreezes,
  ymd,
  calculateHabitGamification,
  type Habit,
  type HabitCategory,
  type TimeOfDay,
  HABIT_CATEGORIES,
} from '@/lib/habits';
import { Buddy } from '@/components/Buddy';
/* Only on screen while you are making or editing a habit. */
const HabitCreatorModal = dynamic(() => import('@/components/habits/HabitCreatorModal').then((m) => m.HabitCreatorModal), { ssr: false });
const HabitTimerModal = dynamic(() => import('@/components/habits/HabitTimerModal').then((m) => m.HabitTimerModal), { ssr: false });
const HabitDetailModal = dynamic(() => import('@/components/habits/HabitDetailModal').then((m) => m.HabitDetailModal), { ssr: false });
const HabitsAnalytics = dynamic(() => import('@/components/habits/HabitsAnalytics').then((m) => m.HabitsAnalytics), { ssr: false });

import { HabitStats } from '@/components/habits/HabitStats';
import { HabitMatrix, windowDays, type MatrixSpan } from '@/components/habits/HabitMatrix';
import { HabitAgenda } from '@/components/habits/HabitAgenda';
import { HabitInsights } from '@/components/habits/HabitInsights';
import { YearHeatmap } from '@/components/habits/YearHeatmap';

type ViewMode = 'week' | 'month' | 'year' | 'analytics';

const VIEWS: { id: ViewMode; label: string; icon: IconName; hint: string }[] = [
  { id: 'week', label: 'This week', icon: 'week', hint: 'Seven days, big squares' },
  { id: 'month', label: '30 days', icon: 'month', hint: 'A month per row' },
  { id: 'year', label: 'Full year', icon: 'grid', hint: '365 days as a heatmap' },
  { id: 'analytics', label: 'Breakdown', icon: 'spark', hint: 'Trophies and distribution' },
];

const SPAN: Record<Exclude<ViewMode, 'analytics'>, MatrixSpan> = { week: 7, month: 30, year: 365 };

/**
 * One window for every view. The old page swapped the tick query between 30
 * and 365 days when you opened Year Grid, which changed the react-query key —
 * so an optimistic tick landed in whichever cache the previous view had built.
 * A year of one person's ticks is a few hundred rows; fetching it once removes
 * the whole class of mismatch and gives streaks their real history.
 */
const TICK_WINDOW = 365;

export default function HabitsPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const hue = SECHUE.habits;

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory | 'all'>('all');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [timingHabit, setTimingHabit] = useState<Habit | null>(null);
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; habit: Habit } | null>(null);

  const { data: habits = [], isPending } = useHabits();
  const { data: ticks = [] } = useTicks(TICK_WINDOW);
  const A = useHabitActions(TICK_WINDOW);
  const { freezes } = useStreakFreezes();

  const today = ymd(new Date());
  const gamification = useMemo(() => calculateHabitGamification(habits, ticks), [habits, ticks]);

  const span: MatrixSpan = viewMode === 'analytics' ? 7 : SPAN[viewMode];
  const days = useMemo(() => windowDays(span), [span]);

  const filteredHabits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return habits.filter((h) => {
      if (selectedCategory !== 'all' && (h.category || 'health') !== selectedCategory) return false;
      if (selectedTimeOfDay !== 'all' && (h.time_of_day || 'anytime') !== selectedTimeOfDay) return false;
      if (q && !h.name.toLowerCase().includes(q) && !h.cue?.toLowerCase().includes(q)) return false;

      const isDone = ticks.some((t) => t.habit_id === h.id && t.on_date === today);
      if (statusFilter === 'pending' && isDone) return false;
      if (statusFilter === 'done' && !isDone) return false;
      return true;
    });
  }, [habits, selectedCategory, selectedTimeOfDay, search, statusFilter, ticks, today]);

  const ownHabits = filteredHabits.filter((h) => !h.challenge_id);
  const challengeHabits = filteredHabits.filter((h) => h.challenge_id);
  const filtersActive = search.trim() !== '' || selectedCategory !== 'all'
    || selectedTimeOfDay !== 'all' || statusFilter !== 'all';

  /** Toggle a day on or off. The grid squares and Mark Done both mean this. */
  const tick = (habitId: string, date: string, value?: number) =>
    A.tick.mutate({ habitId, date, value });

  /** Write an exact value — counters and timers, which must not toggle off. */
  const setValue = (habitId: string, date: string, value: number) =>
    A.tick.mutate({ habitId, date, value, mode: 'set' });

  const duplicate = (h: Habit) => {
    A.create.mutate({
      ...h,
      id: crypto.randomUUID(),
      name: `${h.name} copy`,
      challenge_id: null,
    });
    toast(`Duplicated “${h.name}”`);
  };

  const menuItems = (h: Habit): CtxItem[] => {
    const doneToday = ticks.some((t) => t.habit_id === h.id && t.on_date === today);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = ymd(y);
    const doneYesterday = ticks.some((t) => t.habit_id === h.id && t.on_date === yesterday);

    return [
      {
        label: doneToday ? 'Undo today' : 'Mark done today',
        icon: doneToday ? 'undo' : 'check',
        run: () => tick(h.id, today, h.target ?? 1),
      },
      {
        label: doneYesterday ? 'Undo yesterday' : 'Backfill yesterday',
        icon: 'cal',
        run: () => tick(h.id, yesterday, h.target ?? 1),
      },
      ...(h.kind === 'dur'
        ? [{ label: 'Start focus timer', icon: 'clock' as IconName, run: () => setTimingHabit(h) }]
        : []),
      { label: 'Insights & notes', icon: 'spark', run: () => setDetailHabit(h) },
      { label: 'Edit habit', icon: 'edit', run: () => setEditingHabit(h) },
      {
        label: 'Duplicate',
        icon: 'copy',
        run: () => duplicate(h),
        disabled: !!h.challenge_id,
        hint: 'Challenge habits are mirrored, not owned',
      },
      {
        label: 'Archive habit',
        icon: 'archive',
        danger: true,
        run: () => A.removeWithUndo(h),
        disabled: !!h.challenge_id,
        hint: 'Leave the challenge to remove this',
      },
    ];
  };

  return (
    <div style={{
      padding: phone ? '14px 14px 30px' : 'clamp(18px, 2.2vw, 30px) clamp(20px, 2.6vw, 40px) 48px',
      maxWidth: 1720,
      marginInline: 'auto',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <Hero
        phone={phone}
        hue={hue}
        gamification={gamification}
        freezes={freezes}
        animate={prefs.motion}
        onNew={() => setCreating(true)}
        onCompleteAll={() => A.completeAllToday(habits)}
        onReset={() => A.resetToday(habits)}
      />

      {/* Today, before anything asks you to filter it */}
      {habits.length > 0 && viewMode !== 'analytics' && (
        <section style={{ marginTop: 16 }}>
          <SectionLabel icon="agenda" hue={hue} title="On deck today"
            note={`${gamification.todayCompleted} of ${gamification.activeCount} done`} />
          <HabitAgenda
            habits={habits}
            ticks={ticks}
            today={today}
            phone={phone}
            onTick={tick}
            onOpenTimer={setTimingHabit}
            onMenu={(h, x, y) => setMenu({ habit: h, x, y })}
          />
        </section>
      )}

      {/* What the numbers noticed */}
      {habits.length > 0 && viewMode !== 'analytics' && (
        <section style={{ marginTop: 18 }}>
          <SectionLabel icon="spark" hue={hue} title="Worth knowing" note="From the last 30 days" />
          <HabitInsights habits={habits} ticks={ticks} today={today} phone={phone} onTick={tick} />
        </section>
      )}

      {/* View switcher + filters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        marginTop: 22, marginBottom: 12,
      }}>
        <div className="navsb" data-tour="habits-view-modes" style={{
          display: 'flex', gap: 3, background: 'var(--card)', padding: 3, borderRadius: 13,
          border: '1px solid var(--line)', overflowX: 'auto', maxWidth: '100%',
        }}>
          {VIEWS.map((v) => {
            const on = viewMode === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                title={v.hint}
                className="k-squish"
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 13px', borderRadius: 10, border: 'none', background: 'transparent',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', flex: 'none',
                  color: on ? 'var(--tx)' : 'var(--tx3)',
                }}
              >
                {on && (
                  <motion.span
                    layoutId="habit-view-pill"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 10, zIndex: 0,
                      background: 'var(--card2)',
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 26%, transparent)`,
                    }}
                  />
                )}
                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={v.icon} size={13} color={on ? hue : 'var(--tx3)'} />
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'relative', minWidth: phone ? '100%' : 240, flex: phone ? '1 1 100%' : '0 1 320px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or cue"
            style={{
              width: '100%', padding: '9px 12px 9px 34px', borderRadius: 11,
              border: '1px solid var(--line2)', background: 'var(--card)',
              fontSize: 12.5, color: 'var(--tx)', boxSizing: 'border-box',
            }}
          />
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
            <Icon name="search" size={14} color="var(--tx3)" />
          </span>
        </div>

        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="hov k-squish"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 11,
            border: `1px solid ${filtersActive ? `color-mix(in srgb, ${hue} 40%, transparent)` : 'var(--line2)'}`,
            background: filtersActive ? `color-mix(in srgb, ${hue} 12%, transparent)` : 'var(--card)',
            color: filtersActive ? hue : 'var(--tx2)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Icon name="filter" size={13} color={filtersActive ? hue : 'var(--tx3)'} />
          Filters
          {filtersActive && <span style={{
            width: 6, height: 6, borderRadius: '50%', background: hue,
          }} />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={prefs.motion ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            style={{ overflow: 'hidden', marginBottom: 14 }}
          >
            <div style={{
              background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11,
            }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Segmented
                  label="Status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { id: 'all', label: 'Everything' },
                    { id: 'pending', label: 'Still open' },
                    { id: 'done', label: 'Done today' },
                  ]}
                />
                <Segmented
                  label="Part of day"
                  value={selectedTimeOfDay}
                  onChange={setSelectedTimeOfDay}
                  options={[
                    { id: 'all', label: 'Any time' },
                    { id: 'morning', label: 'Morning' },
                    { id: 'afternoon', label: 'Afternoon' },
                    { id: 'evening', label: 'Evening' },
                  ]}
                />
                {filtersActive && (
                  <button
                    onClick={() => {
                      setSearch(''); setSelectedCategory('all');
                      setSelectedTimeOfDay('all'); setStatusFilter('all');
                    }}
                    className="hov k-squish"
                    style={{
                      alignSelf: 'flex-end', padding: '6px 11px', borderRadius: 9,
                      border: '1px solid var(--line2)', background: 'var(--card2)',
                      fontSize: 12, fontWeight: 700, color: 'var(--tx3)', cursor: 'pointer',
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="navsb" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                <CategoryChip
                  on={selectedCategory === 'all'}
                  color={hue}
                  label={`All categories (${habits.length})`}
                  onClick={() => setSelectedCategory('all')}
                />
                {HABIT_CATEGORIES.map((c) => {
                  const count = habits.filter((h) => (h.category || 'health') === c.id).length;
                  if (count === 0) return null;
                  return (
                    <CategoryChip
                      key={c.id}
                      on={selectedCategory === c.id}
                      color={c.color}
                      dot
                      label={`${c.label} (${count})`}
                      onClick={() => setSelectedCategory(c.id)}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      {viewMode === 'analytics' ? (
        <HabitsAnalytics habits={habits} ticks={ticks} />
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: phone ? 'column' : 'row',
          alignItems: 'flex-start',
          gap: phone ? 16 : 18,
        }}>
          <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {viewMode === 'year' && habits.length > 0 && (
              <YearHeatmap habits={habits} ticks={ticks} days={days} today={today} phone={phone} />
            )}

            {isPending && <RowsSkeleton rows={5} label="Loading your habits" lead="square" />}

            {!isPending && filteredHabits.length === 0 && (
              <EmptyState
                hue={hue}
                filtered={filtersActive}
                onNew={() => setCreating(true)}
                onClear={() => {
                  setSearch(''); setSelectedCategory('all');
                  setSelectedTimeOfDay('all'); setStatusFilter('all');
                }}
              />
            )}

            {ownHabits.length > 0 && (
              <section>
                <SectionLabel icon="habit" hue={hue} title="Personal routines"
                  note={`${ownHabits.length} habit${ownHabits.length === 1 ? '' : 's'}`} />
                <div data-tour="habits-grid-cells">
                <HabitMatrix
                  habits={ownHabits}
                  ticks={ticks}
                  days={days}
                  span={span}
                  today={today}
                  phone={phone}
                  onTick={tick}
                  onSetValue={setValue}
                  onOpenDetail={setDetailHabit}
                  onOpenTimer={setTimingHabit}
                  onMenu={(h, x, y) => setMenu({ habit: h, x, y })}
                />
                </div>
              </section>
            )}

            {challengeHabits.length > 0 && (
              <section>
                <SectionLabel icon="trophy" hue="#FFC24B" title="From active challenges"
                  note={`${challengeHabits.length} mirrored`} />
                <HabitMatrix
                  habits={challengeHabits}
                  ticks={ticks}
                  days={days}
                  span={span}
                  today={today}
                  phone={phone}
                  onTick={tick}
                  onSetValue={setValue}
                  onOpenDetail={setDetailHabit}
                  onOpenTimer={setTimingHabit}
                  onMenu={(h, x, y) => setMenu({ habit: h, x, y })}
                />
              </section>
            )}
          </div>

          {/* The column stays put while the rows scroll past it: the run you are
              on is context for what you are reading, not a scroll target. */}
          <aside
            className={phone ? undefined : 'navsb'}
            style={{
              position: phone ? 'static' : 'sticky',
              top: 0,
              alignSelf: 'flex-start',
              width: phone ? '100%' : 300,
              flex: 'none',
              maxHeight: phone ? undefined : 'calc(100dvh - 96px)',
              overflowY: phone ? 'visible' : 'auto',
              minHeight: 0,
            }}
          >
            <HabitStats habits={habits} ticks={ticks} phone={phone} />
          </aside>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          kind="habit"
          label={menu.habit.name}
          accent={prefs.accent}
          dark={prefs.theme === 'dark'}
          items={menuItems(menu.habit)}
          onClose={() => setMenu(null)}
        />
      )}

      {creating && (
        <HabitCreatorModal
          onClose={() => setCreating(false)}
          onSave={(h) => { A.create.mutate(h); setCreating(false); }}
        />
      )}

      {editingHabit && (
        <HabitCreatorModal
          initial={editingHabit}
          onClose={() => setEditingHabit(null)}
          onSave={(h) => {
            const { id, ...patch } = h;
            A.edit.mutate({ id, patch });
            setEditingHabit(null);
          }}
        />
      )}

      {timingHabit && (
        <HabitTimerModal
          habit={timingHabit}
          onClose={() => setTimingHabit(null)}
          onComplete={(loggedMins) => {
            // `set`, not a toggle: finishing a timer on an already-ticked habit
            // used to delete the tick it was trying to add minutes to.
            setValue(timingHabit.id, today, loggedMins);
          }}
        />
      )}

      {detailHabit && (
        <HabitDetailModal
          habit={detailHabit}
          ticks={ticks}
          onClose={() => setDetailHabit(null)}
          onEdit={() => { const h = detailHabit; setDetailHabit(null); setEditingHabit(h); }}
          onDelete={() => { A.removeWithUndo(detailHabit); setDetailHabit(null); }}
          onToggleToday={(note, mood) => {
            A.tick.mutate({ habitId: detailHabit.id, date: today, note, mood });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero({
  phone, hue, gamification, freezes, animate, onNew, onCompleteAll, onReset,
}: {
  phone: boolean;
  hue: string;
  gamification: ReturnType<typeof calculateHabitGamification>;
  freezes: number;
  animate: boolean;
  onNew: () => void;
  onCompleteAll: () => void;
  onReset: () => void;
}) {
  const g = gamification;
  const pct = g.activeCount > 0 ? g.todayPercent : 0;

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 20,
        boxShadow: 'var(--sh)',
        padding: phone ? '15px 15px 17px' : '18px 22px 20px',
      }}
    >
      {/* A wash that leans harder the more of today is done. */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: 0.35 + (pct / 100) * 0.65 }}
        transition={{ duration: 0.8 }}
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(90% 140% at 8% 0%, color-mix(in srgb, ${hue} 16%, transparent) 0%, transparent 58%)`,
        }}
      />

      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <Buddy
            daysSince={g.todayCompleted > 0 ? 0 : 1}
            size={phone ? 46 : 54}
            racing={g.todayCompleted > 0}
            note={
              g.isPerfectToday
                ? 'Every habit done today.'
                : g.todayCompleted > 0
                  ? `${g.activeCount - g.todayCompleted} left before midnight.`
                  : 'Nothing ticked yet today.'
            }
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{
                fontSize: phone ? 21 : 25, fontWeight: 800, margin: 0,
                letterSpacing: '-.03em', color: 'var(--tx)',
              }}>
                Habits
              </h1>
              <span style={{
                fontSize: 12, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                background: `color-mix(in srgb, ${hue} 16%, transparent)`,
                color: hue, letterSpacing: '.02em',
              }}>
                Level {g.level} · {g.multiplier}× streak bonus
              </span>
            </div>
            <div className="metaline" style={{ marginTop: 3, fontSize: 12 }}>
              <CountUp value={g.todayCompleted} animate={animate} /> of {g.activeCount} done today
              {g.activeCount > 0 && ` · ${g.todayPercent}%`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatPill icon="flame" hue="#FFC24B" value={`${g.topStreak}d`} label="best live run" />
          <StatPill icon="lock" hue="#38D6F2" value={String(freezes)} label="freezes" />

          <button onClick={onReset} className="hov k-squish" title="Clear every tick from today"
            style={{
              padding: '8px 12px', borderRadius: 11, border: '1px solid var(--line2)',
              background: 'var(--card2)', fontSize: 12, fontWeight: 700, color: 'var(--tx3)',
              cursor: 'pointer',
            }}>
            Reset today
          </button>

          <motion.button
            onClick={onCompleteAll}
            whileTap={animate ? { scale: 0.95 } : undefined}
            whileHover={animate ? { scale: 1.03 } : undefined}
            title="Tick every habit still open today"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 11,
              border: '1px solid color-mix(in srgb, #34D9A0 40%, transparent)',
              background: 'color-mix(in srgb, #34D9A0 13%, transparent)',
              color: '#34D9A0', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}
          >
            <Icon name="check" size={13} color="#34D9A0" />
            Finish all
          </motion.button>

          <motion.button
            onClick={onNew}
            whileTap={animate ? { scale: 0.95 } : undefined}
            whileHover={animate ? { scale: 1.04 } : undefined}
            className="acc"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 11,
              background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800,
              border: 'none', cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={14} color="var(--ink)" />
            New habit
          </motion.button>
        </div>
      </div>

      {/* Today first, XP second. The bar you can still act on goes on top. */}
      <div style={{ position: 'relative', marginTop: 15, display: 'grid', gap: 10 }}>
        <Meter
          label="Today"
          right={`${g.todayCompleted}/${g.activeCount}`}
          pct={pct}
          hue={hue}
          animate={animate}
          thick
        />
        <Meter
          label={`Level ${g.level}`}
          right={`${g.currentLevelXp} / 250 XP to level ${g.level + 1}`}
          pct={g.levelProgress}
          hue="var(--acc)"
          animate={animate}
        />
      </div>
    </motion.div>
  );
}

function Segmented<T extends string>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span className="kicker">{label}</span>
      <div style={{ display: 'flex', gap: 3, background: 'var(--card2)', padding: 3, borderRadius: 10 }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className="k-squish"
              style={{
                padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: on ? 'var(--card)' : 'transparent',
                color: on ? 'var(--tx)' : 'var(--tx3)',
                boxShadow: on ? 'var(--sh)' : 'none',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({
  on, color, label, dot, onClick,
}: { on: boolean; color: string; label: string; dot?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="k-squish"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flex: 'none', cursor: 'pointer',
        padding: '5px 11px', borderRadius: 9, fontSize: 12, fontWeight: 700,
        border: `1px solid ${on ? color : 'var(--line2)'}`,
        background: on ? `color-mix(in srgb, ${color} 15%, transparent)` : 'transparent',
        color: on ? 'var(--tx)' : 'var(--tx3)',
        whiteSpace: 'nowrap',
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
      {label}
    </button>
  );
}

function EmptyState({
  hue, filtered, onNew, onClear,
}: { hue: string; filtered: boolean; onNew: () => void; onClear: () => void }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px dashed var(--line2)', borderRadius: 18,
      padding: '38px 22px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <span style={{
        width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center',
        background: `color-mix(in srgb, ${hue} 14%, transparent)`,
      }}>
        <Icon name={filtered ? 'filter' : 'habit'} size={19} color={hue} />
      </span>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--tx)' }}>
        {filtered ? 'Nothing matches those filters' : 'No habits yet'}
      </div>
      <div className="metaline" style={{ maxWidth: 380, lineHeight: 1.45 }}>
        {filtered
          ? 'Loosen the filters, or clear them to see everything again.'
          : 'A habit is a name, a cue, and a square you fill in. Start with one you already almost do.'}
      </div>
      <button
        onClick={filtered ? onClear : onNew}
        className="acc k-squish"
        style={{
          marginTop: 3, padding: '9px 16px', borderRadius: 11, border: 'none', cursor: 'pointer',
          background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800,
        }}
      >
        {filtered ? 'Clear filters' : 'Create your first habit'}
      </button>
    </div>
  );
}
