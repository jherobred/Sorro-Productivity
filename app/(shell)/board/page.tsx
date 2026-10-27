'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useSpring } from 'motion/react';
import { Icon } from '@/components/Icon';
import { ContextMenu, type CtxContent } from '@/components/ContextMenu';
import { TaskPanel } from '@/components/tasks/TaskPanel';
import { useLists, useSubtasks, useTaskActions, useTasks, type List, type Task } from '@/lib/tasks';
import { getPrefs, setPrefs, usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import { compareTasks, courseNames } from '@/lib/taskViews';
import { COLUMNS, DEFAULT_LIMITS, cardCode, columnName, columnOf, drop, ordered, overLimit, type Col } from '@/lib/board';
import '../tasks/tasks.css';
import './board.css';

const ALL = 'all';      // the single lane of the Status view
const NONE = 'none';    // tasks without a project
const GAP = 10;         // px between cards; matches .bd-list
const DONE_DAYS = 14;   // Done shows what was finished lately, the rest stays in Tasks
const SMART = { key: 'smart' as const, desc: false };
const PRIORITIES = [['high', 'High'], ['med', 'Medium'], ['low', 'Low'], [NONE, 'No priority']] as const;
const LAND = { type: 'spring' as const, stiffness: 520, damping: 40 };

type Over = { col: Col; lane: string; index: number };
type Drag = { id: string; from: Col; fromLane: string; start: Over; over: Over; offX: number; offY: number; w: number; h: number };
type Steps = { done: number; total: number };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayFrom = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function dueLabel(due: string, today: string) {
  if (due === today) return 'Today';
  if (due === dayFrom(1)) return 'Tomorrow';
  if (due === dayFrom(-1)) return 'Yesterday';
  return new Date(`${due}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The column glyphs: dashed for not yet, filling up as work moves right. */
function StatusIcon({ col }: { col: Col }) {
  if (col === 'done') return <svg className="bd-st is-done" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="7" fill="currentColor" /><path d="M4.2 7.2l1.9 1.9 3.8-4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return (
    <svg className={'bd-st is-' + col} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={col === 'backlog' ? '2.2 2' : undefined} />
      {col === 'doing' && <path d="M7 7V3a4 4 0 0 1 0 8z" fill="currentColor" />}
      {col === 'review' && <path d="M7 7V3a4 4 0 1 1-4 4z" fill="currentColor" />}
    </svg>
  );
}

function Bars({ p }: { p: Task['priority'] }) {
  if (!p) return <svg className="bd-bars" viewBox="0 0 14 14" aria-label="No priority"><circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="11" cy="7" r="1.2" /></svg>;
  const n = p === 'high' ? 3 : p === 'med' ? 2 : 1;
  return (
    <svg className={'bd-bars' + (p === 'high' ? ' is-high' : '')} viewBox="0 0 14 14" aria-label={`${p === 'med' ? 'Medium' : p === 'high' ? 'High' : 'Low'} priority`}>
      {[0, 1, 2].map((i) => <rect key={i} x={1.5 + i * 4.2} y={9 - i * 3} width="2.6" height={4 + i * 3} rx=".8" opacity={i < n ? 1 : 0.25} />)}
    </svg>
  );
}

function Ring({ done, total }: Steps) {
  const c = 2 * Math.PI * 5;
  return (
    <svg className="bd-ring" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(c * done) / total} ${c}`} transform="rotate(-90 7 7)" />
    </svg>
  );
}

function CardFace({ t, list, steps, courseColor, today }: { t: Task; list?: List; steps?: Steps; courseColor?: string; today: string }) {
  const late = !t.done && !!t.due_on && t.due_on < today;
  return (
    <>
      <div className="bd-top">
        <span className="bd-code">{cardCode(t.id, list?.name)}</span>
        {list && <span className="bd-tag"><i style={{ background: list.color }} />{list.name}</span>}
      </div>
      <p className="bd-title">{t.title}</p>
      <div className="bd-foot">
        <Bars p={t.priority} />
        {t.due_on && <span className={'bd-due' + (late ? ' is-late' : '')}><Icon name="cal" size={12} />{dueLabel(t.due_on, today)}</span>}
        {t.course && <span className="bd-label" style={{ '--c': courseColor ?? 'var(--tx3)' } as React.CSSProperties}><i />{t.course}</span>}
        <span className="bd-grow" />
        {steps && steps.total > 0 && <span className={'bd-steps' + (steps.done === steps.total ? ' is-full' : '')}><Ring {...steps} />{steps.done}/{steps.total}</span>}
        {t.stars > 0 && <span className="bd-stars"><Icon name="star" size={12} />{t.stars}</span>}
      </div>
    </>
  );
}

function Composer({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <motion.div className="bd-composer" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <textarea autoFocus rows={2} value={text} placeholder="What needs doing?" aria-label="New card title"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (!text.trim()) onClose(); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) { onAdd(text.trim()); setText(''); }
          }
        }} />
      <div><button type="button" className="bd-new" disabled={!text.trim()} onClick={() => { onAdd(text.trim()); setText(''); }}>Add card</button><button type="button" className="bd-add" onClick={onClose}>Cancel</button></div>
    </motion.div>
  );
}

/**
 * The Board: every open task as a card moving Backlog → Todo → In progress →
 * In review → Done. Cards lift and tilt when dragged, columns warn when they
 * pass their work-in-progress limit, and Swimlanes splits the columns by
 * project. Done is the task's own tick, so moving a card there completes it.
 */
export default function BoardPage() {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  const { data: tasks = [], isLoading } = useTasks();
  const { data: lists = [] } = useLists();
  const { data: subtasks = [] } = useSubtasks();
  const A = useTaskActions();
  const map = useMemo(() => prefs.taskBoard ?? {}, [prefs.taskBoard]);
  const limits = { ...DEFAULT_LIMITS, ...prefs.boardLimits };
  const lanesView = prefs.boardView === 'lanes';
  const today = ymd(new Date());

  const [pick, setPick] = useState<string[]>([]);
  const [course, setCourse] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const [composer, setComposer] = useState<{ col: Col; lane: string } | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const boardRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const loop = useRef(0);
  const settle = useRef(0);
  const swallowClick = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const lift = useMotionValue(1);
  const tilt = useMotionValue(0);
  const rotate = useSpring(tilt, { stiffness: 260, damping: 18 });

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const tagColor = useMemo(() => new Map((prefs.tags ?? []).map((t) => [t.name.trim().toLowerCase(), t.color])), [prefs.tags]);
  const steps = useMemo(() => {
    const out = new Map<string, Steps>();
    for (const s of subtasks) { const c = out.get(s.task_id) ?? { done: 0, total: 0 }; c.total++; if (s.done) c.done++; out.set(s.task_id, c); }
    return out;
  }, [subtasks]);

  const cutoff = useMemo(() => new Date(`${dayFrom(-DONE_DAYS)}T00:00`).getTime(), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const onBoard = useMemo(() => tasks.filter((t) => !t.done || (!!t.completed_at && Date.parse(t.completed_at) >= cutoff)), [tasks, cutoff]);
  const byCol = useMemo(() => {
    const out = Object.fromEntries(COLUMNS.map((c) => [c.id, [] as Task[]])) as Record<Col, Task[]>;
    for (const t of onBoard) out[columnOf(t, map)].push(t);
    const now = Date.now();
    for (const c of COLUMNS) {
      out[c.id] = ordered(out[c.id], map, c.id === 'done'
        ? (a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
        : (a, b) => compareTasks(a, b, SMART, now));
    }
    return out;
  }, [onBoard, map]);

  const laneOf = (t: Task) => (t.list_id && listById.has(t.list_id) ? t.list_id : NONE);
  const shown = (t: Task) => (!pick.length || pick.includes(laneOf(t)))
    && (!course || (t.course ?? '').trim().toLowerCase() === course)
    && (!priority || (t.priority ?? NONE) === priority);
  const inCell = (col: Col, lane: string) => byCol[col].filter((t) => shown(t) && (lane === ALL || laneOf(t) === lane));
  const lanes = useMemo(() => {
    if (!lanesView) return [{ id: ALL, name: '', color: '' }];
    const meta = prefs.projectMeta ?? {};
    const out = lists.filter((l) => !meta[l.id]?.archived).map((l) => ({ id: l.id, name: l.name, color: l.color }));
    if (onBoard.some((t) => !t.list_id || !listById.has(t.list_id))) out.push({ id: NONE, name: 'No project', color: 'var(--tx3)' });
    return pick.length ? out.filter((l) => pick.includes(l.id)) : out;
  }, [lanesView, lists, listById, onBoard, pick, prefs.projectMeta]);
  const count = (col: Col) => byCol[col].length - (drag?.from === col ? 1 : 0) + (drag?.over.col === col ? 1 : 0);
  const visible = COLUMNS.reduce((n, c) => n + inCell(c.id, ALL).length, 0);

  // Commit and drop read through this, since they run after the render that started the drag.
  const live = useRef({ byCol, shown, laneOf, listById, tasks, A });
  live.current = { byCol, shown, laneOf, listById, tasks, A };

  // A spot for a task that no longer exists would ride the synced prefs forever.
  useEffect(() => {
    if (isLoading || !tasks.length || tasks.length >= 500) return;
    const ids = new Set(tasks.map((t) => t.id));
    const cur = getPrefs().taskBoard ?? {};
    const stale = Object.keys(cur).filter((id) => !ids.has(id));
    if (!stale.length) return;
    const next = { ...cur };
    for (const id of stale) delete next[id];
    setPrefs({ taskBoard: next });
  }, [tasks, isLoading]);

  useEffect(() => () => cancelAnimationFrame(loop.current), []);

  /** Moves a card and offers the move back. `over.index` counts the cards shown in that cell. */
  const commit = (d: Pick<Drag, 'id' | 'from' | 'fromLane' | 'over'>) => {
    const L = live.current;
    const t = L.tasks.find((x) => x.id === d.id);
    if (!t) return;
    const { col, lane, index } = d.over;
    const full = L.byCol[col].map((x) => x.id).filter((id) => id !== t.id);
    const cellIds = L.byCol[col].filter((x) => x.id !== t.id && L.shown(x) && (lane === ALL || L.laneOf(x) === lane)).map((x) => x.id);
    const at = index < cellIds.length ? full.indexOf(cellIds[index]) : cellIds.length ? full.indexOf(cellIds[cellIds.length - 1]) + 1 : full.length;
    const before = getPrefs().taskBoard ?? {};
    const entries = drop(before, full, t.id, col, at);
    const previous = Object.fromEntries(Object.keys(entries).map((k) => [k, before[k]]));
    setPrefs({ taskBoard: { ...before, ...entries } });
    const doneChanged = (col === 'done') !== t.done;
    if (doneChanged) L.A.complete.mutate({ id: t.id, done: col === 'done' });
    const list = lane === ALL || lane === d.fromLane ? undefined : lane === NONE ? null : lane;
    if (list !== undefined) L.A.update.mutate({ id: t.id, patch: { list_id: list } });
    if (col === d.from && list === undefined) return;
    toast(`${cardCode(t.id, L.listById.get((list === undefined ? t.list_id : list) ?? '')?.name)} moved to ${columnName(col)}`, () => {
      const now = { ...(getPrefs().taskBoard ?? {}) };
      for (const [k, v] of Object.entries(previous)) { if (v) now[k] = v; else delete now[k]; }
      setPrefs({ taskBoard: now });
      if (doneChanged) live.current.A.complete.mutate({ id: t.id, done: t.done });
      if (list !== undefined) live.current.A.update.mutate({ id: t.id, patch: { list_id: t.list_id } });
    }, { tone: 'success', icon: 'check' });
  };

  const moveTo = (t: Task, col: Col) => {
    const from = columnOf(t, getPrefs().taskBoard ?? {});
    if (from === col) return;
    commit({ id: t.id, from, fromLane: ALL, over: { col, lane: ALL, index: Number.MAX_SAFE_INTEGER } });
    setTimeout(() => document.querySelector<HTMLElement>(`[data-card="${t.id}"]`)?.focus(), 60);
  };

  /** Which cell the pointer is over, and where in it, counting cards by their own heights so the gap does not feed back. */
  const retarget = (px: number, py: number) => {
    const d = dragRef.current;
    const hit = (document.elementFromPoint(px, py) as HTMLElement | null)?.closest<HTMLElement>('[data-cell]');
    const list = hit?.querySelector<HTMLElement>('[data-list]');
    if (!d || !hit || !list) return;
    const box = list.getBoundingClientRect();
    const k = list.offsetHeight ? box.height / list.offsetHeight : 1;
    const cards = [...list.querySelectorAll<HTMLElement>('[data-card]')];
    let top = box.top;
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const h = cards[i].offsetHeight * k;
      if (py < top + h / 2) { index = i; break; }
      top += h + GAP * k;
    }
    const over = { col: hit.dataset.col as Col, lane: hit.dataset.lane!, index };
    if (over.col !== d.over.col || over.lane !== d.over.lane || over.index !== d.over.index) setDrag({ ...d, over });
  };

  const follow = (px: number, py: number) => {
    const d = dragRef.current;
    if (!d) return;
    const nx = px - d.offX;
    tilt.set(Math.max(-10, Math.min(10, 3 + (nx - x.get()) * 0.6)));
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => tilt.set(3), 90);
    x.set(nx);
    y.set(py - d.offY);
    pointer.current = { x: px, y: py };
    retarget(px, py);
  };

  /** Near an edge the board and the page scroll themselves, so a card can travel past what fits. */
  const autoScroll = () => {
    const step = () => {
      if (!dragRef.current) return;
      const p = pointer.current;
      const board = boardRef.current;
      const main = document.getElementById('workspace');
      let moved = false;
      if (board && board.scrollWidth > board.clientWidth) {
        const r = board.getBoundingClientRect();
        const dx = p.x < r.left + 60 ? -1 : p.x > r.right - 60 ? 1 : 0;
        if (dx) { const was = board.scrollLeft; board.scrollLeft += dx * 12; moved = board.scrollLeft !== was; }
      }
      if (main) {
        const r = main.getBoundingClientRect();
        const dy = p.y < r.top + 50 ? -1 : p.y > r.bottom - 50 ? 1 : 0;
        if (dy) { const was = main.scrollTop; main.scrollTop += dy * 12; moved ||= main.scrollTop !== was; }
      }
      if (moved) retarget(p.x, p.y);
      loop.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(loop.current);
    loop.current = requestAnimationFrame(step);
  };

  /** The card settles into its gap (or back home), then the move is written. */
  const land = async (cancelled: boolean) => {
    cancelAnimationFrame(loop.current);
    clearTimeout(settle.current);
    let d = dragRef.current;
    if (!d) return;
    if (cancelled) { d = { ...d, over: d.start }; setDrag(d); await nextFrame(); }
    const gap = document.querySelector<HTMLElement>('[data-placeholder]');
    tilt.set(0);
    if (gap && getPrefs().motion !== false) {
      const r = gap.getBoundingClientRect();
      await Promise.all([animate(x, r.left, LAND).finished, animate(y, r.top, LAND).finished, animate(lift, 1, { duration: 0.18 }).finished]);
    }
    if (!cancelled) commit(d);
    setDrag(null);
  };

  const press = (e: React.PointerEvent<HTMLDivElement>, t: Task, col: Col, lane: string) => {
    if (e.button !== 0 || dragRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const touch = e.pointerType === 'touch';
    let started = false;
    let lx = sx;
    let ly = sy;
    swallowClick.current = false;
    const begin = () => {
      started = true;
      swallowClick.current = true;
      const start = { col, lane, index: Math.max(0, inCell(col, lane).findIndex((c) => c.id === t.id)) };
      x.set(r.left); y.set(r.top); tilt.set(3); lift.set(1);
      animate(lift, 1.04, { duration: 0.18 });
      if (touch) navigator.vibrate?.(8);
      setDrag({ id: t.id, from: col, fromLane: lane, start, over: start, offX: sx - r.left, offY: sy - r.top, w: r.width, h: r.height });
      follow(lx, ly);
      autoScroll();
    };
    // A finger has to hold still first, or every scroll down a column would pick a card up.
    const timer = touch ? window.setTimeout(begin, 260) : 0;
    const move = (ev: PointerEvent) => {
      lx = ev.clientX; ly = ev.clientY;
      if (!started) {
        if (Math.hypot(lx - sx, ly - sy) < 6) return;
        if (touch) { end(); return; }
        begin();
      }
      follow(lx, ly);
    };
    const hold = (ev: TouchEvent) => { if (started) ev.preventDefault(); };
    const up = () => { end(); if (started) void land(false); };
    const cancel = () => { end(); if (started) void land(true); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && started) { ev.preventDefault(); cancel(); } };
    function end() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', hold);
      window.removeEventListener('keydown', esc);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', hold, { passive: false });
    window.addEventListener('keydown', esc);
  };

  const add = (title: string, col: Col, lane: string) => {
    const id = crypto.randomUUID();
    const listId = lane === ALL ? (pick.length === 1 && pick[0] !== NONE ? pick[0] : null) : lane === NONE ? null : lane;
    A.create.mutate({ id, title, listId, priority: priority === 'high' || priority === 'med' || priority === 'low' ? priority : null });
    const before = getPrefs().taskBoard ?? {};
    const full = byCol[col].map((x) => x.id);
    setPrefs({ taskBoard: { ...before, ...drop(before, full, id, col, full.length) } });
  };

  const setLimit = async (col: Col) => {
    const value = await ask(`Limit for ${columnName(col)}`, { message: 'How many cards may sit here at once. 0 means no limit.', initial: String(limits[col] ?? 0), confirmLabel: 'Set limit' });
    if (value === null) return;
    const n = Math.max(0, Math.floor(Number(value)));
    if (!Number.isFinite(n)) return;
    setPrefs({ boardLimits: { ...getPrefs().boardLimits, [col]: n } });
  };

  const menuAt = (e: React.MouseEvent<HTMLElement>, label: string, items: CtxContent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 6, label, items });
  };

  const cardMenu = (e: React.MouseEvent, t: Task, col: Col) => {
    e.preventDefault();
    if (dragRef.current) return;
    setMenu({
      x: e.clientX, y: e.clientY, label: t.title, items: [
        { label: 'Open', icon: 'edit', run: () => setDetail(t.id) },
        { label: 'Move to', icon: 'arrowRight', items: COLUMNS.map((c) => ({ label: c.name, icon: 'proj', checked: c.id === col, disabled: c.id === col, run: () => moveTo(t, c.id) })) },
        { label: t.done ? 'Mark not done' : 'Mark done', icon: 'check', run: () => moveTo(t, t.done ? (map[t.id]?.s ?? 'todo') : 'done') },
        { label: 'Delete', icon: 'trash', danger: true, run: () => A.removeWithUndo(t) },
      ],
    });
  };

  const renderList = (col: Col, lane: string) => {
    const rows = inCell(col, lane).filter((t) => t.id !== drag?.id);
    const items = rows.map((t, i) => (
      <motion.div key={t.id} layout="position" data-card={t.id} className="bd-card" role="button" tabIndex={0}
        aria-label={`${t.title}, ${columnName(col)}. Alt and arrow keys move it.`}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ opacity: { delay: Math.min(i * 0.025, 0.2), duration: 0.25 }, y: { delay: Math.min(i * 0.025, 0.2), duration: 0.3 }, layout: LAND }}
        onPointerDown={(e) => press(e, t, col, lane)}
        onClick={() => { if (swallowClick.current) { swallowClick.current = false; return; } setDetail(t.id); }}
        onContextMenu={(e) => cardMenu(e, t, col)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t.id); }
          if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
            e.preventDefault();
            const next = COLUMNS[COLUMNS.findIndex((c) => c.id === col) + (e.key === 'ArrowRight' ? 1 : -1)];
            if (next) moveTo(t, next.id);
          }
        }}>
        <CardFace t={t} list={t.list_id ? listById.get(t.list_id) : undefined} steps={steps.get(t.id)} courseColor={tagColor.get((t.course ?? '').trim().toLowerCase())} today={today} />
      </motion.div>
    ));
    if (drag && drag.over.col === col && drag.over.lane === lane) {
      const over = drag.over.col !== drag.from && overLimit(count(col), limits[col] || undefined);
      items.splice(Math.min(drag.over.index, items.length), 0,
        <motion.div key="gap" layout="position" data-placeholder className={'bd-gap' + (over ? ' is-over' : '')} style={{ height: drag.h }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ layout: LAND }}>
          {over && <span><Icon name="flag" size={14} />Over the limit</span>}
        </motion.div>);
    }
    return <div className="bd-list" data-list>{items}</div>;
  };

  const composerFor = (col: Col, lane: string) => {
    if (col === 'done') return null;
    if (composer?.col === col && composer.lane === lane) return <Composer onAdd={(title) => add(title, col, lane)} onClose={() => setComposer(null)} />;
    return <button type="button" className="bd-add" onClick={() => setComposer({ col, lane })}><Icon name="plus" size={15} />Add card</button>;
  };

  const head = (col: Col) => {
    const n = count(col);
    const limit = limits[col] || undefined;
    const over = overLimit(n, limit);
    return (
      <div className="bd-col-head">
        <StatusIcon col={col} />
        <span className="bd-col-name">{columnName(col)}</span>
        <button type="button" className={'bd-n' + (over ? ' is-over' : '')} title="Set a work-in-progress limit" aria-label={`${n} cards${limit ? ` of ${limit}` : ''}. Set a limit`} onClick={() => void setLimit(col)}>
          <motion.span key={n} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{n}</motion.span>{limit ? `/${limit}` : ''}
        </button>
        <AnimatePresence>
          {over && <motion.span className="bd-over" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>Over limit</motion.span>}
        </AnimatePresence>
        {col !== 'done' && !over && <button type="button" className="bd-plus" aria-label={`Add a card to ${columnName(col)}`} onClick={() => setComposer({ col, lane: lanes[0]?.id ?? ALL })}><Icon name="plus" size={15} /></button>}
      </div>
    );
  };

  const cellClass = (col: Col, lane: string) => 'bd-cell'
    + (drag?.over.col === col && drag.over.lane === lane ? ' is-target' : '')
    + (overLimit(count(col), limits[col] || undefined) ? ' is-over' : '');

  const courses = courseNames(tasks, prefs.tags ?? []);
  const courseLabel = courses.find((c) => c.trim().toLowerCase() === course);
  const detailTask = detail ? tasks.find((t) => t.id === detail) : undefined;
  const dragged = drag ? tasks.find((t) => t.id === drag.id) : undefined;
  const zoom = prefs.fontScale || 1;

  return (
    <MotionConfig reducedMotion={prefs.motion === false ? 'always' : 'never'}>
      <div className="bd-page" data-dragging={!!drag || undefined}>
        <header className="bd-head">
          <h1>Board</h1>
          <span className="bd-sub">{onBoard.length} {onBoard.length === 1 ? 'card' : 'cards'}</span>
          <div className="bd-seg" role="group" aria-label="Board layout">
            {(['status', 'lanes'] as const).map((v) => {
              const on = (v === 'lanes') === lanesView;
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => setPrefs({ boardView: v })}>
                  {on && <motion.span layoutId="bd-seg" className="bd-seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span>{v === 'status' ? 'Status' : 'Swimlanes'}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="bd-bar">
          {lists.length > 0 && (
            <div className="bd-faces" role="group" aria-label="Show projects">
              {lists.map((l) => (
                <button key={l.id} type="button" className="bd-face" title={l.name} aria-label={l.name} aria-pressed={pick.includes(l.id)}
                  style={{ '--c': l.color } as React.CSSProperties}
                  onClick={() => setPick((p) => (p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id]))}>
                  {l.name.charAt(0).toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="bd-chip" aria-pressed={!!course} onClick={(e) => menuAt(e, 'Course', [
            { label: 'Any course', icon: 'tag', checked: !course, run: () => setCourse(null) },
            ...courses.map((c) => ({ label: c, icon: 'tag' as const, checked: course === c.trim().toLowerCase(), run: () => setCourse(c.trim().toLowerCase()) })),
          ])}><Icon name="tag" size={14} />{courseLabel ?? 'Course'}</button>
          <button type="button" className="bd-chip" aria-pressed={!!priority} onClick={(e) => menuAt(e, 'Priority', [
            { label: 'Any priority', icon: 'flag', checked: !priority, run: () => setPriority(null) },
            ...PRIORITIES.map(([id, label]) => ({ label, icon: 'flag' as const, checked: priority === id, run: () => setPriority(id) })),
          ])}><Bars p={priority === 'low' || priority === 'med' || priority === 'high' ? priority : 'med'} />{PRIORITIES.find(([id]) => id === priority)?.[1] ?? 'Priority'}</button>
          {(pick.length > 0 || course || priority) && <button type="button" className="bd-clear" onClick={() => { setPick([]); setCourse(null); setPriority(null); }}>Clear</button>}
          <span className="bd-count">{(pick.length > 0 || course || priority) && `${visible} of ${onBoard.length} shown`}</span>
          <button type="button" className="bd-new" onClick={() => setComposer({ col: 'todo', lane: lanes[0]?.id ?? ALL })}><Icon name="plus" size={15} />New card</button>
        </div>

        {lanesView ? (
          <div className="bd-board is-lanes" ref={boardRef}>
            {COLUMNS.map((c) => <div key={c.id} className="bd-lane-col">{head(c.id)}</div>)}
            {lanes.map((l) => (
              <Fragment key={l.id}>
                <div className="bd-lane-head"><span><i style={{ background: l.color }} />{l.name}<small>{COLUMNS.reduce((n, c) => n + inCell(c.id, l.id).length, 0)}</small></span></div>
                {COLUMNS.map((c) => (
                  <div key={c.id} className={cellClass(c.id, l.id)} data-cell data-col={c.id} data-lane={l.id}>
                    {renderList(c.id, l.id)}
                    {composerFor(c.id, l.id)}
                  </div>
                ))}
              </Fragment>
            ))}
            {!lanes.length && <p className="bd-empty">No projects yet. Make one in Tasks and its cards get a row here.</p>}
          </div>
        ) : (
          <div className="bd-board" ref={boardRef}>
            {COLUMNS.map((c) => (
              <section key={c.id} className="bd-col" data-cell data-col={c.id} data-lane={ALL} aria-label={c.name}>
                {head(c.id)}
                <div className={cellClass(c.id, ALL)}>
                  {renderList(c.id, ALL)}
                  {composerFor(c.id, ALL)}
                  {c.id === 'todo' && !isLoading && !onBoard.length && <p className="bd-empty">Add a card, then drag it across as the work moves.</p>}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {drag && dragged && createPortal(
        <motion.div className="bd-float" style={{ x, y, rotate, scale: lift }} aria-hidden>
          <div className="bd-card is-lifted" style={{ width: drag.w / zoom, zoom }}>
            <CardFace t={dragged} list={dragged.list_id ? listById.get(dragged.list_id) : undefined} steps={steps.get(dragged.id)} courseColor={tagColor.get((dragged.course ?? '').trim().toLowerCase())} today={today} />
          </div>
        </motion.div>,
        document.body,
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} kind="board" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}

      {detailTask && (
        <TaskPanel task={detailTask} lists={lists} phone={phone}
          onClose={() => setDetail(null)}
          onPatch={(patch) => A.update.mutate({ id: detailTask.id, patch })}
          onComplete={() => moveTo(detailTask, detailTask.done ? (map[detailTask.id]?.s ?? 'todo') : 'done')}
          onDelete={() => { A.removeWithUndo(detailTask); setDetail(null); }}
          onDuplicate={() => A.create.mutate({ id: crypto.randomUUID(), title: detailTask.title, listId: detailTask.list_id, notes: detailTask.notes, due_on: detailTask.due_on, due_at: detailTask.due_at, priority: detailTask.priority, stars: detailTask.stars, course: detailTask.course ?? null })} />
      )}
    </MotionConfig>
  );
}
