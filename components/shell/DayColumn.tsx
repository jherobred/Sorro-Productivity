'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useToday } from '@/lib/today';
import { useTasks } from '@/lib/tasks';
import { ymd } from '@/lib/habits';
import { SECHUE } from '@/lib/pal';

/**
 * The L4 frame: today's hour grid, always on the left.
 *
 * The grid runs a fixed window rather than all 24 hours, because a column that
 * shows 03:00 is a column that has less room for the hours you are awake for.
 * It opens on the earliest of 07:00, the first event, and the current hour, and
 * runs to the latest of 21:00 and the last event's end.
 *
 * Anything dated but unscheduled sits in the tray at the bottom. That tray is
 * the honest half of "drag it onto the day": the items are visible and one tap
 * from the calendar, which is where the actual scheduling happens.
 */

const PX_PER_HOUR = 46;
const TICK_MS = 60_000;

function hourOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export function DayColumn({ width = 320, go }: { width?: number; go: (id: string) => void }) {
  const t = useToday();
  const { data: tasks = [] } = useTasks();
  const [now, setNow] = useState(() => new Date());

  // One minute is the resolution of the line; a second would repaint the whole
  // column sixty times as often to move it under a pixel.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const nowH = now.getHours() + now.getMinutes() / 60;
  const starts = t.events.map((e) => hourOf(e.starts_at));
  const ends = t.events.map((e) => hourOf(e.ends_at));

  const from = Math.floor(Math.min(7, nowH, ...(starts.length ? starts : [7])));
  const to = Math.ceil(Math.max(21, ...(ends.length ? ends : [21])));
  const hours = Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);

  const today = ymd(now);
  const tray = tasks
    .filter((t2) => !t2.done && !t2.deleted_at && t2.due_on === today && !t2.due_at)
    .slice(0, 6);

  const top = (h: number) => (h - from) * PX_PER_HOUR;

  return (
    <div style={{
      width, minWidth: width, flex: 'none', display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--line)', background: 'var(--panel)', minHeight: 0,
    }}>
      <div style={{
        padding: '13px 16px 11px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 9, flex: 'none',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, letterSpacing: '-.02em' }}>
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' })}
          </div>
          <div className="metaline">
            {now.toLocaleDateString(undefined, { month: 'long' })} · {t.events.length} today
          </div>
        </div>
        <button onClick={() => go('calendar')} className="hov k-squish" style={{
          marginLeft: 'auto', height: 26, padding: '0 10px', borderRadius: 999, flex: 'none',
          border: '1px solid var(--line2)', background: 'var(--card2)',
          fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
        }}>Open</button>
      </div>

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 12px 8px' }}>
        <div style={{ position: 'relative', height: hours.length * PX_PER_HOUR }}>
          {hours.map((h) => (
            <div key={h}>
              <div aria-hidden style={{
                position: 'absolute', left: 40, right: 4, top: top(h),
                borderTop: '1px solid var(--line)',
              }} />
              <div className="num" aria-hidden style={{
                position: 'absolute', left: 0, width: 34, top: top(h) - 6,
                textAlign: 'right', fontSize: 9.5, color: 'var(--tx3)',
              }}>
                {String(h % 24).padStart(2, '0')}:00
              </div>
            </div>
          ))}

          {t.events.map((e) => {
            const s = hourOf(e.starts_at);
            const dur = Math.max(0.5, hourOf(e.ends_at) - s);
            const hue = e.color || SECHUE.calendar;
            return (
              <button key={e.id} onClick={() => go('calendar')} title={e.title} style={{
                position: 'absolute', left: 44, right: 6,
                top: top(s), height: dur * PX_PER_HOUR - 4,
                borderRadius: 9, padding: '6px 9px', textAlign: 'left', overflow: 'hidden',
                borderLeft: `3px solid ${hue}`,
                background: `color-mix(in srgb, ${hue} 15%, var(--card))`,
                display: 'flex', flexDirection: 'column', gap: 1,
              }}>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: 'var(--tx)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{e.title}</span>
                <span className="metaline num">
                  {e.starts_at.slice(11, 16)}–{e.ends_at.slice(11, 16)}
                </span>
                {dur > 1.2 && e.location && (
                  <span className="metaline" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.location}
                  </span>
                )}
              </button>
            );
          })}

          {nowH >= from && nowH <= to + 1 && (
            <div aria-hidden style={{
              position: 'absolute', left: 36, right: 4, top: top(nowH),
              height: 1.5, background: '#FF6B6B', zIndex: 2,
            }}>
              <span style={{
                position: 'absolute', left: -4, top: -3.2, width: 8, height: 8,
                borderRadius: '50%', background: '#FF6B6B',
              }} />
            </div>
          )}
        </div>
      </div>

      {tray.length > 0 && (
        <div style={{
          flex: 'none', borderTop: '1px solid var(--line)', padding: '9px 12px 11px',
          display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden',
        }}>
          <span className="kicker" style={{ flex: 'none' }}>Unscheduled</span>
          <div className="hbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', minWidth: 0 }}>
            {tray.map((task) => (
              <button key={task.id} onClick={() => go('tasks')} title={task.title} style={{
                flex: 'none', height: 24, padding: '0 9px', borderRadius: 999,
                border: '1px solid var(--line2)', background: 'var(--card2)',
                fontSize: 10.5, fontWeight: 600, color: 'var(--tx2)',
                maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{task.title}</button>
            ))}
          </div>
          <Icon name="chev" size={12} color="var(--tx3)" />
        </div>
      )}
    </div>
  );
}
