'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase, currentUserId } from '@/lib/supabase';
import { queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { useEvents, weekStart, hoursOf, hhmm, at, dayIndex, useEventActions } from '@/lib/events';
import { CalendarGrid } from '@/components/calendar/DayGrid';
import { usePrefs } from '@/lib/prefs';
import { Buddy } from '@/components/Buddy';
import { BuddyCompanion } from '@/components/BuddyCompanion';
import { DailyQuests } from '@/components/DailyQuests';
import { FocusHub } from '@/components/FocusHub';
import { playTick } from '@/lib/audio';
import { useLayout } from '@/lib/useLayout';
import { PAL } from '@/lib/pal';
import { Icon, type IconName } from '@/components/Icon';
import { useHabits, useTicks, useHabitActions, streak, ymd } from '@/lib/habits';
import { useTransactions, useBudgets, useAccounts, peso } from '@/lib/money';
import { useScratch, useScratchActions, SCRATCH_TAGS, TAG_COLOR, ago, type Scratch } from '@/lib/scratch';
import { useNotifications, useNotifActions, NOTIF_HUE, NOTIF_ICON, ago as notifAgo } from '@/lib/notify';
import { Streak, streakFrom } from '@/components/Streak';
import { PhoneHome } from '@/components/PhoneHome';

const AMBER = '#F5B33C';
const CARD: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 'var(--r-card)', padding: 'var(--pad-card)', boxShadow: 'var(--sh)',
};

/**
 * Ported from Basedly.dc.html — markup 469–638 (desktop), computed styles
 * 4732–4741 (`skies`) and 5067–5090 (hero, greeting, up-next).
 */

const SKIES: Record<Tod, string> = {
  morning: 'linear-gradient(120deg,#1B2A3E 0%,#243349 40%,#2E2A38 100%)',
  afternoon: 'linear-gradient(150deg,#1B2334 0%,#131828 55%,#0F1119 100%)',
  evening: 'linear-gradient(150deg,#241C30 0%,#171429 55%,#0D0E17 100%)',
};
const SKIES_LIGHT: Record<Tod, string> = {
  morning: 'linear-gradient(120deg,#FBF3EC 0%,#F3F2F2 60%,#EDECEA 100%)',
  afternoon: 'linear-gradient(150deg,#F6F5F3 0%,#F3F2F2 55%,#ECEBE9 100%)',
  evening: 'linear-gradient(150deg,#F2EEF4 0%,#F3F2F2 55%,#EAE8EC 100%)',
};

type Tod = 'morning' | 'afternoon' | 'evening';
const INDIGO = '#6C7CF5';
const CORAL_T = '#FF6B57';

const QUOTES = [
  'Every peso has a job.',
  'Spend on what you actually use.',
  'Small leaks sink big ships.',
  'Future you is watching.',
];

/** --tx3 on --card is 3.59:1, under the 4.5 floor. Labels sit on --tx2. */
const KICKER: React.CSSProperties = {
  fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '.11em',
  textTransform: 'uppercase', color: 'var(--tx2)',
};

export default function HomePage() {
  const router = useRouter();
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';

  const [name, setName] = useState('');
  const [focusOpen, setFocusOpen] = useState(false);
  const [tod, setTod] = useState<Tod>(() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  });
  const [greetSeq, setGreetSeq] = useState(0);
  const [quote, setQuote] = useState(0);
  const [, tick] = useState(0);

  const ws = weekStart(new Date());
  const { data: tasks = [] } = useTasks();
  const TA = useTaskActions();
  const { data: events = [] } = useEvents(ws);
  const A = useEventActions(ws);

  const today = ymd(new Date());
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(30);
  const HA = useHabitActions(30);

  const { data: txns = [] } = useTransactions();
  const { data: budgets = [] } = useBudgets();
  const { data: accounts = [] } = useAccounts();

  const { data: projects = [] } = useQuery({
    queryKey: ['home_projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_projects').select('id,name,progress,color')
        .is('deleted_at', null).eq('status', 'active').order('position').limit(4);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ['home_recent_notes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bd_notes').select('id,title,updated_at')
        .is('deleted_at', null).order('updated_at', { ascending: false }).limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 7000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void (async () => {
      const uid = await currentUserId().catch(() => null);
      if (!uid) return;
      const { data: p } = await supabase.from('bd_profiles').select('name').eq('user_id', uid).maybeSingle();
      setName((p?.name ?? '').split(' ')[0]);
    })();
  }, []);

  const open = tasks.filter((t) => !t.done);
  const todayISO = new Date().toISOString().slice(0, 10);
  /** Whole days since anything was ticked, or null if nothing ever has been. */
  const lastDone = tasks.map((t) => t.completed_at).filter(Boolean).sort().at(-1);
  const daysSinceDone = lastDone
    ? Math.max(0, Math.round((Date.now() - Date.parse(lastDone)) / 864e5))
    : null;
  const overdue = open.filter((t) => t.due_on && t.due_on < todayISO);
  const oldest = overdue
    .map((t) => Math.round((Date.now() - new Date(t.due_on! + 'T00:00:00').getTime()) / 86_400_000))
    .sort((a, b) => b - a)[0];

  const todays = events
    .filter((e) => new Date(e.starts_at).toDateString() === new Date().toDateString())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const upNext = events
    .filter((e) => new Date(e.starts_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  const minsUntil = upNext ? Math.round((new Date(upNext.starts_at).getTime() - Date.now()) / 60_000) : 0;
  /** "2h 15m" / "48m" — the countdown reads as a phrase, so it carries no "in". */
  const untilShort = !upNext ? '' : minsUntil >= 60
    ? `${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m`
    : `${Math.max(0, minsUntil)}m`;

  // The embedded day grid. It is the calendar's own component, so it wants the
  // same props the calendar hands it; Home differs only in where taps go
  // (straight to /calendar/ rather than into a popover) and where it parks.
  const todayCol = dayIndex(new Date().toISOString(), ws);
  /** An hour of lead-in, so the block you are in is not flush against the top. */
  const parkHour = Math.max(0, new Date().getHours() - 1);
  const [sel, setSel] = useState<string | null>(null);

  /** Dropping a task on the grid dates it. Same rule as the calendar page:
   *  due_on always follows due_at, or the Tasks page groups it under the
   *  wrong day. */
  const schedule = (t: Task, day: number, hour: number | null) => {
    const date = new Date(at(ws, day, hour ?? 9));
    const due_on = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    TA.update.mutate({ id: t.id, patch: { due_at: hour === null ? null : date.toISOString(), due_on } });
    toast(hour === null ? `${t.title} — no set time` : `${t.title} at ${hhmm(hour)}`);
  };

  // Money tile: spend this calendar month against the summed monthly budgets.
  const month = new Date().toISOString().slice(0, 7);
  const spent = txns.filter((t) => t.occurred_at.startsWith(month)).reduce((s, t) => s + Math.abs(t.amount_centavos), 0);
  const budgetTotal = budgets.filter((b) => b.period === 'monthly').reduce((s, b) => s + b.amount_centavos, 0);
  const left = Math.max(0, budgetTotal - spent);
  const spentPct = budgetTotal > 0 ? Math.min(100, Math.round((spent / budgetTotal) * 100)) : 0;
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const daysLeft = endOfMonth - new Date().getDate();

  // Running balance per account: opening + everything logged against it.
  const balances = new Map<string, number>();
  for (const a of accounts) balances.set(a.id, 0);
  for (const t of txns) {
    if (!t.account_id) continue;
    balances.set(t.account_id, (balances.get(t.account_id) ?? 0) - Math.abs(t.amount_centavos));
  }

  const deadlines = open
    .filter((t) => t.due_on && t.due_on >= todayISO)
    .map((t) => ({
      id: t.id,
      title: t.title,
      days: Math.round((new Date(t.due_on! + 'T00:00:00').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86_400_000),
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);

  const greeting = `Good ${tod}${name ? `, ${name}` : ''}`;

  // Phone portrait is its own composition (markup 313–374), not this grid reflowed.
  if (phone) return <PhoneHome name={name} />;

  return (
    <div>
      {/* The page is one continuous --bg now.
          What went is the `--panel` slab behind this card and the 2px rule
          under it: two near-identical darks (#16181F on #111216) meeting at a
          hard line 338px down, which read as a cut-off band rather than a
          section boundary. The sky card keeps its gradient, its sun and the
          time-of-day switch — it just floats on the page like every other
          block instead of being welded into a slab. */}
      <div style={{ padding: 'var(--sp-5) var(--sp-6) 0' }}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-card)',
          border: '1px solid var(--line)', padding: 'var(--pad-card)', marginBottom: 'var(--sp-3)',
        }}>
          <div className="dnl" style={{ position: 'absolute', inset: 0, background: (dark ? SKIES : SKIES_LIGHT)[tod], backgroundSize: '240% 240%' }} />
          <div className="sunl" style={{
            position: 'absolute', top: -58, left: 0, width: 190, height: 190, borderRadius: '50%',
            background: `radial-gradient(circle, color-mix(in srgb, ${prefs.accent} 34%, transparent), transparent 68%)`,
            pointerEvents: 'none',
          }} />

          {/* One row, one baseline. The greeting, the switch and Focus each sat
              on a different vertical rhythm, with the Buddy dropped onto a
              fourth line underneath them. */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <Buddy daysSince={daysSinceDone} size={44} racing={open.length > 0} />

            <div style={{ minWidth: 0 }}>
              <div key={greetSeq} aria-label={greeting}
                style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.1 }}>
                {greeting.split('').map((c, i) => (
                  <span key={i} aria-hidden className="fade" style={{ animationDelay: `${i * 0.025}s`, whiteSpace: 'pre' }}>{c}</span>
                ))}
              </div>
              <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)', marginTop: 3 }}>
                {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}{open.length} things left{overdue.length ? ` · ${overdue.length} overdue` : ''}
              </div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(120,140,180,.16)' }}>
                {(['morning', 'afternoon', 'evening'] as Tod[]).map((t) => (
                  <button key={t} onClick={() => { setTod(t); setGreetSeq((n) => n + 1); }}
                    style={{
                      padding: '5px 11px', borderRadius: 7, fontSize: 'var(--fs-micro)', fontWeight: 700, textTransform: 'capitalize',
                      background: tod === t ? `color-mix(in srgb, ${prefs.accent} 20%, transparent)` : 'transparent',
                      color: tod === t ? 'var(--accTx)' : 'var(--tx2)',
                    }}>
                    {t}
                  </button>
                ))}
              </div>

              <button onClick={() => setFocusOpen(true)} className="hov k-squish"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9,
                  border: '1px solid var(--line2)', fontSize: 'var(--fs-meta)', fontWeight: 600, color: 'var(--tx2)',
                }}>
                <Icon name="clock" size={14} color="var(--tx2)" />
                <span>Focus Station</span>
              </button>
            </div>
          </div>
        </div>

        {/* Time until the next thing, and how late the late things are.
            The old progress bar filled `(120 - minutes) / 120`, so anything
            more than two hours out pinned at 4% and measured nothing. The
            countdown is the measure. */}
        <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'stretch', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <div style={{ ...CARD, flex: 1, minWidth: 360, display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {upNext ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {untilShort}
                    </span>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--tx2)' }}>until</span>
                    <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, letterSpacing: '-.025em' }}>{upNext.title}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 'var(--sp-2)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: upNext.color, flex: 'none' }} />
                    <span style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
                      {hhmm(hoursOf(upNext.starts_at))} – {hhmm(hoursOf(upNext.ends_at))}{upNext.location ? ` · ${upNext.location}` : ''}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, letterSpacing: '-.025em' }}>Nothing else today</div>
                  <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)', marginTop: 'var(--sp-2)' }}>Tomorrow is clear too</div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                if (!upNext) { toast('Nothing to snooze'); return; }
                A.snooze.mutate({ id: upNext.id });
                toast(`Reminder for “${upNext.title}” pushed 10 minutes`);
              }}
              className="hov k-squish"
              style={{
                flex: 'none', padding: '8px 14px', borderRadius: 9, border: '1px solid var(--line2)',
                color: 'var(--tx2)', fontSize: 'var(--fs-meta)', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
              Snooze 10 minutes
            </button>
          </div>

          <div style={{
            flex: 'none', width: 260, borderRadius: 'var(--r-card)', padding: 'var(--pad-card)',
            background: `color-mix(in srgb,${CORAL_T} 12%,transparent)`,
            border: `1px solid color-mix(in srgb,${CORAL_T} 34%,transparent)`,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ ...KICKER, color: `color-mix(in srgb,${CORAL_T} 78%,var(--tx))` }}>Overdue</div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 'var(--sp-2)', letterSpacing: '-.03em' }}>{overdue.length}</div>
            <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, lineHeight: 1.4, color: 'var(--tx2)', marginTop: 3 }}>
              {overdue.length ? `Oldest is ${oldest} day${oldest === 1 ? '' : 's'} old` : 'Nothing is late'}
            </div>
          </div>
        </div>

        {/* The day itself — the calendar's own grid, drag and all, parked on
            the hour you are in rather than on 7 a.m. This replaces the "Today"
            list card and the mini hour-strip that used to sit up here; both
            drew the same day at lower fidelity. */}
        <div data-tour="home-timeline" style={{
          ...CARD, padding: 0, height: 430, marginBottom: 'var(--sp-3)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
            padding: 'var(--sp-3) var(--pad-card) var(--sp-2)', flex: 'none',
          }}>
            <div style={KICKER}>Today</div>
            <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)' }}>
              {todays.length} event{todays.length === 1 ? '' : 's'}
            </div>
            <button onClick={() => router.push('/calendar/')} className="hov"
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
                borderRadius: 7, fontSize: 'var(--fs-meta)', fontWeight: 600, color: 'var(--tx2)',
              }}>
              <span>Open calendar</span>
              <Icon name="chev" size={12} color="var(--tx2)" />
            </button>
          </div>

          <CalendarGrid
            days={1}
            dayOffset={todayCol}
            parkHour={parkHour}
            ws={ws}
            events={events}
            tasks={tasks}
            A={A}
            TA={TA}
            sel={sel}
            setSel={setSel}
            openEvent={() => router.push('/calendar/')}
            openSlot={() => router.push('/calendar/')}
            onSchedule={schedule}
          />
        </div>

        <TaskBoard tasks={open} todayISO={todayISO} TA={TA} onAll={() => router.push('/tasks/')} />
      </div>

      <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
        <Announcements phone={phone} />

        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
          {/* Interactive Study Buddy Companion */}
          <div data-tour="home-buddy" style={{ gridColumn: phone ? 'span 1' : 'span 2' }}>
            <BuddyCompanion
              daysSince={daysSinceDone}
              streak={habits.reduce((m, h) => Math.max(m, streak(ticks, h.id)), 0)}
              xp={tasks.filter((t) => t.done).length * 20 + ticks.length * 10}
              onStartFocus={() => setFocusOpen(true)}
            />
          </div>

          {/* Daily RPG Quests */}
          <div data-tour="home-quests" style={{ gridColumn: 'span 1' }}>
            <DailyQuests
              tasks={tasks}
              habits={habits}
              ticks={ticks}
              notesCount={recent.length}
            />
          </div>

          <Scratchpad phone={phone} />

          {/* Habits — tick inline */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <button
                onClick={() => router.push('/habits/')}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', ...KICKER }}
              >
                Habits ({ticks.filter((t) => t.on_date === today).length}/{habits.length})
              </button>
              <div style={{ marginLeft: 'auto' }}>
                <Streak size="sm" label="best run"
                  days={habits.reduce((m, h) => Math.max(m, streakFrom(ticks.filter((t) => t.habit_id === h.id).map((t) => t.on_date))), 0)} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {habits.slice(0, 7).map((h) => {
                const tick = ticks.find((t) => t.habit_id === h.id && t.on_date === today);
                const on = !!tick;
                const label = !on ? '+' : h.kind === 'bin' ? '✓' : h.kind === 'dur'
                  ? `${Math.floor(Number(tick!.value) / 60)}h${Math.round(Number(tick!.value) % 60)}m`
                  : String(Number(tick!.value));
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={() => {
                        playTick();
                        HA.tick.mutate({ habitId: h.id, date: today });
                      }}
                      className={on ? 'cellpop' : 'k-squish'}
                      style={{
                        width: 28, height: 28, borderRadius: 9, flex: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: on ? 'none' : '1.5px solid var(--line2)',
                        background: on ? h.color : 'transparent',
                        color: on ? '#0C0F16' : 'var(--tx3)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                    <div
                      onClick={() => router.push('/habits/')}
                      style={{ flex: 1, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {h.name}
                    </div>
                    <Streak days={streak(ticks, h.id)} label="" size="sm" hue={h.color} />
                  </div>
                );
              })}
              {habits.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: '10px 0' }}>
                  No habits set yet. <button onClick={() => router.push('/habits/')} style={{ color: 'var(--accTx)', background: 'none', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Add habit</button>
                </div>
              )}
            </div>
          </div>

          {/* Money */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={KICKER}>Money</div>
              <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>{daysLeft} days left</div>
            </div>
            <div style={{ fontSize: 23, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>{peso(left)}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tx3)', marginBottom: 12 }}>
              left of {peso(budgetTotal)} this month
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'var(--line2)', overflow: 'hidden', marginBottom: 11 }}>
              <div style={{ width: `${spentPct}%`, height: '100%', background: AMBER, borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 500, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
              {accounts.map((a) => <span key={a.id}>{a.name} {peso(balances.get(a.id) ?? 0)}</span>)}
            </div>
            {/* Rotating motivational line on the tloop keyframe. */}
            <div style={{ marginTop: 10, minHeight: 30, overflow: 'hidden' }}>
              <div key={quote} style={{
                fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx3)', textWrap: 'pretty',
                animation: 'tloop 7s cubic-bezier(.22,1,.36,1) both',
                animationPlayState: 'var(--anim, running)' as React.CSSProperties['animationPlayState'],
              }}>
                {QUOTES[quote]}
              </div>
            </div>
          </div>

          {/* Deadlines */}
          <div style={CARD}>
            <div style={KICKER}>Deadlines</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {deadlines.length === 0 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Nothing due soon.</div>}
              {deadlines.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: d.days <= 7 ? AMBER : 'var(--tx2)', width: 40, fontVariantNumeric: 'tabular-nums' }}>
                    {d.days}d
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{d.title}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active projects */}
          <div style={CARD}>
            <div style={KICKER}>Active projects</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 12 }}>
              {projects.length === 0 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>No active projects.</div>}
              {projects.map((p) => (
                <div key={p.id}>
                  <div style={{ display: 'flex', marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</div>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--line2)', overflow: 'hidden' }}>
                    <div style={{ width: `${p.progress}%`, height: '100%', background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recently edited */}
          <div style={CARD}>
            <div style={KICKER}>Recently edited</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 12 }}>
              {recent.length === 0 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Nothing edited yet.</div>}
              {recent.map((n) => (
                <div key={n.id}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{n.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>{ago(n.updated_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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

/** Scratchpad — spans two grid columns on desktop (scratchCardStyle). */
/**
 * One task list, ordered the way the day actually presses on you: late first
 * and oldest-late first, then today, then dated, then undated.
 *
 * Home used to carry three partial views of the same table — an Overdue count,
 * a Deadlines card of the next three due, and nothing you could actually tick.
 * The count and the deadlines still stand; this is the part that was missing.
 */
function TaskBoard({ tasks, todayISO, TA, onAll }: {
  tasks: Task[];
  todayISO: string;
  TA: ReturnType<typeof useTaskActions>;
  onAll: () => void;
}) {
  const [all, setAll] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  /** Late < today < dated < undated, and inside each bucket by date. */
  const rank = (t: Task) => {
    if (!t.due_on) return 3;
    if (t.due_on < todayISO) return 0;
    if (t.due_on === todayISO) return 1;
    return 2;
  };
  const sorted = [...tasks].sort((a, b) =>
    rank(a) - rank(b) || (a.due_on ?? '').localeCompare(b.due_on ?? ''));
  const shown = all ? sorted : sorted.slice(0, 8);

  const complete = (t: Task) => {
    playTick();
    setLeaving((s) => new Set(s).add(t.id));
    setTimeout(() => {
      TA.complete.mutate({ id: t.id, done: true });
      setLeaving((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }, 220);
  };

  /** Days late, "Today", a weekday inside the week, else a short date. */
  const due = (t: Task): { label: string; tone: string } => {
    if (!t.due_on) return { label: '', tone: 'var(--tx2)' };
    const days = Math.round(
      (new Date(t.due_on + 'T00:00:00').getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86_400_000);
    if (days < 0) return { label: `${-days} day${days === -1 ? '' : 's'} late`, tone: 'var(--pal-coral)' };
    if (days === 0) return { label: 'Today', tone: 'var(--pal-amber)' };
    if (days === 1) return { label: 'Tomorrow', tone: 'var(--tx2)' };
    if (days < 7) return {
      label: new Date(t.due_on + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' }),
      tone: 'var(--tx2)',
    };
    return {
      label: new Date(t.due_on + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      tone: 'var(--tx2)',
    };
  };

  return (
    <div style={{ ...CARD, marginBottom: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <div style={KICKER}>Tasks</div>
        <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)' }}>{tasks.length} open</div>
        <button onClick={onAll} className="hov"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
            borderRadius: 7, fontSize: 'var(--fs-meta)', fontWeight: 600, color: 'var(--tx2)',
          }}>
          <span>Open tasks</span>
          <Icon name="chev" size={12} color="var(--tx2)" />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {shown.length === 0 && (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--tx2)', padding: '4px 8px' }}>Nothing on your plate.</div>
        )}

        {shown.map((t) => {
          const d = due(t);
          const late = !!t.due_on && t.due_on < todayISO;
          return (
            <div key={t.id} className={`blk${leaving.has(t.id) ? ' leaving' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                padding: '10px var(--sp-2)', borderRadius: 'var(--r-row)',
              }}>
              <button
                onClick={() => complete(t)}
                aria-label={`Complete ${t.title}`}
                title="Complete"
                className="k-squish"
                style={{
                  width: 20, height: 20, flex: 'none', borderRadius: '50%', cursor: 'pointer',
                  border: `1.6px solid ${late ? 'color-mix(in srgb, var(--pal-coral) 60%, transparent)' : 'var(--line2)'}`,
                }}
              />
              <div style={{
                flex: 1, minWidth: 0, fontSize: 'var(--fs-body)', fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {t.title}
              </div>
              {/* Fixed-width right column so every due value lands on one
                  right edge instead of ragging with the title length. */}
              <div style={{
                flex: 'none', width: 96, textAlign: 'right', fontSize: 'var(--fs-meta)',
                fontWeight: late ? 600 : 500, color: d.tone, fontVariantNumeric: 'tabular-nums',
              }}>
                {d.label}
              </div>
              <button onClick={() => TA.removeWithUndo(t)} className="bh hov"
                aria-label={`Delete ${t.title}`} title="Delete"
                style={{ flex: 'none', width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
                <Icon name="trash" size={13} color="var(--tx2)" />
              </button>
            </div>
          );
        })}
      </div>

      {sorted.length > 8 && (
        <button onClick={() => setAll((v) => !v)} className="hov"
          style={{
            marginTop: 'var(--sp-2)', width: '100%', padding: '9px 0', borderRadius: 'var(--r-row)',
            borderTop: '1px solid var(--line)', fontSize: 'var(--fs-meta)', fontWeight: 600, color: 'var(--tx2)',
          }}>
          {all ? 'Show less' : `Show ${sorted.length - 8} more`}
        </button>
      )}
    </div>
  );
}

/**
 * Scratchpad — quick capture, and the one card on Home you edit rather than read.
 *
 * Four changes over the original:
 *  - the row carries text, tag and time; ⇢Task, pin and delete come up on
 *    hover (`.bh`, which globals.css already gives a visible resting state on
 *    touch). Four always-on controls per row made this the noisiest block on
 *    the page.
 *  - click the text to edit it. Fixing a typo used to mean delete and retype.
 *  - a text filter beside the tag chips, because tags alone stop helping at
 *    about a screenful.
 *  - pinned notes sort to the top here rather than only in the query. The
 *    server orders by `pinned` then `position`, but `position` is
 *    `Date.now() % 2e9` at insert and sorts *ascending*, so new notes sank to
 *    the bottom and a pinned one could still be under three newer notes in a
 *    cached or fixture-backed list.
 */
function Scratchpad({ phone }: { phone: boolean }) {
  const { data: notes = [] } = useScratch();
  const A = useScratchActions();
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [q, setQ] = useState('');

  const keep = () => {
    const t = draft.trim();
    if (!t) { toast('Type something first'); return; }
    A.add.mutate({ id: crypto.randomUUID(), text: t, tag: 'Note', color: TAG_COLOR.Note });
    setDraft('');
  };

  const needle = q.trim().toLowerCase();
  const shown = notes
    .filter((n) => (filter === 'All' || n.tag === filter))
    .filter((n) => !needle || n.text.toLowerCase().includes(needle))
    .sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));

  /** "⇢ Task" promotes a scratch note into the first task list and clears it. */
  const toTask = async (n: Scratch) => {
    try {
      const user_id = await currentUserId();
      const { data: list } = await supabase.from('bd_lists').select('id').order('position').limit(1).maybeSingle();
      const { error } = await supabase.from('bd_tasks').insert({ user_id, title: n.text, list_id: list?.id ?? null });
      if (error) throw error;
      A.removeWithUndo(n);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast('Turned into a task');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create task');
    }
  };

  return (
    <div style={{ ...CARD, gridColumn: phone ? 'auto' : 'span 2' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <div style={KICKER}>Scratchpad</div>
        <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 500, color: 'var(--tx2)' }}>
          {notes.length} kept{shown.length !== notes.length ? ` · ${shown.length} shown` : ''}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)', padding: '10px 12px',
        borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line)', marginBottom: 'var(--sp-3)',
      }}>
        <Icon name="plus" size={15} color="var(--accTx)" style={{ marginTop: 3 }} />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); keep(); } }}
          rows={1}
          placeholder="Jot something — Enter to keep it"
          style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.5, color: 'var(--tx)', resize: 'none', fontFamily: 'inherit', background: 'transparent' }}
        />
        <button onClick={keep} className="acc k-squish"
          style={{ flex: 'none', padding: '6px 12px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 'var(--fs-meta)', fontWeight: 700 }}>
          Keep
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['All', ...SCRATCH_TAGS].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '5px 11px', borderRadius: 9999, fontSize: 'var(--fs-meta)',
                fontWeight: filter === f ? 700 : 500,
                background: filter === f ? 'color-mix(in srgb, var(--acc) 20%, transparent)' : 'transparent',
                color: filter === f ? 'var(--accTx)' : 'var(--tx2)',
              }}>
              {f}
            </button>
          ))}
        </div>

        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
          borderRadius: 9999, border: '1px solid var(--line)', minWidth: 150,
        }}>
          <Icon name="search" size={13} color="var(--tx2)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a note"
            aria-label="Search kept notes"
            style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-meta)', color: 'var(--tx)', background: 'transparent' }}
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search" style={{ flex: 'none', display: 'flex' }}>
              <Icon name="close" size={12} color="var(--tx2)" />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {shown.map((n) => <ScratchRow key={n.id} n={n} A={A} onToTask={toTask} />)}
        {shown.length === 0 && (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--tx2)', padding: '4px 2px' }}>
            {needle ? `Nothing matches “${q.trim()}”.` : 'Nothing kept under this tag yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

function ScratchRow({ n, A, onToTask }: { n: Scratch; A: ReturnType<typeof useScratchActions>; onToTask: (n: Scratch) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(n.text);

  const cycleTag = () => {
    const i = SCRATCH_TAGS.indexOf(n.tag as (typeof SCRATCH_TAGS)[number]);
    const next = SCRATCH_TAGS[(i + 1) % SCRATCH_TAGS.length];
    A.save.mutate({ id: n.id, patch: { tag: next, color: TAG_COLOR[next] } });
  };

  /** Empty is a delete-by-accident, so it reverts instead. */
  const commit = () => {
    const t = text.trim();
    setEditing(false);
    if (!t) { setText(n.text); return; }
    if (t === n.text) return;
    A.save.mutate({ id: n.id, patch: { text: t } });
  };

  return (
    <div className="blk" style={{
      padding: '11px 12px', borderRadius: 12, background: 'var(--card2)',
      border: `1px solid ${n.pinned ? 'color-mix(in srgb, var(--acc) 40%, transparent)' : 'var(--line)'}`,
    }}>
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setText(n.text); setEditing(false); }
          }}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          style={{
            width: '100%', fontSize: 'var(--fs-sm)', lineHeight: 1.55, fontWeight: 500,
            color: 'var(--tx)', background: 'transparent', resize: 'none', fontFamily: 'inherit',
          }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
          title="Click to edit"
          style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, fontWeight: 500, textWrap: 'pretty', cursor: 'text' }}
        >
          {n.text}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
        <button onClick={cycleTag} title="Change tag"
          style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 'var(--fs-micro)', fontWeight: 700, flex: 'none',
            color: n.color, background: `color-mix(in srgb, ${n.color} 16%, transparent)`,
          }}>
          {n.tag}
        </button>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{ago(n.created_at)}</span>
        {n.pinned && (
          <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--accTx)' }}>Pinned</span>
        )}

        {/* `.bh` hides these until hover where hover exists, and leaves them
            visible at .6 on touch — see globals.css. */}
        <div className="bh" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => onToTask(n)} className="hov" title="Turn into a task"
            style={{
              flex: 'none', padding: '4px 10px', borderRadius: 7,
              border: '1px solid var(--line2)', fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--tx2)',
            }}>
            Make task
          </button>
          <button onClick={() => A.save.mutate({ id: n.id, patch: { pinned: !n.pinned } })}
            className="hov" title={n.pinned ? 'Unpin' : 'Pin to top'}
            aria-label={n.pinned ? 'Unpin note' : 'Pin note to top'}
            style={{ flex: 'none', width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
            <Icon name="pin" size={13} color={n.pinned ? 'var(--accTx)' : 'var(--tx2)'} />
          </button>
          <button onClick={() => A.removeWithUndo(n)} className="hov"
            aria-label={`Delete note: ${n.text.slice(0, 30)}`} title="Delete note"
            style={{ flex: 'none', width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
            <Icon name="trash" size={13} color="var(--tx2)" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The announcements pane: what arrived while you were away, newest first.
 * Course announcements synced from Canvas LMS land here as well as in the bell,
 * because a deadline change is the kind of thing you should meet on opening the
 * app rather than have to go looking for.
 */
function Announcements({ phone }: { phone: boolean }) {
  const { data: items = [] } = useNotifications();
  const A = useNotifActions();
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const unread = items.filter((n) => !n.read_at);
  const shown = (unread.length ? unread : items).slice(0, phone ? 3 : 4);
  if (!shown.length) return null;

  return (
    <div style={{ ...CARD, marginBottom: 12, padding: '13px 15px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: open ? 11 : 0 }}>
        <div style={KICKER}>Announcements</div>
        {unread.length > 0 && (
          <span style={{
            padding: '1px 7px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
            background: 'color-mix(in srgb, var(--pal-coral) 22%, transparent)', color: 'var(--pal-coral)',
          }}>
            {unread.length} new
          </span>
        )}
        <button onClick={() => setOpen((v) => !v)} className="hov k-squish" aria-expanded={open}
          aria-label={open ? 'Collapse announcements' : 'Expand announcements'}
          style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
          <Icon name="chev" size={13} color="var(--tx3)"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .3s var(--k-spring)' }} />
        </button>
      </div>

      {open && (
        <div className="k-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shown.map((n, i) => (
            <div key={n.id} style={{ '--i': i } as React.CSSProperties}>
              <button
                onClick={() => { if (!n.read_at) A.read.mutate({ id: n.id }); if (n.href) router.push(n.href); }}
                className="row"
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '8px 9px', borderRadius: 10, textAlign: 'left' }}>
                <span style={{
                  width: 24, height: 24, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center', marginTop: 1,
                  background: `color-mix(in srgb, ${NOTIF_HUE[n.kind]} 20%, transparent)`,
                }}>
                  <Icon name={NOTIF_ICON[n.kind] as IconName} size={12} color={NOTIF_HUE[n.kind]} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: n.read_at ? 600 : 800, overflowWrap: 'anywhere' }}>{n.title}</span>
                    <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 10, color: 'var(--tx3)' }}>{notifAgo(n.created_at)}</span>
                  </span>
                  {n.body && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.body}
                    </span>
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
