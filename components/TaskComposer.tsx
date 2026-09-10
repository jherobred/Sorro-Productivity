'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { PAL } from '@/lib/pal';
import type { List, NewTask, CustomTaskLink } from '@/lib/tasks';
import { serializeTaskWithLinks } from '@/lib/tasks';
import { TextLoop } from '@/components/core/text-loop';

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
  const [course, setCourse] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<'low' | 'med' | 'high' | null>(null);
  const [stars, setStars] = useState(0);
  const [submissionLink, setSubmissionLink] = useState('');
  const [googleDocsLink, setGoogleDocsLink] = useState('');
  const [customLinks, setCustomLinks] = useState<CustomTaskLink[]>([]);
  const [showLinksSection, setShowLinksSection] = useState(false);
  const [listId, setListId] = useState<string | null>(defaultListId);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setListId((v) => v ?? defaultListId), [defaultListId]);

  // Clicking away collapses an empty composer. One that has something in it
  // stays, because silently discarding typing is the worst thing this could do.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      if (!title.trim() && !notes.trim() && !course.trim() && !submissionLink.trim() && !googleDocsLink.trim() && customLinks.length === 0) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open, title, notes, course, submissionLink, googleDocsLink, customLinks]);

  const reset = () => {
    setTitle(''); setNotes(''); setCourse(''); setDue(null); setTime('');
    setPriority(null); setStars(0); setListId(defaultListId);
    setSubmissionLink(''); setGoogleDocsLink(''); setCustomLinks([]); setShowLinksSection(false);
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    let due_at: string | null = null;
    if (due && time) {
      const d = new Date(`${due}T${time}`);
      if (!isNaN(d.getTime())) {
        due_at = d.toISOString();
      }
    }
    const finalNotes = serializeTaskWithLinks(notes, submissionLink, googleDocsLink, customLinks, course);
    onCreate({
      id: crypto.randomUUID(),
      title: t,
      listId: listId || null,
      notes: finalNotes,
      due_on: due || null,
      due_at,
      priority: priority || null,
      stars: stars || 0,
      course: course.trim() || null,
    });
    reset();
  };

  const dueChips: { n: string; v: string | null }[] = [
    { n: 'Today', v: ymd(new Date()) },
    { n: 'Tomorrow', v: shift(1) },
    { n: 'Next week', v: nextWeek() },
  ];

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let t = e.target.value;
    let changed = false;

    const pMatch = t.match(/(?:^|\s)(!high|!med|!low|!!!|!!|!)(?:\s|$)/i);
    if (pMatch) {
      const p = pMatch[1].toLowerCase();
      if (p === '!high' || p === '!!!') setPriority('high');
      else if (p === '!med' || p === '!!') setPriority('med');
      else if (p === '!low' || p === '!') setPriority('low');
      t = t.replace(pMatch[0], ' ');
      changed = true;
    }

    const lMatch = t.match(/(?:^|\s)#(\w+)(?:\s|$)/i);
    if (lMatch && lists) {
      const listName = lMatch[1].toLowerCase();
      const list = lists.find(l => l.name.toLowerCase() === listName);
      if (list) {
        setListId(list.id);
        t = t.replace(lMatch[0], ' ');
        changed = true;
      }
    }

    const dMatch = t.match(/(?:^|\s)(today|tomorrow|tonight|next mon(?:day)?)(?:\s|$)/i);
    if (dMatch) {
      const d = dMatch[1].toLowerCase();
      if (d === 'today' || d === 'tonight') setDue(ymd(new Date()));
      else if (d === 'tomorrow') setDue(shift(1));
      else if (d.startsWith('next mon')) setDue(nextWeek());
      t = t.replace(dMatch[0], ' ');
      changed = true;
    }

    const tMatch = t.match(/(?:^|\s)(\d{1,2}:\d{2}(?:am|pm)?|\d{1,2}(?:am|pm))(?:\s|$)/i);
    if (tMatch) {
      const timeStr = tMatch[1].toLowerCase();
      let hh = 0; let mm = 0;
      if (timeStr.includes(':')) {
        const [h, mPart] = timeStr.split(':');
        hh = parseInt(h, 10);
        mm = parseInt(mPart, 10);
        if (timeStr.includes('pm') && hh < 12) hh += 12;
        if (timeStr.includes('am') && hh === 12) hh = 0;
      } else {
        hh = parseInt(timeStr, 10);
        if (timeStr.includes('pm') && hh < 12) hh += 12;
        if (timeStr.includes('am') && hh === 12) hh = 0;
      }
      setTime(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
      t = t.replace(tMatch[0], ' ');
      changed = true;
    }

    setTitle(changed ? t.replace(/\s+/g, ' ').trimStart() : t);
  };

  return (
    <div ref={box} style={{
      background: 'var(--card2)',
      borderRadius: 16,
      boxShadow: open ? '0 0 0 2px color-mix(in srgb, var(--acc) 45%, transparent), var(--sh)' : 'var(--sh)',
      border: `1.5px solid ${open ? 'var(--acc)' : 'var(--line2)'}`,
      padding: open ? '14px 16px' : '13px 16px',
      transition: 'border-color .2s, box-shadow .2s, padding .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Icon name="plus" size={15} color="var(--accTx)" />
        <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <input
            value={title}
            onFocus={() => setOpen(true)}
            onChange={handleTitleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setOpen(false);
                (e.target as HTMLElement).blur();
              }
            }}
            aria-label="Task title"
            style={{
              width: '100%',
              fontSize: 13.5,
              fontWeight: open ? 600 : 500,
              color: 'var(--tx)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              position: 'relative',
              zIndex: 2,
            }}
          />
          {!title && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 1,
                color: 'var(--tx2)',
                fontSize: 13.5,
                fontWeight: 500,
                opacity: 0.95,
              }}
            >
              <TextLoop interval={3600}>
                <span>Add a task (press Enter)</span>
                <span>Draft essay thesis and outline</span>
                <span>Design new logo & visual identity</span>
                <span>Solve complex problem set before deadline</span>
                <span>Review key lecture formulas and slides</span>
                <span>Code frontend feature and deploy live</span>
                <span>25-minute deep focus sprint</span>
                <span>Complete daily physical workout and hydrate</span>
                <span>Read next chapter of assigned book</span>
                <span>Organize research notes and study materials</span>
              </TextLoop>
            </div>
          )}
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="hov k-squish"
            aria-label="More options" title="More options"
            style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={15} color="var(--tx3)" />
          </button>
        )}
      </div>

      {(due || time || priority || submissionLink || googleDocsLink || customLinks.length > 0 || (listId && listId !== defaultListId)) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingLeft: 26 }}>
          {(due || time) && (
            <Chip on onClick={() => { setDue(null); setTime(''); }}>
              {due === ymd(new Date()) ? 'Today' : due === shift(1) ? 'Tomorrow' : due === nextWeek() ? 'Next week' : due} {time}
              <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name="close" size={10} color="inherit" /></span>
            </Chip>
          )}
          {priority && (
            <Chip on onClick={() => setPriority(null)} tint={PRIORITIES.find(p => p.v === priority)?.c}>
              {PRIORITIES.find(p => p.v === priority)?.n}
              <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name="close" size={10} color="inherit" /></span>
            </Chip>
          )}
          {submissionLink && (
            <Chip on onClick={() => setSubmissionLink('')} tint="var(--pal-coral)">
              <Icon name="send" size={10} color="inherit" />
              <span>Submission</span>
              <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name="close" size={10} color="inherit" /></span>
            </Chip>
          )}
          {googleDocsLink && (
            <Chip on onClick={() => setGoogleDocsLink('')} tint="var(--pal-sky)">
              <Icon name="book" size={10} color="inherit" />
              <span>Docs</span>
              <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name="close" size={10} color="inherit" /></span>
            </Chip>
          )}
          {customLinks.map((cl, i) => (
            <Chip key={cl.id || i} on onClick={() => setCustomLinks(customLinks.filter((_, idx) => idx !== i))} tint="var(--pal-mint)">
              <Icon name="link" size={10} color="inherit" />
              <span>{cl.label || 'Link'}</span>
              <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name="close" size={10} color="inherit" /></span>
            </Chip>
          ))}
          {listId && listId !== defaultListId && (
            <Chip on onClick={() => setListId(defaultListId)} tint={lists.find(l => l.id === listId)?.color}>
              {lists.find(l => l.id === listId)?.name}
              <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name="close" size={10} color="inherit" /></span>
            </Chip>
          )}
        </div>
      )}

      {open && (
        <div className="k-bloom" style={{ marginTop: 10 }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Notes (optional, ⌘+Enter to add)"
            aria-label="Notes"
            rows={2}
            style={{
              width: '100%', fontSize: 12.5, lineHeight: 1.55, color: 'var(--tx2)',
              resize: 'vertical', background: 'transparent', marginBottom: 11,
              border: 'none', outline: 'none',
            }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {/* Submission Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                width: 56, flex: 'none', fontSize: 12, fontWeight: 800, letterSpacing: '.07em',
                textTransform: 'uppercase', color: submissionLink ? 'var(--pal-coral)' : 'var(--tx3)',
              }}>
                Submit
              </span>
              <input
                type="url"
                value={submissionLink}
                onChange={(e) => setSubmissionLink(e.target.value)}
                placeholder="Submission link (Canvas, Turnitin, portal…)"
                style={{ ...FIELD, flex: 1, minWidth: 200 }}
              />
              {submissionLink && (
                <button
                  type="button"
                  onClick={() => setSubmissionLink('')}
                  className="k-squish"
                  style={{
                    width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center',
                    background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--tx3)', cursor: 'pointer',
                  }}
                >
                  <Icon name="close" size={11} color="var(--tx3)" />
                </button>
              )}
            </div>

            {/* Google Docs Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                width: 56, flex: 'none', fontSize: 12, fontWeight: 800, letterSpacing: '.07em',
                textTransform: 'uppercase', color: googleDocsLink ? 'var(--pal-sky)' : 'var(--tx3)',
              }}>
                GDocs
              </span>
              <input
                type="url"
                value={googleDocsLink}
                onChange={(e) => setGoogleDocsLink(e.target.value)}
                placeholder="Google Docs or Drive link (docs.google.com/…)"
                style={{ ...FIELD, flex: 1, minWidth: 200 }}
              />
              {googleDocsLink && (
                <button
                  type="button"
                  onClick={() => setGoogleDocsLink('')}
                  className="k-squish"
                  style={{
                    width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center',
                    background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--tx3)', cursor: 'pointer',
                  }}
                >
                  <Icon name="close" size={11} color="var(--tx3)" />
                </button>
              )}
            </div>

            {/* Custom / Multiple Additional Links */}
            {customLinks.map((cl, idx) => (
              <div key={cl.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={cl.label}
                  onChange={(e) => {
                    const next = [...customLinks];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setCustomLinks(next);
                  }}
                  placeholder="Label"
                  style={{
                    ...FIELD,
                    width: 56,
                    padding: '0 6px',
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                />
                <input
                  type="url"
                  value={cl.url}
                  onChange={(e) => {
                    const next = [...customLinks];
                    next[idx] = { ...next[idx], url: e.target.value };
                    setCustomLinks(next);
                  }}
                  placeholder="https://…"
                  style={{ ...FIELD, flex: 1, minWidth: 200 }}
                />
                <button
                  type="button"
                  onClick={() => setCustomLinks(customLinks.filter((_, i) => i !== idx))}
                  className="k-squish"
                  style={{
                    width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center',
                    background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--tx3)', cursor: 'pointer',
                  }}
                >
                  <Icon name="close" size={11} color="var(--tx3)" />
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ width: 56, flex: 'none' }} />
              <button
                type="button"
                onClick={() => setCustomLinks([...customLinks, { id: crypto.randomUUID(), label: 'Link', url: '' }])}
                className="k-chip"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 26, padding: '0 10px',
                  borderRadius: 999, fontSize: 12, fontWeight: 700, border: '1px dashed var(--line2)',
                  background: 'transparent', color: 'var(--pal-sky)', cursor: 'pointer',
                }}
              >
                <Icon name="plus" size={11} color="var(--pal-sky)" />
                <span>Add Another Link</span>
              </button>
            </div>
          </div>

          <Row label="Course">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. CS 101, MATH 20, Physics…"
                aria-label="Course or subject"
                style={{ ...FIELD, flex: 1 }}
              />
              {course && (
                <button
                  type="button"
                  onClick={() => setCourse('')}
                  className="k-squish"
                  style={{
                    width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center',
                    background: 'var(--card2)', border: '1px solid var(--line2)', color: 'var(--tx3)', cursor: 'pointer',
                  }}
                >
                  <Icon name="close" size={11} color="var(--tx3)" />
                </button>
              )}
            </div>
          </Row>

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
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--tx3)' }}>
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
        width: 56, flex: 'none', fontSize: 12, fontWeight: 800, letterSpacing: '.09em',
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
        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
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
  background: 'var(--card2)', color: 'var(--tx)', fontSize: 12, fontWeight: 600,
};

export type { IconName };
