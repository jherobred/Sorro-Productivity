'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';
import { foxGlad } from './foxMood';
import { getPrefs, setPrefs } from './prefs';
import { nextDue, isRepeat } from './taskRepeat';
import { changeFixture } from './devFixtures';

export type Task = {
  id: string;
  list_id: string | null;
  title: string;
  notes: string;
  done: boolean;
  due_on: string | null;
  /** A precise slot on the calendar. Without one the task sits in the all-day
      tray; `due_on` stays the date the Tasks page groups by either way. */
  due_at?: string | null;
  // Drives the checkbox ring colour (priCol in the prototype): high→coral,
  // med→amber, low/null→tx3.
  priority: 'low' | 'med' | 'high' | null;
  stars: number;
  /** Minutes of focus logged from the Focus widget. */
  focus_minutes?: number;
  position: number;
  deleted_at: string | null;
  /** When it was ticked. Written by COMPLETE below; read so a screen can tell
      "did anything get done today" without a second query. */
  completed_at?: string | null;
  /** Course / Subject code or name (e.g. CS 101, MATH 20) */
  course?: string | null;
  /** Where a synced task came from, 'canvas_lms' for a Canvas assignment. Null for your own. */
  source?: string | null;
  /** Calendar-only projection. Canvas's real deadline is never overwritten by a study plan. */
  calendar_original_due_at?: string | null;
  calendar_original_due_on?: string | null;
  calendar_planned?: boolean;
};

export type List = { id: string; name: string; color: string; position: number };

export type TaskAlert = {
  tier: 'red' | 'orange' | 'yellow';
  emoji: string;
  label: string;
  speed: string;
};

/**
 * Calculates deadline proximity and returns alert hierarchy with emoji and animation speed:
 * - Red (Fast 0.8s flash + 🚨): 24 hours left (or overdue).
 * - Orange (Medium 1.4s flash + ⏰): 2 days left (24h - 48h).
 * - Yellow (Slow 2.2s flash + ⏳): 3 days left (48h - 72h).
 */
export function getTaskAlert(task: Task): TaskAlert | null {
  if (task.done) return null;
  if (!task.due_on && !task.due_at) return null;

  const now = Date.now();
  let dueTime: number;

  if (task.due_at) {
    dueTime = new Date(task.due_at).getTime();
  } else {
    const [y, m, d] = task.due_on!.split('-').map(Number);
    dueTime = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }

  const diffMs = dueTime - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 24) {
    return {
      tier: 'red',
      emoji: '🚨',
      label: diffHours < 0 ? 'Overdue' : 'Due within 24h',
      speed: '0.8s',
    };
  }

  if (diffHours <= 48) {
    return {
      tier: 'orange',
      emoji: '⏰',
      label: '2 days left',
      speed: '1.4s',
    };
  }

  if (diffHours <= 72) {
    return {
      tier: 'yellow',
      emoji: '⏳',
      label: '3 days left',
      speed: '2.2s',
    };
  }

  return null;
}

/**
 * Returns dynamic live countdown timer details for task deadlines:
 * - Overdue: "Overdue 2h 15m" or "Overdue 14m 20s"
 * - Today: "02:14:35 left"
 * - Tomorrow / days: "1d 6h left"
 */
export function formatTaskCountdown(task: Task, nowMs: number = Date.now()): {
  text: string;
  isOverdue: boolean;
  totalMs: number;
} | null {
  if (task.done) return null;
  if (!task.due_on && !task.due_at) return null;

  let dueTime: number;
  if (task.due_at) {
    dueTime = new Date(task.due_at).getTime();
  } else {
    const [y, m, d] = task.due_on!.split('-').map(Number);
    dueTime = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }

  const diffMs = dueTime - nowMs;
  const isOverdue = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const days = Math.floor(absMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((absMs % (1000 * 60)) / 1000);

  if (isOverdue) {
    if (days > 0) return { text: `Overdue ${days}d ${hours}h`, isOverdue: true, totalMs: diffMs };
    if (hours > 0) return { text: `Overdue ${hours}h ${mins}m`, isOverdue: true, totalMs: diffMs };
    return { text: `Overdue ${mins}m ${secs}s`, isOverdue: true, totalMs: diffMs };
  }

  if (days > 1) {
    return { text: `${days}d ${hours}h left`, isOverdue: false, totalMs: diffMs };
  }
  if (days === 1) {
    return { text: `1d ${hours}h left`, isOverdue: false, totalMs: diffMs };
  }
  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return { text: `${hh}:${mm}:${ss} left`, isOverdue: false, totalMs: diffMs };
  }
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return { text: `${mm}:${ss} left`, isOverdue: false, totalMs: diffMs };
}

export type CustomTaskLink = {
  id: string;
  label: string;
  url: string;
};

export type ParsedTaskLinks = {
  submissionLink: string;
  googleDocsLink: string;
  course: string;
  customLinks: CustomTaskLink[];
  cleanNotes: string;
};

/**
 * Extracts Submission Link, Google Docs Link, Course/Subject, and multiple custom links from task notes.
 */
export function parseTaskLinks(rawNotes: string = ''): ParsedTaskLinks {
  let submissionLink = '';
  let googleDocsLink = '';
  let course = '';
  const customLinks: CustomTaskLink[] = [];
  const lines = (rawNotes || '').split('\n');
  const remainingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      remainingLines.push(line);
      continue;
    }

    // Match Course / Subject tag
    const courseMatch = trimmed.match(/^(?:📚\s*|🏷️\s*)?(?:\[\s*)?Course(?:\s*[\/:]\s*|\s*:\s*)(?<courseVal>[^\]\n]+)(?:\])?$/i)
      || trimmed.match(/^(?:📚\s*|🏷️\s*)?(?:\[\s*)?Subject(?:\s*[\/:]\s*|\s*:\s*)(?<courseVal2>[^\]\n]+)(?:\])?$/i);

    if (courseMatch) {
      course = (courseMatch.groups?.courseVal || courseMatch.groups?.courseVal2 || '').trim();
      continue;
    }

    // Match Submission Link
    const subMatch = trimmed.match(/^(?:🔗\s*|📄\s*)?Submission(?:\s*Link)?:\s*(?<url>https?:\/\/[^\s]+)/i)
      || trimmed.match(/^\[Submission(?: Link)?\]\((?<url>https?:\/\/[^\s\)]+)\)/i);

    // Match Google Docs Link
    const docsMatch = trimmed.match(/^(?:📄\s*|🔗\s*)?Google\s*Docs?(?:\s*Link)?:\s*(?<url>https?:\/\/[^\s]+)/i)
      || trimmed.match(/^\[Google Docs?(?: Link)?\]\((?<url>https?:\/\/[^\s\)]+)\)/i);

    // Match Custom Named Link: e.g. "🔗 Figma: https://..." or "Link 1: https://..." or "[Portfolio](https://...)"
    const customMatch = trimmed.match(/^(?:🔗\s*|📄\s*)?(?:\[(?<label>[^\]]+)\]\((?<url>https?:\/\/[^\s\)]+)\)|(?<label2>[A-Za-z0-9\s_\-]+):\s*(?<url2>https?:\/\/[^\s]+))/i);

    // Match plain 🔗 url
    const emojiMatch = trimmed.match(/^🔗\s*(?<url>https?:\/\/[^\s]+)$/i);

    if (subMatch?.groups?.url) {
      submissionLink = subMatch.groups.url;
    } else if (docsMatch?.groups?.url) {
      googleDocsLink = docsMatch.groups.url;
    } else if (customMatch) {
      const label = (customMatch.groups?.label || customMatch.groups?.label2 || '').trim();
      const url = (customMatch.groups?.url || customMatch.groups?.url2 || '').trim();
      if (url) {
        if (label.toLowerCase().includes('submission')) {
          submissionLink = url;
        } else if (label.toLowerCase().includes('google doc') || label.toLowerCase().includes('gdoc') || url.includes('docs.google.com')) {
          googleDocsLink = url;
        } else {
          customLinks.push({ id: crypto.randomUUID(), label: label || 'Link', url });
        }
      } else {
        remainingLines.push(line);
      }
    } else if (emojiMatch?.groups?.url) {
      const url = emojiMatch.groups.url;
      if (url.includes('docs.google.com') && !googleDocsLink) {
        googleDocsLink = url;
      } else {
        customLinks.push({ id: crypto.randomUUID(), label: 'Link', url });
      }
    } else {
      remainingLines.push(line);
    }
  }

  return {
    submissionLink,
    googleDocsLink,
    course,
    customLinks,
    cleanNotes: remainingLines.join('\n').trim(),
  };
}

/**
 * Serializes clean notes + Course + Submission Link + Google Docs Link + Custom links into a stored markdown string.
 */
export function serializeTaskWithLinks(
  cleanNotes: string,
  submissionLink: string,
  googleDocsLink: string,
  customLinks: CustomTaskLink[],
  course?: string | null
): string {
  const parts: string[] = [];
  const text = cleanNotes.trim();
  if (text) parts.push(text);

  const metaLines: string[] = [];
  if (course && course.trim()) {
    metaLines.push(`📚 Course: ${course.trim()}`);
  }
  if (submissionLink.trim()) {
    metaLines.push(`🔗 Submission Link: ${submissionLink.trim()}`);
  }
  if (googleDocsLink.trim()) {
    metaLines.push(`📄 Google Docs Link: ${googleDocsLink.trim()}`);
  }
  for (const cl of customLinks) {
    if (cl.url.trim()) {
      metaLines.push(`🔗 ${cl.label.trim() || 'Link'}: ${cl.url.trim()}`);
    }
  }

  if (metaLines.length > 0) {
    parts.push(metaLines.join('\n'));
  }

  return parts.join('\n\n');
}

const TASKS_KEY = ['tasks'] as const;
const LISTS_KEY = ['lists'] as const;

export function useLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: async (): Promise<List[]> => {
      const { data, error } = await supabase
        .from('sorro_lists')
        .select('id,name,color,position')
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('sorro_tasks')
        .select('id,list_id,title,notes,done,due_on,due_at,priority,stars,position,deleted_at,completed_at,source,focus_minutes')
        .is('deleted_at', null)
        .order('position')
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((t) => {
        const parsed = parseTaskLinks(t.notes);
        return {
          ...t,
          course: (t as unknown as { course?: string | null }).course || parsed.course || null,
        };
      });
    },
  });
}

/* ---- Mutations -----------------------------------------------------------
   Registered at module scope so a write queued offline can still be replayed
   after a full app restart, when the original closure is long gone. */

/**
 * Everything the composer can collect, not just a title. Creating a task and
 * then opening it to set the three things you already knew was two steps for
 * one intention.
 */
export type NewTask = {
  id: string;
  title: string;
  listId?: string | null;
  list_id?: string | null;
  notes?: string;
  due_on?: string | null;
  due_at?: string | null;
  priority?: 'low' | 'med' | 'high' | null;
  stars?: number;
  course?: string | null;
};

const CREATE = defineMutation('task.create', async (v: NewTask) => {
  const user_id = await currentUserId();
  const targetListId = v.listId || v.list_id || null;
  const parsed = parseTaskLinks(v.notes ?? '');
  const course = v.course || parsed.course || '';
  const finalNotes = serializeTaskWithLinks(
    parsed.cleanNotes,
    parsed.submissionLink,
    parsed.googleDocsLink,
    parsed.customLinks,
    course
  );
  const { error } = await supabase.from('sorro_tasks').insert({
    id: v.id,
    user_id,
    title: v.title.trim(),
    list_id: targetListId,
    notes: finalNotes,
    due_on: v.due_on || null,
    due_at: v.due_at || null,
    priority: v.priority || null,
    stars: v.stars ?? 0,
    position: Date.now() % 2_000_000_000,
  });
  if (error) throw error;
});

const VALID_DB_TASK_COLS = new Set([
  'list_id',
  'title',
  'notes',
  'done',
  'due_on',
  'due_at',
  'priority',
  'stars',
  'position',
  'deleted_at',
  'completed_at',
]);

const UPDATE = defineMutation('task.update', async (v: { id: string; patch: Partial<Task> }) => {
  if (changeFixture<Task>('tasks', rows => rows.map(t => t.id === v.id ? { ...t, ...v.patch } : t))) return;
  const rawPatch: Record<string, unknown> = { ...v.patch };
  if ('listId' in rawPatch && !('list_id' in rawPatch)) {
    rawPatch.list_id = rawPatch.listId;
    delete rawPatch.listId;
  }

  let newNotes = typeof rawPatch.notes === 'string' ? rawPatch.notes : undefined;
  if ('course' in rawPatch && newNotes === undefined) {
    const currentTasks = queryClient.getQueryData<Task[]>(TASKS_KEY) ?? [];
    const currentTask = currentTasks.find((t) => t.id === v.id);
    if (currentTask) {
      const parsed = parseTaskLinks(currentTask.notes ?? '');
      newNotes = serializeTaskWithLinks(
        parsed.cleanNotes,
        parsed.submissionLink,
        parsed.googleDocsLink,
        parsed.customLinks,
        typeof rawPatch.course === 'string' ? rawPatch.course : null
      );
    }
  }

  const sanitizedPatch: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(rawPatch)) {
    if (VALID_DB_TASK_COLS.has(k)) {
      sanitizedPatch[k] = val === '' ? null : val;
    }
  }

  if (newNotes !== undefined) {
    sanitizedPatch.notes = newNotes;
  }

  if (Object.keys(sanitizedPatch).length === 0) return;

  const { error } = await supabase.from('sorro_tasks').update(sanitizedPatch).eq('id', v.id);
  if (error) throw error;
});

const COMPLETE = defineMutation('task.complete', async (v: { id: string; done: boolean }) => {
  const { error } = await supabase
    .from('sorro_tasks')
    .update({ done: v.done, completed_at: v.done ? new Date().toISOString() : null })
    .eq('id', v.id);
  if (error) throw error;
});

const DELETE = defineMutation('task.delete', async (v: { id: string }) => {
  // Soft delete — undo has to survive a refresh, so it is a column, not memory.
  const { error } = await supabase
    .from('sorro_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('task.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('sorro_restore', { p_table: 'sorro_tasks', p_id: v.id });
  if (error) throw error;
});

/** Optimistically patch the cached list; returns the snapshot for rollback. */
function optimistic(fn: (prev: Task[]) => Task[]) {
  const prev = queryClient.getQueryData<Task[]>(TASKS_KEY) ?? [];
  queryClient.setQueryData<Task[]>(TASKS_KEY, fn(prev));
  return prev;
}

const rollback = (_e: unknown, _v: unknown, ctx: Task[] | undefined) => {
  if (ctx) queryClient.setQueryData(TASKS_KEY, ctx);
};

/** The repeating tasks finished in this visit and the task each made, so undoing the tick takes the new one back. */
const cameBack = new Map<string, string>();
const completionRevisions = new Map<string, number>();
const pad2 = (n: number) => String(n).padStart(2, '0');
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

export function useTaskActions() {
  const qc = useQueryClient();
  const settle = settler(qc, TASKS_KEY);

  const create = useMutation({
    mutationKey: CREATE,
    onMutate: (v: NewTask) => {
      const targetListId = v.listId || v.list_id || null;
      return optimistic((prev) => [
        ...prev,
        {
          id: v.id,
          list_id: targetListId,
          title: v.title.trim(),
          notes: v.notes ?? '',
          done: false,
          due_on: v.due_on ?? null,
          due_at: v.due_at ?? null,
          priority: v.priority ?? null,
          stars: v.stars ?? 0,
          position: Number.MAX_SAFE_INTEGER,
          deleted_at: null,
          course: v.course ?? null,
        },
      ]);
    },
    onError: (err, _v, ctx) => {
      rollback(err, _v, ctx);
      toast(err instanceof Error ? err.message : 'Could not create task');
    },
    onSettled: settle,
  });

  const update = useMutation({
    mutationKey: UPDATE,
    onMutate: (v: { id: string; patch: Partial<Task> }) => {
      const p = { ...v.patch };
      if ('listId' in p && !('list_id' in p)) {
        p.list_id = (p as Record<string, unknown>).listId as string | null;
        delete (p as Record<string, unknown>).listId;
      }
      return optimistic((prev) =>
        prev.map((t) => {
          if (t.id !== v.id) return t;
          const merged = { ...t, ...p };
          if (p.notes !== undefined) {
            const parsed = parseTaskLinks(p.notes);
            merged.course = p.course !== undefined ? p.course : (parsed.course || null);
          }
          return merged;
        })
      );
    },
    onError: (err, _v, ctx) => {
      rollback(err, _v, ctx);
      toast(err instanceof Error ? err.message : 'Could not update task');
    },
    onSettled: settle,
  });

  const subCreate = useMutation<unknown, Error, Subtask>({ mutationKey: SUB_CREATE, onSettled: settler(qc, SUBTASKS_KEY) });

  /**
   * Finishing a repeating task makes the next one, whichever screen it was
   * ticked on: same title, notes, project, priority and steps (unticked), due
   * on the rule's next date, at the same time of day. The rule moves to it.
   */
  const comeBack = (id: string) => {
    const rules = getPrefs().taskRepeat ?? {};
    const rule = rules[id];
    const task = queryClient.getQueryData<Task[]>(TASKS_KEY)?.find((t) => t.id === id);
    if (!task || !isRepeat(rule)) return;
    const due = nextDue(rule, task.due_on, todayYmd());
    if (!due) return;                                            // the rule has run its course
    const next = crypto.randomUUID();
    let due_at: string | null = null;
    if (task.due_at) {
      const at = new Date(task.due_at), [y, m, d] = due.split('-').map(Number);
      due_at = new Date(y, m - 1, d, at.getHours(), at.getMinutes()).toISOString();
    }
    create.mutate({ id: next, title: task.title, listId: task.list_id, notes: task.notes, due_on: due, due_at, priority: task.priority, stars: task.stars, course: task.course ?? null });
    const steps = (queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY) ?? []).filter((st) => st.task_id === id).sort((a, b) => a.position - b.position);
    if (steps.length) {
      const copies = steps.map((st) => ({ id: crypto.randomUUID(), task_id: next, title: st.title, done: false, position: st.position }));
      queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY, (prev) => [...(prev ?? []), ...copies]);
      for (const c of copies) subCreate.mutate(c);
    }
    const { [id]: _moved, ...rest } = rules;
    setPrefs({ taskRepeat: { ...rest, [next]: rule } });
    cameBack.set(id, next);
    toast(`Comes back ${new Date(`${due}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`, undefined, { icon: 'repeat' });
  };
  /** Undoing the tick takes back the task it made, and the rule with it. */
  const stayBack = (id: string) => {
    const next = cameBack.get(id);
    if (!next) return;
    cameBack.delete(id);
    const rules = getPrefs().taskRepeat ?? {};
    const rule = rules[next];
    remove.mutate({ id: next });
    if (rule) { const { [next]: _gone, ...rest } = rules; setPrefs({ taskRepeat: { ...rest, [id]: rule } }); }
  };

  const complete = useMutation({
    mutationKey: COMPLETE,
    scope: { id: 'task-completion' },
    onMutate: (v: { id: string; done: boolean }) => {
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY)?.find(t => t.id === v.id);
      const revision = (completionRevisions.get(v.id) ?? 0) + 1;
      completionRevisions.set(v.id, revision);
      if (v.done) {
        foxGlad();
        comeBack(v.id);
      } else {
        stayBack(v.id);
      }
      // completed_at moves with done, as it does on the server, so "done today" counts at once.
      optimistic((prev) => prev.map((t) => (t.id === v.id ? { ...t, done: v.done, completed_at: v.done ? new Date().toISOString() : null } : t)));
      return { previous, revision };
    },
    onError: (_error, v, context) => {
      // A late failure must not undo another task or a newer tick/Undo.
      if (context?.previous && completionRevisions.get(v.id) === context.revision) {
        const previous = context.previous;
        optimistic(rows => rows.map(t => t.id === v.id ? { ...t, done: previous.done, completed_at: previous.completed_at } : t));
      }
      toast('Task completion could not sync. Please retry.');
    },
    onSettled: settle,
  });

  // mutationFn lives in setMutationDefaults, so the variables type has to be
  // stated explicitly — there is no function signature here to infer from.
  const restore = useMutation<unknown, Error, { id: string }>({
    mutationKey: RESTORE,
    onSettled: settle,
  });

  const remove = useMutation({
    mutationKey: DELETE,
    onMutate: (v: { id: string }) => optimistic((prev) => prev.filter((t) => t.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  /** Delete + toast with a working Undo inside the 4200 ms window. */
  const removeWithUndo = (task: Task) => {
    remove.mutate({ id: task.id });
    toast(`Deleted “${task.title}”`, () => restore.mutate({ id: task.id }));
  };

  return { create, update, complete, remove, restore, removeWithUndo };
}

/* ---- Subtasks and lists ------------------------------------------------ */

/** A step inside a task. sorro_subtasks has no timestamps, so order is `position`. */
export type Subtask = { id: string; task_id: string; title: string; done: boolean; position: number };

const SUBTASKS_KEY = ['subtasks'] as const;

/** Every step of every task in one query, so a row can show "2/5" without a request per task. */
export function useSubtasks() {
  return useQuery({
    queryKey: SUBTASKS_KEY,
    queryFn: async (): Promise<Subtask[]> => {
      const { data, error } = await supabase
        .from('sorro_subtasks')
        .select('id,task_id,title,done,position')
        .order('position')
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const SUB_CREATE = defineMutation('subtask.create', async (v: Subtask) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_subtasks').insert({ ...v, user_id });
  if (error) throw error;
});

const SUB_UPDATE = defineMutation('subtask.update', async (v: { id: string; patch: Partial<Pick<Subtask, 'title' | 'done' | 'position'>> }) => {
  const { error } = await supabase.from('sorro_subtasks').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const SUB_DELETE = defineMutation('subtask.delete', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_subtasks').delete().eq('id', v.id);
  if (error) throw error;
});

function patchSubtasks(fn: (prev: Subtask[]) => Subtask[]) {
  const prev = queryClient.getQueryData<Subtask[]>(SUBTASKS_KEY) ?? [];
  queryClient.setQueryData<Subtask[]>(SUBTASKS_KEY, fn(prev));
  return prev;
}

const rollbackSubtasks = (_e: unknown, _v: unknown, ctx: Subtask[] | undefined) => {
  if (ctx) queryClient.setQueryData(SUBTASKS_KEY, ctx);
};

export function useSubtaskActions() {
  const qc = useQueryClient();
  const settle = settler(qc, SUBTASKS_KEY);

  const create = useMutation({
    mutationKey: SUB_CREATE,
    onMutate: (v: Subtask) => patchSubtasks((prev) => [...prev, v]),
    onError: (err, v, ctx) => {
      rollbackSubtasks(err, v, ctx);
      toast(err instanceof Error ? `Step not added: ${err.message}` : 'Step not added');
    },
    onSettled: settle,
  });

  const update = useMutation({
    mutationKey: SUB_UPDATE,
    onMutate: (v: { id: string; patch: Partial<Pick<Subtask, 'title' | 'done' | 'position'>> }) =>
      patchSubtasks((prev) => prev.map((s) => (s.id === v.id ? { ...s, ...v.patch } : s))),
    onError: rollbackSubtasks,
    onSettled: settle,
  });

  const remove = useMutation({
    mutationKey: SUB_DELETE,
    onMutate: (v: { id: string }) => patchSubtasks((prev) => prev.filter((s) => s.id !== v.id)),
    onError: rollbackSubtasks,
    onSettled: settle,
  });

  return { create, update, remove };
}

const LIST_CREATE = defineMutation('list.create', async (v: List) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_lists').insert({ ...v, user_id });
  if (error) throw error;
});

const LIST_UPDATE = defineMutation('list.update', async (v: { id: string; patch: Partial<Pick<List, 'name' | 'color'>> }) => {
  const { error } = await supabase.from('sorro_lists').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

function patchLists(fn: (prev: List[]) => List[]) {
  const prev = queryClient.getQueryData<List[]>(LISTS_KEY) ?? [];
  queryClient.setQueryData<List[]>(LISTS_KEY, fn(prev));
  return prev;
}

/** Making and renaming lists. Lists are not deleted here: what happens to their tasks is not settled. */
export function useListActions() {
  const qc = useQueryClient();
  const settle = settler(qc, LISTS_KEY);
  const rollback = (_e: unknown, _v: unknown, ctx: List[] | undefined) => { if (ctx) queryClient.setQueryData(LISTS_KEY, ctx); };

  const create = useMutation({
    mutationKey: LIST_CREATE,
    onMutate: (v: List) => patchLists((prev) => [...prev, v]),
    onError: (err, v, ctx) => {
      rollback(err, v, ctx);
      toast(err instanceof Error ? `List not created: ${err.message}` : 'List not created');
    },
    onSettled: settle,
  });

  const update = useMutation({
    mutationKey: LIST_UPDATE,
    onMutate: (v: { id: string; patch: Partial<Pick<List, 'name' | 'color'>> }) =>
      patchLists((prev) => prev.map((l) => (l.id === v.id ? { ...l, ...v.patch } : l))),
    onError: rollback,
    onSettled: settle,
  });

  return { create, update };
}
