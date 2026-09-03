'use client';

import { motion } from 'motion/react';
import { usePrefs } from '@/lib/prefs';
import { peso } from '@/lib/money';
import { Icon, type IconName } from '@/components/Icon';
import { localDay, type CategorySpend, type DaySpend } from '@/lib/runway';

/**
 * Money, drawn.
 *
 * Pictures instead of columns of pesos, because the questions this tab exists
 * to answer are shape questions: is it going up, which days hurt, what is
 * about to leave without asking.
 *
 * Everything here springs rather than eases. A bar that snaps to its height
 * reads as a redraw; one that overshoots slightly and settles reads as a thing
 * that moved, which is the difference between a chart and a chart you look at.
 * All of it is gated on `prefs.motion`, which is a WCAG 2.3.3 control and not a
 * taste setting — when it is off, everything is simply already in place.
 */

const CATEGORY_COLOR: Record<string, string> = {
  Food: '#34D9A0', Transport: '#7C6CFF', School: '#38D6F2',
  Bills: '#FF6B6B', Fun: '#FF6FA8', Health: '#B07CFF', Other: '#FFC24B',
};

export const colourOf = (c: string) => CATEGORY_COLOR[c] ?? CATEGORY_COLOR.Other;

/** One spring, so nothing on the tab moves to a different rhythm than the rest. */
const SPRING = { type: 'spring' as const, stiffness: 210, damping: 24, mass: 0.7 };

/** Motion props that collapse to "already there" when the preference is off. */
function useRise(on: boolean) {
  return (i = 0) =>
    on
      ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { ...SPRING, delay: i * 0.035 } }
      : {};
}

/* ------------------------------------------------------------ where it went */

/**
 * The month by category, as bars that share one scale.
 *
 * This was three isometric coin stacks. Coins are charming at four categories
 * and unreadable at seven, they cannot show a category worth 3% of the month
 * at all (one coin is the floor), and two of them in a 170px card is mostly
 * empty space. A bar has none of those problems and answers the same question
 * in the same glance.
 */
export function Stacks({
  spend, onPick, active,
}: {
  spend: CategorySpend[];
  onPick?: (c: string) => void;
  /** The category currently filtering the ledger, dimmed out of the others. */
  active?: string | null;
}) {
  const { prefs } = usePrefs();
  const rise = useRise(prefs.motion);
  const top = spend.slice(0, 7);

  if (top.length === 0) {
    return <Empty icon="money" line="Nothing spent this month yet." sub="Log something and this fills in." />;
  }

  const most = Math.max(...top.map((s) => s.total));
  const all = top.reduce((n, s) => n + s.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {top.map((s, i) => {
        const c = colourOf(s.category);
        const on = !active || active === s.category;
        return (
          <motion.button
            key={s.category}
            {...rise(i)}
            whileHover={prefs.motion && onPick ? { x: 3 } : undefined}
            whileTap={prefs.motion && onPick ? { scale: 0.985 } : undefined}
            onClick={() => onPick?.(s.category)}
            disabled={!onPick}
            aria-pressed={onPick ? active === s.category : undefined}
            aria-label={`${s.category}: ${peso(s.total)}, ${Math.round((s.total / all) * 100)} percent of the month`}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: 0, border: 'none',
              background: 'transparent', font: 'inherit', color: 'inherit',
              cursor: onPick ? 'pointer' : 'default', opacity: on ? 1 : 0.38,
              transition: 'opacity .2s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: c, flex: 'none' }} />
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{s.category}</span>
              <span className="num" style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700 }}>{peso(s.total)}</span>
              <span className="num" style={{ fontSize: 10, color: 'var(--tx3)', width: 30, textAlign: 'right' }}>
                {Math.round((s.total / all) * 100)}%
              </span>
            </span>
            <span style={{ display: 'block', height: 9, borderRadius: 5, background: 'var(--card2)', overflow: 'hidden' }}>
              <motion.span
                initial={prefs.motion ? { scaleX: 0 } : false}
                animate={{ scaleX: s.total / most }}
                transition={{ ...SPRING, delay: 0.05 + i * 0.045 }}
                style={{
                  display: 'block', height: '100%', width: '100%', borderRadius: 5, transformOrigin: 'left',
                  background: `linear-gradient(90deg, color-mix(in srgb, ${c} 55%, transparent), ${c})`,
                  boxShadow: `0 0 14px color-mix(in srgb, ${c} 35%, transparent)`,
                }}
              />
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- trend */

/**
 * Thirty days of spending, one bar a day.
 *
 * The zero days are drawn as a stub rather than skipped, so a quiet week is
 * visibly a quiet week and not a gap in the data. Today is the rightmost bar
 * and wears the accent, because "am I having an expensive day" is the question
 * people actually bring to a sparkline.
 */
export function SpendTrend({ series, hue = '#34D9A0' }: { series: DaySpend[]; hue?: string }) {
  const { prefs } = usePrefs();
  const most = Math.max(1, ...series.map((d) => d.total));
  const today = localDay(new Date());

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 62 }} role="img"
      aria-label={`Spending over the last ${series.length} days`}>
      {series.map((d, i) => {
        const isToday = d.day === today;
        // A quiet day is a visible floor, not a gap: a sparkline with holes in
        // it reads as missing data rather than as a day nothing was spent.
        const h = d.total === 0 ? 0.055 : Math.max(0.12, d.total / most);
        return (
          <motion.span
            key={d.day}
            title={`${new Date(d.day + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${peso(d.total)}`}
            initial={prefs.motion ? { scaleY: 0 } : false}
            animate={{ scaleY: h }}
            transition={{ ...SPRING, delay: i * 0.012 }}
            style={{
              flex: 1, minWidth: 0, height: '100%', borderRadius: 3, transformOrigin: 'bottom',
              background: isToday
                ? `linear-gradient(180deg, #FFFFFF, ${hue})`
                : d.total === 0 ? 'var(--line2)' : `color-mix(in srgb, ${hue} ${45 + h * 45}%, transparent)`,
              boxShadow: isToday ? `0 0 12px color-mix(in srgb, ${hue} 55%, transparent)` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- heatmap */

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The month as a grid, each day tinted by what it cost.
 *
 * Five steps, not a continuous ramp: a gradient across thirty small squares is
 * a gradient nobody can read back to a number, whereas five steps can be
 * matched to the legend underneath. Clicking a day filters the ledger to it,
 * and clicking it again clears — the same row is the on and the off.
 */
export function MonthHeatmap({
  days, hue = '#34D9A0', selected, onPick, weekStart = 'mon',
}: {
  days: DaySpend[];
  hue?: string;
  selected?: string | null;
  onPick?: (day: string | null) => void;
  weekStart?: 'mon' | 'sun';
}) {
  const { prefs } = usePrefs();
  const most = Math.max(1, ...days.map((d) => d.total));
  const today = localDay(new Date());

  if (days.length === 0) return null;

  // getDay() is Sunday-first; the grid may not be. This is how many blanks sit
  // before the 1st so it lands under the right weekday.
  const firstDow = new Date(days[0].day + 'T00:00').getDay();
  const lead = weekStart === 'mon' ? (firstDow + 6) % 7 : firstDow;
  const heads = weekStart === 'mon' ? WEEK : [WEEK[6], ...WEEK.slice(0, 6)];

  const step = (total: number) => (total === 0 ? 0 : Math.ceil((total / most) * 4));
  const tint = (s: number) =>
    s === 0 ? 'var(--card2)' : `color-mix(in srgb, ${hue} ${s * 22 + 12}%, transparent)`;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 5 }}>
        {heads.map((w, i) => (
          <span key={i} className="num" aria-hidden
            style={{ fontSize: 8.5, color: 'var(--tx3)', textAlign: 'center', letterSpacing: '.08em' }}>
            {w}
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: lead }, (_, i) => <span key={`pad${i}`} aria-hidden />)}
        {days.map((d, i) => {
          const s = step(d.total);
          const isToday = d.day === today;
          const on = selected === d.day;
          const n = Number(d.day.slice(8));
          return (
            <motion.button
              key={d.day}
              initial={prefs.motion ? { opacity: 0, scale: 0.6 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...SPRING, delay: i * 0.008 }}
              whileHover={prefs.motion ? { scale: 1.14, zIndex: 1 } : undefined}
              whileTap={prefs.motion ? { scale: 0.92 } : undefined}
              onClick={() => onPick?.(on ? null : d.day)}
              disabled={!onPick}
              aria-pressed={onPick ? on : undefined}
              aria-label={`${new Date(d.day + 'T00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}: ${d.total === 0 ? 'nothing spent' : peso(d.total)}`}
              title={`${n} · ${d.total === 0 ? 'nothing' : peso(d.total)}`}
              style={{
                aspectRatio: '1', borderRadius: 5, padding: 0, cursor: onPick ? 'pointer' : 'default',
                background: tint(s),
                border: on ? '1.5px solid var(--tx)' : isToday ? `1.5px solid ${hue}` : '1px solid transparent',
                color: s >= 3 ? '#08130E' : 'var(--tx3)',
                fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700,
                display: 'grid', placeItems: 'center',
              }}
            >
              {n}
            </motion.button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 9 }}>
        <span className="num" style={{ fontSize: 8.5, color: 'var(--tx3)' }}>QUIET</span>
        {[0, 1, 2, 3, 4].map((s) => (
          <span key={s} aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: tint(s) }} />
        ))}
        <span className="num" style={{ fontSize: 8.5, color: 'var(--tx3)' }}>{peso(most)}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- coming up */

export type Upcoming = {
  id: string;
  kind: 'sub' | 'goal';
  name: string;
  amount: number;
  /** ISO date, or null for a goal with no deadline. */
  on: string | null;
  /** Goals only: 0–100. */
  progress?: number;
};

/**
 * What is about to leave, and what you are saving towards, on one strip.
 *
 * A subscription and a goal are the same kind of fact — money already spoken
 * for — and reading them off two lists at opposite ends of the page is how a
 * ₱149 charge surprises somebody every month. Sorted by date, undated goals
 * last, and anything inside a week is called out rather than left to be
 * counted off a calendar.
 */
export function ComingUp({ items, onOpen }: { items: Upcoming[]; onOpen?: (u: Upcoming) => void }) {
  const { prefs } = usePrefs();
  const rise = useRise(prefs.motion);

  if (items.length === 0) {
    return <Empty icon="clock" line="Nothing scheduled." sub="Subscriptions and goals show up here." />;
  }

  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((u, i) => {
        const days = u.on ? Math.round((new Date(u.on + 'T00:00').getTime() - midnight) / 86_400_000) : null;
        const soon = days !== null && days <= 7;
        const late = days !== null && days < 0;
        const hue = u.kind === 'goal' ? '#7C6CFF' : late ? '#FF6B6B' : soon ? '#FFC24B' : '#34D9A0';

        return (
          <motion.button
            key={`${u.kind}:${u.id}`}
            {...rise(i)}
            whileHover={prefs.motion && onOpen ? { x: 3 } : undefined}
            whileTap={prefs.motion && onOpen ? { scale: 0.985 } : undefined}
            onClick={() => onOpen?.(u)}
            disabled={!onOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
              padding: '8px 7px', borderRadius: 9, border: 'none', background: 'transparent',
              font: 'inherit', color: 'inherit', cursor: onOpen ? 'pointer' : 'default',
            }}
            className={onOpen ? 'hov' : undefined}
          >
            <span aria-hidden style={{
              width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center',
              background: `color-mix(in srgb, ${hue} 16%, transparent)`,
            }}>
              <Icon name={u.kind === 'goal' ? 'target' : 'refresh'} size={13} color={hue} />
            </span>

            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.name}
              </span>
              <span className="num" style={{ display: 'block', fontSize: 9.5, color: soon || late ? hue : 'var(--tx3)', marginTop: 1 }}>
                {u.kind === 'goal'
                  ? `${u.progress ?? 0}% saved${days === null ? '' : late ? ` · ${-days}d overdue` : ` · ${days}d left`}`
                  : days === null ? 'no date set'
                  : late ? `${-days}d overdue`
                  : days === 0 ? 'charges today'
                  : days === 1 ? 'charges tomorrow'
                  : `in ${days} days`}
              </span>
            </span>

            <span className="num" style={{ fontSize: 12, fontWeight: 700, flex: 'none' }}>{peso(u.amount)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Subs and goals merged and sorted the way ComingUp wants them. */
export function toUpcoming(
  subs: { id: string; name: string; amount_centavos: number; next_charge: string | null }[],
  goals: { id: string; name: string; target_centavos: number; saved_centavos: number; due_on: string | null }[],
): Upcoming[] {
  const rows: Upcoming[] = [
    ...subs.map((s) => ({
      id: s.id, kind: 'sub' as const, name: s.name, amount: s.amount_centavos,
      on: s.next_charge?.slice(0, 10) ?? null,
    })),
    ...goals.map((g) => ({
      id: g.id, kind: 'goal' as const, name: g.name,
      amount: Math.max(0, g.target_centavos - g.saved_centavos),
      on: g.due_on?.slice(0, 10) ?? null,
      progress: Math.min(100, Math.round((g.saved_centavos / Math.max(1, g.target_centavos)) * 100)),
    })),
  ];
  // Undated rows sort last rather than to 1970.
  return rows.sort((a, b) => (a.on ?? '9999').localeCompare(b.on ?? '9999'));
}

/* ---------------------------------------------------------- insight tiles */

/**
 * Three numbers that need no chart.
 *
 * Each is a comparison rather than a total, because a total is already
 * elsewhere on the page and a comparison is the thing you cannot get by
 * looking at one.
 */
export function Insight({
  label, value, sub, hue, icon, delay = 0,
}: {
  label: string; value: string; sub?: string; hue: string; icon: IconName; delay?: number;
}) {
  const { prefs } = usePrefs();

  return (
    <motion.div
      initial={prefs.motion ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
      whileHover={prefs.motion ? { y: -3 } : undefined}
      style={{
        minWidth: 0, padding: '10px 11px', borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={11} color={hue} />
        <span className="num" style={{ fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
          {label}
        </span>
      </span>
      <span className="num" style={{
        fontSize: 16, fontWeight: 800, letterSpacing: '-.035em', color: hue, lineHeight: 1.1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------- empty */

/** One empty state, so a card with nothing in it still looks built. */
export function Empty({ icon, line, sub }: { icon: IconName; line: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 5, padding: '22px 10px', textAlign: 'center',
    }}>
      <span aria-hidden style={{
        width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center',
        background: 'var(--card2)', border: '1px dashed var(--line2)',
      }}>
        <Icon name={icon} size={15} color="var(--tx3)" />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>{line}</span>
      {sub && <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{sub}</span>}
    </div>
  );
}
