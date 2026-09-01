'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Icon, type IconName } from '@/components/Icon';
import { RowsSkeleton } from '@/components/Skeleton';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import {
  useHabits,
  useTicks,
  useHabitActions,
  useStreakFreezes,
  lastDays,
  ymd,
  calculateHabitGamification,
  type Habit,
  type HabitCategory,
  type TimeOfDay,
  type HabitLog,
  HABIT_CATEGORIES,
} from '@/lib/habits';
import { Buddy } from '@/components/Buddy';
import { HabitCard } from '@/components/habits/HabitCard';
/* Only on screen while you are making or editing a habit. */
const HabitCreatorModal = dynamic(() => import('@/components/habits/HabitCreatorModal').then((m) => m.HabitCreatorModal), { ssr: false });
const HabitTimerModal = dynamic(() => import('@/components/habits/HabitTimerModal').then((m) => m.HabitTimerModal), { ssr: false });
const HabitDetailModal = dynamic(() => import('@/components/habits/HabitDetailModal').then((m) => m.HabitDetailModal), { ssr: false });
const HabitsAnalytics = dynamic(() => import('@/components/habits/HabitsAnalytics').then((m) => m.HabitsAnalytics), { ssr: false });
import { HabitStats } from '@/components/habits/HabitStats';
import { AsciiBar } from '@/components/AsciiBar';

type ViewMode = 'week' | 'day' | 'year' | 'analytics';

export default function HabitsPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory | 'all'>('all');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [search, setSearch] = useState('');

  // Modals state
  const [creating, setCreating] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [timingHabit, setTimingHabit] = useState<Habit | null>(null);
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);

  const daysCount = viewMode === 'year' ? 365 : 30;
  const { data: habits = [], isPending } = useHabits();
  const { data: ticks = [] } = useTicks(daysCount);
  const A = useHabitActions(daysCount);
  const { freezes } = useStreakFreezes();

  const week = useMemo(() => lastDays(7), []);
  const today = ymd(new Date());

  const gamification = useMemo(
    () => calculateHabitGamification(habits, ticks),
    [habits, ticks]
  );

  // Filtered habits
  const filteredHabits = useMemo(() => {
    return habits.filter((h) => {
      if (selectedCategory !== 'all' && (h.category || 'health') !== selectedCategory) {
        return false;
      }
      if (selectedTimeOfDay !== 'all' && (h.time_of_day || 'anytime') !== selectedTimeOfDay) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = h.name.toLowerCase().includes(q);
        const matchCue = h.cue?.toLowerCase().includes(q);
        if (!matchName && !matchCue) return false;
      }
      const isDone = ticks.some((t) => t.habit_id === h.id && t.on_date === today);
      if (statusFilter === 'pending' && isDone) return false;
      if (statusFilter === 'done' && !isDone) return false;

      return true;
    });
  }, [habits, selectedCategory, selectedTimeOfDay, search, statusFilter, ticks, today]);

  const ownHabits = filteredHabits.filter((h) => !h.challenge_id);
  const challengeHabits = filteredHabits.filter((h) => h.challenge_id);

  return (
    <div style={{
      padding: phone ? '14px 14px 28px' : '20px 24px 36px', maxWidth: 1480, marginInline: 'auto',
      display: 'flex', flexDirection: phone ? 'column' : 'row', gap: phone ? 16 : 20,
      alignItems: 'flex-start',
    }}>
      {/* The column stays put while the habits scroll past it, which is the
          point of putting it there: the run you are on is context for what you
          are looking at, not a thing to scroll back up for. */}
      <div className={phone ? 'navsb' : undefined} style={{
        position: phone ? 'static' : 'sticky', top: 0, alignSelf: 'flex-start',
        width: phone ? '100%' : undefined,
        display: 'flex', minHeight: 0,
        // On a phone the whole column ahead of the habits is a screen and a
        // half of scrolling before the first thing you came here to tick, so
        // it gets a ceiling and scrolls inside it — the same shape L4's day
        // strip takes at this width.
        maxHeight: phone ? 320 : 'calc(100dvh - 120px)',
        overflowY: phone ? 'auto' : 'visible',
      }}>
        <HabitStats habits={habits} ticks={ticks} phone={phone} />
      </div>

      {/* width:100% matters on a phone: the row becomes a column there, so
          `flex: 1` sizes the height and the width falls back to the content's,
          which ran 97px past the screen. */}
      <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
      {/* Hero Gamification & Buddy Banner */}
      <div
        style={{
          background: 'var(--card)',
          borderRadius: 20,
          padding: phone ? '16px' : '18px 22px',
          border: '1px solid var(--line)',
          boxShadow: 'var(--sh)',
          marginBottom: 18,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          {/* Left: Study Buddy & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Buddy
              daysSince={gamification.todayCompleted > 0 ? 0 : 1}
              size={54}
              racing={gamification.todayCompleted > 0}
              note={
                gamification.isPerfectToday
                  ? 'All habits done today! Legendary discipline 🔥'
                  : gamification.todayCompleted > 0
                    ? `${gamification.todayCompleted}/${gamification.activeCount} completed — keep momentum!`
                    : 'Ready to build atomic habits today?'
              }
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: phone ? 20 : 22, fontWeight: 900, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                  Daily Habits
                </h1>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'color-mix(in srgb, var(--acc) 18%, transparent)',
                    color: 'var(--accTx)',
                  }}
                >
                  Level {gamification.level} ({gamification.multiplier}x Multiplier)
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                {gamification.todayCompleted} of {gamification.activeCount} routines completed today ({gamification.todayPercent}%)
              </div>
            </div>
          </div>

          {/* Right: Gamification Badges & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 12,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--pal-amber)',
              }}
            >
              <span>🔥</span>
              <span>{gamification.topStreak} Day Streak</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 12,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                fontSize: 12,
                fontWeight: 800,
                color: '#38D6F2',
              }}
              title="Streak Freezes available to protect consistency"
            >
              <span>🛡️</span>
              <span>{freezes} Freezes</span>
            </div>

            <button
              onClick={() => setCreating(true)}
              className="acc k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 16px',
                borderRadius: 12,
                background: 'var(--acc)',
                color: 'var(--ink)',
                fontSize: 12.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon name="plus" size={15} color="var(--ink)" />
              New Habit
            </button>
          </div>
        </div>

        {/* Level XP Progress Bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', marginBottom: 4 }}>
            <span>Rank Progress: Level {gamification.level}</span>
            <span>{gamification.currentLevelXp} / 250 XP to Level {gamification.level + 1}</span>
          </div>
          {/* 40 mono cells is ~290px before the row's padding, which a 390px
              phone cannot hold. The bar has a fixed character count, so the
              count is what has to change. */}
          <AsciiBar value={gamification.levelProgress} cells={phone ? 22 : 40} hue="var(--accTx)" showValue={false}
            label={`Level ${gamification.level}, ${gamification.currentLevelXp} of 250 XP`} />
        </div>
      </div>

      {/* View Mode & Global Actions Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* View mode switcher */}
        <div data-tour="habits-view-modes" style={{ display: 'flex', gap: 4, background: 'var(--card)', padding: 3, borderRadius: 12, border: '1px solid var(--line)' }}>
          {(
            [
              { id: 'week', label: 'Week Grid', icon: 'week' },
              { id: 'day', label: 'Day Focus', icon: 'task' },
              { id: 'year', label: 'Year Grid', icon: 'grid' },
              { id: 'analytics', label: 'Analytics', icon: 'spark' },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className="k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                background: viewMode === v.id ? 'var(--card2)' : 'transparent',
                color: viewMode === v.id ? 'var(--tx)' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              <Icon name={v.icon as IconName} size={13} color={viewMode === v.id ? 'var(--accTx)' : 'var(--tx3)'} />
              {v.label}
            </button>
          ))}
        </div>

        {/* Batch Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => A.completeAllToday(habits)}
            className="hov k-squish"
            title="Complete all habits for today"
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              border: '1px solid var(--line2)',
              background: 'var(--card)',
              fontSize: 11.5,
              fontWeight: 700,
              color: '#52C41A',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="check" size={13} color="#52C41A" />
            Complete All Today
          </button>
          <button
            onClick={() => A.resetToday(habits)}
            className="hov k-squish"
            title="Reset today's progress"
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              border: '1px solid var(--line2)',
              background: 'var(--card)',
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--tx3)',
            }}
          >
            Reset Today
          </button>
        </div>
      </div>

      {viewMode === 'analytics' ? (
        <HabitsAnalytics habits={habits} ticks={ticks} />
      ) : (
        <>
          {/* Filters & Search Rail */}
          <div
            style={{
              background: 'var(--card)',
              padding: '12px 14px',
              borderRadius: 16,
              border: '1px solid var(--line)',
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Search */}
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search habits by name or trigger cue..."
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: 10,
                    border: '1px solid var(--line2)',
                    background: 'var(--card2)',
                    fontSize: 12.5,
                    color: 'var(--tx)',
                  }}
                />
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
                  <Icon name="spark" size={14} color="var(--tx3)" />
                </span>
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--card2)', padding: 3, borderRadius: 10 }}>
                {(['all', 'pending', 'done'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 700,
                      border: 'none',
                      background: statusFilter === s ? 'var(--card)' : 'transparent',
                      color: statusFilter === s ? 'var(--tx)' : 'var(--tx3)',
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                    }}
                  >
                    {s === 'all' ? 'All Habits' : s === 'pending' ? 'Pending' : 'Done Today'}
                  </button>
                ))}
              </div>

              {/* Time of Day Filter */}
              <div style={{ display: 'flex', gap: 4, background: 'var(--card2)', padding: 3, borderRadius: 10 }}>
                {(['all', 'morning', 'afternoon', 'evening'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTimeOfDay(t)}
                    style={{
                      padding: '5px 9px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 700,
                      border: 'none',
                      background: selectedTimeOfDay === t ? 'var(--card)' : 'transparent',
                      color: selectedTimeOfDay === t ? 'var(--tx)' : 'var(--tx3)',
                      textTransform: 'capitalize',
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'all' ? 'All Day' : t}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter Chips */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} className="navsb">
              <button
                onClick={() => setSelectedCategory('all')}
                className="k-squish"
                style={{
                  padding: '5px 11px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  border: `1px solid ${selectedCategory === 'all' ? 'var(--acc)' : 'var(--line2)'}`,
                  background: selectedCategory === 'all' ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                  color: selectedCategory === 'all' ? 'var(--accTx)' : 'var(--tx3)',
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                All Categories ({habits.length})
              </button>

              {HABIT_CATEGORIES.map((c) => {
                const count = habits.filter((h) => (h.category || 'health') === c.id).length;
                if (count === 0) return null;
                const on = selectedCategory === c.id;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategory(c.id)}
                    className="k-squish"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 11px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      border: `1px solid ${on ? c.color : 'var(--line2)'}`,
                      background: on ? `color-mix(in srgb, ${c.color} 16%, transparent)` : 'transparent',
                      color: on ? 'var(--tx)' : 'var(--tx3)',
                      cursor: 'pointer',
                      flex: 'none',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
                    {c.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Habits Grid / List */}
          {isPending && <RowsSkeleton rows={5} label="Loading your habits" lead="square" />}

          {!isPending && filteredHabits.length === 0 && (
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 16,
                padding: '36px 20px',
                textAlign: 'center',
                color: 'var(--tx3)',
                fontSize: 13,
                border: '1px solid var(--line)',
              }}
            >
              {search || selectedCategory !== 'all' || statusFilter !== 'all'
                ? 'No habits match your filters.'
                : 'No habits created yet. Tap "New Habit" to start building your streak!'}
            </div>
          )}

          {/* Your Habits Section */}
          {ownHabits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: 'var(--tx3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                <span>Personal Routines</span>
                <span style={{ opacity: 0.6 }}>({ownHabits.length})</span>
              </div>

              <div
                data-tour="habits-grid-cells"
                style={{
                  display: 'grid',
                  gridTemplateColumns: phone || viewMode === 'week' ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))',
                  gap: 10,
                }}
              >
                {ownHabits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    ticks={ticks}
                    week={week}
                    today={today}
                    phone={phone}
                    viewMode={viewMode === 'day' ? 'day' : 'week'}
                    onTick={(id, date, val) => A.tick.mutate({ habitId: id, date, value: val })}
                    onOpenTimer={() => setTimingHabit(h)}
                    onOpenDetail={() => setDetailHabit(h)}
                    onOpenEdit={() => setEditingHabit(h)}
                    onDelete={() => A.removeWithUndo(h)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Challenge Habits Section */}
          {challengeHabits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: 'var(--tx3)', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 10 }}>
                <span>From Active Challenges</span>
                <span style={{ opacity: 0.6 }}>({challengeHabits.length})</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: phone || viewMode === 'week' ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))',
                  gap: 10,
                }}
              >
                {challengeHabits.map((h) => (
                  <HabitCard
                    key={h.id}
                    habit={h}
                    ticks={ticks}
                    week={week}
                    today={today}
                    phone={phone}
                    viewMode={viewMode === 'day' ? 'day' : 'week'}
                    onTick={(id, date, val) => A.tick.mutate({ habitId: id, date, value: val })}
                    onOpenTimer={() => setTimingHabit(h)}
                    onOpenDetail={() => setDetailHabit(h)}
                    onOpenEdit={() => setEditingHabit(h)}
                    onDelete={() => A.removeWithUndo(h)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {creating && (
        <HabitCreatorModal
          onClose={() => setCreating(false)}
          onSave={(h) => {
            A.create.mutate(h);
            setCreating(false);
          }}
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
            A.tick.mutate({ habitId: timingHabit.id, date: today, value: loggedMins });
          }}
        />
      )}

      {detailHabit && (
        <HabitDetailModal
          habit={detailHabit}
          ticks={ticks}
          onClose={() => setDetailHabit(null)}
          onEdit={() => {
            const h = detailHabit;
            setDetailHabit(null);
            setEditingHabit(h);
          }}
          onDelete={() => {
            A.removeWithUndo(detailHabit);
            setDetailHabit(null);
          }}
          onToggleToday={(note, mood) => {
            A.tick.mutate({ habitId: detailHabit.id, date: today, note, mood });
          }}
        />
      )}
      </div>
    </div>
  );
}
