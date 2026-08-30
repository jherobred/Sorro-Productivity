'use client';

import { Icon, type IconName } from '@/components/Icon';
import {
  calculateHabitGamification,
  HABIT_MILESTONES,
  HABIT_CATEGORIES,
  streak,
  maxStreak,
  type Habit,
  type Tick,
} from '@/lib/habits';
import { AsciiBar } from '../AsciiBar';

const DAYS_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function HabitsAnalytics({
  habits = [],
  ticks = [],
}: {
  habits: Habit[];
  ticks: Tick[];
}) {
  const g = calculateHabitGamification(habits, ticks);

  // Group completions by day of week
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  ticks.forEach((t) => {
    const d = new Date(`${t.on_date}T00:00:00`).getDay();
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  });

  let bestDayIdx = 0;
  let maxDayCount = 0;
  dayCounts.forEach((c, i) => {
    if (c > maxDayCount) {
      maxDayCount = c;
      bestDayIdx = i;
    }
  });
  const maxDayPossible = Math.max(1, Math.max(...dayCounts));

  // Category completion stats
  const categoryCounts: Record<string, number> = {};
  habits.forEach((h) => {
    const cat = h.category || 'health';
    const habitTicks = ticks.filter((t) => t.habit_id === h.id).length;
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + habitTicks;
  });

  const maxCatCount = Math.max(1, ...Object.values(categoryCounts));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 Big Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: 'var(--card)', padding: '16px 18px', borderRadius: 16, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>DISCIPLINE LEVEL</span>
            <span style={{ fontSize: 12 }}>⭐</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--accTx)' }}>
            Level {g.level}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
            {g.currentLevelXp}/250 XP to next tier ({g.multiplier}x Multiplier)
          </div>
        </div>

        <div style={{ background: 'var(--card)', padding: '16px 18px', borderRadius: 16, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>ALL-TIME BEST STREAK</span>
            <span style={{ fontSize: 12 }}>⚡</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--pal-amber)', fontVariantNumeric: 'tabular-nums' }}>
            {g.bestAllTimeStreak} Days
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
            Current active: {g.topStreak} days
          </div>
        </div>

        <div style={{ background: 'var(--card)', padding: '16px 18px', borderRadius: 16, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>PERFECT DAYS</span>
            <span style={{ fontSize: 12 }}>👑</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#52C41A', fontVariantNumeric: 'tabular-nums' }}>
            {g.perfectDays} Days
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
            100% of daily habits finished
          </div>
        </div>

        <div style={{ background: 'var(--card)', padding: '16px 18px', borderRadius: 16, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>LIFETIME TICKS</span>
            <span style={{ fontSize: 12 }}>🎯</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#38D6F2', fontVariantNumeric: 'tabular-nums' }}>
            {g.totalCompletions}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
            Across {habits.length} routines
          </div>
        </div>
      </div>

      {/* Unlocked Trophy Room */}
      <div style={{ background: 'var(--card)', padding: 18, borderRadius: 18, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="trophy" size={16} color="var(--accTx)" />
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--tx)' }}>
              Habit Master Trophies ({g.unlockedMilestones.length}/{HABIT_MILESTONES.length})
            </h3>
          </div>
          {g.nextMilestone && (
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              Next: <strong style={{ color: g.nextMilestone.color }}>{g.nextMilestone.title}</strong> at {g.nextMilestone.days} days
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {HABIT_MILESTONES.map((m) => {
            const unlocked = g.bestAllTimeStreak >= m.days;
            return (
              <div
                key={m.id}
                style={{
                  padding: '12px 10px',
                  borderRadius: 14,
                  background: unlocked ? `color-mix(in srgb, ${m.color} 14%, var(--card2))` : 'var(--card2)',
                  border: `1px solid ${unlocked ? m.color : 'var(--line)'}`,
                  opacity: unlocked ? 1 : 0.45,
                  textAlign: 'center',
                  transition: 'transform .15s ease',
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>{unlocked ? '🏆' : '🔒'}</div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: unlocked ? 'var(--tx)' : 'var(--tx3)' }}>
                  {m.title}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: m.color, marginTop: 2 }}>
                  {m.days} days streak
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--tx3)', marginTop: 4, lineHeight: 1.3 }}>
                  {m.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category breakdown & Weekly Consistency */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Weekly Consistency Bar Chart */}
        <div style={{ background: 'var(--card)', padding: 18, borderRadius: 18, border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>
            Day of Week Consistency
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 14 }}>
            Your strongest day is <strong style={{ color: 'var(--accTx)' }}>{DAYS_NAME[bestDayIdx]}</strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, gap: 8, paddingBottom: 4 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, i) => {
              const count = dayCounts[i];
              const heightPct = Math.max(8, Math.round((count / maxDayPossible) * 100));
              const isBest = i === bestDayIdx && count > 0;

              return (
                <div key={name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3)' }}>{count}</div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPct}%`,
                      borderRadius: 6,
                      background: isBest ? 'var(--acc)' : 'color-mix(in srgb, var(--acc) 30%, var(--card2))',
                      transition: 'height .4s ease',
                    }}
                  />
                  <div style={{ fontSize: 10, fontWeight: 700, color: isBest ? 'var(--accTx)' : 'var(--tx3)' }}>{name}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category breakdown */}
        <div style={{ background: 'var(--card)', padding: 18, borderRadius: 18, border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>
            Category Distribution
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 14 }}>
            Where your daily discipline is focused
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {HABIT_CATEGORIES.map((cat) => {
              const count = categoryCounts[cat.id] ?? 0;
              const pct = Math.max(4, Math.round((count / maxCatCount) * 100));

              return (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 80, fontSize: 11, fontWeight: 700, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.label.split(' ')[0]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AsciiBar value={pct} cells={22} hue={cat.color} showValue={false} label={cat.label} />
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', width: 28, textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
