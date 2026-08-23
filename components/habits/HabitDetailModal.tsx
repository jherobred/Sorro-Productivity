'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import {
  useHabitLogs,
  logHabitEntry,
  streak,
  maxStreak,
  ymd,
  type Habit,
  type Tick,
  HABIT_MILESTONES,
  type HabitLog,
} from '@/lib/habits';

const MOODS: { id: HabitLog['mood']; label: string; emoji: string }[] = [
  { id: 'fire', label: 'On Fire!', emoji: '🔥' },
  { id: 'happy', label: 'Great', emoji: '😊' },
  { id: 'neutral', label: 'Okay', emoji: '😐' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'skull', label: 'Struggled', emoji: '💀' },
];

export function HabitDetailModal({
  habit,
  ticks = [],
  onClose,
  onEdit,
  onDelete,
  onToggleToday,
}: {
  habit: Habit;
  ticks: Tick[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleToday: (note?: string, mood?: HabitLog['mood']) => void;
}) {
  useOverlayBack(true, onClose);

  const logs = useHabitLogs(habit.id);
  const today = ymd(new Date());
  const isDoneToday = ticks.some((t) => t.habit_id === habit.id && t.on_date === today);
  const todayLog = logs.find((l) => l.on_date === today);

  const [note, setNote] = useState(todayLog?.note ?? '');
  const [mood, setMood] = useState<HabitLog['mood']>(todayLog?.mood ?? 'fire');

  const curStreak = streak(ticks, habit.id);
  const longestStreak = maxStreak(ticks, habit.id);
  const habitTicks = ticks.filter((t) => t.habit_id === habit.id);
  const totalCount = habitTicks.length;
  const completionRate = Math.min(100, Math.round((totalCount / 30) * 100));

  const unlockedMilestones = HABIT_MILESTONES.filter((m) => longestStreak >= m.days);

  const handleSaveNote = () => {
    logHabitEntry({
      habit_id: habit.id,
      on_date: today,
      value: habit.target ?? 1,
      note: note.trim(),
      mood,
      completed_at: new Date().toISOString(),
    });
    toast('Logged note and feeling for today! 📝');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          width: 580,
          maxWidth: '100%',
          maxHeight: '88dvh',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 22,
          padding: 22,
          boxShadow: 'var(--shl)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: `color-mix(in srgb, ${habit.color} 22%, transparent)`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={(habit.icon as IconName) || 'check'} size={22} color={habit.color} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                  {habit.name}
                </h2>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: `color-mix(in srgb, ${habit.color} 16%, transparent)`,
                    color: habit.color,
                    textTransform: 'capitalize',
                  }}
                >
                  {habit.category || 'Habit'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
                {habit.cue || 'Build consistency day by day'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* 4 Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
          <div style={{ background: 'var(--card2)', padding: '12px 10px', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--pal-amber)', fontVariantNumeric: 'tabular-nums' }}>
              🔥 {curStreak}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>CURRENT STREAK</div>
          </div>
          <div style={{ background: 'var(--card2)', padding: '12px 10px', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: habit.color, fontVariantNumeric: 'tabular-nums' }}>
              ⚡ {longestStreak}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>BEST STREAK</div>
          </div>
          <div style={{ background: 'var(--card2)', padding: '12px 10px', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--accTx)', fontVariantNumeric: 'tabular-nums' }}>
              {totalCount}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>TOTAL TICKS</div>
          </div>
          <div style={{ background: 'var(--card2)', padding: '12px 10px', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#52C41A', fontVariantNumeric: 'tabular-nums' }}>
              {completionRate}%
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>30-DAY RATE</div>
          </div>
        </div>

        {/* Today's Log / Reflection Card */}
        <div style={{ background: 'var(--card2)', padding: 14, borderRadius: 16, border: '1px solid var(--line)', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx)' }}>
              Today’s Check-in & Feeling ({new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })})
            </div>
            <button
              onClick={() => onToggleToday(note, mood)}
              className="k-squish"
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                background: isDoneToday ? '#52C41A' : 'var(--acc)',
                color: isDoneToday ? '#fff' : 'var(--ink)',
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isDoneToday ? 'Completed ✓' : 'Mark as Done'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {MOODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMood(m.id)}
                className="k-squish"
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: 10,
                  fontSize: 12,
                  border: `1px solid ${mood === m.id ? 'var(--acc)' : 'var(--line2)'}`,
                  background: mood === m.id ? 'color-mix(in srgb, var(--acc) 18%, transparent)' : 'var(--card)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div>{m.emoji}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: mood === m.id ? 'var(--accTx)' : 'var(--tx3)', marginTop: 2 }}>
                  {m.label}
                </div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a quick note / win about today's session..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--line2)',
                background: 'var(--card)',
                fontSize: 12,
                color: 'var(--tx)',
              }}
            />
            <button
              onClick={handleSaveNote}
              className="hov k-squish"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: 'var(--card)',
                border: '1px solid var(--line2)',
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--tx)',
                cursor: 'pointer',
              }}
            >
              Save Note
            </button>
          </div>
        </div>

        {/* Milestone Badges for this habit */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Unlocked Milestone Badges ({unlockedMilestones.length}/{HABIT_MILESTONES.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
            {HABIT_MILESTONES.map((m) => {
              const unlocked = longestStreak >= m.days;
              return (
                <div
                  key={m.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: unlocked ? `color-mix(in srgb, ${m.color} 14%, var(--card2))` : 'var(--card2)',
                    border: `1px solid ${unlocked ? m.color : 'var(--line)'}`,
                    opacity: unlocked ? 1 : 0.45,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 14 }}>{unlocked ? '🏆' : '🔒'}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: unlocked ? 'var(--tx)' : 'var(--tx3)', marginTop: 2 }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 9, color: m.color, fontWeight: 700 }}>{m.days} days</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent logs history */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Recent Check-in Logs
          </div>
          {logs.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--tx3)', padding: 12, textAlign: 'center', background: 'var(--card2)', borderRadius: 12 }}>
              No written notes yet. Add your feelings and notes above!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logs.slice(0, 5).map((l) => (
                <div
                  key={l.on_date}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'var(--card2)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{MOODS.find((m) => m.id === l.mood)?.emoji || '✓'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--tx)' }}>{l.note || 'Completed session'}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                    {l.on_date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <button
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="hov k-squish"
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 12,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: 'var(--tx)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Icon name="edit" size={14} color="var(--tx2)" />
            Edit Settings
          </button>
          <button
            onClick={() => {
              onClose();
              onDelete();
            }}
            className="hov k-squish"
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
              color: '#FF4D4F',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="trash" size={14} color="#FF4D4F" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
