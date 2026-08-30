'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '../AsciiBar';
import { streak, maxStreak, ymd, type Habit, type Tick } from '@/lib/habits';
import { SECHUE } from '@/lib/pal';

/**
 * The Habits column: what actually happened, and how long it has been going.
 *
 * Deliberately not the analytics view next door. That one leads with a level,
 * an XP bar and a wall of trophies — a score for having used the app, which
 * says nothing about whether the habits are holding. This says the two things
 * that do: the run you are on, and the share of days you actually hit.
 *
 * Every number here is derived from ticks, so there is nothing to keep in sync.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The last `n` dates as ymd strings, oldest first. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(ymd(x));
  }
  return out;
}

export function HabitStats({
  habits, ticks, width = 300, phone = false,
}: {
  habits: Habit[];
  ticks: Tick[];
  width?: number;
  phone?: boolean;
}) {
  const stats = useMemo(() => {
    const active = habits.filter((h) => !h.archived_at);
    const days = lastDays(30);
    const today = ymd(new Date());

    /** habit ids ticked, per day. */
    const byDay = new Map<string, Set<string>>();
    for (const t of ticks) {
      if (!byDay.has(t.on_date)) byDay.set(t.on_date, new Set());
      byDay.get(t.on_date)!.add(t.habit_id);
    }

    const perDay = days.map((d) => byDay.get(d)?.size ?? 0);
    const doneToday = byDay.get(today)?.size ?? 0;

    // ponytail: treats every habit as due every day. Habits carry a frequency,
    // and a three-times-a-week habit is not failing on the other four — so this
    // reads low for anyone using them. Weight by frequency when that matters.
    const possible = Math.max(1, active.length);
    const rate = days.length
      ? Math.round((perDay.reduce((a, b) => a + b, 0) / (possible * days.length)) * 100)
      : 0;

    const perfect = perDay.filter((n) => active.length > 0 && n >= active.length).length;

    // Which weekday you actually show up on, over the window.
    const dow = [0, 0, 0, 0, 0, 0, 0];
    days.forEach((d, i) => { dow[new Date(`${d}T00:00:00`).getDay()] += perDay[i]; });
    const bestDow = dow.indexOf(Math.max(...dow));
    const anyDow = dow.some((n) => n > 0);

    const runs = active
      .map((h) => ({ h, now: streak(ticks, h.id), best: maxStreak(ticks, h.id) }))
      .sort((a, b) => b.now - a.now || b.best - a.best);

    return {
      active, perDay, doneToday, rate, perfect, runs, bestDow, anyDow,
      current: runs.reduce((m, r) => Math.max(m, r.now), 0),
      longest: runs.reduce((m, r) => Math.max(m, r.best), 0),
    };
  }, [habits, ticks]);

  const maxDay = Math.max(1, ...stats.perDay);

  const Metric = ({ label, value, sub, hue }: { label: string; value: string; sub?: string; hue?: string }) => (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
      padding: '11px 12px', minWidth: 0,
    }}>
      <div className="kicker">{label}</div>
      <div className="num" style={{
        fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15,
        color: hue ?? 'var(--tx)', marginTop: 3,
      }}>{value}</div>
      {sub && <div className="metaline" style={{ marginTop: 1 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{
      width: phone ? '100%' : width, minWidth: phone ? 0 : width, flex: 'none',
      display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="habit" size={15} color={SECHUE.habits} />
        <span style={{
          fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, letterSpacing: '-.02em',
        }}>Analytics</span>
        <span className="metaline" style={{ marginLeft: 'auto' }}>Last 30 days</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Metric label="Current run" value={`${stats.current}d`} hue={SECHUE.habits}
          sub={stats.current > 0 ? 'and counting' : 'start one today'} />
        <Metric label="Longest ever" value={`${stats.longest}d`} />
        <Metric label="Hit rate" value={`${stats.rate}%`}
          sub={`${stats.active.length} habit${stats.active.length === 1 ? '' : 's'}`} />
        <Metric label="Perfect days" value={String(stats.perfect)} sub="all of them, in 30" />
      </div>

      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 13px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
          <span className="kicker">Today</span>
          <span className="num metaline" style={{ marginLeft: 'auto' }}>
            {stats.doneToday} of {stats.active.length}
          </span>
        </div>
        <AsciiBar
          value={stats.active.length ? (stats.doneToday / stats.active.length) * 100 : 0}
          cells={22} hue={SECHUE.habits} showValue={false} label="Habits done today" />
      </div>

      {/* Thirty columns, one per day. A bar chart is the only thing here that
          shows a slide starting before a streak counter admits to it. */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 13px',
      }}>
        <div className="kicker" style={{ marginBottom: 10 }}>Last 30 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 54 }} aria-hidden>
          {stats.perDay.map((n, i) => (
            <span key={i} title={`${n} done`} style={{
              flex: 1, minWidth: 0,
              height: `${Math.max(4, (n / maxDay) * 100)}%`,
              borderRadius: 2,
              background: n === 0
                ? 'var(--line2)'
                : `color-mix(in srgb, ${SECHUE.habits} ${40 + (n / maxDay) * 60}%, transparent)`,
            }} />
          ))}
        </div>
        <div className="metaline" style={{ marginTop: 8 }}>
          {stats.anyDow
            ? <>Strongest on <strong style={{ color: 'var(--tx2)' }}>{DAY_NAMES[stats.bestDow]}</strong></>
            : 'No ticks in this window yet'}
        </div>
      </div>

      <div className="navsb" style={{
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
        padding: '12px 13px', minHeight: 0, overflowY: 'auto',
      }}>
        <div className="kicker" style={{ marginBottom: 9 }}>Streaks</div>
        {stats.runs.length === 0 && <div className="metaline">No habits yet.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {stats.runs.map(({ h, now, best }) => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: 2, flex: 'none', background: h.color || SECHUE.habits,
              }} />
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12, color: 'var(--tx2)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{h.name}</span>
              <span className="num" style={{
                fontSize: 12, fontWeight: 700, color: now > 0 ? (h.color || SECHUE.habits) : 'var(--tx3)',
              }}>{now}d</span>
              <span className="num metaline" style={{ width: 34, textAlign: 'right' }}>
                {best > 0 ? `/${best}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
