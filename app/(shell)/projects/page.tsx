'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { ContextMenu, type CtxContent, type CtxGroup } from '@/components/ContextMenu';
import { TaskItem } from '@/components/tasks/TaskItem';
import { QuickAdd } from '@/components/tasks/QuickAdd';
import { TaskPanel } from '@/components/tasks/TaskPanel';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { triggerFireworks } from '@/lib/fireworks';
import { PAL } from '@/lib/pal';
import { courseIs, TAG_COLORS } from '@/lib/tagList';
import { sortTasks, INBOX } from '@/lib/taskViews';
import { useLists, useListActions, useSubtasks, useTaskActions, useTasks, type List, type NewTask, type Task } from '@/lib/tasks';
import { activeProjects, archivedProjects, inkOn, projectStats, withMeta, type ProjectStats } from '@/lib/projects';
import '../tasks/tasks.css';
import './projects.css';

const TaskDatePicker = dynamic(() => import('@/components/TaskDatePicker').then((m) => m.TaskDatePicker), { ssr: false });

const pad = (n: number) => String(n).padStart(2, '0');
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAfter = (now: number, days: number) => { const d = new Date(now); d.setDate(d.getDate() + days); return localYmd(d); };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SMART = { key: 'smart' as const, desc: false };
const NO_PROJECT_COLOR = '#7c8cff';

function dueWords(t: Task, today: string, now: number): string {
  if (!t.due_on) return '';
  if (t.due_on < today) return 'overdue';
  if (t.due_on === today) return 'today';
  if (t.due_on === dayAfter(now, 1)) return 'tomorrow';
  return new Date(`${t.due_on}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ProjectsPage() {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const { data: lists = [], isPending: listsPending } = useLists();
  const { data: tasks = [], isPending: tasksPending } = useTasks();
  const { data: subtasks = [] } = useSubtasks();
  const A = useTaskActions();
  const L = useListActions();

  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ task: Task; anchor: { top: number; left: number; bottom: number; right: number } } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  useOverlayBack(!!openId, () => { setOpenId(null); setShowDone(false); });
  // My Tasks links straight to a project with ?open=<id>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open');
    if (id) setOpenId(id);
  }, []);

  const meta = prefs.projectMeta;
  const tags = prefs.tags ?? [];
  const today = localYmd(new Date(now));
  const weekEnd = dayAfter(now, 7);
  const active = useMemo(() => activeProjects(lists, meta), [lists, meta]);
  const archived = useMemo(() => archivedProjects(lists, meta), [lists, meta]);
  const byList = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const stepCounts = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const s of subtasks) {
      const e = map.get(s.task_id) ?? { done: 0, total: 0 };
      e.total += 1;
      if (s.done) e.done += 1;
      map.set(s.task_id, e);
    }
    return map;
  }, [subtasks]);
  const statsOf = (id: string | null) => projectStats(tasks, id, today, weekEnd);

  /* ---- projects */
  const newProject = async () => {
    const name = (await ask('New project', { message: 'Tasks for one purpose, like School or GCI World 2026.', placeholder: 'Project name', confirmLabel: 'Create' }))?.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const existing = lists.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (meta?.[existing.id]?.archived) void update({ projectMeta: withMeta(meta, existing.id, { archived: false }) });
      setOpenId(existing.id);
      toast(`${existing.name} already exists, so it is open`);
      return;
    }
    const list: List = { id: crypto.randomUUID(), name, color: TAG_COLORS[lists.length % TAG_COLORS.length].value, position: lists.length };
    L.create.mutate(list);
    setOpenId(list.id);
    toast(`${name} is ready. Add its first task.`, undefined, { tone: 'success', icon: 'proj' });
  };

  const rename = async (l: List) => {
    const name = (await ask('Rename project', { initial: l.name, confirmLabel: 'Rename' }))?.trim();
    if (name && name !== l.name) {
      L.update.mutate({ id: l.id, patch: { name } });
      toast(`Renamed to ${name}`, () => L.update.mutate({ id: l.id, patch: { name: l.name } }));
    }
  };

  const describe = async (l: List) => {
    const note = await ask('Describe the project', { initial: meta?.[l.id]?.note ?? '', placeholder: 'What it is for, in a line', confirmLabel: 'Save' });
    if (note !== null) void update({ projectMeta: withMeta(meta, l.id, { note: note.trim() }) });
  };

  const setArchived = (l: List, archivedNow: boolean) => {
    void update({ projectMeta: withMeta(meta, l.id, { archived: archivedNow }) });
    if (archivedNow && openId === l.id) setOpenId(null);
    toast(archivedNow ? `${l.name} archived. Its tasks stay in My Tasks.` : `${l.name} is back on the shelf`,
      () => void update({ projectMeta: withMeta(meta, l.id, { archived: !archivedNow }) }), { icon: 'archive' });
  };

  const projectMenu = (l: List, x: number, y: number) => setMenu({
    x, y, label: l.name, items: [
      { items: [
        { icon: 'expand', label: 'Open', run: () => setOpenId(l.id) },
        { icon: 'pen', label: 'Rename', run: () => void rename(l) },
        { icon: 'text', label: meta?.[l.id]?.note ? 'Edit description' : 'Add a description', run: () => void describe(l) },
      ] },
      { label: 'Colour', items: TAG_COLORS.map((c) => ({ icon: 'palette' as const, label: c.name, swatch: c.value, checked: l.color.toLowerCase() === c.value, run: () => L.update.mutate({ id: l.id, patch: { color: c.value } }) })) },
      { items: [meta?.[l.id]?.archived
        ? { icon: 'undo', label: 'Restore', run: () => setArchived(l, false) }
        : { icon: 'archive', label: 'Archive', run: () => setArchived(l, true) }] },
    ],
  });

  /* ---- tasks inside a project */
  const complete = (task: Task, at: { x: number; y: number } | null) => {
    A.complete.mutate({ id: task.id, done: !task.done });
    if (!task.done) triggerFireworks(at?.x, at?.y);
    toast(task.done ? `Back on the list: ${task.title}` : `Done: ${task.title}`, () => A.complete.mutate({ id: task.id, done: task.done }), { tone: task.done ? 'info' : 'success', icon: task.done ? 'undo' : 'check' });
  };
  const remove = (task: Task) => {
    A.remove.mutate({ id: task.id });
    if (detail === task.id) setDetail(null);
    toast(`Deleted “${task.title}”`, () => A.restore.mutate({ id: task.id }), { tone: 'danger' });
  };
  const patch = (task: Task, p: Partial<Task>, message: string) => {
    const undo = Object.fromEntries(Object.keys(p).map((k) => [k, task[k as keyof Task] ?? null])) as Partial<Task>;
    A.update.mutate({ id: task.id, patch: p });
    toast(message, () => A.update.mutate({ id: task.id, patch: undo }));
  };
  const create = (task: NewTask) => {
    A.create.mutate(task);
    toast(`Added “${task.title}”`, () => setDetail(task.id), { tone: 'success', icon: 'plus', action: 'Open' });
  };
  const duplicate = (task: Task) => {
    const id = crypto.randomUUID();
    A.create.mutate({ id, title: `${task.title} (copy)`, listId: task.list_id, notes: task.notes, due_on: task.due_on, due_at: task.due_at ?? null, priority: task.priority, stars: task.stars, course: task.course ?? null });
    toast(`Made a copy of “${task.title}”`, () => setDetail(id), { tone: 'success', icon: 'copy', action: 'Open' });
  };
  const onDay = (t: Task, day: string | null): Partial<Task> => {
    if (!day || !t.due_at) return { due_on: day, due_at: null };
    const old = new Date(t.due_at);
    const [y, m, d] = day.split('-').map(Number);
    return { due_on: day, due_at: new Date(y, m - 1, d, old.getHours(), old.getMinutes()).toISOString() };
  };

  const rowMenu = (task: Task, x: number, y: number) => {
    const items: CtxGroup[] = [
      { items: [
        { icon: 'edit', label: 'Open', run: () => setDetail(task.id) },
        { icon: 'pen', label: 'Rename', run: () => setRenaming(task.id) },
        { icon: 'copy', label: 'Duplicate', run: () => duplicate(task) },
      ] },
      { items: [
        { icon: 'cal', label: 'Date', hint: task.due_on ?? 'No date', items: [
          { icon: 'sun', label: 'Today', checked: task.due_on === today, run: () => patch(task, onDay(task, today), 'Moved to today') },
          { icon: 'cal', label: 'Tomorrow', checked: task.due_on === dayAfter(now, 1), run: () => patch(task, onDay(task, dayAfter(now, 1)), 'Moved to tomorrow') },
          { icon: 'clock', label: 'Pick a date and time', run: () => setPicker({ task, anchor: { top: y, left: x, bottom: y, right: x } }) },
          { icon: 'close', label: 'No date', checked: !task.due_on, run: () => patch(task, { due_on: null, due_at: null }, 'Date removed') },
        ] },
        { icon: 'proj', label: 'Move to project', items: [
          { icon: 'task', label: 'No project', checked: !task.list_id, run: () => patch(task, { list_id: null }, 'Moved out of the project') },
          ...active.map((l) => ({ icon: 'proj' as const, label: l.name, swatch: l.color, checked: task.list_id === l.id, run: () => patch(task, { list_id: l.id }, `Moved to ${l.name}`) })),
        ] },
        { icon: 'star', label: task.stars ? 'Remove star' : 'Star', run: () => A.update.mutate({ id: task.id, patch: { stars: task.stars ? 0 : 1 } }) },
      ] },
      { items: [
        { icon: 'check', label: task.done ? 'Mark as not done' : 'Mark done', run: () => complete(task, null) },
        { icon: 'trash', label: 'Delete', danger: true, run: () => remove(task) },
      ] },
    ];
    setMenu({ x, y, label: task.title, items });
  };

  const row = (t: Task) => (
    <TaskItem key={t.id} task={t} list={t.list_id ? byList.get(t.list_id) : undefined}
      tag={t.course ? tags.find((tag) => courseIs(t.course!, tag)) : undefined}
      steps={stepCounts.get(t.id)} showList={false} selected={false} selecting={false} leaving={false}
      phone={phone} time24={prefs.time24} now={now}
      renaming={renaming === t.id} onRenameEnd={() => setRenaming(null)}
      onToggleSelect={() => undefined}
      onCheck={(at) => complete(t, at)}
      onOpen={() => setDetail(t.id)}
      onRename={(title) => patch(t, { title }, `Renamed to “${title}”`)}
      onStar={() => A.update.mutate({ id: t.id, patch: { stars: t.stars ? 0 : 1 } })}
      onSchedule={(rect) => setPicker({ task: t, anchor: rect })}
      onMenu={(x, y) => rowMenu(t, x, y)}
      onDelete={() => remove(t)} />
  );

  const inbox = openId === INBOX;
  const project = openId && !inbox ? byList.get(openId) ?? null : null;
  // A project deleted on another device closes itself.
  useEffect(() => { if (openId && !inbox && !listsPending && !project) setOpenId(null); }, [openId, inbox, listsPending, project]);
  const detailTask = tasks.find((t) => t.id === detail) ?? null;

  const cover = (l: List, s: ProjectStats) => {
    const pct = s.total ? (s.done / s.total) * 100 : 0;
    const ink = inkOn(l.color);
    const note = meta?.[l.id]?.note;
    return (
      <button key={l.id} type="button" className="prj-cover" style={{ '--p': l.color, '--ink': ink } as React.CSSProperties}
        onClick={() => setOpenId(l.id)} onContextMenu={(e) => { e.preventDefault(); projectMenu(l, e.clientX, e.clientY); }}
        aria-label={`${l.name}: ${plural(s.open, 'open task')}${s.overdue ? `, ${s.overdue} overdue` : ''}`}>
        <span className="prj-cover-top">
          <span className="prj-chip">{s.open} open</span>
          {s.overdue > 0 && <span className="prj-chip is-late">{s.overdue} late</span>}
        </span>
        <b className="prj-cover-name">{l.name}</b>
        {note && <small className="prj-cover-note">{note}</small>}
        <span className="prj-cover-next">
          {s.next ? <><Icon name="clock" size={13} />{s.next.title}<em>{dueWords(s.next, today, now)}</em></> : s.open ? 'No dates yet' : s.total ? 'Everything done' : 'No tasks yet'}
        </span>
        <span className="prj-cover-foot">
          <AsciiBar value={pct} hue={ink} showValue={false} shape="slim" label={`${l.name}: ${s.done} of ${s.total} done`} />
          <em>{s.total ? `${s.done} of ${s.total} done` : 'Empty'}</em>
        </span>
      </button>
    );
  };

  /* ---- a project, opened */
  if (openId && (project || inbox)) {
    const id = project?.id ?? null;
    const color = project?.color ?? NO_PROJECT_COLOR;
    const s = statsOf(id);
    const mine = tasks.filter((t) => !t.deleted_at && (t.list_id ?? null) === id);
    const open = sortTasks(mine.filter((t) => !t.done), SMART, now);
    const done = mine.filter((t) => t.done).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    const groups = [
      { id: 'late', title: 'Overdue', hint: 'Past their date', tint: PAL.coral, tasks: open.filter((t) => !!t.due_on && t.due_on < today) },
      { id: 'today', title: 'Today', hint: 'Due before midnight', tint: PAL.amber, tasks: open.filter((t) => t.due_on === today) },
      { id: 'upcoming', title: 'Upcoming', hint: 'After today', tint: PAL.mint, tasks: open.filter((t) => !!t.due_on && t.due_on > today) },
      { id: 'nodate', title: 'No date', hint: 'Whenever you get to them', tint: 'var(--tx3)', tasks: open.filter((t) => !t.due_on) },
    ].filter((g) => g.tasks.length);
    const note = project ? meta?.[project.id]?.note : null;

    return (
      <div className="prj prj-room" style={{ '--p': color, '--ink': inkOn(color) } as React.CSSProperties}>
        <header className="prj-room-head">
          <button type="button" className="prj-back" onClick={() => setOpenId(null)}><Icon name="back" size={16} />Projects</button>
          <div className="prj-room-band">
            <div className="prj-room-title">
              <h1>{project?.name ?? 'No project'}</h1>
              {project
                ? <button type="button" className="prj-room-note" onClick={() => void describe(project)}>{note || 'Add a line about what this project is for'}</button>
                : <p className="prj-room-note">Tasks that are not in a project yet. Move them with the task menu.</p>}
            </div>
            {project && (
              <button type="button" className="prj-room-menu" aria-label="Project options"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); projectMenu(project, r.left - 160, r.bottom + 6); }}>
                <Icon name="dots" size={18} />
              </button>
            )}
            <div className="prj-room-progress">
              <AsciiBar value={s.total ? (s.done / s.total) * 100 : 0} hue={inkOn(color)} showValue={false} label="Project progress" />
              <span>{s.total ? `${s.done} of ${s.total} done` : 'No tasks yet'}{s.overdue ? ` · ${s.overdue} overdue` : ''}{s.week ? ` · ${s.week} due this week` : ''}</span>
            </div>
          </div>
        </header>

        <QuickAdd lists={active} tags={tags} defaults={{ listId: id, course: null, due_on: null, hint: project?.name ?? null }} onCreate={create} />

        {tasksPending ? <p className="prj-muted">Loading tasks…</p> : open.length === 0 ? (
          <div className="prj-empty-room">
            <Icon name={done.length ? 'check' : 'task'} size={22} />
            <p>{done.length ? 'Everything in here is done.' : `Nothing in ${project?.name ?? 'here'} yet. Add the first task above.`}</p>
          </div>
        ) : (
          <div className="task-groups">
            {groups.map((g) => (
              <section key={g.id} className="task-group" style={{ '--tint': g.tint } as React.CSSProperties}>
                <header><i aria-hidden="true" /><h2>{g.title}</h2><span>{g.hint}</span><b>{g.tasks.length}</b></header>
                <div role="list">{g.tasks.map(row)}</div>
              </section>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <section className="task-done-shelf">
            <button type="button" className="task-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
              <Icon name={showDone ? 'chevronDown' : 'chevronRight'} size={14} /><span>Completed</span><b>{done.length}</b>
            </button>
            {showDone && <div role="list">{done.slice(0, 60).map(row)}</div>}
          </section>
        )}

        {menu && <ContextMenu x={menu.x} y={menu.y} kind="tasks" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
        {picker && (
          <TaskDatePicker initialDate={picker.task.due_on}
            initialTime={picker.task.due_at ? new Date(picker.task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : null}
            anchorRect={picker.anchor} onClose={() => setPicker(null)}
            onSave={(due_on, due_at) => patch(picker.task, { due_on, due_at }, due_on ? `Due ${new Date(`${due_on}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Date removed')} />
        )}
        {detailTask && (
          <TaskPanel task={detailTask} lists={active} phone={phone} onClose={() => setDetail(null)}
            onPatch={(p) => A.update.mutate({ id: detailTask.id, patch: p })}
            onComplete={() => complete(detailTask, null)} onDelete={() => remove(detailTask)} onDuplicate={() => duplicate(detailTask)} />
        )}
      </div>
    );
  }

  /* ---- the shelf */
  const loose = statsOf(null);
  return (
    <div className="prj">
      <header className="prj-head">
        <div>
          <h1 className="section-title">Projects</h1>
          <p>Keep tasks together by what they are for, like School or GCI World 2026.</p>
        </div>
        <button type="button" className="prj-new" onClick={() => void newProject()}><Icon name="plus" size={17} />New project</button>
      </header>

      {listsPending ? <p className="prj-muted">Loading projects…</p> : (
        <div className="prj-shelf">
          {active.map((l) => cover(l, statsOf(l.id)))}
          <button type="button" className="prj-cover is-new" onClick={() => void newProject()}>
            <span className="prj-new-mark"><Icon name="plus" size={24} /></span>
            <b>New project</b>
            <small>School, a course, a program, a trip.</small>
          </button>
        </div>
      )}

      <button type="button" className="prj-loose" onClick={() => setOpenId(INBOX)}>
        <span className="prj-loose-mark"><Icon name="task" size={18} /></span>
        <span className="prj-loose-copy">
          <b>No project</b>
          <small>{loose.open ? `${plural(loose.open, 'open task')} not in a project yet${loose.overdue ? `, ${loose.overdue} overdue` : ''}` : 'Every open task belongs to a project'}</small>
        </span>
        <Icon name="chevronRight" size={16} />
      </button>

      {archived.length > 0 && (
        <section className="prj-archived">
          <button type="button" className="prj-archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
            <Icon name={showArchived ? 'chevronDown' : 'chevronRight'} size={14} />Archived<b>{archived.length}</b>
          </button>
          {showArchived && (
            <ul>
              {archived.map((l) => {
                const s = statsOf(l.id);
                return (
                  <li key={l.id} style={{ '--p': l.color } as React.CSSProperties}>
                    <i aria-hidden="true" />
                    <button type="button" className="prj-archived-name" onClick={() => setOpenId(l.id)}><b>{l.name}</b><small>{s.done} of {s.total} done</small></button>
                    <button type="button" className="prj-pill" onClick={() => setArchived(l, false)}>Restore</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} kind="tasks" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
