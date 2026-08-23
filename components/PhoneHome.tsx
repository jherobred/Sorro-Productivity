'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TabRail } from './TabRail';
import { Icon, type IconName } from './Icon';
import { PAL, K } from '@/lib/pal';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { useHabits, useTicks, useHabitActions, ymd } from '@/lib/habits';
import { useScratch } from '@/lib/scratch';
import { useTransactions, useBudgets } from '@/lib/money';
import { useEvents, type Ev } from '@/lib/events';
import { PhoneHomeSkeleton } from './Skeleton';

/**
 * Phone Home — its own composition, not the desktop grid reflowed.
 *
 * **Two of the three tabs used to be a button.** "Projects" and "Agenda" each
 * rendered a single row that said "Open the project boards" and navigated
 * away, which is a tab that costs a tap to do what the nav bar already did in
 * one — and worse, it taught you that the tabs were decoration, so the one
 * with real content in it stopped being worth swiping to. All three carry
 * their own screen now.
 *
 * **Dashboard leads with today.** The rings were at the top because they are
 * the prettiest thing here, and underneath them sat the scratchpad, then
 * tasks. So the first thing the screen said in the morning was "here are eight
 * circles", and the question actually being asked — what is happening today —
 * was below the fold. Now: what is next, then what is on you, then the rings,
 * then the scratchpad. Ordered by how often somebody opens the phone to find
 * out.
 */

const TABS = ['Dashboard', 'Projects', 'Agenda'] as const;
type Tab = (typeof TABS)[number];

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' };

export function PhoneHome({ name }: { name: string }) {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('Dashboard');

  const today = ymd(new Date());
  const { data: tasks = [], isPending } = useTasks();
  const TA = useTaskActions();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(7);
  const HA = useHabitActions(7);
  const { data: scratch = [] } = useScratch();
  const { data: txns = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();

  // A week from this morning, not from Monday: the phone is asked "what is
  // next", and next never means "three days ago".
  const from = startOfToday();
  const { data: events = [] } = useEvents(from, 7);

  const { data: projects = [] } = useQuery({
    queryKey: ['phone_projects'],
    queryFn: async (): Promise<{ id: string; name: string; progress: number; color: string; deadline: string | null }[]> => {
      const { data, error } = await supabase
        .from('bd_projects').select('id,name,progress,color,deadline')
        .is('deleted_at', null).eq('status', 'active').order('position').limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const open = tasks.filter((t) => !t.done);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const month = new Date().toISOString().slice(0, 7);
  const spent = txns.filter((t) => t.occurred_at.startsWith(month)).reduce((s, t) => s + Math.abs(t.amount_centavos), 0);
  const budget = budgets.reduce((s, b) => s + b.amount_centavos, 0);

  const dueToday = open.filter((t) => t.due_on === today);
  const overdue = open.filter((t) => t.due_on && t.due_on < today);
  const todaysEvents = events.filter((e) => sameDay(e.starts_at, today));
  const next = events.find((e) => new Date(e.ends_at).getTime() > Date.now()) ?? null;

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
  const ringsDone = rings.filter((r) => r.pct >= 1).length;

  const complete = (t: Task) => {
    setLeaving((s) => new Set(s).add(t.id));
    setTimeout(() => {
      TA.complete.mutate({ id: t.id, done: true });
      setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }, K.taskExitMs);
  };

  return (
    <div style={{ padding: '6px 14px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
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

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.04em' }}>basedly</div>
          {/* The greeting used to be nowhere on the phone, so the screen opened
              with a wordmark and no idea whose it was. */}
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', marginTop: -1 }}>
            {greeting()}{name ? `, ${name.split(' ')[0]}` : ''}
          </div>
        </div>

        {/* No avatar here. The Shell's phone header draws your face directly
            above this row and it opens the account sheet — two of them a
            centimetre apart, one of which only navigated, was the same control
            asked twice. The spacer keeps the wordmark centred. */}
        <span aria-hidden style={{ width: 38, flex: 'none' }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <TabRail tabs={TABS.map((t) => ({ id: t, label: t }))} value={tab} onChange={setTab} phone label="Home sections" />
      </div>

      {tab === 'Dashboard' && isPending && <PhoneHomeSkeleton />}

      {tab === 'Dashboard' && !isPending && (
        <>
          {/* What is next. One line, and it is the reason most people unlock
              the phone between classes. */}
          <button onClick={() => router.push('/calendar/')} className="hov k-squish" style={{
            ...CARD, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11,
            padding: '13px 14px',
          }}>
            <span style={{
              width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2,
              background: next?.color || PAL.sky, flex: 'none',
            }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={KICKER}>{next ? 'Up next' : 'Today'}</span>
              <span style={{
                display: 'block', fontSize: 13.5, fontWeight: 800, letterSpacing: '-.02em', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {next ? next.title : 'Nothing scheduled'}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                {next ? whenLabel(next) : `${todaysEvents.length} today · ${dueToday.length} due`}
              </span>
            </span>
            <Icon name="chev" size={14} color="var(--tx3)" />
          </button>

          {/* Overdue only appears when it exists. A red bar that is always
              there stops meaning anything. */}
          {overdue.length > 0 && (
            <button onClick={() => router.push('/tasks/')} className="hov k-squish" style={{
              width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 13px', borderRadius: 14, textAlign: 'left',
              background: `color-mix(in srgb, ${PAL.coral} 12%, var(--card))`,
              border: `1px solid color-mix(in srgb, ${PAL.coral} 38%, transparent)`,
            }}>
              <Icon name="flag" size={15} color={PAL.coral} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>
                {overdue.length} overdue
              </span>
              <Icon name="chev" size={13} color={PAL.coral} />
            </button>
          )}

          <SectionHead label="Assigned to me" note="What’s on your plate" onAll={() => router.push('/tasks/')} />

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
            {open.length === 0 && <Empty>Nothing on your plate.</Empty>}
          </div>

          <SectionHead label="Today’s rings" note={`${ringsDone} of ${rings.length} closed`} onAll={() => router.push('/habits/')} />

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
              {rings.length === 0 && <Empty>No habits yet.</Empty>}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, padding: '11px 12px',
            borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--sh)',
          }}>
            <span style={{ width: 3, alignSelf: 'stretch', minHeight: 36, borderRadius: 2, background: PAL.cyan, flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={KICKER}>Scratchpad</span>
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
        </>
      )}

      {tab === 'Projects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {projects.map((p) => (
            <button key={p.id} onClick={() => router.push('/projects/')} className="hov k-squish"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 15,
                background: 'var(--card)', boxShadow: 'var(--sh)', textAlign: 'left',
              }}>
              <span style={{
                width: 38, height: 38, flex: 'none', borderRadius: 11, display: 'grid', placeItems: 'center',
                background: `color-mix(in srgb, ${p.color} 20%, transparent)`,
              }}>
                <Icon name="proj" size={16} color={p.color} />
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--line2)', overflow: 'hidden' }}>
                    <span style={{
                      display: 'block', height: '100%', width: `${Math.min(100, p.progress)}%`,
                      background: p.color, borderRadius: 2, transition: 'width .5s',
                    }} />
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                    {p.progress}%
                  </span>
                </span>
              </span>

              {p.deadline && (
                <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, color: 'var(--tx3)' }}>
                  {new Date(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </button>
          ))}

          {projects.length === 0 && <Empty>No active projects. Make one on the boards.</Empty>}

          <button onClick={() => router.push('/projects/')} className="hov"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
              borderRadius: 14, border: '1px dashed var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx3)',
            }}>
            <Icon name="proj" size={14} color="var(--tx3)" />
            Open the boards
          </button>
        </div>
      )}

      {tab === 'Agenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groupByDay(events).map(([day, list]) => (
            <div key={day}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.02em' }}>{dayLabel(day)}</span>
                <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{list.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {list.map((e) => (
                  <button key={e.id} onClick={() => router.push('/calendar/')} className="hov k-squish"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 14,
                      background: 'var(--card)', boxShadow: 'var(--sh)', textAlign: 'left',
                    }}>
                    <span style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: e.color || PAL.sky, flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.title}
                      </span>
                      {e.location && (
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.location}
                        </span>
                      )}
                    </span>
                    <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                      {e.all_day ? 'All day' : timeOf(e.starts_at)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {events.length === 0 && <Empty>Nothing in the next seven days.</Empty>}

          <button onClick={() => router.push('/calendar/')} className="hov"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
              borderRadius: 14, border: '1px dashed var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx3)',
            }}>
            <Icon name="cal" size={14} color="var(--tx3)" />
            Open the calendar
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

function SectionHead({ label, note, onAll }: { label: string; note: string; onAll: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 2px' }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em' }}>{label}</div>
        <button onClick={onAll}
          style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--accTx)' }}>view all ›</button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginBottom: 11 }}>{note}</div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '4px 2px' }}>{children}</div>;
}

/* ------------------------------------------------------------------ dates */

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const sameDay = (iso: string, day: string) => ymd(new Date(iso)) === day;

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "in 20 min" while it is close, a clock time once it is not. */
function whenLabel(e: Ev): string {
  if (e.all_day) return 'All day';
  const mins = Math.round((new Date(e.starts_at).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return `On now · until ${timeOf(e.ends_at)}`;
  if (mins < 60) return `in ${mins} min`;
  if (sameDay(e.starts_at, ymd(new Date()))) return `${timeOf(e.starts_at)} today`;
  return `${dayLabel(ymd(new Date(e.starts_at)))} · ${timeOf(e.starts_at)}`;
}

function dayLabel(day: string): string {
  const today = ymd(new Date());
  if (day === today) return 'Today';
  const t = new Date();
  t.setDate(t.getDate() + 1);
  if (day === ymd(t)) return 'Tomorrow';
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Events bucketed by local day, in order. Days with nothing in them are absent. */
function groupByDay(events: Ev[]): [string, Ev[]][] {
  const map = new Map<string, Ev[]>();
  for (const e of events) {
    const day = ymd(new Date(e.starts_at));
    map.set(day, [...(map.get(day) ?? []), e]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
