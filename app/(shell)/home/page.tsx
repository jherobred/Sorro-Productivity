'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase, currentUserId } from '@/lib/supabase';
import { queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { useTasks } from '@/lib/tasks';
import { useEvents, weekStart, hoursOf, hhmm, useEventActions } from '@/lib/events';
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
  background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)',
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

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em',
  textTransform: 'uppercase', color: 'var(--tx3)',
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
  const untilPct = Math.max(4, Math.min(100, Math.round(((120 - minsUntil) / 120) * 100)));
  const untilLabel = !upNext ? '' : minsUntil >= 60
    ? `in ${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m`
    : `in ${Math.max(0, minsUntil)} min`;

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
      {/* Hero — the day/night sky band with its drifting gradient and sun blob. */}
      <div style={{
        padding: phone ? '14px 14px 4px' : '20px 24px 6px', position: 'relative', overflow: 'hidden',
        background: 'var(--panel)', borderBottom: '2px solid var(--line2)',
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 16, border: '1px solid var(--line)',
            padding: phone ? '15px 16px 17px' : '17px 20px 19px', marginBottom: phone ? 14 : 16,
          }}>
            <div className="dnl" style={{ position: 'absolute', inset: 0, background: (dark ? SKIES : SKIES_LIGHT)[tod], backgroundSize: '240% 240%' }} />
            <div className="sunl" style={{
              position: 'absolute', top: -58, left: 0, width: 190, height: 190, borderRadius: '50%',
              background: `radial-gradient(circle, color-mix(in srgb, ${prefs.accent} 34%, transparent), transparent 68%)`,
              pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative' }}>
              <div style={phone
                ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, marginBottom: 6 }
                : { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                <div key={greetSeq} aria-label={greeting}
                  style={{ fontSize: phone ? 23 : 27, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>
                  {greeting.split('').map((c, i) => (
                    <span key={i} aria-hidden className="fade" style={{ animationDelay: `${i * 0.025}s`, whiteSpace: 'pre' }}>{c}</span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(120,140,180,.16)' }}>
                  {(['morning', 'afternoon', 'evening'] as Tod[]).map((t) => (
                    <button key={t} onClick={() => { setTod(t); setGreetSeq((n) => n + 1); }}
                      style={{
                        padding: '4px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize',
                        background: tod === t ? `color-mix(in srgb, ${prefs.accent} 20%, transparent)` : 'transparent',
                        color: tod === t ? 'var(--accTx)' : 'var(--tx3)',
                      }}>
                      {t}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setFocusOpen(true)}
                  className="k-squish"
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 9,
                    background: 'color-mix(in srgb, var(--acc) 18%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--acc) 35%, transparent)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--accTx)',
                  }}
                >
                  <Icon name="clock" size={13} color="var(--accTx)" />
                  <span>Focus Station</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 6 }}>
                {/* The same creature that runs your lane on the challenge
                    board, on the page you open first. It is derived from your
                    id, so it costs nothing and it is already yours. Its face
                    reads off whether anything got ticked today — never off how
                    much is left, which would make a bad morning worse. */}
                <Buddy daysSince={daysSinceDone} size={44} racing={open.length > 0} />
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)' }}>
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}{open.length} things left{overdue.length ? ` · ${overdue.length} overdue` : ''}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 13, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* Up next */}
            <div style={{
              flex: 'none', width: 353, borderRadius: 15, padding: '14px 16px',
              background: `color-mix(in srgb, ${INDIGO} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${INDIGO} 38%, transparent)`,
              minHeight: 170, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{ ...KICKER, color: INDIGO }}>Up next</div>
                {upNext && (
                  // Live indicator: a dot under an expanding halo ring.
                  <span style={{ position: 'relative', width: 6, height: 6, flex: 'none' }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: INDIGO }} />
                    <span className="halo" style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `1.5px solid ${INDIGO}` }} />
                  </span>
                )}
              </div>

              {upNext ? (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 5 }}>{upNext.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums', marginBottom: 11 }}>
                    {hhmm(hoursOf(upNext.starts_at))} – {hhmm(hoursOf(upNext.ends_at))}{upNext.location ? ` · ${upNext.location}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: `color-mix(in srgb,${INDIGO} 22%,transparent)`, overflow: 'hidden' }}>
                      <div style={{ width: `${untilPct}%`, height: '100%', borderRadius: 3, background: PAL.indigo, transition: 'width .4s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: INDIGO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{untilLabel}</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 5 }}>Nothing else today</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx2)', marginBottom: 11 }}>Tomorrow is clear too</div>
                </>
              )}

              <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
                <button onClick={() => router.push('/notebooks/')} className="acc k-squish"
                  style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  Open notes
                </button>
                <button
                  onClick={() => {
                    // Silence was the bug: with nothing scheduled this did
                    // nothing at all and looked broken.
                    if (!upNext) { toast('Nothing to snooze'); return; }
                    A.snooze.mutate({ id: upNext.id });
                    toast(`Reminder for “${upNext.title}” pushed 10 minutes`);
                  }}
                  className="hov k-squish"
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line2)', color: 'var(--tx2)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  Snooze
                </button>
              </div>
            </div>

            {/* The rest of today */}
            <div style={{
              flex: 1, minWidth: 260, borderRadius: 15, padding: '14px 16px',
              background: 'color-mix(in srgb, var(--panel) 62%, transparent)', border: '1px solid var(--line)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={KICKER}>The rest of today</div>
                <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>to 10 PM</div>
              </div>
              <div style={{ position: 'relative', height: 34, marginBottom: 9 }}>
                <div style={{ position: 'absolute', top: 15, left: 0, right: 0, height: 2, background: 'var(--line2)' }} />
                {todays.map((e) => {
                  const s = hoursOf(e.starts_at);
                  const len = hoursOf(e.ends_at) - s;
                  const left = ((s - 9) / 13) * 100;
                  if (left < -5 || left > 100) return null;
                  return (
                    <div key={e.id} style={{
                      position: 'absolute', top: 8, left: `${Math.max(0, left)}%`,
                      width: `${Math.max(4, (len / 13) * 100)}%`, height: 16, borderRadius: 5, background: e.color,
                    }} />
                  );
                })}
                <div style={{ position: 'absolute', top: 2, left: `${Math.max(0, Math.min(100, ((new Date().getHours() + new Date().getMinutes() / 60 - 9) / 13) * 100))}%`, width: 2, height: 30, background: 'var(--acc)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 500, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                <span>9 AM</span><span>12 PM</span><span>3 PM</span><span>6 PM</span><span>9 PM</span>
              </div>
            </div>

            {/* Overdue */}
            <div style={{
              flex: 'none', width: 353, borderRadius: 15, padding: '14px 16px',
              background: `color-mix(in srgb,${CORAL_T} 12%,transparent)`,
              border: `1px solid color-mix(in srgb,${CORAL_T} 34%,transparent)`,
            }}>
              <div style={{ ...KICKER, color: `color-mix(in srgb,${CORAL_T} 78%,var(--tx))`, marginBottom: 8 }}>Overdue</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{overdue.length}</div>
              <div style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: 'var(--tx2)' }}>
                {overdue.length ? `Oldest is ${oldest} day${oldest === 1 ? '' : 's'} old` : 'Nothing is late'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
        <Announcements phone={phone} />

        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
          {/* Interactive Study Buddy Companion */}
          <div style={{ gridColumn: phone ? 'span 1' : 'span 2' }}>
            <BuddyCompanion
              daysSince={daysSinceDone}
              streak={habits.reduce((m, h) => Math.max(m, streak(ticks, h.id)), 0)}
              xp={tasks.filter((t) => t.done).length * 20 + ticks.length * 10}
              onStartFocus={() => setFocusOpen(true)}
            />
          </div>

          {/* Daily RPG Quests */}
          <DailyQuests
            tasks={tasks}
            habits={habits}
            ticks={ticks}
            notesCount={recent.length}
          />

          {/* Today */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={KICKER}>Today</div>
              <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>
                {todays.length} event{todays.length === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {todays.length === 0 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Nothing scheduled.</div>}
              {todays.map((e) => {
                const started = new Date(e.starts_at).getTime() <= Date.now();
                const ended = new Date(e.ends_at).getTime() <= Date.now();
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 2, height: 26, background: e.color, borderRadius: 1 }} />
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)', width: 38, fontVariantNumeric: 'tabular-nums' }}>
                      {String(new Date(e.starts_at).getHours()).padStart(2, '0')}:{String(new Date(e.starts_at).getMinutes()).padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{e.title}</div>
                    {ended && <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tx3)' }}>done</div>}
                    {started && !ended && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>now</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <Scratchpad phone={phone} />

          {/* Habits — tick inline */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={KICKER}>Habits</div>
              <div style={{ marginLeft: 'auto' }}>
                <Streak size="sm" label="best run"
                  days={habits.reduce((m, h) => Math.max(m, streakFrom(ticks.filter((t) => t.habit_id === h.id).map((t) => t.on_date))), 0)} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {habits.map((h) => {
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
                      className={on ? 'cellpop' : ''}
                      style={{
                        width: 28, height: 28, borderRadius: 9, flex: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: on ? 'none' : '1.5px solid var(--line2)',
                        background: on ? h.color : 'transparent',
                        color: on ? '#0C0F16' : 'var(--tx3)',
                        fontSize: 11, fontWeight: 700,
                      }}
                    >
                      {label}
                    </button>
                    <div style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{h.name}</div>
                    <Streak days={streak(ticks, h.id)} label="" size="sm" hue={h.color} />
                  </div>
                );
              })}
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
function Scratchpad({ phone }: { phone: boolean }) {
  const { data: notes = [] } = useScratch();
  const A = useScratchActions();
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<string>('All');

  const keep = () => {
    const t = draft.trim();
    // Pressing Keep on an empty field used to do nothing and say nothing.
    if (!t) { toast('Type something first'); return; }
    A.add.mutate({ id: crypto.randomUUID(), text: t, tag: 'Note', color: TAG_COLOR.Note });
    setDraft('');
  };

  const shown = filter === 'All' ? notes : notes.filter((n) => n.tag === filter);

  /** "→ Task" promotes a scratch note into the first task list and clears it. */
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <div style={KICKER}>Scratchpad</div>
        <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>{notes.length} kept</div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 12,
        background: 'var(--card2)', border: '1px solid var(--line)', marginBottom: 12,
      }}>
        <Icon name="plus" size={15} color="var(--accTx)" />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); keep(); } }}
          rows={1}
          placeholder="Jot something — Enter to keep it"
          style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--tx)', resize: 'none', fontFamily: 'inherit', background: 'transparent' }}
        />
        <button onClick={keep} className="acc"
          style={{ flex: 'none', padding: '5px 11px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 11, fontWeight: 800 }}>
          Keep
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['All', ...SCRATCH_TAGS].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 700,
              background: filter === f ? 'color-mix(in srgb, var(--acc) 20%, transparent)' : 'transparent',
              color: filter === f ? 'var(--accTx)' : 'var(--tx3)',
            }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((n) => <ScratchRow key={n.id} n={n} A={A} onToTask={toTask} />)}
        {shown.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '4px 2px' }}>Nothing kept under this tag yet.</div>
        )}
      </div>
    </div>
  );
}

function ScratchRow({ n, A, onToTask }: { n: Scratch; A: ReturnType<typeof useScratchActions>; onToTask: (n: Scratch) => void }) {
  const cycleTag = () => {
    const i = SCRATCH_TAGS.indexOf(n.tag as (typeof SCRATCH_TAGS)[number]);
    const next = SCRATCH_TAGS[(i + 1) % SCRATCH_TAGS.length];
    A.save.mutate({ id: n.id, patch: { tag: next, color: TAG_COLOR[next] } });
  };

  return (
    <div className="pop" style={{
      padding: '10px 11px', borderRadius: 12, background: 'var(--card2)', border: '1px solid var(--line)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <span style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: n.color, flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, fontWeight: 500, textWrap: 'pretty' }}>{n.text}</div>
          {/* Tag + stamp sit left; the actions are pushed to the right edge,
              matching the prototype's row (markup 571–577). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button onClick={cycleTag} title="Change tag"
              style={{
                padding: '3px 9px', borderRadius: 6, fontSize: 10, fontWeight: 800, flex: 'none',
                color: n.color, background: `color-mix(in srgb, ${n.color} 16%, transparent)`,
              }}>
              {n.tag}
            </button>
            <span style={{ fontSize: 10, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{ago(n.created_at)}</span>

            <button onClick={() => onToTask(n)} className="hov" title="Turn into a task"
              style={{
                marginLeft: 'auto', flex: 'none', padding: '4px 9px', borderRadius: 7,
                border: '1px solid var(--line2)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)',
              }}>
              → Task
            </button>
            <button onClick={() => A.save.mutate({ id: n.id, patch: { pinned: !n.pinned } })}
              className="hov" title={n.pinned ? 'Unpin' : 'Pin to top'}
              style={{ flex: 'none', padding: '3px 7px', borderRadius: 6, fontSize: 11, color: n.pinned ? 'var(--accTx)' : 'var(--tx3)' }}>
              {n.pinned ? '★' : '☆'}
            </button>
            <button onClick={() => A.removeWithUndo(n)} className="hov"
              aria-label={`Delete note: ${n.text.slice(0, 30)}`} title="Delete note"
              style={{ flex: 'none', padding: '3px 6px', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <Icon name="trash" size={13} color="var(--tx3)" />
            </button>
          </div>
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
