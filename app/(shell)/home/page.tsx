'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { UpcomingTasksCarousel } from '@/components/UpcomingTasksCarousel';
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
import {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContent,
  MorphingDialogTitle,
  MorphingDialogImage,
  MorphingDialogSubtitle,
  MorphingDialogClose,
  MorphingDialogDescription,
  MorphingDialogContainer,
} from '@/components/core/morphing-dialog';
import { PlusIcon, Camera, Trash2, Pin, CheckSquare } from 'lucide-react';
import { AsciiBar } from '@/components/AsciiBar';

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
    void (async () => {
      const uid = await currentUserId().catch(() => null);
      if (!uid) return;
      const { data: p } = await supabase.from('bd_profiles').select('name').eq('user_id', uid).maybeSingle();
      setName((p?.name ?? '').split(' ')[0]);
    })();
  }, []);

  const open = tasks.filter((t) => !t.done);
  const todayISO = today;
  /** Whole days since anything was ticked, or null if nothing ever has been. */
  const lastDone = tasks.map((t) => t.completed_at).filter(Boolean).sort().at(-1);
  const daysSinceDone = lastDone
    ? Math.max(0, Math.round((Date.now() - Date.parse(lastDone)) / 864e5))
    : null;
  const overdue = open.filter((t) => t.due_on && t.due_on < todayISO);
  const oldest = overdue
    .map((t) => Math.round((Date.now() - new Date(t.due_on! + 'T00:00:00').getTime()) / 86_400_000))
    .sort((a, b) => b - a)[0];

  // Coarse. `upNext` only changes when an event ends and the kicker only flips
  // when one starts; the 15s tick above re-renders this page often enough for
  // both. The seconds live in UpNextCountdown, which owns its own timer — a 1s
  // tick here re-rendered every task row, event row, note, habit and project
  // card on the page to move three digits.
  const now = Date.now();

  const todays = events
    .filter((e) => new Date(e.starts_at).toDateString() === new Date().toDateString())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const upNext = events
    .filter((e) => new Date(e.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  const isOngoing = upNext ? new Date(upNext.starts_at).getTime() <= now : false;

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
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="clock" size={13} color="var(--accTx)" />
                  <span>Focus Station</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 6 }}>
                <Buddy daysSince={daysSinceDone} size={44} racing={open.length > 0} />
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)' }}>
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}{open.length} things left{overdue.length ? ` · ${overdue.length} overdue` : ''}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 13, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* Up next with animated Border Trail matching event calendar color */}
            {(() => {
              const upNextColor = upNext?.color || INDIGO;
              const cardBody = (
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  borderRadius: 15,
                  padding: '16px 18px',
                  background: upNext ? `color-mix(in srgb, ${upNextColor} 14%, var(--card))` : 'var(--card)',
                  border: upNext ? `1px solid color-mix(in srgb, ${upNextColor} 32%, transparent)` : '1px solid var(--line)',
                  boxShadow: upNext ? `0 4px 20px color-mix(in srgb, ${upNextColor} 14%, transparent)` : 'var(--sh)',
                  minHeight: 180,
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ ...KICKER, color: upNextColor }}>{isOngoing ? 'Happening Now' : 'Up next'}</div>
                      {upNext && (
                        <span style={{ position: 'relative', width: 7, height: 7, flex: 'none' }}>
                          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isOngoing ? PAL.mint : upNextColor }} />
                          <span className="halo" style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `1.5px solid ${isOngoing ? PAL.mint : upNextColor}` }} />
                        </span>
                      )}
                    </div>
                    {upNext && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                        {hhmm(hoursOf(upNext.starts_at))} – {hhmm(hoursOf(upNext.ends_at))}
                      </span>
                    )}
                  </div>

                  {upNext ? (
                    <>
                      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {upNext.title}
                      </div>
                      {upNext.location && (
                        <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="pin" size={11} color="var(--tx3)" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{upNext.location}</span>
                        </div>
                      )}

                      <UpNextCountdown startsAt={upNext.starts_at} endsAt={upNext.ends_at} color={upNextColor} />
                    </>
                  ) : (
                    <div style={{ margin: 'auto 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Nothing else today</div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)' }}>Your schedule is clear</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
                    <button onClick={() => router.push('/calendar/')} className="acc k-squish"
                      style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      Open schedule
                    </button>
                    <button
                      onClick={() => {
                        if (!upNext) { toast('Nothing to snooze'); return; }
                        A.snooze.mutate({ id: upNext.id });
                        toast(`Reminder for “${upNext.title}” pushed 10 minutes`);
                      }}
                      className="hov k-squish"
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line2)', color: 'var(--tx2)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      Snooze 10m
                    </button>
                  </div>
                </div>
              );

              if (upNext) {
                return (
                  <div className="border-trail-wrap" style={{ flex: 'none', width: 280, display: 'flex' }}>
                    <div
                      className="border-trail-spinner"
                      style={{
                        background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${upNextColor} 60deg, transparent 120deg)`,
                      }}
                    />
                    {cardBody}
                  </div>
                );
              }

              return (
                <div style={{ flex: 'none', width: 280, display: 'flex' }}>
                  {cardBody}
                </div>
              );
            })()}

            {/* The rest of today with event labels */}
            <div style={{
              flex: 1, minWidth: 320, borderRadius: 15, padding: '16px 18px', minHeight: 180,
              background: 'color-mix(in srgb, var(--panel) 62%, transparent)', border: '1px solid var(--line)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={KICKER}>The rest of today</div>
                <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>
                  {todays.length} event{todays.length === 1 ? '' : 's'} to 10 PM
                </div>
              </div>

              <div style={{ position: 'relative', height: 34, marginBottom: 8 }}>
                <div style={{ position: 'absolute', top: 15, left: 0, right: 0, height: 2, background: 'var(--line2)' }} />
                {todays.map((e) => {
                  const s = hoursOf(e.starts_at);
                  const len = hoursOf(e.ends_at) - s;
                  const left = ((s - 9) / 13) * 100;
                  if (left < -5 || left > 100) return null;
                  return (
                    <div
                      key={e.id}
                      title={`${e.title} (${hhmm(hoursOf(e.starts_at))} - ${hhmm(hoursOf(e.ends_at))})`}
                      onClick={() => router.push('/calendar/')}
                      style={{
                        position: 'absolute', top: 6, left: `${Math.max(0, left)}%`,
                        width: `${Math.max(4, (len / 13) * 100)}%`, height: 20, borderRadius: 6, background: e.color,
                        display: 'flex', alignItems: 'center', overflow: 'hidden', padding: '0 4px',
                        boxShadow: `0 2px 8px color-mix(in srgb, ${e.color} 30%, transparent)`,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#0A0912', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.title}
                      </span>
                    </div>
                  );
                })}
                <div style={{ position: 'absolute', top: 2, left: `${Math.max(0, Math.min(100, ((new Date().getHours() + new Date().getMinutes() / 60 - 9) / 13) * 100))}%`, width: 2, height: 30, background: 'var(--acc)', zIndex: 2 }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 500, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
                <span>9 AM</span><span>12 PM</span><span>3 PM</span><span>6 PM</span><span>9 PM</span>
              </div>

              {/* Event Labels List */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {todays.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    onClick={() => router.push('/calendar/')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '2px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                      background: 'var(--card2)', border: '1px solid var(--line)',
                      color: 'var(--tx2)', cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: e.color, flex: 'none' }} />
                    <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{hhmm(hoursOf(e.starts_at))}</span>
                  </span>
                ))}
                {todays.length > 3 && (
                  <span style={{ fontSize: 10, color: 'var(--tx3)', alignSelf: 'center' }}>+{todays.length - 3} more</span>
                )}
                {todays.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--tx3)' }}>No events scheduled for the rest of today</span>
                )}
              </div>
            </div>

            {/* Upcoming Tasks Sliding Carousel (Replacing Overdue) */}
            <UpcomingTasksCarousel tasks={tasks} todayISO={todayISO} />
          </div>
        </div>
      </div>

      <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
        <Announcements phone={phone} />

        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
          {/* Study Buddy Hub */}
          <div data-tour="home-quests" style={{ gridColumn: phone ? 'span 1' : 'span 3' }}>
            <BuddyCompanion
              daysSince={daysSinceDone}
              streak={habits.reduce((m, h) => Math.max(m, streak(ticks, h.id)), 0)}
              xp={tasks.filter((t) => t.done).length * 20 + ticks.length * 10}
              onStartFocus={() => setFocusOpen(true)}
            />
          </div>

          {/* Today */}
          <div data-tour="home-timeline" style={CARD}>
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
            <div style={{ marginBottom: 11 }}>
              <AsciiBar value={spentPct} cells={26} hue={AMBER} suffix="% spent" label="Budget used this month" />
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 500, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
              {accounts.map((a) => <span key={a.id}>{a.name} {peso(balances.get(a.id) ?? 0)}</span>)}
            </div>
            {/* Rotating motivational line on the tloop keyframe. */}
            <RotatingQuote />
          </div>

          {/* Deadlines */}
          <div style={CARD}>
            <div style={KICKER}>Deadlines</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {deadlines.length === 0 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Nothing due soon.</div>}
              {deadlines.map((d) => (
                <div
                  key={d.id}
                  onClick={() => router.push(`/tasks?detail=${d.id}`)}
                  className="hov k-squish"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: d.days <= 7 ? AMBER : 'var(--tx2)', width: 40, fontVariantNumeric: 'tabular-nums' }}>
                    {d.days}d
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
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
                  <AsciiBar value={p.progress} cells={28} hue={p.color} showValue={false} label={`${p.name} progress`} />
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

      {/* Focus Station Dialog Modal. Portalled: `main` carries the zoom pref
          and the page-entry transform, so a fixed overlay rendered inside it is
          positioned against `main` rather than the viewport (HANDOFF fact 2). */}
      {focusOpen && typeof document !== 'undefined' && createPortal((
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
      ), document.body)}
    </div>
  );
}

/** Journal & Scratchpad — full journal with photo captures and MorphingDialog */
function Scratchpad({ phone }: { phone: boolean }) {
  const { data: notes = [] } = useScratch();
  const A = useScratchActions();
  const [draft, setDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const [tag, setTag] = useState<string>('Journal');
  const [filter, setFilter] = useState<string>('All');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDraft(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const keep = () => {
    const t = draft.trim();
    const ttl = titleDraft.trim();
    if (!t && !ttl && !photoDraft) {
      toast('Type something or add a photo first');
      return;
    }
    A.add.mutate({
      id: crypto.randomUUID(),
      title: ttl || undefined,
      text: t,
      photo_url: photoDraft || undefined,
      tag,
      color: TAG_COLOR[tag] || PAL.amber,
    });
    setDraft('');
    setTitleDraft('');
    setPhotoDraft(null);
    toast('Added to Journal ✨');
  };

  const shown = filter === 'All' ? notes : notes.filter((n) => n.tag === filter);

  const toTask = async (n: Scratch) => {
    try {
      const user_id = await currentUserId();
      const { data: list } = await supabase.from('bd_lists').select('id').order('position').limit(1).maybeSingle();
      const { error } = await supabase.from('bd_tasks').insert({ user_id, title: n.title ? `${n.title}: ${n.text}` : n.text, list_id: list?.id ?? null });
      if (error) throw error;
      A.removeWithUndo(n);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast('Turned into a task');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create task');
    }
  };

  return (
    <div style={{
      ...CARD,
      gridColumn: phone ? 'auto' : 'span 2',
      background: 'color-mix(in srgb, #FFF9E6 10%, var(--card))',
      border: '1px solid color-mix(in srgb, #F5B33C 32%, var(--line))',
      boxShadow: '0 4px 20px rgba(245, 179, 60, 0.05), var(--sh)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pal-amber)' }} />
          <div style={{ ...KICKER, color: 'var(--pal-amber)' }}>Daily Journal & Capture</div>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)' }}>{notes.length} entries</div>
      </div>

      {/* Composer Container */}
      <div style={{
        borderRadius: 14,
        background: 'color-mix(in srgb, #FFF9E6 16%, var(--card2))',
        border: '1px solid color-mix(in srgb, #F5B33C 28%, var(--line))',
        padding: '10px 12px',
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flex: 'none', color: 'var(--pal-amber)' }}>
            <PlusIcon size={16} />
          </div>
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Title (optional)..."
            style={{
              flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--tx)',
              background: 'transparent', border: 'none', outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach photo to your day"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
              background: photoDraft ? 'color-mix(in srgb, var(--pal-amber) 25%, transparent)' : 'var(--card)',
              border: '1px solid var(--line)', color: photoDraft ? 'var(--pal-amber)' : 'var(--tx2)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Camera size={13} />
            <span>{photoDraft ? 'Photo Added' : 'Add Photo'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
        </div>

        {photoDraft && (
          <div style={{ position: 'relative', width: 80, height: 60, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line2)' }}>
            <img loading="lazy" decoding="async" src={photoDraft} alt="Attached preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              type="button"
              onClick={() => setPhotoDraft(null)}
              style={{
                position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center', border: 'none',
              }}
            >
              ✕
            </button>
          </div>
        )}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); keep(); } }}
          rows={2}
          placeholder="Capture thoughts, moments, or photos of your day..."
          style={{
            width: '100%', fontSize: 12.5, lineHeight: 1.5, color: 'var(--tx)',
            resize: 'none', fontFamily: 'inherit', background: 'transparent', border: 'none', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {SCRATCH_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                style={{
                  padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                  background: tag === t ? `color-mix(in srgb, ${TAG_COLOR[t]} 25%, transparent)` : 'transparent',
                  color: tag === t ? TAG_COLOR[t] : 'var(--tx3)',
                  border: `1px solid ${tag === t ? TAG_COLOR[t] : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            onClick={keep}
            className="acc k-squish"
            style={{
              padding: '5px 14px', borderRadius: 8, background: 'var(--pal-amber)',
              color: '#0A0912', fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer',
            }}
          >
            Keep
          </button>
        </div>
      </div>

      {/* Tag Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {['All', ...SCRATCH_TAGS].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700,
              background: filter === f ? 'color-mix(in srgb, var(--pal-amber) 20%, transparent)' : 'transparent',
              color: filter === f ? 'var(--pal-amber)' : 'var(--tx3)',
              border: 'none', cursor: 'pointer',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Journal Cards List with MorphingDialog */}
      <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {shown.map((n) => (
          <JournalCard key={n.id} n={n} A={A} onToTask={toTask} />
        ))}
        {shown.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '8px 2px' }}>
            No journal entries kept under this tag yet.
          </div>
        )}
      </div>
    </div>
  );
}

function JournalCard({
  n,
  A,
  onToTask,
}: {
  n: Scratch;
  A: ReturnType<typeof useScratchActions>;
  onToTask: (n: Scratch) => void;
}) {
  return (
    <MorphingDialog
      transition={{
        type: 'spring',
        bounce: 0.05,
        duration: 0.25,
      }}
    >
      <MorphingDialogTrigger
        style={{ borderRadius: '12px' }}
        className="flex flex-col overflow-hidden border border-zinc-800/60 bg-[var(--card2)] transition-all hover:border-zinc-700/80 shadow-sm"
      >
        {n.photo_url && (
          <MorphingDialogImage
            src={n.photo_url}
            alt={n.title || n.text}
            className="h-36 w-full object-cover"
          />
        )}
        <div className="flex grow flex-col p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              style={{
                padding: '2px 6px',
                borderRadius: 5,
                fontSize: 9.5,
                fontWeight: 800,
                color: n.color,
                background: `color-mix(in srgb, ${n.color} 16%, transparent)`,
              }}
            >
              {n.tag}
            </span>
            <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{ago(n.created_at)}</span>
          </div>

          {n.title && (
            <MorphingDialogTitle className="text-sm font-bold text-[var(--tx)] line-clamp-1 mb-1">
              {n.title}
            </MorphingDialogTitle>
          )}

          <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.45, textWrap: 'pretty' }} className="line-clamp-3">
            {n.text}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToTask(n);
              }}
              className="hov"
              title="Turn into a task"
              style={{
                padding: '2px 6px', borderRadius: 5, border: '1px solid var(--line2)',
                fontSize: 10, fontWeight: 700, color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <CheckSquare size={10} />
              <span>→ Task</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                A.save.mutate({ id: n.id, patch: { pinned: !n.pinned } });
              }}
              className="hov"
              title={n.pinned ? 'Unpin' : 'Pin to top'}
              style={{
                marginLeft: 'auto', padding: '2px 5px', borderRadius: 5, fontSize: 10,
                color: n.pinned ? 'var(--pal-amber)' : 'var(--tx3)', border: 'none', background: 'transparent',
              }}
            >
              <Pin size={11} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                A.removeWithUndo(n);
              }}
              className="hov"
              title="Delete"
              style={{ padding: '2px 5px', borderRadius: 5, color: 'var(--tx3)', border: 'none', background: 'transparent' }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </MorphingDialogTrigger>

      <MorphingDialogContainer>
        <MorphingDialogContent
          style={{ borderRadius: '20px' }}
          className="pointer-events-auto relative flex h-auto w-full max-w-lg flex-col overflow-hidden border border-zinc-700 bg-[var(--card)] shadow-2xl"
        >
          {n.photo_url && (
            <MorphingDialogImage
              src={n.photo_url}
              alt={n.title || n.text}
              className="h-64 w-full object-cover"
            />
          )}
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: n.color,
                  background: `color-mix(in srgb, ${n.color} 18%, transparent)`,
                }}
              >
                {n.tag}
              </span>
              <MorphingDialogSubtitle className="text-xs text-[var(--tx3)]">
                {new Date(n.created_at).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })} · {ago(n.created_at)}
              </MorphingDialogSubtitle>
            </div>

            {n.title && (
              <MorphingDialogTitle className="text-xl font-extrabold text-[var(--tx)] mb-2">
                {n.title}
              </MorphingDialogTitle>
            )}

            <MorphingDialogDescription
              disableLayoutAnimation
              variants={{
                initial: { opacity: 0, scale: 0.95, y: 20 },
                animate: { opacity: 1, scale: 1, y: 0 },
                exit: { opacity: 0, scale: 0.95, y: 20 },
              }}
            >
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--tx)] whitespace-pre-wrap">
                {n.text}
              </p>
            </MorphingDialogDescription>
          </div>
          <MorphingDialogClose className="text-white" />
        </MorphingDialogContent>
      </MorphingDialogContainer>
    </MorphingDialog>
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

/**
 * The seconds countdown, with its own timer.
 *
 * This was setNow(Date.now()) on a 1s interval in HomePage, which re-rendered
 * the entire page — every task row, event row, note, habit and project card —
 * once a second to move three digits. Nothing else on the page needs second
 * precision, so the timer belongs to the digits.
 */
function UpNextCountdown({ startsAt, endsAt, color }: { startsAt: string; endsAt: string; color: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const ongoing = startMs <= now && endMs > now;
  const target = ongoing ? endMs : startMs;
  const total = Math.floor(Math.max(0, target - now) / 1000);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  // Real, accurate percentage based on actual time elapsed:
  // If ongoing: percentage of event duration completed (0% to 100%).
  // If upcoming: percentage of time elapsed today towards the event start.
  let pct = 0;
  if (ongoing) {
    const duration = Math.max(1000, endMs - startMs);
    const elapsed = Math.max(0, now - startMs);
    pct = Math.min(100, Math.round((elapsed / duration) * 100));
  } else if (startMs > now) {
    const startOfDay = new Date(startsAt);
    startOfDay.setHours(0, 0, 0, 0);
    const totalWait = Math.max(1000, startMs - startOfDay.getTime());
    const elapsedWait = Math.max(0, now - startOfDay.getTime());
    pct = Math.min(100, Math.max(0, Math.round((elapsedWait / totalWait) * 100)));
  }

  return (
    <>
                      {/* Seconds Countdown Box */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 14px', borderRadius: 12, margin: '8px 0 10px',
                        background: `color-mix(in srgb, ${color} 18%, var(--card2))`,
                        border: `1.5px solid color-mix(in srgb, ${color} 45%, transparent)`,
                        boxShadow: `0 3px 12px color-mix(in srgb, ${color} 18%, transparent)`,
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
                          color: color, textAlign: 'center', width: '100%',
                        }}>
                          <Icon name="clock" size={12} color={color} />
                          <span>{ongoing ? 'Ends in' : 'Starts in'}</span>
                        </div>

                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          fontSize: 25, fontWeight: 800, color: 'var(--tx)',
                          fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          padding: '4px 0 2px',
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span>{String(hrs).padStart(2, '0')}</span>
                            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.06em' }}>HRS</span>
                          </div>
                          <span style={{ color: color, marginTop: -10 }}>:</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span>{String(mins).padStart(2, '0')}</span>
                            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.06em' }}>MIN</span>
                          </div>
                          <span style={{ color: color, marginTop: -10 }}>:</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ color: color }}>{String(secs).padStart(2, '0')}</span>
                            <span style={{ fontSize: 8.5, fontWeight: 700, color: color, letterSpacing: '.06em' }}>SEC</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <AsciiBar value={pct} cells={30} hue={ongoing ? PAL.mint : color} showValue={false}
                          label={ongoing ? 'Time elapsed' : 'Time until it starts'} />
                      </div>
    </>
  );
}

/**
 * The rotating line, with its own timer. Cycling it in HomePage re-rendered
 * the whole page every seven seconds to swap one string.
 */
function RotatingQuote() {
  const [quote, setQuote] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 7000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ marginTop: 10, minHeight: 30, overflow: 'hidden' }}>
      <div key={quote} style={{
        fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx3)', textWrap: 'pretty',
        animation: 'tloop 7s cubic-bezier(.22,1,.36,1) both',
        animationPlayState: 'var(--anim, running)' as React.CSSProperties['animationPlayState'],
      }}>
        {QUOTES[quote]}
      </div>
    </div>
  );
}
