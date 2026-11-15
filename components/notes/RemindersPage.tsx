'use client';
/**
 * N.reminders: a list the way Reminders keeps one, in Sorro's materials. Each
 * reminder is a row on a grid: the circle, the title with its note under it
 * and its date in the accent colour, then the flag. A subtask sits indented
 * under its parent. Today, Scheduled, All, Flagged and Completed filter the
 * one list, and the last row is always a new reminder. Everything is kept in
 * the note's own body (lib/noteTypes.ts), not in a table of its own.
 */
import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { Note } from '@/lib/notes';
import { readReminders, writeReminders, remindersIn, REMINDER_LISTS, type Reminder, type ReminderList, type RemindersDoc } from '@/lib/noteTypes';
import { usePageDraft } from './usePageDraft';
import { PageSaveStatus } from './PageSaveStatus';

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return dayOf(new Date(y, m - 1, d + n)); };
/** Today, Tomorrow and Yesterday by name; any other day as the calendar says it. */
function when(due: string, today: string) {
  if (due === today) return 'Today';
  if (due === shift(today, 1)) return 'Tomorrow';
  if (due === shift(today, -1)) return 'Yesterday';
  const [y, m, d] = due.split('-').map(Number), date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

export function RemindersPage({ note, onSave }: { note: Note; onSave: (v: { title: string; body: string }) => void }) {
  const { draft, change, waiting } = usePageDraft(note, onSave);
  const [doc, setDoc] = useState<RemindersDoc>(() => readReminders(note.body) ?? { version: 1, items: [] });
  const [list, setList] = useState<ReminderList>('All');
  const [adding, setAdding] = useState('');
  const [dating, setDating] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState('');
  const newRow = useRef<HTMLInputElement>(null);
  const today = dayOf(new Date());

  const save = (items: Reminder[]) => { const next: RemindersDoc = { version: 1, items }; setDoc(next); change({ body: writeReminders(next) }); };
  const edit = (id: string, fields: Partial<Reminder>) => save(doc.items.map(r => r.id === id ? { ...r, ...fields } : r));
  /** Closing a parent closes its subtasks with it; opening one leaves them as they were. */
  const tick = (r: Reminder) => save(doc.items.map(x => x.id === r.id || (!r.done && x.parent === r.id) ? { ...x, done: !r.done } : x));
  const drop = (id: string) => save(doc.items.filter(r => r.id !== id && r.parent !== id));
  const add = (title: string, parent?: string) => {
    const t = title.trim(); if (!t) return;
    // A new reminder lands where it will still be seen: today on Today, today on Scheduled, flagged on Flagged.
    const item: Reminder = { id: crypto.randomUUID(), title: t, note: '', flag: !parent && list === 'Flagged', done: false,
      ...(!parent && (list === 'Today' || list === 'Scheduled') ? { due: today } : {}), ...(parent ? { parent } : {}) };
    if (!parent) { save([...doc.items, item]); return; }
    // A subtask goes after its parent's last subtask, so the list reads in the order they were written.
    const at = doc.items.reduce((last, r, i) => r.id === parent || r.parent === parent ? i : last, doc.items.length - 1);
    save([...doc.items.slice(0, at + 1), item, ...doc.items.slice(at + 1)]);
  };

  const shown = useMemo(() => remindersIn(doc.items, list, today), [doc.items, list, today]);
  const counts = useMemo(() => Object.fromEntries(REMINDER_LISTS.map(l => [l, remindersIn(doc.items, l, today).filter(r => !r.parent || l === 'Completed').length])) as Record<ReminderList, number>, [doc.items, today]);
  const doneCount = doc.items.filter(r => r.done).length;

  return <section className="rem" aria-label="Reminders">
    <div className="page-edit-header"><input className="page-title-input note-editor-clean-input" aria-label="Page title" value={draft.title} onChange={e => change({ title: e.target.value })} /><PageSaveStatus id={note.id} waiting={waiting} /></div>
    <div className="rem-lists" role="tablist" aria-label="Lists">
      {REMINDER_LISTS.map(l => <button key={l} role="tab" aria-selected={list === l} onClick={() => setList(l)}>{l}{counts[l] > 0 && <b>{counts[l]}</b>}</button>)}
    </div>
    <div className="rem-list" role="list" aria-label={list}>
      {shown.length === 0 && list !== 'All' && <p className="rem-empty">{list === 'Completed' ? 'Nothing done yet.' : list === 'Today' ? 'Nothing due today.' : list === 'Scheduled' ? 'Nothing has a date yet.' : 'Nothing flagged.'}</p>}
      {shown.map(r => <div key={r.id} className={'rem-row' + (r.parent ? ' sub' : '') + (r.done ? ' is-done' : '')} role="listitem">
        <button className={'rem-tick' + (r.done ? ' on' : '')} aria-pressed={r.done} aria-label={r.done ? 'Mark open' : 'Mark done'} onClick={() => tick(r)}>{r.done && <Icon name="check" size={13} />}</button>
        <div className="rem-copy">
          <input className="rem-title" aria-label="Reminder" value={r.title} onChange={e => edit(r.id, { title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); newRow.current?.focus(); } if (e.key === 'Backspace' && !r.title) { e.preventDefault(); drop(r.id); } }} />
          <input className="rem-note" aria-label="Note" placeholder="Add note" value={r.note} onChange={e => edit(r.id, { note: e.target.value })} />
          <div className="rem-meta">
            {dating === r.id
              ? <input type="date" autoFocus className="rem-date" aria-label="Date" value={r.due ?? ''} onChange={e => edit(r.id, e.target.value ? { due: e.target.value } : { due: undefined })} onBlur={() => setDating(null)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setDating(null); }} />
              : <button className={'rem-when' + (r.due ? '' : ' unset') + (r.due && r.due < today && !r.done ? ' late' : '')} onClick={() => setDating(r.id)}>{r.due ? when(r.due, today) : 'Add date'}</button>}
            {r.due && dating !== r.id && <button className="rem-clear" aria-label="Clear the date" title="Clear the date" onClick={() => edit(r.id, { due: undefined })}><Icon name="close" size={12} /></button>}
            {!r.parent && <button className="rem-add-sub" onClick={() => { setSubFor(r.id); setSubDraft(''); }}><Icon name="plus" size={12} />Subtask</button>}
          </div>
        </div>
        <button className={'rem-flag' + (r.flag ? ' on' : '')} aria-pressed={r.flag} aria-label="Flag" title="Flag" onClick={() => edit(r.id, { flag: !r.flag })}><Icon name="flag" size={16} /></button>
        {subFor === r.id && <form className="rem-row sub rem-new" onSubmit={e => { e.preventDefault(); add(subDraft, r.id); setSubDraft(''); }}>
          <span className="rem-tick bare" aria-hidden />
          <input autoFocus aria-label="New subtask" placeholder="New subtask" value={subDraft} onChange={e => setSubDraft(e.target.value)} onBlur={() => { if (subDraft.trim()) add(subDraft, r.id); setSubFor(null); }} onKeyDown={e => { if (e.key === 'Escape') setSubFor(null); }} />
        </form>}
      </div>)}
      {list === 'All' && doneCount > 0 && <button className="rem-done-head" onClick={() => setList('Completed')}>Completed <b>{doneCount}</b></button>}
      {list !== 'Completed' && <form className="rem-row rem-new" onSubmit={e => { e.preventDefault(); add(adding); setAdding(''); }}>
        <span className="rem-tick bare" aria-hidden><Icon name="plus" size={14} /></span>
        <input ref={newRow} aria-label="New reminder" placeholder="New reminder" value={adding} onChange={e => setAdding(e.target.value)} />
      </form>}
    </div>
  </section>;
}
