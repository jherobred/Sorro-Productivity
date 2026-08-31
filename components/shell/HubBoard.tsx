'use client';

import { Icon, type IconName } from '../Icon';
import { AsciiBar } from '../AsciiBar';
import { useToday, untilLabel } from '@/lib/today';
import { useTasks } from '@/lib/tasks';
import { useHabits, useTicks, ymd } from '@/lib/habits';
import { peso } from '@/lib/money';
import { SECHUE } from '@/lib/pal';

/**
 * The L2 home surface.
 *
 * Home already rebuilt six other sections as summary cards; this stops treating
 * that as duplication and makes it the navigation. Every card states the
 * section's live number and opens the section, so there is one place a summary
 * is written rather than two that drift.
 *
 * A card with nothing to say says so, rather than rendering an empty frame —
 * "Nothing due" is information, an empty box is a bug the reader has to rule
 * out.
 */

type CardDef = {
  id: string;
  name: string;
  icon: IconName;
  hue: string;
  badge?: string;
  body: React.ReactNode;
};

const CARD: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
  padding: 14, display: 'flex', flexDirection: 'column', gap: 9,
  minWidth: 0, textAlign: 'left', overflow: 'hidden',
};

export function HubBoard({ go, phone }: { go: (id: string) => void; phone: boolean }) {
  const t = useToday();
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(1);

  const today = ymd(new Date());
  const doneIds = new Set(ticks.filter((x) => x.on_date === today).map((x) => x.habit_id));
  const open = tasks.filter((x) => !x.done && !x.deleted_at);

  const line = (s: string) => (
    <div style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</div>
  );
  const quiet = (s: string) => <div className="metaline">{s}</div>;

  const cards: CardDef[] = [
    {
      id: 'calendar', name: 'Calendar', icon: 'cal', hue: SECHUE.calendar,
      badge: t.events.length ? String(t.events.length) : undefined,
      body: t.events.length ? (
        <>
          {t.events.slice(0, 3).map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
              <span className="num" style={{ width: 36, flex: 'none', fontSize: 11, color: 'var(--tx3)' }}>
                {e.starts_at.slice(11, 16)}
              </span>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: 2, flex: 'none',
                background: e.color || SECHUE.calendar, marginTop: 4,
              }} />
              {line(e.title)}
            </div>
          ))}
          {t.next && quiet(`${t.next.title} ${untilLabel(t.minsTo, t.ongoing)}`)}
        </>
      ) : quiet('Your schedule is clear'),
    },
    {
      id: 'tasks', name: 'Tasks', icon: 'task', hue: SECHUE.tasks,
      badge: open.length ? String(open.length) : undefined,
      body: open.length ? (
        <>
          {open.slice(0, 4).map((x) => (
            <div key={x.id} style={{ display: 'flex', gap: 9, alignItems: 'center', minWidth: 0 }}>
              <span aria-hidden style={{
                width: 14, height: 14, flex: 'none', borderRadius: 4,
                border: '1.6px solid var(--line2)',
              }} />
              {line(x.title)}
            </div>
          ))}
          {quiet(`${t.dueToday} due today${t.overdue ? ` · ${t.overdue} overdue` : ''}`)}
        </>
      ) : quiet('Nothing open'),
    },
    {
      id: 'habits', name: 'Habits', icon: 'habit', hue: SECHUE.habits,
      badge: habits.length ? `${t.habitsDone}/${habits.length}` : undefined,
      body: habits.length ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {habits.slice(0, 8).map((h) => (
              <span key={h.id} aria-hidden title={h.name} style={{
                width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: doneIds.has(h.id)
                  ? `color-mix(in srgb, ${h.color || SECHUE.habits} 24%, transparent)`
                  : 'var(--card2)',
                border: `1px solid ${doneIds.has(h.id) ? h.color || SECHUE.habits : 'var(--line2)'}`,
              }}>
                <Icon name="check" size={11} color={doneIds.has(h.id) ? (h.color || SECHUE.habits) : 'var(--tx3)'} />
              </span>
            ))}
          </div>
          <AsciiBar value={habits.length ? (t.habitsDone / habits.length) * 100 : 0}
            cells={16} hue={SECHUE.habits} showValue={false} label="Habits ticked today" />
        </>
      ) : quiet('No habits yet'),
    },
    {
      id: 'money', name: 'Money', icon: 'money', hue: SECHUE.money,
      body: t.leftCentavos !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--tx)' }}>
              {peso(t.leftCentavos)}
            </span>
            <span className="metaline">left this month</span>
          </div>
          <AsciiBar value={t.spentPct} cells={18} hue={SECHUE.money} suffix="% spent" label="Budget used" />
        </>
      ) : quiet('No budgets set'),
    },
    {
      id: 'notebooks', name: 'Notebooks', icon: 'book', hue: SECHUE.notebooks,
      body: <>{line('Notebooks, Canvas, Graph, Journal')}{quiet('Open to pick up where you left off')}</>,
    },
    {
      id: 'projects', name: 'Projects', icon: 'proj', hue: SECHUE.projects,
      body: <>{line('Boards, milestones and owners')}{quiet('Open the board')}</>,
    },
    {
      id: 'gym', name: 'Gym', icon: 'heart', hue: SECHUE.gym,
      body: <>{line('Your split and this week’s volume')}{quiet('Start today’s routine')}</>,
    },
    {
      id: 'fuel', name: 'Fuel', icon: 'food', hue: SECHUE.fuel,
      body: <>{line('Water, meals, steps and sleep')}{quiet('What you have taken in today')}</>,
    },
    {
      id: 'community', name: 'Community', icon: 'chat', hue: 'var(--acc)',
      body: <>{line('Feed, Messages and Challenges')}{quiet('See what your space is doing')}</>,
    },
    {
      id: 'files', name: 'Files', icon: 'files', hue: SECHUE.files,
      body: <>{line('Everything you have attached')}{quiet('Search by name or section')}</>,
    },
    {
      id: 'people', name: 'People', icon: 'people', hue: SECHUE.people,
      body: <>{line('Your space and who is in it')}{quiet('Profiles and presence')}</>,
    },
    {
      id: 'profile', name: 'Profile', icon: 'focus', hue: SECHUE.profile,
      body: <>{line('Your rank, streaks and timeline')}{quiet('How the week actually went')}</>,
    },
    {
      id: 'home', name: 'Home', icon: 'home', hue: SECHUE.home,
      body: <>{line('The full Home page')}{quiet('Journal, focus station and the rest')}</>,
    },
  ];

  return (
    <div style={{
      display: 'grid', gap: phone ? 10 : 14, padding: phone ? '12px 14px 20px' : '20px 22px 24px',
      // Twelve cards over four columns is three equal rows that fill the frame.
      // `auto-fill` reflowed them into ragged rows the moment the window moved,
      // which is the one thing a board is supposed not to do.
      gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
      gridAutoRows: phone ? undefined : 'minmax(0, 1fr)',
      minHeight: phone ? undefined : '100%',
      alignContent: 'stretch',
    }}>
      {cards.map((c) => (
        <button key={c.id} onClick={() => go(c.id)} className="hov k-squish"
          style={{ ...CARD, borderLeft: `3px solid ${c.hue}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Icon name={c.icon} size={15} color={c.hue} />
            <span style={{
              flex: 1, fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700,
              letterSpacing: '-.01em', color: 'var(--tx)', minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{c.name}</span>
            {c.badge && (
              <span className="num" style={{
                flex: 'none', height: 20, padding: '0 7px', borderRadius: 999, fontSize: 10,
                fontWeight: 700, lineHeight: '20px', color: c.hue,
                background: `color-mix(in srgb, ${c.hue} 15%, transparent)`,
                border: `1px solid color-mix(in srgb, ${c.hue} 34%, transparent)`,
              }}>{c.badge}</span>
            )}
          </div>
          {c.body}
        </button>
      ))}
    </div>
  );
}
