'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useLists, useTasks, useTaskActions, type Task } from '@/lib/tasks';
import { K, SECHUE } from '@/lib/pal';

export default function TasksPage() {
  const { data: lists = [] } = useLists();
  const { data: tasks = [], isLoading } = useTasks();
  const actions = useTaskActions();

  // Rows animate out for 380 ms before they leave the list.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());

  const complete = (t: Task) => {
    setLeaving((s) => new Set(s).add(t.id));
    // Do not block the animation on the response.
    setTimeout(() => {
      actions.complete.mutate({ id: t.id, done: true });
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
    }, K.taskExitMs);
  };

  const open = tasks.filter((t) => !t.done);
  const grouped = lists
    .map((l) => ({ list: l, items: open.filter((t) => t.list_id === l.id) }))
    .concat([{ list: { id: '__none', name: 'Inbox', color: SECHUE.tasks, position: 999 }, items: open.filter((t) => !t.list_id) }])
    .filter((g) => g.items.length > 0 || g.list.id !== '__none');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>Tasks</h1>
        <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 600 }}>
          {open.length} open
        </span>
      </div>

      {isLoading && <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Loading…</p>}

      {grouped.map(({ list, items }) => (
        <section key={list.id} style={{ marginBottom: 26 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.11em',
              textTransform: 'uppercase',
              color: 'var(--tx3)',
              marginBottom: 9,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: list.color || SECHUE.tasks }} />
            {list.name}
            <span style={{ color: 'var(--tx3)', opacity: 0.7 }}>{items.length}</span>
          </div>

          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              boxShadow: 'var(--sh)',
              overflow: 'hidden',
            }}
          >
            {items.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                leaving={leaving.has(t.id)}
                index={i}
                onComplete={() => complete(t)}
                onStar={(n) => actions.update.mutate({ id: t.id, patch: { stars: n } })}
                onDelete={() => actions.removeWithUndo(t)}
              />
            ))}

            <InlineAdd
              listId={list.id === '__none' ? null : list.id}
              onAdd={(title, listId) =>
                actions.create.mutate({ id: crypto.randomUUID(), title, listId })
              }
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  leaving,
  index,
  onComplete,
  onStar,
  onDelete,
}: {
  task: Task;
  leaving: boolean;
  index: number;
  onComplete: () => void;
  onStar: (n: number) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={leaving ? 'leaving' : 'lensrow'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '11px 14px',
        borderBottom: '1px solid var(--line)',
        animationDelay: leaving ? undefined : `${Math.min(index, 8) * 0.02}s`,
      }}
    >
      <button
        onClick={onComplete}
        aria-label={`Complete ${task.title}`}
        style={{
          width: 19,
          height: 19,
          flex: 'none',
          borderRadius: 7,
          border: '1px solid var(--line2)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {task.done && <Icon name="task" size={12} color="var(--acc)" />}
      </button>

      <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4, textWrap: 'pretty' }}>{task.title}</span>

      {/* stars 0–3; pressing the current value clears it back to 0 */}
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            onClick={() => onStar(task.stars === n ? 0 : n)}
            aria-label={`Priority ${n}`}
            style={{ padding: 3, minWidth: 22, minHeight: 22 }}
          >
            <Icon name="star" size={13} color={task.stars >= n ? 'var(--pal-amber)' : 'var(--tx3)'} />
          </button>
        ))}
      </div>

      {task.due_on && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', flex: 'none' }}>
          {new Date(task.due_on).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}

      <button onClick={onDelete} aria-label="Delete task" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
        <Icon name="trash" size={13} color="var(--tx3)" />
      </button>
    </div>
  );
}

function InlineAdd({
  listId,
  onAdd,
}: {
  listId: string | null;
  onAdd: (title: string, listId: string | null) => void;
}) {
  const [value, setValue] = useState('');

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    onAdd(title, listId);
    setValue('');
  };

  return (
    <div className="row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px' }}>
      <Icon name="plus" size={15} color="var(--tx3)" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        onBlur={submit}
        placeholder="Add a task"
        style={{ flex: 1, fontSize: 13.5, color: 'var(--tx)', minHeight: 22 }}
      />
    </div>
  );
}
