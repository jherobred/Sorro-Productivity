'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { RowsSkeleton } from '@/components/Skeleton';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { useLongPress } from '@/lib/useLongPress';
import { ContextMenu } from '@/components/ContextMenu';
import { useHabits, useTicks, useHabitActions, lastDays, ymd, streak, type Habit, type Tick } from '@/lib/habits';
import { Streak, bestStreakFrom } from '@/components/Streak';
import { Buddy } from '@/components/Buddy';
import { useRouter } from 'next/navigation';
import { useChallenges } from '@/lib/challenges';
import { metricDef } from '@/lib/metrics';

/** Ported from Basedly.dc.html markup 1020–1078; cell grid at 4433 (40px desktop). */

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const CELL = 40;
const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };

const KIND_LABEL: Record<string, string> = { bin: 'Binary · daily', count: 'Quantity · daily', dur: 'Duration · daily' };

export default function HabitsPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const router = useRouter();
  const [year, setYear] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const lp = useLongPress();

  const days = year ? 365 : 7;
  const { data: habits = [], isPending } = useHabits();
  const { data: ticks = [] } = useTicks(days);
  const { data: challenges = [] } = useChallenges();
  const A = useHabitActions(days);

  /**
   * Two lists, one page.
   *
   * A challenge you joined writes a habit here (lib/challenges.ts), which is
   * the whole point - a scoreboard in Community is not somewhere anybody looks
   * at 7am. But mixed into your own habits they are noise: you did not choose
   * them, you cannot rename them usefully, and leaving one is done elsewhere.
   * So they sit under their own heading, below yours, in the order they arrived.
   */
  const own = habits.filter((h) => !h.challenge_id);
  const fromChallenges = habits.filter((h) => h.challenge_id);
  const chalOf = (id: string | null) => challenges.find((c) => c.id === id) ?? null;

  const week = lastDays(7);
  const today = ymd(new Date());

  /**
   * Whole days since anything at all was ticked. The creature's face reads off
   * this and nothing else — never off how many habits are kept or missed, which
   * is the rule the challenge mascots are built on and the reason it is safe to
   * put one on the page somebody opens on the morning they are failing.
   */
  const lastTick = ticks.map((t) => t.on_date).sort().at(-1) ?? null;
  const daysSince = lastTick
    ? Math.round((Date.parse(`${today}T12:00`) - Date.parse(`${lastTick}T12:00`)) / 864e5)
    : null;
  const keptToday = ticks.filter((t) => t.on_date === today).length;

  const label = (h: Habit, t: Tick | undefined) =>
    !t ? '' : h.kind === 'bin' ? '✓'
      : h.kind === 'dur' ? `${Math.floor(Number(t.value) / 60)}h`
        : String(Number(t.value));

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <h1 className="sronly">Habits</h1>
        <Buddy daysSince={daysSince} size={46} racing={keptToday > 0}
          note={daysSince === null ? 'Tick one and we start'
            : keptToday > 0 ? `${keptToday} kept today — keep going`
              : daysSince === 0 ? 'Back at it' : 'Ready when you are'} />
        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
          {weekLabel(week[0], week[6])}
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

      {isPending && <RowsSkeleton rows={5} label="Loading your habits" lead="square" />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!isPending && habits.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No habits yet.</div>}

        {([
          { key: 'own', label: 'Yours', items: own },
          { key: 'chal', label: 'From challenges', items: fromChallenges },
        ] as const).flatMap((group) => (group.items.length === 0 ? [] : [
          <div key={`h-${group.key}`} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            // The divider. Only drawn above the second group, because a rule
            // over the first one separates it from nothing.
            marginTop: group.key === 'chal' ? 10 : 0,
            paddingTop: group.key === 'chal' ? 14 : 0,
            borderTop: group.key === 'chal' ? '1px solid var(--line)' : 'none',
          }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
              {group.label}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{group.items.length}</span>
          </div>,
          ...group.items.map((h) => {
          const s = streak(ticks, h.id);
          const chal = chalOf(h.challenge_id);
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
                  {h.challenge_id && (
                    <span title={chal ? `Counts: ${metricDef(chal.metric).label}` : 'From a challenge'}
                      style={{
                        flex: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                        borderRadius: 999, fontSize: 10, fontWeight: 700,
                        background: `color-mix(in srgb, ${h.color} 18%, transparent)`,
                        color: 'var(--tx2)',
                      }}>
                      <Icon name="trophy" size={10} color={h.color} />
                      {chal ? metricDef(chal.metric).label : 'Challenge'}
                    </span>
                  )}
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
                  {h.challenge_id ? (
                    // Deleting this would leave you in the challenge with
                    // nothing to tick. Leaving is done where you joined.
                    <button onClick={() => router.push('/community/')} className="hov" title="Open the challenge"
                      style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="chev" size={14} color="var(--tx2)" />
                    </button>
                  ) : (
                    <button onClick={() => A.removeWithUndo(h)} className="hov" title="Delete habit"
                      style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={14} color="var(--tx2)" />
                    </button>
                  )}
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
        }),
        ]))}
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

/**
 * "Aug 13 – 19, 2026", or "Aug 30 – Sep 5, 2026" across a month boundary.
 *
 * Built from parts rather than a second toLocaleDateString call: asking for
 * `{ day, year }` without a month is a combination most locales have no pattern
 * for, and Chrome falls back to its field-listing style — the heading read
 * "Aug 13 – 2026 (day: 19)".
 */
function weekLabel(from: Date, to: Date): string {
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const tail = `${to.getDate()}, ${to.getFullYear()}`;
  return from.getMonth() === to.getMonth()
    ? `${md(from)} – ${tail}`
    : `${md(from)} – ${md(to)}, ${to.getFullYear()}`;
}
