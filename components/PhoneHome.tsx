'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TabRail } from './TabRail';
import { Icon, type IconName } from './Icon';
import { PAL, K } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { useHabits, useTicks, useHabitActions, ymd } from '@/lib/habits';
import { useScratch } from '@/lib/scratch';
import { useTransactions, useBudgets } from '@/lib/money';

/**
 * Phone Home — its own composition, not the desktop grid reflowed.
 * Ported from Basedly.dc.html markup 313–374.
 */

const TABS = ['Dashboard', 'Projects', 'Agenda'] as const;
type Tab = (typeof TABS)[number];

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };

export function PhoneHome({ name }: { name: string }) {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('Dashboard');

  const today = ymd(new Date());
  const { data: tasks = [] } = useTasks();
  const TA = useTaskActions();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(7);
  const HA = useHabitActions(7);
  const { data: scratch = [] } = useScratch();
  const { data: txns = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();

  const open = tasks.filter((t) => !t.done);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const month = new Date().toISOString().slice(0, 7);
  const spent = txns.filter((t) => t.occurred_at.startsWith(month)).reduce((s, t) => s + Math.abs(t.amount_centavos), 0);
  const budget = budgets.reduce((s, b) => s + b.amount_centavos, 0);

  // Eight rings: habits first, then the standing money/tasks dials.
  type Ring = { n: string; c: string; pct: number; ic: IconName; go: () => void };

  const habitRings: Ring[] = habits.slice(0, 6).map((h) => ({
    n: h.name,
    c: h.color,
    ic: 'habit',
    pct: ticks.some((t) => t.habit_id === h.id && t.on_date === today) ? 1 : 0,
    go: () => { HA.tick.mutate({ habitId: h.id, date: today }); },
  }));

  const standing: Ring[] = [
    { n: 'Tasks', c: PAL.mint, ic: 'task', pct: tasks.length ? 1 - open.length / tasks.length : 0, go: () => router.push('/tasks/') },
    { n: 'Money', c: PAL.amber, ic: 'money', pct: budget ? Math.min(1, spent / budget) : 0, go: () => router.push('/money/') },
  ];
  const rings: Ring[] = [...habitRings, ...standing].slice(0, 8);

  const complete = (t: Task) => {
    setLeaving((s) => new Set(s).add(t.id));
    setTimeout(() => {
      TA.complete.mutate({ id: t.id, done: true });
      setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }, K.taskExitMs);
  };

  return (
    <div style={{ padding: '6px 14px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => router.push('/habits/')} className="glowring" title="Habit rings"
          style={{
            position: 'relative', width: 38, height: 38, borderRadius: '50%', flex: 'none',
            display: 'grid', placeItems: 'center',
            background: `color-mix(in srgb, ${prefs.accent} 18%, transparent)`,
            border: `1px solid color-mix(in srgb, ${prefs.accent} 40%, transparent)`,
          }}>
          <span className="glowspin" aria-hidden style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: `conic-gradient(from 0deg, transparent, ${prefs.accent}, transparent)`,
            opacity: 0.5, pointerEvents: 'none',
          }} />
          <Icon name="habit" size={16} color="var(--accTx)" />
        </button>

        <div style={{ flex: 1, textAlign: 'center', fontSize: 21, fontWeight: 800, letterSpacing: '-.04em' }}>basedly</div>

        <button onClick={() => router.push('/profile/')}
          style={{ width: 32, height: 32, borderRadius: '50%', background: PAL.indigo, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#0C0F16', flex: 'none' }}>
          {(name || 'MR').slice(0, 2).toUpperCase()}
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <TabRail tabs={TABS.map((t) => ({ id: t, label: t }))} value={tab} onChange={setTab} phone label="Home sections" />
      </div>

      {tab === 'Dashboard' && (
        <>
          <div style={CARD}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(72px,1fr))', gap: '12px 6px' }}>
              {rings.map((r) => {
                const circ = 2 * Math.PI * 30;
                return (
                  <button key={r.n} onClick={r.go} title={r.n}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <span style={{ position: 'relative', width: 56, height: 56, display: 'grid', placeItems: 'center' }}>
                      <svg viewBox="0 0 72 72" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(150,165,200,.16)" strokeWidth="6" />
                        <circle cx="36" cy="36" r="30" fill="none" stroke={r.c} strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={circ} strokeDashoffset={circ * (1 - r.pct)}
                          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }} />
                      </svg>
                      <Icon name={r.ic} size={16} color={r.c} />
                    </span>
                    <span style={{
                      fontSize: 8.5, fontWeight: 700, letterSpacing: '.02em', color: 'var(--tx3)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                    }}>{r.n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, padding: '11px 12px',
            borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--sh)',
          }}>
            <span style={{ width: 3, alignSelf: 'stretch', minHeight: 36, borderRadius: 2, background: PAL.cyan, flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>Scratchpad</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--tx3)' }}>{scratch.length}</span>
              </span>
              <span style={{
                display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--tx2)', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {scratch[0]?.text ?? 'Nothing kept yet'}
              </span>
            </span>
            <button onClick={() => router.push('/home/')} className="acc"
              style={{ flex: 'none', padding: '7px 12px', borderRadius: 9, background: 'var(--acc)', color: '#0C0F16', fontSize: 10.5, fontWeight: 800 }}>
              Open
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 2px' }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em' }}>Assigned to me</div>
            <button onClick={() => router.push('/tasks/')}
              style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)' }}>view all ›</button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 11 }}>What’s on your plate</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {open.slice(0, 6).map((t) => (
              <div key={t.id} className={leaving.has(t.id) ? 'leaving' : 'lensrow'} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 14,
                background: 'var(--card)', boxShadow: 'var(--sh)',
              }}>
                <button onClick={() => router.push('/tasks/')} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <span key={v} style={{
                        width: 5, height: 5, borderRadius: 3,
                        background: v <= (t.stars || 0) ? 'var(--accTx)' : 'var(--line2)',
                      }} />
                    ))}
                  </div>
                </button>
                <button onClick={() => complete(t)} title="Complete" style={{
                  width: 22, height: 22, flex: 'none', borderRadius: '50%',
                  border: '1.6px solid var(--line2)', display: 'grid', placeItems: 'center',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent' }} />
                </button>
              </div>
            ))}
            {open.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing on your plate.</div>}
          </div>
        </>
      )}

      {tab === 'Projects' && (
        <button onClick={() => router.push('/projects/')} className="hov"
          style={{ ...CARD, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11 }}>
          <Icon name="proj" size={16} color={PAL.amber} />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Open the project boards</span>
          <Icon name="chev" size={13} color="var(--tx3)" />
        </button>
      )}

      {tab === 'Agenda' && (
        <button onClick={() => router.push('/calendar/')} className="hov"
          style={{ ...CARD, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11 }}>
          <Icon name="cal" size={16} color={PAL.sky} />
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Open the calendar</span>
          <Icon name="chev" size={13} color="var(--tx3)" />
        </button>
      )}
    </div>
  );
}
