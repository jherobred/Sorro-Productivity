'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { useLongPress } from '@/lib/useLongPress';
import { ContextMenu } from '@/components/ContextMenu';
import { useHabits, useTicks, useHabitActions, lastDays, ymd, streak, type Habit, type Tick } from '@/lib/habits';
import { Streak, bestStreakFrom } from '@/components/Streak';

/** Ported from Basedly.dc.html markup 1020–1078; cell grid at 4433 (40px desktop). */

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const CELL = 40;
const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };

const KIND_LABEL: Record<string, string> = { bin: 'Binary · daily', count: 'Quantity · daily', dur: 'Duration · daily' };

export default function HabitsPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const [year, setYear] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const lp = useLongPress();

  const days = year ? 365 : 7;
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(days);
  const A = useHabitActions(days);

  const week = lastDays(7);
  const today = ymd(new Date());

  const label = (h: Habit, t: Tick | undefined) =>
    !t ? '' : h.kind === 'bin' ? '✓'
      : h.kind === 'dur' ? `${Math.floor(Number(t.value) / 60)}h`
        : String(Number(t.value));

  return (
    <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em' }}>Habits</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
          {week[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {week[6].toLocaleDateString(undefined, { day: 'numeric', year: 'numeric' })}
        </div>
        <button onClick={() => setYear((v) => !v)} className="hov" title="Switch week / year view"
          style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={year ? 'week' : 'grid'} size={15} color="var(--tx2)" />
        </button>
        <button onClick={() => A.create.mutate({ id: crypto.randomUUID(), name: 'New habit', color: PAL.coral })} className="acc"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'var(--acc)', color: '#0C0F16', fontSize: 12, fontWeight: 800 }}>
          <Icon name="plus" size={15} color="#0C0F16" />Add habit
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {habits.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No habits yet.</div>}

        {habits.map((h) => {
          const s = streak(ticks, h.id);
          return (
            <div key={h.id} style={CARD}
              onPointerDown={(e) => lp.start(e, 'habit', h.id, h.name)}
              onContextMenu={(e) => lp.onContextMenu(e, 'habit', h.id, h.name)}>
              <div style={phone
                ? { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, marginBottom: 13 }
                : { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 1 auto', minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: h.color, flex: 'none' }} />
                  <span title={h.name} style={{
                    fontSize: phone ? 14.5 : 15, fontWeight: 800, letterSpacing: '-.015em',
                    minWidth: 0, overflowWrap: 'anywhere',
                  }}>{h.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: phone ? 0 : 'auto' }}>
                  <span style={{ flex: 'none', fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
                    {KIND_LABEL[h.kind] ?? 'Daily'}
                  </span>
                  <Streak days={s} label="" size="sm" hue={h.color}
                    best={bestStreakFrom(ticks.filter((t) => t.habit_id === h.id).map((t) => t.on_date))} />
                  <button onClick={() => setEditing(editing === h.id ? null : h.id)} className="hov" title="Edit habit"
                    style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="edit" size={14} color="var(--tx2)" />
                  </button>
                  <button onClick={() => A.removeWithUndo(h)} className="hov" title="Delete habit"
                    style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="trash" size={14} color="var(--tx2)" />
                  </button>
                </div>
              </div>

              {editing === h.id && (
                <div className="rise" style={{
                  display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12,
                  padding: '10px 12px', borderRadius: 11, background: 'var(--card2)',
                }}>
                  <input defaultValue={h.name}
                    onBlur={(e) => e.target.value !== h.name && A.rename.mutate({ id: h.id, name: e.target.value })}
                    style={{ flex: 1, minWidth: 140, fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', padding: '5px 9px', borderRadius: 8, border: '1px solid var(--line2)' }} />
                  <div style={{ display: 'flex', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--tx2)', flexWrap: 'wrap' }}>
                    {(['bin', 'count', 'dur'] as const).map((k) => (
                      <button key={k} onClick={() => A.setKind.mutate({ id: h.id, kind: k })} style={{
                        padding: '5px 10px', borderRadius: 8,
                        border: `1px solid ${h.kind === k ? 'var(--acc)' : 'var(--line2)'}`,
                        color: h.kind === k ? 'var(--accTx)' : 'var(--tx2)',
                      }}>
                        {k === 'bin' ? 'Binary' : k === 'count' ? 'Quantity' : 'Duration'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!year ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: phone ? 'repeat(7,1fr)' : `repeat(7, ${CELL}px)`,
                  gap: phone ? 7 : 6,
                }}>
                  {week.map((d, i) => {
                    const key = ymd(d);
                    const t = ticks.find((x) => x.habit_id === h.id && x.on_date === key);
                    const on = !!t;
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3)', textAlign: 'center', marginBottom: 4 }}>
                          {DAYS_SHORT[i]}
                        </div>
                        <button
                          onClick={() => A.tick.mutate({ habitId: h.id, date: key })}
                          className={on ? 'cellpop' : undefined}
                          title={key}
                          style={{
                            width: '100%', height: phone ? 38 : CELL, borderRadius: 9,
                            display: 'grid', placeItems: 'center',
                            background: on ? h.color : 'var(--card2)',
                            border: key === today ? `1px solid ${on ? 'transparent' : h.color}` : '1px solid transparent',
                            color: on ? '#0C0F16' : 'var(--tx3)', fontSize: 11, fontWeight: 800,
                          }}
                        >
                          {label(h, t)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 600, color: 'var(--tx3)', marginBottom: 5 }}>
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => <span key={m}>{m}</span>)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateRows: 'repeat(7,1fr)', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 2 }}>
                    {lastDays(364).map((d) => {
                      const key = ymd(d);
                      const on = ticks.some((x) => x.habit_id === h.id && x.on_date === key);
                      return <div key={key} title={key} style={{ aspectRatio: '1', borderRadius: 2, background: on ? h.color : 'var(--card2)', opacity: on ? 1 : 0.6 }} />;
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {lp.ctx && (
        <ContextMenu
          x={lp.ctx.x} y={lp.ctx.y} kind="habit" label={lp.ctx.label}
          accent={prefs.accent} dark={prefs.theme === 'dark'} onClose={lp.close}
          items={[
            { label: 'Tick today', icon: 'task', run: () => A.tick.mutate({ habitId: lp.ctx!.id, date: today }) },
            { label: 'Rename', icon: 'edit', run: () => setEditing(lp.ctx!.id) },
            {
              label: 'Delete', icon: 'trash', danger: true,
              run: () => { const h = habits.find((x) => x.id === lp.ctx!.id); if (h) A.removeWithUndo(h); },
            },
          ]}
        />
      )}
    </div>
  );
}
