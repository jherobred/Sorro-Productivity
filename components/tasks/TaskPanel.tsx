'use client';
import { startFocus } from '@/lib/focusTimer';
import { toast } from '@/lib/toast';
import Link from 'next/link';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEvents } from '@/lib/events';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { ObjectCoverImage } from '@/components/notes/NotebookCover';
import { TaskPhotos } from './TaskPhotos';
import { TaskRepeatProp } from './TaskRepeat';
import { useOverlayBack } from '@/lib/nav';
import { usePrefs } from '@/lib/prefs';
import { useRegisterSidePanel } from '@/lib/sidePanel';
import { courseIs, TAG_COLORS } from '@/lib/tagList';
import { deadlineClock, deadlineOf } from '@/lib/todayCycle';
import {
  parseTaskLinks, serializeTaskWithLinks, useListActions, useSubtaskActions, useSubtasks,
  type CustomTaskLink, type List, type Task,
} from '@/lib/tasks';

const CoverCapture = dynamic(() => import('@/components/notes/CoverCapture').then((m) => m.CoverCapture), { ssr: false });

const PRIORITIES = [
  { v: 'high', n: 'High' }, { v: 'med', n: 'Medium' }, { v: 'low', n: 'Low' }, { v: null, n: 'None' },
] as const;
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** A new day for a task, keeping the clock time it already had. */
const onDay = (task: Task, day: string | null): Partial<Task> => {
  if (!day) return { due_on: null, due_at: null };
  if (!task.due_at) return { due_on: day, due_at: null };
  const old = new Date(task.due_at);
  const [y, m, d] = day.split('-').map(Number);
  return { due_on: day, due_at: new Date(y, m - 1, d, old.getHours(), old.getMinutes()).toISOString() };
};

/** The live line at the top of a task: how long is left, to the second, and a bar on the day it is due. */
function DeadlineLine({ task }: { task: Task }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const deadline = deadlineOf(task);
  if (deadline === null || task.done) return null;
  const clock = deadlineClock(deadline, now);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dueToday = new Date(deadline).toDateString() === new Date(now).toDateString();
  const share = Math.min(1, Math.max(0, (now - midnight.getTime()) / Math.max(1, deadline - midnight.getTime())));
  return (
    <div className={'task-panel-deadline' + (clock.late ? ' is-late' : '')}>
      <p>
        <Icon name="hourglass" size={14} />
        {clock.late ? 'Overdue by' : 'Due in'}
        <strong role="timer" aria-live="off">{clock.text}</strong>
      </p>
      {dueToday && !clock.late && <AsciiBar value={share * 100} hue="var(--poster-yellow)" showValue={false} label="How much of the time before it is due has passed today" />}
    </div>
  );
}

/**
 * Where the task sits on the calendar: its day and time, a link that opens it
 * there, and the study time reserved for it in the next two weeks.
 */
function CalendarLine({ task, time24, onPlan }: { task: Task; time24: boolean; onPlan: () => void }) {
  const { prefs } = usePrefs();
  const dayKey = new Date().toDateString();
  const from = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = prefs.taskEventLinks?.[task.id];
  const { data: events = [] } = useEvents(from, 14);
  const blocks = linked?.length ? events.filter((e) => linked.includes(e.id) && !e.deleted_at && Date.parse(e.ends_at) > Date.now()) : [];
  const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });
  const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const where = !task.due_on ? null
    : task.due_at ? `${day(new Date(task.due_at))} at ${clock(task.due_at)}`
      : `${day(new Date(`${task.due_on}T12:00:00`))}, any time`;
  return (
    <div className="task-prop">
      <span className="task-prop-name"><Icon name="cal" size={14} />Calendar</span>
      <div className="task-prop-value task-cal">
        <p>{where ?? 'Not on your calendar. Give it a date to put it there.'}</p>
        <div className="task-chips">
          {task.due_on && <Link href={`/calendar/?day=${task.due_on}&task=${task.id}`} aria-label="Show on calendar" title="Open this day on the calendar"><Icon name="cal" size={12} />Show</Link>}
          <button type="button" onClick={onPlan}><Icon name="clock" size={12} />Reserve study time</button>
        </div>
        {blocks.length > 0 && (
          <ul className="task-cal-blocks" aria-label="Study time reserved">
            {blocks.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((e) => (
              <li key={e.id}><Link href={`/calendar/?day=${ymd(new Date(e.starts_at))}`}>{day(new Date(e.starts_at))} · {clock(e.starts_at)}–{clock(e.ends_at)}</Link></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A step's name, saved when you leave the field rather than on every letter. */
function StepTitle({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  const commit = () => {
    const clean = value.trim();
    if (clean && clean !== title) onSave(clean);
    else setValue(title);
  };
  return (
    <input value={value} aria-label="Step" onChange={(e) => setValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}

/**
 * Everything about one task, beside the list on a wide screen and over it on
 * a phone. Typing saves itself a moment after you stop; the chips save at once.
 */
export function TaskPanel({ task, lists, phone, onClose, onPatch, onComplete, onDelete, onDuplicate, onPlan }: {
  task: Task;
  lists: List[];
  phone: boolean;
  onClose: () => void;
  /** Opens Plan week with this task picked, to reserve study time for it. */
  onPlan: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onComplete: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { prefs } = usePrefs();
  const tags = prefs.tags ?? [];
  const pushes = prefs.shellLayout === 'L5' && !phone;
  useRegisterSidePanel(pushes ? 460 : 0);

  const { data: allSteps = [] } = useSubtasks();
  const S = useSubtaskActions();
  const L = useListActions();
  const steps = allSteps.filter((s) => s.task_id === task.id).sort((a, b) => a.position - b.position);
  const stepsDone = steps.filter((s) => s.done).length;

  const initial = parseTaskLinks(task.notes ?? '');
  const [title, setTitle] = useState(task.title);
  const [course, setCourse] = useState(task.course || initial.course || '');
  const [notes, setNotes] = useState(initial.cleanNotes);
  const [submissionLink, setSubmissionLink] = useState(initial.submissionLink);
  const [googleDocsLink, setGoogleDocsLink] = useState(initial.googleDocsLink);
  const [customLinks, setCustomLinks] = useState<CustomTaskLink[]>(initial.customLinks);
  const [newStep, setNewStep] = useState('');
  const [newList, setNewList] = useState<string | null>(null);
  const [captureCover, setCaptureCover] = useState(false);
  const titleBox = useRef<HTMLTextAreaElement>(null);

  // The latest typed values, for the saves that run from event handlers and on close.
  const latest = useRef({ title, course, notes, submissionLink, googleDocsLink, customLinks });
  latest.current = { title, course, notes, submissionLink, googleDocsLink, customLinks };

  const openedId = useRef(task.id);
  useEffect(() => {
    if (openedId.current === task.id) return;
    openedId.current = task.id;
    const p = parseTaskLinks(task.notes ?? '');
    setTitle(task.title);
    setCourse(task.course || p.course || '');
    setNotes(p.cleanNotes);
    setSubmissionLink(p.submissionLink);
    setGoogleDocsLink(p.googleDocsLink);
    setCustomLinks(p.customLinks);
  }, [task.id, task.title, task.notes, task.course]);

  /** Saves what has been typed, together with any change passed in. */
  const save = useCallback((extra: Partial<Task> = {}) => {
    const v = latest.current;
    const cleanTitle = v.title.trim();
    const serialized = serializeTaskWithLinks(v.notes, v.submissionLink, v.googleDocsLink, v.customLinks, v.course.trim());
    const patch: Partial<Task> = { ...extra };
    if (cleanTitle && cleanTitle !== task.title) patch.title = cleanTitle;
    if (serialized !== (task.notes ?? '')) patch.notes = serialized;
    if (Object.keys(patch).length) onPatch(patch);
  }, [task.title, task.notes, onPatch]);

  useEffect(() => {
    const timer = setTimeout(() => save(), 600);
    return () => clearTimeout(timer);
  }, [title, course, notes, submissionLink, googleDocsLink, customLinks, save]);

  const close = useCallback(() => { save(); onClose(); }, [save, onClose]);
  useOverlayBack(true, close);

  // The title grows with what is written in it.
  useEffect(() => {
    const box = titleBox.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [title]);

  const today = new Date();
  const days = [
    { n: 'Today', v: ymd(today) },
    { n: 'Tomorrow', v: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { n: 'Next week', v: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + (((8 - today.getDay()) % 7) || 7))) },
    { n: 'No date', v: null },
  ];

  const moveDay = (day: string | null) => {
    const before = { due_on: task.due_on, due_at: task.due_at ?? null };
    save(onDay(task, day));
    toast(day ? `Due ${days.find((d) => d.v === day)?.n.toLowerCase() ?? new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Date removed', () => onPatch(before), { icon: 'cal' });
  };

  const addStep = () => {
    const text = newStep.trim();
    if (!text) return;
    S.create.mutate({ id: crypto.randomUUID(), task_id: task.id, title: text, done: false, position: Date.now() % 2_000_000_000 });
    setNewStep('');
  };

  const createList = () => {
    const name = (newList ?? '').trim().replace(/\s+/g, ' ');
    if (!name) { setNewList(null); return; }
    const existing = lists.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      save({ list_id: existing.id });
      setNewList(null);
      return;
    }
    const list = { id: crypto.randomUUID(), name, color: TAG_COLORS[lists.length % TAG_COLORS.length].value, position: lists.length };
    L.create.mutate(list);
    save({ list_id: list.id });
    toast(`Project “${name}” made and this task moved into it`, undefined, { tone: 'success', icon: 'proj' });
    setNewList(null);
  };

  const linkRow = (label: string, icon: 'send' | 'book', value: string, set: (v: string) => void, placeholder: string) => (
    <div className="task-panel-link">
      <span><Icon name={icon} size={13} />{label}</span>
      <input type="url" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} onBlur={() => save()} />
      {value && <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}><Icon name="link" size={13} /></a>}
    </div>
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {!pushes && <div className="task-panel-scrim" onClick={close} />}
      <aside className={'task-panel' + (phone ? ' is-phone' : '')} role="dialog" aria-label={`Task: ${task.title}`}>
        <div className="task-panel-top">
          <button type="button" className={'task-panel-done' + (task.done ? ' is-done' : '')} aria-pressed={task.done} onClick={onComplete}>
            <span aria-hidden="true"><Icon name="check" size={12} /></span>
            {task.done ? 'Done' : 'Mark done'}
          </button>
          <button type="button" className="studio-button" onClick={() => { startFocus(25, task.id); toast(`Focusing on ${task.title} for 25 minutes. The timer is in the side panel.`); }}><Icon name="clock" size={16}/>Focus 25 min</button>{!!task.focus_minutes && <span className="task-panel-focus">{task.focus_minutes} min focused</span>}<span className="task-panel-spacer" />
          <button type="button" className="task-panel-icon" aria-label="Duplicate" title="Duplicate" onClick={onDuplicate}><Icon name="copy" size={16} /></button>
          <button type="button" className="task-panel-icon is-danger" aria-label="Delete task" title="Delete" onClick={onDelete}><Icon name="trash" size={16} /></button>
          <button type="button" className="task-panel-icon" aria-label="Close" title="Close" onClick={close}><Icon name="close" size={16} /></button>
        </div>

        <textarea ref={titleBox} className={'task-panel-title' + (task.done ? ' is-done' : '')} value={title} rows={1} aria-label="Title" placeholder="Task title"
          onChange={(e) => setTitle(e.target.value)} onBlur={() => save()}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); e.currentTarget.blur(); } }} />

        <DeadlineLine task={task} />

        <section className="task-panel-props" aria-label="Details">
          <div className="task-prop">
            <span className="task-prop-name"><Icon name="cal" size={14} />Due</span>
            <div className="task-prop-value">
              <div className="task-chips">
                {days.map((d) => (
                  <button key={d.n} type="button" aria-pressed={task.due_on === d.v} onClick={() => moveDay(d.v)}>{d.n}</button>
                ))}
              </div>
              <div className="task-prop-inputs">
                <input type="date" aria-label="Due date" value={task.due_on ?? ''} onChange={(e) => moveDay(e.target.value || null)} />
                <input type="time" aria-label="Due time" value={timeOf(task.due_at)} disabled={!task.due_on}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value || !task.due_on) { save({ due_at: null }); return; }
                    const [h, m] = value.split(':').map(Number);
                    const [y, mo, d] = task.due_on.split('-').map(Number);
                    save({ due_at: new Date(y, mo - 1, d, h, m).toISOString() });
                  }} />
              </div>
            </div>
          </div>

          <CalendarLine task={task} time24={prefs.time24} onPlan={() => { save(); onPlan(); }} />

          <TaskRepeatProp taskId={task.id} due={task.due_on} />

          <div className="task-prop">
            <span className="task-prop-name"><Icon name="flag" size={14} />Priority</span>
            <div className="task-prop-value task-chips" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <button key={p.n} type="button" role="radio" aria-checked={(task.priority ?? null) === p.v} className={p.v ? `is-${p.v}` : undefined} onClick={() => save({ priority: p.v })}>{p.n}</button>
              ))}
            </div>
          </div>

          <div className="task-prop">
            <span className="task-prop-name"><Icon name="proj" size={14} />Project</span>
            <div className="task-prop-value task-chips" role="radiogroup" aria-label="Project">
              <button type="button" role="radio" aria-checked={!task.list_id} onClick={() => save({ list_id: null })}>Inbox</button>
              {lists.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={task.list_id === l.id} onClick={() => save({ list_id: l.id })}>
                  <i aria-hidden="true" style={{ background: l.color }} />{l.name}
                </button>
              ))}
              {newList === null ? (
                <button type="button" className="is-add" onClick={() => setNewList('')}><Icon name="plus" size={12} />New project</button>
              ) : (
                <input className="task-chip-input" autoFocus value={newList} placeholder="Project name" aria-label="New project name"
                  onChange={(e) => setNewList(e.target.value)} onBlur={createList}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); createList(); }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNewList(null); }
                  }} />
              )}
            </div>
          </div>

          <div className="task-prop">
            <span className="task-prop-name"><Icon name="tag" size={14} />Course</span>
            <div className="task-prop-value">
              {tags.length > 0 && (
                <div className="task-chips" role="radiogroup" aria-label="Course">
                  {tags.map((tag) => {
                    const on = courseIs(course, tag);
                    return (
                      <button key={tag.id} type="button" role="radio" aria-checked={on}
                        onClick={() => { const next = on ? '' : tag.name; latest.current.course = next; setCourse(next); save(); }}>
                        <i aria-hidden="true" style={{ background: tag.color }} />{tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <input className="task-prop-text" value={course} placeholder={tags.length ? 'Or type another course' : 'e.g. CS 101, Physics'} aria-label="Course"
                onChange={(e) => setCourse(e.target.value)} onBlur={() => save()} />
            </div>
          </div>

        </section>

        <section className="task-panel-section" aria-label="Steps">
          <header>
            <h3>Steps</h3>
            {steps.length > 0 && <span>{stepsDone} of {steps.length} done</span>}
          </header>
          {steps.length > 0 && <AsciiBar value={(stepsDone / steps.length) * 100} hue="#2fb27a" showValue={false} label="Steps done" />}
          <ul className="task-steps">
            {steps.map((step) => (
              <li key={step.id} className={step.done ? 'is-done' : undefined}>
                <button type="button" className="task-step-check" aria-pressed={step.done} aria-label={step.done ? `Mark “${step.title}” as not done` : `Mark “${step.title}” as done`}
                  onClick={() => S.update.mutate({ id: step.id, patch: { done: !step.done } })}>
                  <Icon name="check" size={11} />
                </button>
                <StepTitle title={step.title} onSave={(value) => S.update.mutate({ id: step.id, patch: { title: value } })} />
                <button type="button" className="task-step-remove" aria-label={`Remove “${step.title}”`}
                  onClick={() => {
                    S.remove.mutate({ id: step.id });
                    toast(`Step removed: ${step.title}`, () => S.create.mutate(step), { tone: 'danger' });
                  }}>
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="task-step-add">
            <Icon name="plus" size={14} />
            <input value={newStep} placeholder={steps.length ? 'Add another step' : 'Break it into steps'} aria-label="New step"
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }} />
            {newStep.trim() && <button type="button" onClick={addStep}>Add</button>}
          </div>
        </section>

        <section className="task-panel-section" aria-label="Notes">
          <header><h3>Notes</h3></header>
          <textarea className="task-panel-notes" value={notes} rows={4} placeholder="Details, instructions, anything to remember"
            onChange={(e) => setNotes(e.target.value)} onBlur={() => save()} />
        </section>

        {/* The extras stay folded until a task uses them, so the panel opens on what matters. */}
        <details className="task-panel-more" open={!!task.stars || !!(submissionLink || googleDocsLink || customLinks.length) || undefined}>
        <summary>Stars, links and photos</summary>
        <div className="task-prop">
          <span className="task-prop-name"><Icon name="star" size={14} />Stars</span>
          <div className="task-prop-value task-stars" role="radiogroup" aria-label="Stars">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={task.stars === v} aria-label={`${v} ${v === 1 ? 'star' : 'stars'}`}
                className={v <= (task.stars || 0) ? 'is-on' : undefined} onClick={() => save({ stars: task.stars === v ? 0 : v })}>
                <Icon name="star" size={17} />
              </button>
            ))}
          </div>
        </div>

        <section className="task-panel-section" aria-label="Links">
          <header>
            <h3>Links</h3>
            <button type="button" onClick={() => setCustomLinks([...customLinks, { id: crypto.randomUUID(), label: 'Link', url: '' }])}><Icon name="plus" size={12} />Add a link</button>
          </header>
          {linkRow('Submission', 'send', submissionLink, setSubmissionLink, 'Canvas, Turnitin or portal link')}
          {linkRow('Google Docs', 'book', googleDocsLink, setGoogleDocsLink, 'docs.google.com link')}
          {customLinks.map((link, index) => (
            <div key={link.id || index} className="task-panel-link is-custom">
              <input value={link.label} aria-label="Link name" placeholder="Name"
                onChange={(e) => setCustomLinks(customLinks.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)))} onBlur={() => save()} />
              <input type="url" value={link.url} aria-label="Link address" placeholder="https://"
                onChange={(e) => setCustomLinks(customLinks.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)))} onBlur={() => save()} />
              <button type="button" aria-label="Remove link"
                onClick={() => { const next = customLinks.filter((_, i) => i !== index); latest.current.customLinks = next; setCustomLinks(next); save(); }}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </section>

        <TaskPhotos taskId={task.id} />

        <button type="button" className="task-panel-cover" onClick={() => setCaptureCover(true)}>
          <ObjectCoverImage targetKind="task" targetId={task.id} style={{ width: 52, height: 52 }} />
          <span><b>Cover photo</b><small>Turn a photo into something you recognise at a glance.</small></span>
          <Icon name="image" size={18} />
        </button>
        </details>
      </aside>
      {captureCover && <CoverCapture target={{ kind: 'task', id: task.id, title: title || task.title }} onClose={() => setCaptureCover(false)} />}
    </>,
    document.body,
  );
}
