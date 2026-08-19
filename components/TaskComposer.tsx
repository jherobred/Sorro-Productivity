'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { PAL } from '@/lib/pal';
import type { List, NewTask } from '@/lib/tasks';

/**
 * Creating a task was one text field and nothing else.
 *
 * Everything a task actually has — when it is due, how much it matters, which
 * list it belongs to — had to be set afterwards, by finding the row you just
 * made and opening it. Two steps for one intention, and the second step is the
 * one people skip, which is why lists fill up with undated, unsorted titles.
 *
 * The field stays a single line until you touch it, so quick capture is still
 * one keystroke away. Focusing expands it — Todoist's pattern — and everything
 * else is one click from there. Enter saves from anywhere in the form;
 * Escape collapses without losing what you typed.
 */

const PRIORITIES: { v: 'high' | 'med' | 'low'; n: string; c: string }[] = [
  { v: 'high', n: 'High', c: PAL.coral },
  { v: 'med', n: 'Medium', c: PAL.amber },
  { v: 'low', n: 'Low', c: PAL.mint },
];

const ymd = (d: Date) => {
  // Local date, not UTC: toISOString() on a Manila evening reports tomorrow.
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const shift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
};

/** Monday of next week, which is what "next week" means to a student. */
function nextWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return ymd(d);
}

export function TaskComposer({
  lists, defaultListId, onCreate,
}: {
  lists: List[];
  defaultListId: string | null;
  onCreate: (t: NewTask) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<'low' | 'med' | 'high' | null>(null);
  const [stars, setStars] = useState(0);
  const [listId, setListId] = useState<string | null>(defaultListId);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setListId((v) => v ?? defaultListId), [defaultListId]);

  // Clicking away collapses an empty composer. One that has something in it
  // stays, because silently discarding typing is the worst thing this could do.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      if (!title.trim() && !notes.trim()) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open, title, notes]);

  const reset = () => {
    setTitle(''); setNotes(''); setDue(null); setTime('');
    setPriority(null); setStars(0); setListId(defaultListId);
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onCreate({
      id: crypto.randomUUID(),
      title: t,
      listId,
      notes: notes.trim(),
      due_on: due,
      // A time only means anything alongside a date, and it is what puts the
      // task in a calendar slot rather than the all-day tray.
      due_at: due && time ? new Date(`${due}T${time}`).toISOString() : null,
      priority,
      stars,
    });
    reset();
  };

  const dueChips: { n: string; v: string | null }[] = [
    { n: 'Today', v: ymd(new Date()) },
    { n: 'Tomorrow', v: shift(1) },
    { n: 'Next week', v: nextWeek() },
  ];

  return (
    <div ref={box} style={{
      background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)',
      border: `1px solid ${open ? 'color-mix(in srgb, var(--acc) 40%, transparent)' : 'var(--line)'}`,
      padding: open ? '14px 15px' : '13px 15px',
      transition: 'border-color .2s, padding .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Icon name="plus" size={15} color="var(--accTx)" />
        <input
          value={title}
          onFocus={() => setOpen(true)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setOpen(false); (e.target as HTMLElement).blur(); }
          }}
          placeholder="Add a task"
          aria-label="Task title"
          style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: open ? 600 : 500, color: 'var(--tx)' }} />
        {!open && (
          <button onClick={() => setOpen(true)} className="hov k-squish"
            aria-label="More options" title="More options"
            style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={15} color="var(--tx3)" />
          </button>
        )}
      </div>

      {open && (
        <div className="k-bloom" style={{ marginTop: 10 }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            placeholder="Notes (optional)"
            aria-label="Notes"
            rows={2}
            style={{
              width: '100%', fontSize: 12.5, lineHeight: 1.55, color: 'var(--tx2)',
              resize: 'vertical', background: 'transparent', marginBottom: 11,
            }} />

          <Row label="Due">
            {dueChips.map((c) => (
              <Chip key={c.n} on={due === c.v} onClick={() => setDue(due === c.v ? null : c.v)}>{c.n}</Chip>
            ))}
            <input type="date" value={due ?? ''} onChange={(e) => setDue(e.target.value || null)}
              aria-label="Due date" style={FIELD} />
            {due && (
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                aria-label="Due time" style={FIELD} />
            )}
          </Row>

          <Row label="Priority">
            {PRIORITIES.map((p) => (
              <Chip key={p.v} on={priority === p.v} tint={p.c}
                onClick={() => setPriority(priority === p.v ? null : p.v)}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: p.c, display: 'inline-block', marginRight: 6 }} />
                {p.n}
              </Chip>
            ))}
          </Row>

          <Row label="Stars">
            <span style={{ display: 'flex', gap: 1 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setStars(stars === n ? 0 : n)}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={stars >= n}
                  className="k-squish"
                  style={{ width: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center' }}>
                  <Icon name="star" size={14} color={stars >= n ? PAL.amber : 'var(--line2)'} />
                </button>
              ))}
            </span>
          </Row>

          {lists.length > 0 && (
            <Row label="List">
              {lists.map((l) => (
                <Chip key={l.id} on={listId === l.id} tint={l.color} onClick={() => setListId(l.id)}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: l.color, display: 'inline-block', marginRight: 6 }} />
                  {l.name}
                </Chip>
              ))}
            </Row>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
            <button onClick={submit} disabled={!title.trim()} className="acc k-squish"
              style={{
                minHeight: 38, padding: '0 18px', borderRadius: 10, background: 'var(--acc)',
                color: 'var(--ink)', fontSize: 12.5, fontWeight: 800,
                opacity: title.trim() ? 1 : 0.45,
              }}>
              Add task
            </button>
            <button onClick={() => { reset(); setOpen(false); }} className="hov k-squish"
              style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
              Cancel
            </button>
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 10.5, color: 'var(--tx3)' }}>
              Enter to add
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      <span style={{
        width: 56, flex: 'none', fontSize: 9.5, fontWeight: 800, letterSpacing: '.09em',
        textTransform: 'uppercase', color: 'var(--tx3)',
      }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({ on, tint, onClick, children }: {
  on: boolean; tint?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} aria-pressed={on} className="k-chip"
      style={{
        display: 'inline-flex', alignItems: 'center', minHeight: 30, padding: '0 11px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
        border: `1px solid ${on ? (tint ?? 'var(--acc)') : 'var(--line2)'}`,
        background: on ? `color-mix(in srgb, ${tint ?? 'var(--acc)'} 16%, transparent)` : 'transparent',
        color: on ? 'var(--tx)' : 'var(--tx2)',
      }}>
      {children}
    </button>
  );
}

const FIELD: React.CSSProperties = {
  minHeight: 30, padding: '0 9px', borderRadius: 8, border: '1px solid var(--line2)',
  background: 'var(--card2)', color: 'var(--tx)', fontSize: 11.5, fontWeight: 600,
};

export type { IconName };
