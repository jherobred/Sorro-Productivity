'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { K, SECHUE } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import {
  useEvents, useEventActions, weekStart, hoursOf, dayIndex, hhmm, type Ev,
} from '@/lib/events';

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// The desktop grid is a fixed 760px band from 07:00 to 22:00 (H0/H1 at
// Basedly.dc.html:4455), with hour rules and events positioned by percentage.
const H0 = 7;
const H1 = 22;
const SPAN = H1 - H0;          // 15 intervals, 16 labels
const GRID_H = 760;
const pct = (hour: number) => ((hour - H0) / SPAN) * 100;

type View = 'week' | 'month' | 'day' | 'agenda' | 'countdown';
const ORDER: View[] = ['month', 'week', 'day', 'agenda', 'countdown'];

export default function CalendarPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [ws, setWs] = useState(() => weekStart(new Date()));
  const [focusDay, setFocusDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ ev: Ev; x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<Ev | null>(null);

  const { data: events = [] } = useEvents(ws);
  const A = useEventActions(ws);

  // Week is the desktop default, Day the phone-portrait default.
  const [view, setView] = useState<View>(prefs.calView);
  useEffect(() => {
    if (phone && prefs.calView === 'week') setView('day');
  }, [phone, prefs.calView]);

  const setCalView = (v: View) => {
    setView(v);
    void update({ calView: v });
  };

  const shiftWeek = (dir: number) => {
    const n = new Date(ws);
    n.setDate(n.getDate() + dir * 7);
    setWs(n);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>Calendar</h1>
        <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 600 }}>
          {ws.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => shiftWeek(-1)} className="hov" aria-label="Previous week"
            style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34 }}>
            <Icon name="back" size={15} color="var(--tx2)" />
          </button>
          <button onClick={() => { setWs(weekStart(new Date())); setFocusDay((new Date().getDay() + 6) % 7); }}
            className="hov" style={{ padding: '7px 11px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 34 }}>
            Today
          </button>
          <button onClick={() => shiftWeek(1)} className="hov" aria-label="Next week"
            style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34, transform: 'rotate(180deg)' }}>
            <Icon name="back" size={15} color="var(--tx2)" />
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--line2)', margin: '0 5px' }} />

          {ORDER.map((v) => (
            <button key={v} onClick={() => setCalView(v)} className="hov"
              style={{
                padding: '7px 10px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, minHeight: 34,
                color: view === v ? SECHUE.calendar : 'var(--tx3)',
                background: view === v ? 'var(--hov)' : undefined,
              }}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {view === 'week' && (
        <Grid days={7} ws={ws} events={events} A={A} sel={sel} setSel={setSel} openMenu={setMenu} />
      )}
      {view === 'day' && (
        <>
          <DayStrip ws={ws} focus={focusDay} onPick={setFocusDay} />
          <Grid days={1} dayOffset={focusDay} ws={ws} events={events} A={A} sel={sel} setSel={setSel} openMenu={setMenu} />
        </>
      )}
      {view === 'month' && (
        <Month ws={ws} events={events} onPickDay={(d) => { setFocusDay(d); setCalView('day'); }} />
      )}
      {view === 'agenda' && <Agenda ws={ws} events={events} />}
      {view === 'countdown' && <Countdown events={events} A={A} />}

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Edit', icon: 'edit', run: () => setEdit(menu.ev) },
            { label: 'Duplicate', icon: 'copy', run: () => A.duplicate(menu.ev) },
            { label: 'Delete', icon: 'trash', run: () => A.removeWithUndo(menu.ev), danger: true },
          ]}
        />
      )}

      {edit && <EditSheet ev={edit} onClose={() => setEdit(null)} onSave={(patch) => { A.update.mutate({ id: edit.id, patch }); setEdit(null); }} />}
    </div>
  );
}

/* ---------------------------------------------------------------- week/day */

function Grid({
  days, dayOffset = 0, ws, events, A, sel, setSel, openMenu,
}: {
  days: number;
  dayOffset?: number;
  ws: Date;
  events: Ev[];
  A: ReturnType<typeof useEventActions>;
  sel: string | null;
  setSel: (id: string | null) => void;
  openMenu: (m: { ev: Ev; x: number; y: number }) => void;
}) {
  const { prefs } = usePrefs();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; day: number; hour: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; end: number } | null>(null);

  const hours = Array.from({ length: SPAN + 1 }, (_, i) => H0 + i);

  /**
   * One pointerdown drives long-press, drag and resize. Moving more than 7px
   * cancels the long-press, which is what lets hold and drag share the gesture.
   */
  const press = (e: React.PointerEvent, ev: Ev, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setSel(ev.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origDay = dayIndex(ev.starts_at, ws);
    const origHour = hoursOf(ev.starts_at);
    const origEnd = hoursOf(ev.ends_at);
    const colW = (bodyRef.current?.clientWidth ?? 322) / days;
    let moved = false;

    const timer = window.setTimeout(() => {
      if (moved) return;
      navigator.vibrate?.(K.hapticMs);
      openMenu({ ev, x: startX, y: startY });
    }, K.longPressMs);

    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > K.longPressCancelPx) {
        moved = true;
        clearTimeout(timer);
      }
      if (!moved) return;

      if (mode === 'resize') {
        // 16px = 30 min
        // 30-min step, derived from the real row height so the chip tracks the
        // pointer on this 760px grid (README's 16px figure is for the phone grid).
        const steps = Math.round(dy / (GRID_H / SPAN / 2));
        setResize({ id: ev.id, end: origEnd + steps * 0.5 });
      } else {
        const dayStep = days === 1 ? 0 : Math.round(dx / colW);
        // 30-min step, derived from the real row height so the chip tracks the
        // pointer on this 760px grid (README's 16px figure is for the phone grid).
        const steps = Math.round(dy / (GRID_H / SPAN / 2));
        setDrag({
          id: ev.id,
          day: Math.max(0, Math.min(6, origDay + dayStep)),
          hour: origHour + steps * 0.5,
        });
      }
    };

    const onUp = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // Commit on drop, not per frame.
      setDrag((d) => {
        if (d && d.id === ev.id) A.moveTo(ev, d.day, d.hour);
        return null;
      });
      setResize((r) => {
        if (r && r.id === ev.id) A.resizeTo(ev, r.end);
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--sh)' }}>
      {/* hour axis — labels sit on the rule, centred by translateY(-50%) */}
      <div style={{ width: 52, flex: 'none', position: 'relative', height: GRID_H, marginTop: 64 }}>
        <div style={{
          position: 'absolute', top: -34, right: 0, left: 0, height: 34,
          fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          color: 'var(--tx3)', padding: '6px 7px 0', textAlign: 'right',
        }}>
          All-day
        </div>
        {hours.map((h, i) => (
          <div key={h} style={{
            position: 'absolute', right: 8, top: `${(i / SPAN) * 100}%`, transform: 'translateY(-50%)',
            fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>
            {hhmm(h)}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days}, 1fr)`, height: 30, borderBottom: '1px solid var(--line)' }}>
          {Array.from({ length: days }, (_, i) => {
            const idx = days === 1 ? dayOffset : i;
            const d = new Date(ws);
            d.setDate(d.getDate() + idx);
            const today = d.toDateString() === new Date().toDateString();
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: today ? SECHUE.calendar : 'var(--tx3)' }}>
                {DAYS_SHORT[idx]} <span style={{ opacity: .7 }}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* all-day strip — 2px rule under it, 34px minimum */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--line2)', minHeight: 34 }}>
          {Array.from({ length: days }, (_, i) => {
            const idx = days === 1 ? dayOffset : i;
            const allDay = events.filter((e) => e.all_day && dayIndex(e.starts_at, ws) === idx);
            return (
              <button key={i} onClick={() => A.addAt(idx, K.calStartHour, prefs.accent)} className="hov"
                title="Add an all-day item"
                style={{ flex: 1, minWidth: 0, padding: '5px 3px', borderRight: i < days - 1 ? '1px solid var(--line)' : undefined, textAlign: 'left' }}>
                {allDay.map((e) => (
                  <div key={e.id} style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, marginBottom: 2,
                    background: `color-mix(in srgb, ${e.color} 26%, var(--card))`, color: 'var(--tx)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{e.title}</div>
                ))}
              </button>
            );
          })}
        </div>

        {/* slots */}
        <div ref={bodyRef} style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${days}, 1fr)`, height: GRID_H }}>
          {/* hour rules span the full width, behind the columns */}
          {hours.map((h, i) => (
            <div key={`r${h}`} aria-hidden style={{
              position: 'absolute', left: 0, right: 0, top: `${(i / SPAN) * 100}%`,
              height: 1, background: 'var(--line)', pointerEvents: 'none',
            }} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const idx = days === 1 ? dayOffset : i;
            return (
              <div key={i} style={{ position: 'relative', borderRight: i < days - 1 ? '1px solid var(--line)' : undefined }}>
                {hours.slice(0, -1).map((h, i) => (
                  <button
                    key={h}
                    onClick={() => A.addAt(idx, h, prefs.accent)}
                    className="hov"
                    aria-label={`Add event ${hhmm(h)}`}
                    style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `${(i / SPAN) * 100}%`, height: `${(1 / SPAN) * 100}%`,
                    }}
                  />
                ))}

                {events
                  .filter((e) => dayIndex(e.starts_at, ws) === idx || (drag?.id === e.id && drag.day === idx))
                  .map((e) => {
                    const isDrag = drag?.id === e.id;
                    const isResize = resize?.id === e.id;
                    if (isDrag && drag.day !== idx) return null;

                    const start = isDrag ? drag.hour : hoursOf(e.starts_at);
                    const end = isResize ? resize.end : isDrag ? drag.hour + (hoursOf(e.ends_at) - hoursOf(e.starts_at)) : hoursOf(e.ends_at);
                    const top = pct(start);
                    const height = Math.max((0.5 / SPAN) * 100, pct(end) - pct(start));

                    return (
                      <div
                        key={e.id}
                        onPointerDown={(p) => press(p, e, 'move')}
                        className={sel === e.id ? 'pop' : undefined}
                        style={{
                          position: 'absolute', left: 3, right: 3, top: `${top}%`, height: `${height}%`,
                          borderRadius: 8, padding: '4px 7px', overflow: 'hidden',
                          background: `color-mix(in srgb, ${e.color} 26%, var(--card))`,
                          borderLeft: `2px solid ${e.color}`,
                          boxShadow: isDrag || isResize ? 'var(--shl)' : undefined,
                          transform: isDrag || isResize ? 'scale(1.02)' : undefined,
                          cursor: 'grab', touchAction: 'none', zIndex: isDrag || isResize ? 5 : 1,
                          outline: sel === e.id ? `1px solid ${e.color}` : undefined,
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden' }}>
                          {e.title}
                        </span>
                        <span style={{ display: 'block', fontSize: 9.5, opacity: 0.72, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {hhmm(start)} {e.location}
                        </span>

                        {/* bottom edge resizes the end time in 30-min steps */}
                        <div
                          onPointerDown={(p) => press(p, e, 'resize')}
                          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, cursor: 'ns-resize', touchAction: 'none' }}
                        />
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayStrip({ ws, focus, onPick }: { ws: Date; focus: number; onPick: (d: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {DAYS_SHORT.map((d, i) => {
        const date = new Date(ws);
        date.setDate(date.getDate() + i);
        const on = i === focus;
        return (
          <button key={d} onClick={() => onPick(i)} className="tt"
            style={{
              flex: 1, minHeight: 44, borderRadius: 10, padding: '7px 0',
              border: `1px solid ${on ? SECHUE.calendar : 'var(--line)'}`,
              background: on ? 'var(--hov)' : 'transparent',
              color: on ? SECHUE.calendar : 'var(--tx3)',
              fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
            }}>
            {d}
            <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2, color: on ? 'var(--tx)' : 'var(--tx2)' }}>{date.getDate()}</div>
          </button>
        );
      })}
    </div>
  );
}

function Month({ ws, events, onPickDay }: { ws: Date; events: Ev[]; onPickDay: (d: number) => void }) {
  const first = new Date(ws.getFullYear(), ws.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(ws.getFullYear(), ws.getMonth() + 1, 0).getDate();

  const counts = new Map<string, number>();
  for (const e of events) {
    const k = new Date(e.starts_at).toDateString();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, boxShadow: 'var(--sh)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {DAYS_SHORT.map((d) => (
          <div key={d} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', color: 'var(--tx3)', textAlign: 'center', paddingBottom: 5 }}>{d}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = new Date(ws.getFullYear(), ws.getMonth(), i + 1);
          const n = counts.get(date.toDateString()) ?? 0;
          const today = date.toDateString() === new Date().toDateString();
          return (
            <button key={i} onClick={() => onPickDay((date.getDay() + 6) % 7)} className="hov"
              style={{
                aspectRatio: '1', minHeight: 44, borderRadius: 10, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                border: `1px solid ${today ? SECHUE.calendar : 'transparent'}`,
                fontSize: 12.5, fontWeight: today ? 700 : 500, color: today ? SECHUE.calendar : 'var(--tx2)',
              }}>
              {i + 1}
              {n > 0 && <span style={{ width: 4, height: 4, borderRadius: '50%', background: SECHUE.calendar }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Agenda — one block per day, each row a colour bar, 44px time, title, location. */
function Agenda({ ws, events }: { ws: Date; events: Ev[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div>
      {days.map((d) => {
        const items = events
          .filter((e) => dayIndex(e.starts_at, ws) === (d.getDay() + 6) % 7)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        if (!items.length) return null;
        const today = d.toDateString() === new Date().toDateString();
        return (
          <div key={d.toISOString()} className="lensrow" style={{
            background: 'var(--card)', borderRadius: 16, padding: '13px 16px',
            marginBottom: 10, boxShadow: 'var(--sh)',
            border: `1px solid ${today ? `color-mix(in srgb, ${SECHUE.calendar} 34%, transparent)` : 'var(--line)'}`,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase',
              color: today ? SECHUE.calendar : 'var(--tx3)', marginBottom: 6,
            }}>
              {d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            {items.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                <span style={{ width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, background: a.color, flex: 'none' }} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', width: 44, fontVariantNumeric: 'tabular-nums' }}>
                  {hhmm(hoursOf(a.starts_at))}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{a.location}</span>
              </div>
            ))}
          </div>
        );
      })}
      {events.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing scheduled this week.</p>}
    </div>
  );
}

function Countdown({ events, A }: { events: Ev[]; A: ReturnType<typeof useEventActions> }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), K.countdownTickMs);
    return () => clearInterval(t);
  }, []);

  const next = events
    .filter((e) => new Date(e.starts_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  if (!next) {
    return <p style={{ fontSize: 13.5, color: 'var(--tx3)', textAlign: 'center', padding: 40 }}>Nothing else scheduled this week.</p>;
  }

  const ms = new Date(next.starts_at).getTime() - Date.now();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const due = ms < 60_000;

  return (
    <div className="rise" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 34, textAlign: 'center', boxShadow: 'var(--sh)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 12 }}>Up next</div>
      <div className={due ? 'arrive' : undefined} style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', marginBottom: 7 }}>{next.title}</div>
      <div className="glowring" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 14, background: 'var(--card2)', fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', color: SECHUE.calendar, fontVariantNumeric: 'tabular-nums' }}>
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tx2)' }}>{hhmm(hoursOf(next.starts_at))}{next.location && ` · ${next.location}`}</div>
      <button onClick={() => A.snooze.mutate({ id: next.id })} className="hov"
        style={{ marginTop: 18, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 44 }}>
        Snooze 10 min
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ menu + sheet */

function ContextMenu({
  x, y, items, onClose,
}: {
  x: number; y: number; onClose: () => void;
  items: { label: string; icon: 'edit' | 'copy' | 'trash'; run: () => void; danger?: boolean }[];
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close, { once: true });
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div className="pop" style={{
      position: 'fixed', left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 150),
      zIndex: 80, minWidth: 158, padding: 5, borderRadius: 12,
      background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
    }}>
      {items.map((it) => (
        <button key={it.label} onClick={() => { it.run(); onClose(); }} className="row"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: it.danger ? 'var(--pal-coral)' : 'var(--tx)', textAlign: 'left', minHeight: 36 }}>
          <Icon name={it.icon} size={14} color={it.danger ? 'var(--pal-coral)' : 'var(--tx3)'} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

function EditSheet({ ev, onClose, onSave }: { ev: Ev; onClose: () => void; onSave: (p: Partial<Ev>) => void }) {
  const [title, setTitle] = useState(ev.title);
  const [location, setLocation] = useState(ev.location);
  const [color, setColor] = useState(ev.color);
  const swatches = ['#FF6B6B', '#7C8CFF', '#38D6F2', '#34D9A0', '#B07CFF', '#FFC24B', '#FF6FA8', '#A3E635'];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet"
        style={{ width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: '14px 14px 0 0', border: '1px solid var(--line2)', padding: 24, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 16 }}>Edit event</h2>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
          style={{ width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 13.5, marginBottom: 10 }} />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location"
          style={{ width: '100%', minHeight: 44, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 13.5, marginBottom: 14 }} />

        <div style={{ display: 'flex', gap: 7, marginBottom: 20, flexWrap: 'wrap' }}>
          {swatches.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`}
              style={{ width: 26, height: 26, borderRadius: 7, background: c, outline: color === c ? '2px solid var(--tx)' : undefined, outlineOffset: 2 }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onClose} className="hov" style={{ flex: 1, minHeight: 44, borderRadius: 14, border: '1px solid var(--line2)', fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)' }}>Cancel</button>
          <button onClick={() => onSave({ title, location, color })} className="acc"
            style={{ flex: 1, minHeight: 44, borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>Save</button>
        </div>
      </div>
    </div>
  );
}
