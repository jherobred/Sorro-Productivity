'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TasksSkeleton } from '@/components/Skeleton';
import { Page } from '@/components/Page';
import { TaskComposer } from '@/components/TaskComposer';
import { K, PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useLists, useTasks, useTaskActions, type Task, type List } from '@/lib/tasks';
import { useLongPress } from '@/lib/useLongPress';
import { toast } from '@/lib/toast';
import { ContextMenu } from '@/components/ContextMenu';

/**
 * Ported from Basedly.dc.html — markup at lines 1081–1189, computed styles at
 * 4571–4645 (`priCol`, `starRow`, `mkTask`, `taskGroups`). Grouping is by due
 * state, not by list; every number here is the prototype's.
 */

const TSW = K.notebookSwipePx; // 156 — swipe reveal width
const ACT = TSW / 3; // 52px per action button

type Row = {
  task: Task;
  listName: string;
  listColor: string;
  late: number;
  dueLabel: string;
  pri: 'High' | 'Med' | 'Low';
};

const PRI_COL: Record<Row['pri'], string> = { High: PAL.coral, Med: PAL.amber, Low: 'var(--tx3)' };

/** High sorts above Med above Low. */
const PRI_RANK: Record<Row['pri'], number> = { High: 3, Med: 2, Low: 1 };

const priOf = (p: string | null): Row['pri'] =>
  p === 'high' ? 'High' : p === 'med' ? 'Med' : 'Low';

/** Days overdue, and the label the row shows. */
function dueInfo(due: string | null): { late: number; label: string } {
  if (!due) return { late: 0, label: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + 'T00:00:00');
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { late: -days, label: `${-days}d late` };
  if (days === 0) return { late: 0, label: 'Today' };
  if (days === 1) return { late: 0, label: 'Tomorrow' };
  return { late: 0, label: d.toLocaleDateString(undefined, { weekday: 'short' }) };
}

export default function TasksPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const { data: lists = [] } = useLists();
  const { data: tasks = [], isPending } = useTasks();
  const A = useTaskActions();

  const [tsw, setTsw] = useState<{ id: string; dx: number; live: boolean } | null>(null);
  const [starHover, setStarHover] = useState<{ id: string; v: number } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const lp = useLongPress();
  const [order, setOrder] = useState<'Due' | 'Priority' | 'Stars' | 'Title'>('Due');

  const byList = new Map(lists.map((l) => [l.id, l]));

  const rows: Row[] = tasks
    .filter((t) => !t.done)
    .map((t) => {
      const l = t.list_id ? byList.get(t.list_id) : undefined;
      const { late, label } = dueInfo(t.due_on);
      return {
        task: t,
        listName: l?.name ?? 'Inbox',
        listColor: l?.color ?? PAL.indigo,
        late,
        dueLabel: label,
        pri: priOf(t.priority),
      };
    });

  // Ordering inside each group. The groups themselves stay chronological —
  // Overdue before Today before Upcoming is the whole point of the screen —
  // so sorting only rearranges rows within a group.
  const ordered = (items: Row[]) => [...items].sort((a, b) =>
    order === 'Priority' ? PRI_RANK[b.pri] - PRI_RANK[a.pri]
      : order === 'Stars' ? b.task.stars - a.task.stars
      : order === 'Title' ? a.task.title.localeCompare(b.task.title)
      : (a.task.due_on ?? '9999').localeCompare(b.task.due_on ?? '9999'));

  /**
   * All three, always — an empty one is information.
   *
   * These used to be filtered out when they had nothing in them, so a good
   * week collapsed the screen to a single "Today" card and you could not tell
   * whether Overdue was empty or whether the app had forgotten to draw it.
   * Nothing overdue is the best thing this page can tell you and it was the
   * one state it refused to show. Each group now says so in a line.
   */
  const groups = [
    { n: 'Overdue', items: ordered(rows.filter((r) => r.late > 0)), tint: PAL.coral, note: order === 'Due' ? 'Oldest first' : `By ${order.toLowerCase()}`, empty: 'Nothing late.' },
    { n: 'Today', items: ordered(rows.filter((r) => !r.late && r.dueLabel === 'Today')), tint: PAL.amber, note: 'Due before midnight', empty: 'Nothing due today.' },
    { n: 'Upcoming', items: ordered(rows.filter((r) => !r.late && r.dueLabel !== 'Today')), tint: PAL.mint, note: 'The rest of the week', empty: 'Nothing scheduled yet.' },
  ];

  const complete = (r: Row) => {
    setLeaving((s) => new Set(s).add(r.task.id));
    setTimeout(() => {
      A.complete.mutate({ id: r.task.id, done: true });
      setLeaving((s) => { const n = new Set(s); n.delete(r.task.id); return n; });
    }, K.taskExitMs);
  };

  const detailTask = tasks.find((t) => t.id === detail) ?? null;

  return (
    <Page
      name="Tasks"
      width="list"
      meta={`${rows.length} open across every list and project`}
      actions={
        <button
          className="hov k-squish"
          title={`Sorted by ${order.toLowerCase()} — click to change`}
          aria-label={`Sorted by ${order.toLowerCase()}. Change sort.`}
          onClick={() => {
            const next = { Due: 'Priority', Priority: 'Stars', Stars: 'Title', Title: 'Due' } as const;
            setOrder(next[order]);
            toast(`Sorted by ${next[order].toLowerCase()}`);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line2)', flex: 'none', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}
        >
          <Icon name="sort" size={15} color="var(--tx2)" />{order}
        </button>
      }
    >

      <TaskComposer
        lists={lists}
        defaultListId={lists[0]?.id ?? null}
        onCreate={(t) => { A.create.mutate(t); toast(`Added “${t.title}”`); }} />

      {/* Pending, not empty. Once the offline cache has been restored there is
          data on the first frame and this never renders. */}
      {isPending && <TasksSkeleton tints={[PAL.coral, PAL.amber, PAL.mint]} />}

      {!isPending && groups.map((g) => (
        <div key={g.n}
          style={{
            background: 'var(--card)', borderRadius: 16, padding: '14px 14px 6px', marginTop: 12,
            boxShadow: 'var(--sh)', border: `1px solid color-mix(in srgb, ${g.tint} 34%, transparent)`,
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, flex: 'none', background: g.tint }} />
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase',
              color: prefs.theme === 'dark'
                ? `color-mix(in srgb, ${g.tint} 100%, transparent)`
                : `color-mix(in srgb, ${g.tint} 66%, #201E1D)`,
            }}>
              {g.n}
            </span>
            <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, color: 'var(--tx3)', border: '1px solid var(--line2)', fontVariantNumeric: 'tabular-nums' }}>
              {g.items.length}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>{g.items.length ? g.note : ''}</span>
          </div>

          {g.items.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '2px 2px 12px' }}>{g.empty}</div>
          )}

          {g.items.map((r) => (
            <TaskRow
              key={r.task.id}
              row={r}
              phone={phone}
              accent={prefs.accent}
              leaving={leaving.has(r.task.id)}
              tsw={tsw?.id === r.task.id ? tsw : null}
              setTsw={setTsw}
              starHover={starHover?.id === r.task.id ? starHover.v : 0}
              setStarHover={setStarHover}
              onCheck={() => complete(r)}
              onOpen={() => { setDetail(r.task.id); setTsw(null); }}
              onDelete={() => A.removeWithUndo(r.task)}
              onStar={(v) => A.update.mutate({ id: r.task.id, patch: { stars: r.task.stars === v ? 0 : v } })}
              lp={lp}
            />
          ))}
        </div>
      ))}

      <div style={{ fontSize: 10.5, color: 'var(--tx3)', padding: '4px 4px 0' }}>
        Swipe a row left to reveal archive, edit and delete.
      </div>

      {lp.ctx && (
        <ContextMenu
          x={lp.ctx.x} y={lp.ctx.y} kind="task" label={lp.ctx.label}
          accent={prefs.accent} dark={prefs.theme === 'dark'}
          onClose={lp.close}
          items={[
            { label: 'Edit', icon: 'edit', run: () => setDetail(lp.ctx!.id) },
            { label: 'Complete', icon: 'task', run: () => A.complete.mutate({ id: lp.ctx!.id, done: true }) },
            { label: 'Clear stars', icon: 'star', run: () => A.update.mutate({ id: lp.ctx!.id, patch: { stars: 0 } }) },
            {
              label: 'Delete', icon: 'trash', danger: true,
              run: () => { const t = tasks.find((x) => x.id === lp.ctx!.id); if (t) A.removeWithUndo(t); },
            },
          ]}
        />
      )}

      {detailTask && (
        <TaskDetail
          task={detailTask}
          lists={lists}
          onClose={() => setDetail(null)}
          onPatch={(patch) => A.update.mutate({ id: detailTask.id, patch })}
          onDelete={() => { A.removeWithUndo(detailTask); setDetail(null); }}
        />
      )}
    </Page>
  );
}

function TaskRow({
  row, phone, accent, leaving, tsw, setTsw, starHover, setStarHover,
  onCheck, onOpen, onDelete, onStar, lp,
}: {
  row: Row;
  phone: boolean;
  accent: string;
  leaving: boolean;
  tsw: { id: string; dx: number; live: boolean } | null;
  setTsw: (v: { id: string; dx: number; live: boolean } | null) => void;
  starHover: number;
  setStarHover: (v: { id: string; v: number } | null) => void;
  onCheck: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onStar: (v: number) => void;
  lp: ReturnType<typeof useLongPress>;
}) {
  const dx = tsw ? tsw.dx : 0;
  const startX = useRef(0);

  const actBtn = (bg: string, tone: string): React.CSSProperties => ({
    width: ACT, height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    fontSize: 9.5, fontWeight: 800, letterSpacing: '.02em', color: tone, background: bg,
  });

  /** Swipe left to reveal; snaps open past a third of the tray. */
  const onPointerDown = (e: React.PointerEvent) => {
    // Hold and swipe share this pointerdown; 7px of movement cancels the hold.
    lp.start(e, 'task', row.task.id, row.task.title);
    startX.current = e.clientX;
    const move = (m: PointerEvent) => {
      const d = Math.max(-TSW, Math.min(0, m.clientX - startX.current));
      setTsw({ id: row.task.id, dx: d, live: true });
    };
    const up = (m: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = m.clientX - startX.current;
      setTsw(d < -TSW / 3 ? { id: row.task.id, dx: -TSW, live: false } : null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const locked = row.task.stars || 0;
  const shown = starHover || locked;
  const [popped, setPopped] = useState(0);

  return (
    <div className={leaving ? 'leaving' : ''} style={{ position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
      <span style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: TSW,
        display: 'flex', alignItems: 'stretch',
        pointerEvents: dx < -8 ? 'auto' : 'none',
      }}>
        <button title="Archive" onClick={onDelete} style={actBtn('var(--card2)', 'var(--tx2)')}>
          <Icon name="archive" size={15} color="var(--tx2)" />Archive
        </button>
        <button title="Edit" onClick={onOpen} style={actBtn(`color-mix(in srgb, ${accent} 26%, var(--card2))`, 'var(--tx)')}>
          <Icon name="edit" size={15} color="var(--tx)" />Edit
        </button>
        <button title="Delete" onClick={onDelete} style={actBtn(PAL.coral, '#0C0F16')}>
          <Icon name="trash" size={15} color="#0C0F16" />Delete
        </button>
      </span>

      <div
        onPointerDown={onPointerDown}
        onContextMenu={(e) => lp.onContextMenu(e, 'task', row.task.id, row.task.title)}
        style={{
          position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 11, padding: '12px 8px',
          background: 'var(--card)', borderBottom: '1px solid var(--line)',
          touchAction: 'pan-y', cursor: 'grab', userSelect: 'none',
          transform: `translateX(${dx}px)`,
          transition: tsw?.live ? 'none' : 'transform .42s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <button
          onClick={onCheck}
          title="Complete"
          className="tap"
          style={{
            width: 19, height: 19, borderRadius: '50%', flex: 'none', marginTop: 1,
            border: `1.6px solid ${PRI_COL[row.pri]}`,
            background: row.pri === 'High' ? `color-mix(in srgb, ${PAL.coral} 18%, transparent)` : 'transparent',
            transition: 'all .2s',
          }}
        />

        <button onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: 'var(--tx)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
            {row.task.title}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, flex: 'none', background: row.listColor }} />
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{row.listName}</span>
          </span>
        </button>

        <span style={phone
          ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flex: 'none' }
          : { display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <span
            onMouseLeave={() => setStarHover(null)}
            title={locked ? `${locked} of 5` : 'Not rated'}
            style={{ display: 'flex', alignItems: 'center', gap: 1, flex: 'none' }}
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => { onStar(v); setPopped(v); }}
                onMouseEnter={() => setStarHover({ id: row.task.id, v })}
                title={`${v} ${v === 1 ? 'star' : 'stars'}`}
                // starpop fires on the star that just locked in.
                className={`tap ${!starHover && popped === v && locked === v ? 'starpop' : ''}`}
                style={{
                  fontSize: 16, lineHeight: 1, padding: '0 1px',
                  color: v <= shown ? (starHover ? accent : 'var(--accTx)') : 'var(--line2)',
                  transition: 'color .16s', transformOrigin: '50% 55%',
                }}
              >
                ★
              </button>
            ))}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: row.late ? PAL.coral : 'var(--tx3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: phone ? 'right' : 'center' }}>
            {row.dueLabel}
          </span>
        </span>
      </div>
    </div>
  );
}

const KICKER: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.11em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

const CHIP = (on: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 9,
  fontSize: 11.5, fontWeight: 700, minHeight: 32,
  border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
  background: on ? 'var(--hov)' : 'transparent',
  color: on ? 'var(--accTx)' : 'var(--tx2)',
});

function TaskDetail({
  task, lists, onClose, onPatch, onDelete,
}: {
  task: Task;
  lists: List[];
  onClose: () => void;
  onPatch: (p: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const stars = task.stars || 0;

  const dues: { n: string; v: string | null }[] = [
    { n: 'Today', v: new Date().toISOString().slice(0, 10) },
    { n: 'Tomorrow', v: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) },
    { n: 'Next week', v: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) },
    { n: 'None', v: null },
  ];

  return (
    <>
      <div onClick={onClose} className="fade" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.44)', zIndex: 30 }} />
      <div className="sheet" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 31,
        maxHeight: 'calc(100% - 56px)', overflowY: 'auto',
        background: 'var(--card)', borderRadius: '22px 22px 0 0', padding: '20px 22px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</div>
          <button onClick={onDelete} className="hov" title="Delete task"
            style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="trash" size={14} color="var(--tx2)" />
          </button>
          <button onClick={onClose} className="hov" style={{ width: 26, height: 26, borderRadius: 8, color: 'var(--tx3)', fontSize: 15 }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '14px 22px' }}>
          <div>
            <div style={KICKER}>Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== task.title && onPatch({ title })}
              style={{ width: '100%', marginTop: 6, padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 13, fontWeight: 600, color: 'var(--tx)' }} />
          </div>

          <div>
            <div style={KICKER}>List</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {lists.map((l) => (
                <button key={l.id} onClick={() => onPatch({ list_id: l.id })} style={CHIP(task.list_id === l.id)}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: l.color }} />
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={KICKER}>Due</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {dues.map((d) => (
                <button key={d.n} onClick={() => onPatch({ due_on: d.v })} style={CHIP(task.due_on === d.v)}>{d.n}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={KICKER}>Rating</div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} onClick={() => onPatch({ stars: stars === v ? 0 : v })} title={`${v} ${v === 1 ? 'star' : 'stars'}`}
                  style={{ fontSize: 16, lineHeight: 1, padding: '0 1px', color: v <= stars ? 'var(--accTx)' : 'var(--line2)', transition: 'color .16s' }}>
                  ★
                </button>
              ))}
              <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
                {stars ? `${stars} of 5` : 'Not rated'}
              </span>
            </span>
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={KICKER}>Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== task.notes && onPatch({ notes })}
            rows={3} placeholder="Add a note…"
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 11, border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          <button onClick={onClose} className="acc"
            style={{ padding: '11px 20px', borderRadius: 11, background: 'var(--acc)', color: '#0C0F16', fontSize: 13, fontWeight: 800 }}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
