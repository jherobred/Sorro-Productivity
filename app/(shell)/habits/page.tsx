'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { SECHUE, PAL } from '@/lib/pal';
import { useHabits, useTicks, useHabitActions, lastDays, ymd, streak, type Habit } from '@/lib/habits';
import { useLayout } from '@/lib/useLayout';

export default function HabitsPage() {
  const { phone } = useLayout();
  const [span, setSpan] = useState<'week' | 'month'>('week');
  const days = span === 'week' ? 7 : 28;

  const { data: habits = [], isLoading } = useHabits();
  const { data: ticks = [] } = useTicks(days);
  const A = useHabitActions(days);

  const grid = lastDays(days);
  const today = ymd(new Date());
  const isOn = (h: string, d: string) => ticks.some((t) => t.habit_id === h && t.on_date === d);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>Habits</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['week', 'month'] as const).map((s) => (
            <button key={s} onClick={() => setSpan(s)} className="hov"
              style={{
                padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, minHeight: 34,
                color: span === s ? SECHUE.habits : 'var(--tx3)',
                background: span === s ? 'var(--hov)' : undefined,
              }}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {isLoading && <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Loading…</p>}

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
        {habits.map((h, i) => (
          <div key={h.id} className="lensrow" style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)', animationDelay: `${Math.min(i, 8) * 0.02}s` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: h.color, flex: 'none' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{h.name}</span>

              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
                <Icon name="flame" size={12} color={streak(ticks, h.id) > 0 ? h.color : 'var(--tx3)'} />
                {streak(ticks, h.id)}
              </span>

              <button onClick={() => A.removeWithUndo(h)} aria-label={`Delete ${h.name}`} style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
                <Icon name="trash" size={13} color="var(--tx3)" />
              </button>
            </div>

            {/* Heatmap. auto-fit so nothing clips at 360px. */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${span === 'week' ? 7 : 14}, 1fr)`, gap: 4 }}>
              {grid.map((d) => {
                const key = ymd(d);
                const on = isOn(h.id, key);
                return (
                  <button
                    key={key}
                    onClick={() => A.tick.mutate({ habitId: h.id, date: key })}
                    className={on ? 'cellpop' : undefined}
                    aria-label={`${h.name} ${key}`}
                    title={key}
                    style={{
                      height: phone ? 26 : 22,
                      borderRadius: 7,
                      background: on ? h.color : 'var(--card2)',
                      border: key === today ? `1px solid ${on ? 'transparent' : h.color}` : '1px solid transparent',
                      opacity: on ? 1 : 0.75,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <AddHabit onAdd={(name, color) => A.create.mutate({ id: crypto.randomUUID(), name, color })} />
      </div>
    </div>
  );
}

function AddHabit({ onAdd }: { onAdd: (name: string, color: string) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PAL.coral);
  const swatches = Object.values(PAL);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n, color);
    setName('');
  };

  return (
    <div className="row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
      <Icon name="plus" size={15} color="var(--tx3)" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add a habit"
        style={{ flex: 1, minWidth: 120, fontSize: 13.5, color: 'var(--tx)', minHeight: 24 }}
      />
      <div style={{ display: 'flex', gap: 5 }}>
        {swatches.slice(0, 6).map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`}
            style={{ width: 18, height: 18, borderRadius: 6, background: c, outline: color === c ? '2px solid var(--tx)' : undefined, outlineOffset: 2 }} />
        ))}
      </div>
    </div>
  );
}
