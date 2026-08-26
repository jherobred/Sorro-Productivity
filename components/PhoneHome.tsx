'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TabRail } from './TabRail';
import { Icon, type IconName } from './Icon';
import { PAL, K } from '@/lib/pal';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { useHabits, useTicks, useHabitActions, ymd, streak } from '@/lib/habits';
import { useScratch } from '@/lib/scratch';
import { useTransactions, useBudgets } from '@/lib/money';
import { useEvents, useEventActions, at, hhmm, type Ev } from '@/lib/events';
import { CalendarGrid } from './calendar/DayGrid';
import { PhoneHomeSkeleton } from './Skeleton';
import { BuddyCompanion } from './BuddyCompanion';
import { DailyQuests } from './DailyQuests';
import { FocusHub } from './FocusHub';
import { playTick } from '@/lib/audio';
import { SwipeableRow } from './SwipeableRow';

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
 * tasks. Now: what is next, then what is on you, companion & quests, then the rings,
 * then the scratchpad. Ordered by how often somebody opens the phone to find
 * out.
 */

const TABS = ['Dashboard', 'Projects', 'Agenda'] as const;
type Tab = (typeof TABS)[number];

const CARD: React.CSSProperties = { background: 'var(--card)', borderRadius: 'var(--r-card)', padding: 'var(--pad-card)', boxShadow: 'var(--sh)' };

export function PhoneHome({ name }: { name: string }) {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [focusOpen, setFocusOpen] = useState(false);

  const today = ymd(new Date());
  const { data: tasks = [], isPending } = useTasks();
  const TA = useTaskActions();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(7);
  const HA = useHabitActions(7);
  const { data: scratch = [] } = useScratch();
  const { data: txns = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();

  // A week from this morning, not from Monday
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

  // Countdown to the next block. `next` is the current-or-next event, so a
  // block already running counts down to nothing — it says "Now" instead.
  const nextMins = next ? Math.round((new Date(next.starts_at).getTime() - Date.now()) / 60_000) : 0;
  const running = !!next && nextMins <= 0;
  const untilShort = !next ? '' : running ? 'Now'
    : nextMins >= 60 ? `${Math.floor(nextMins / 60)}h ${nextMins % 60}m` : `${nextMins}m`;

  // The calendar's own day grid, embedded. `from` is this morning, so today is
  // column 0; it parks an hour behind the current one.
  const EA = useEventActions(from);
  const [sel, setSel] = useState<string | null>(null);
  const parkHour = Math.max(0, new Date().getHours() - 1);
  const schedule = (t: Task, day: number, hour: number | null) => {
    const date = new Date(at(from, day, hour ?? 9));
    const due_on = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    TA.update.mutate({ id: t.id, patch: { due_at: hour === null ? null : date.toISOString(), due_on } });
    toast(hour === null ? `${t.title} — no set time` : `${t.title} at ${hhmm(hour)}`);
  };

  // Eight rings: habits first, then the standing money/tasks dials.
  type Ring = { n: string; c: string; pct: number; ic: IconName; go: () => void };

  const habitRings: Ring[] = habits.slice(0, 6).map((h) => ({
    n: h.name,
    c: h.color,
    ic: 'habit',
    pct: ticks.some((t) => t.habit_id === h.id && t.on_date === today) ? 1 : 0,
    go: () => {
      playTick();
      HA.tick.mutate({ habitId: h.id, date: today });
    },
  }));

  const standing: Ring[] = [
    { n: 'Tasks', c: PAL.mint, ic: 'task', pct: tasks.length ? 1 - open.length / tasks.length : 0, go: () => router.push('/tasks/') },
    { n: 'Money', c: PAL.amber, ic: 'money', pct: budget ? Math.min(1, spent / budget) : 0, go: () => router.push('/money/') },
  ];
  const rings: Ring[] = [...habitRings, ...standing].slice(0, 8);
  const ringsDone = rings.filter((r) => r.pct >= 1).length;

  const complete = (t: Task) => {
    playTick();
    setLeaving((s) => new Set(s).add(t.id));
    setTimeout(() => {
      TA.complete.mutate({ id: t.id, done: true });
      setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }, K.taskExitMs);
  };

  const bestStreak = habits.reduce((m, h) => Math.max(m, streak(ticks, h.id)), 0);

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
          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, letterSpacing: '-.04em' }}>basedly</div>
          <div style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--tx3)', marginTop: -1 }}>
            {greeting()}{name ? `, ${name.split(' ')[0]}` : ''}
          </div>
        </div>

        <button
          onClick={() => setFocusOpen(true)}
          className="k-squish"
          title="Focus Station"
          style={{
            width: 38, height: 38, borderRadius: '50%', flex: 'none',
            display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--acc) 18%, transparent)',
            border: '1px solid color-mix(in srgb, var(--acc) 35%, transparent)',
            color: 'var(--accTx)',
          }}
        >
          <Icon name="clock" size={16} color="var(--accTx)" />
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <TabRail tabs={TABS.map((t) => ({ id: t, label: t }))} value={tab} onChange={setTab} phone label="Home sections" />
      </div>

      {tab === 'Dashboard' && isPending && <PhoneHomeSkeleton />}

      {tab === 'Dashboard' && !isPending && (
        <>
          {/* Time until the next thing, then the day it sits in — the
              calendar's own grid, not a summary of it. */}
          <div style={{ ...CARD, padding: 'var(--pad-card)' }}>
            {next ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span style={{
                    fontSize: 'var(--fs-2xl)', fontWeight: 700, letterSpacing: '-.03em',
                    lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {untilShort}
                  </span>
                  {!running && <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--tx2)' }}>until</span>}
                </div>
                <div style={{
                  fontSize: 'var(--fs-lg)', fontWeight: 700, letterSpacing: '-.025em', marginTop: 'var(--sp-2)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {next.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: next.color || PAL.sky, flex: 'none' }} />
                  <span style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
                    {whenLabel(next)}{next.location ? ` · ${next.location}` : ''}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, letterSpacing: '-.025em' }}>Nothing scheduled</div>
                <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)', marginTop: 5 }}>
                  {todaysEvents.length} today · {dueToday.length} due
                </div>
              </>
            )}
          </div>

          <div style={{
            ...CARD, padding: 0, height: 340, marginTop: 10,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flex: 'none',
              padding: 'var(--sp-3) var(--pad-card) var(--sp-2)',
            }}>
              <span style={KICKER}>Today</span>
              <span style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)' }}>
                {todaysEvents.length} event{todaysEvents.length === 1 ? '' : 's'}
              </span>
              <button onClick={() => router.push('/calendar/')} className="hov"
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                  borderRadius: 7, fontSize: 'var(--fs-meta)', fontWeight: 600, color: 'var(--tx2)',
                }}>
                <span>Calendar</span>
                <Icon name="chev" size={12} color="var(--tx2)" />
              </button>
            </div>

            <CalendarGrid
              days={1}
              dayOffset={0}
              parkHour={parkHour}
              ws={from}
              events={events}
              tasks={tasks}
              A={EA}
              TA={TA}
              sel={sel}
              setSel={setSel}
              openEvent={() => router.push('/calendar/')}
              openSlot={() => router.push('/calendar/')}
              onSchedule={schedule}
            />
          </div>

          {/* Overdue */}
          {overdue.length > 0 && (
            <button onClick={() => router.push('/tasks/')} className="hov k-squish" style={{
              width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 13px', borderRadius: 14, textAlign: 'left',
              background: `color-mix(in srgb, ${PAL.coral} 12%, var(--card))`,
              border: `1px solid color-mix(in srgb, ${PAL.coral} 38%, transparent)`,
            }}>
              <Icon name="flag" size={15} color={PAL.coral} />
              <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
                {overdue.length} overdue
              </span>
              <Icon name="chev" size={13} color={PAL.coral} />
            </button>
          )}

          {/* Interactive Pet Companion */}
          <div style={{ marginTop: 12 }}>
            <BuddyCompanion
              streak={bestStreak}
              xp={tasks.filter((t) => t.done).length * 20 + ticks.length * 10}
              onStartFocus={() => setFocusOpen(true)}
            />
          </div>

          {/* Daily Quests */}
          <div style={{ marginTop: 12 }}>
            <DailyQuests
              tasks={tasks}
              habits={habits}
              ticks={ticks}
            />
          </div>

          <SectionHead label="Assigned to me" note="What’s on your plate" onAll={() => router.push('/tasks/')} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {open.slice(0, 6).map((t) => (
              <div key={t.id} className={leaving.has(t.id) ? 'leaving' : ''} style={{ borderRadius: 14, overflow: 'hidden' }}>
                <SwipeableRow
                  onSwipeRight={() => complete(t)}
                  onSwipeLeft={() => TA.removeWithUndo(t)}
                  rightActionIcon="check"
                  rightActionColor="var(--pal-mint)"
                  leftActionIcon="trash"
                  leftActionColor="var(--pal-coral)"
                >
                  <div
                    className="lensrow"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 13px',
                      background: 'var(--card)',
                      boxShadow: 'var(--sh)',
                      border: '1px solid var(--line)',
                      borderRadius: 14,
                    }}
                  >
                    <button onClick={() => router.push('/tasks/')} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0 }}>
                      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--tx)' }}>{t.title}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <span key={v} style={{
                            width: 5, height: 5, borderRadius: 3,
                            background: v <= (t.stars || 0) ? 'var(--accTx)' : 'var(--line2)',
                          }} />
                        ))}
                      </div>
                    </button>
                    <button
                      onClick={() => complete(t)}
                      title="Complete"
                      className="k-squish"
                      style={{
                        width: 24, height: 24, flex: 'none', borderRadius: '50%',
                        border: '1.6px solid var(--line2)', display: 'grid', placeItems: 'center',
                        cursor: 'pointer', background: 'transparent',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'transparent' }} />
                    </button>
                  </div>
                </SwipeableRow>
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
                      fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '.02em', color: 'var(--tx3)',
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
                <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--tx3)' }}>{scratch.length}</span>
              </span>
              <span style={{
                display: 'block', fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--tx2)', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {scratch[0]?.text ?? 'Nothing kept yet'}
              </span>
            </span>
            <button onClick={() => router.push('/home/')} className="acc"
              style={{ flex: 'none', padding: '7px 12px', borderRadius: 9, background: 'var(--acc)', color: '#0C0F16', fontSize: 'var(--fs-meta)', fontWeight: 800 }}>
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
                <span style={{ display: 'block', fontSize: 'var(--fs-body)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                  <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--line2)', overflow: 'hidden' }}>
                    <span style={{
                      display: 'block', height: '100%', width: `${Math.min(100, p.progress)}%`,
                      background: p.color, borderRadius: 2, transition: 'width .5s',
                    }} />
                  </span>
                  <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
                    {p.progress}%
                  </span>
                </span>
              </span>

              {p.deadline && (
                <span style={{ flex: 'none', fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--tx3)' }}>
                  {new Date(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </button>
          ))}

          {projects.length === 0 && <Empty>No active projects. Make one on the boards.</Empty>}

          <button onClick={() => router.push('/projects/')} className="hov"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
              borderRadius: 14, border: '1px dashed var(--line2)', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--tx3)',
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
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '-.02em' }}>{dayLabel(day)}</span>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--tx3)' }}>{list.length}</span>
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
                      <span style={{ display: 'block', fontSize: 'var(--fs-sm)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.title}
                      </span>
                      {e.location && (
                        <span style={{ display: 'block', fontSize: 'var(--fs-meta)', color: 'var(--tx3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.location}
                        </span>
                      )}
                    </span>
                    <span style={{ flex: 'none', fontSize: 'var(--fs-meta)', fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
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
              borderRadius: 14, border: '1px dashed var(--line2)', fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--tx3)',
            }}>
            <Icon name="cal" size={14} color="var(--tx3)" />
            Open the calendar
          </button>
        </div>
      )}

      {/* Focus Station Dialog Modal */}
      {focusOpen && (
        <div
          onClick={() => setFocusOpen(false)}
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 150,
            background: 'rgba(4,4,8,.75)',
            backdropFilter: 'blur(6px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440 }}>
            <FocusHub onClose={() => setFocusOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

const KICKER: React.CSSProperties = {
  fontSize: 'var(--fs-micro)', fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx2)',
};

function SectionHead({ label, note, onAll }: { label: string; note: string; onAll: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '18px 0 2px' }}>
        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, letterSpacing: '-.02em' }}>{label}</div>
        <button onClick={onAll}
          style={{ marginLeft: 'auto', fontSize: 'var(--fs-meta)', fontWeight: 700, color: 'var(--accTx)' }}>view all ›</button>
      </div>
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--tx3)', marginBottom: 11 }}>{note}</div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--tx3)', padding: '4px 2px' }}>{children}</div>;
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
