'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { Streak, bestStreakFrom } from '@/components/Streak';
import { playTick, playClick } from '@/lib/audio';
import {
  streak,
  maxStreak,
  ymd,
  type Habit,
  type Tick,
  type HabitLog,
} from '@/lib/habits';

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const CELL = 38;

export function HabitCard({
  habit,
  ticks = [],
  week = [],
  today,
  phone = false,
  viewMode = 'week',
  onTick,
  onOpenTimer,
  onOpenDetail,
  onOpenEdit,
  onDelete,
}: {
  habit: Habit;
  ticks: Tick[];
  week: Date[];
  today: string;
  phone?: boolean;
  viewMode?: 'week' | 'day';
  onTick: (habitId: string, date: string, value?: number) => void;
  onOpenTimer: () => void;
  onOpenDetail: () => void;
  onOpenEdit: () => void;
  onDelete: () => void;
}) {
  const s = streak(ticks, habit.id);
  const bestS = maxStreak(ticks, habit.id);
  const todayTick = ticks.find((t) => t.habit_id === habit.id && t.on_date === today);
  const isDoneToday = !!todayTick;
  const targetVal = habit.target ?? 1;
  const currentVal = todayTick ? Number(todayTick.value) || 1 : 0;
  const isTargetMet = currentVal >= targetVal;

  const handleStepCount = (delta: number) => {
    playClick();
    const nextVal = Math.max(0, currentVal + delta);
    if (nextVal === 0) {
      if (todayTick) onTick(habit.id, today);
    } else {
      onTick(habit.id, today, nextVal);
    }
  };

  const label = (t: Tick | undefined) => {
    if (!t) return '';
    if (habit.kind === 'bin') return '✓';
    if (habit.kind === 'dur') return `${Math.round(Number(t.value))}m`;
    return String(Number(t.value));
  };

  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 16,
        padding: '15px 16px',
        boxShadow: 'var(--sh)',
        border: isDoneToday
          ? `1px solid color-mix(in srgb, ${habit.color} 45%, var(--line))`
          : '1px solid var(--line)',
        transition: 'border-color .2s ease, box-shadow .2s ease',
      }}
    >
      {/* Top Meta Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div
          onClick={onOpenDetail}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: `color-mix(in srgb, ${habit.color} 20%, transparent)`,
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
            }}
          >
            <Icon name={(habit.icon as IconName) || 'check'} size={16} color={habit.color} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 14.5,
                  fontWeight: 800,
                  letterSpacing: '-.015em',
                  color: 'var(--tx)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {habit.name}
              </span>
              {habit.challenge_id && (
                <span
                  style={{
                    padding: '2px 7px',
                    borderRadius: 999,
                    fontSize: 9.5,
                    fontWeight: 800,
                    background: `color-mix(in srgb, ${habit.color} 18%, transparent)`,
                    color: habit.color,
                  }}
                >
                  Challenge
                </span>
              )}
            </div>

            {habit.cue ? (
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {habit.cue}
              </div>
            ) : (
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', textTransform: 'capitalize', marginTop: 1 }}>
                {habit.time_of_day || 'Anytime'} · {habit.frequency || 'Daily'}
              </div>
            )}
          </div>
        </div>

        {/* Right Stats & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          <Streak days={s} label="" size="sm" hue={habit.color} best={bestS} />

          {habit.kind === 'dur' && (
            <button
              onClick={onOpenTimer}
              className="hov k-squish"
              title="Launch Focus Timer"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--line2)',
                background: 'var(--card2)',
              }}
            >
              <Icon name="clock" size={13} color="var(--accTx)" />
            </button>
          )}

          <button
            onClick={onOpenDetail}
            className="hov k-squish"
            title="Habit Insights & Notes"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
            }}
          >
            <Icon name="spark" size={13} color="var(--tx2)" />
          </button>

          <button
            onClick={onOpenEdit}
            className="hov k-squish"
            title="Edit Habit"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--line2)',
              background: 'var(--card2)',
            }}
          >
            <Icon name="edit" size={13} color="var(--tx2)" />
          </button>

          {!habit.challenge_id && (
            <button
              onClick={onDelete}
              className="hov k-squish"
              title="Delete Habit"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                border: '1px solid var(--line2)',
                background: 'var(--card2)',
              }}
            >
              <Icon name="trash" size={13} color="var(--tx3)" />
            </button>
          )}
        </div>
      </div>

      {/* Week Grid Mode */}
      {viewMode === 'week' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: phone ? 'repeat(7,1fr)' : `repeat(7, ${CELL}px)`,
            gap: phone ? 6 : 6,
          }}
        >
          {week.map((d, i) => {
            const key = ymd(d);
            const t = ticks.find((x) => x.habit_id === habit.id && x.on_date === key);
            const on = !!t;
            const isToday = key === today;

            return (
              <div key={key}>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: isToday ? 'var(--accTx)' : 'var(--tx3)',
                    textAlign: 'center',
                    marginBottom: 4,
                  }}
                >
                  {DAYS_SHORT[i]}
                </div>
                <button
                  onClick={() => {
                    onTick(habit.id, key, habit.target ?? 1);
                  }}
                  className={on ? 'cellpop' : 'k-squish'}
                  title={key}
                  style={{
                    width: '100%',
                    height: phone ? 38 : CELL,
                    borderRadius: 9,
                    display: 'grid',
                    placeItems: 'center',
                    background: on ? habit.color : 'var(--card2)',
                    border: isToday
                      ? `2px solid ${on ? habit.color : 'var(--acc)'}`
                      : '1px solid transparent',
                    color: on ? '#0C0F16' : 'var(--tx3)',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'transform .1s ease',
                  }}
                >
                  {label(t)}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* Day Focus Mode with Quick Counter / Timer */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--card2)', padding: '10px 14px', borderRadius: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
              TODAY'S TARGET
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: isTargetMet ? '#52C41A' : 'var(--tx)', marginTop: 2 }}>
              {currentVal} / {targetVal} {habit.target_unit || (habit.kind === 'dur' ? 'mins' : 'times')}
            </div>
          </div>

          {habit.kind === 'count' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => handleStepCount(-1)}
                className="hov k-squish"
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card)', fontSize: 16, fontWeight: 800 }}
              >
                -
              </button>
              <button
                onClick={() => handleStepCount(1)}
                className="acc k-squish"
                style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13, fontWeight: 800, border: 'none' }}
              >
                +1
              </button>
              <button
                onClick={() => handleStepCount(5)}
                className="hov k-squish"
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}
              >
                +5
              </button>
            </div>
          ) : habit.kind === 'dur' ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onOpenTimer}
                className="acc k-squish"
                style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800, border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="clock" size={13} color="var(--ink)" />
                Start Timer
              </button>
              <button
                onClick={() => onTick(habit.id, today, targetVal)}
                className="hov k-squish"
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}
              >
                {isDoneToday ? 'Done ✓' : 'Mark Full'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => onTick(habit.id, today)}
              className="k-squish"
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                background: isDoneToday ? habit.color : 'var(--acc)',
                color: isDoneToday ? '#0C0F16' : 'var(--ink)',
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isDoneToday ? 'Completed ✓' : 'Mark Done +'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
