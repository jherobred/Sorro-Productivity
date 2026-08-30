'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';

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
  position: number;
  deleted_at: string | null;
  /** When it was ticked. Written by COMPLETE below; read so a screen can tell
      "did anything get done today" without a second query. */
  completed_at?: string | null;
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
  customLinks: CustomTaskLink[];
  cleanNotes: string;
};

/**
 * Extracts Submission Link, Google Docs Link, and multiple custom links from task notes.
 */
export function parseTaskLinks(rawNotes: string = ''): ParsedTaskLinks {
  let submissionLink = '';
  let googleDocsLink = '';
  const customLinks: CustomTaskLink[] = [];
  const lines = (rawNotes || '').split('\n');
  const remainingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      remainingLines.push(line);
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
    customLinks,
    cleanNotes: remainingLines.join('\n').trim(),
  };
}

/**
 * Serializes clean notes + Submission Link + Google Docs Link + Custom links into a stored markdown string.
 */
export function serializeTaskWithLinks(
  cleanNotes: string,
  submissionLink: string,
  googleDocsLink: string,
  customLinks: CustomTaskLink[]
): string {
  const parts: string[] = [];
  const text = cleanNotes.trim();
  if (text) parts.push(text);

  const linkLines: string[] = [];
  if (submissionLink.trim()) {
    linkLines.push(`🔗 Submission Link: ${submissionLink.trim()}`);
  }
  if (googleDocsLink.trim()) {
    linkLines.push(`📄 Google Docs Link: ${googleDocsLink.trim()}`);
  }
  for (const cl of customLinks) {
    if (cl.url.trim()) {
      linkLines.push(`🔗 ${cl.label.trim() || 'Link'}: ${cl.url.trim()}`);
    }
  }

  if (linkLines.length > 0) {
    parts.push(linkLines.join('\n'));
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
        .from('bd_lists')
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
        .from('bd_tasks')
        .select('id,list_id,title,notes,done,due_on,due_at,priority,stars,position,deleted_at,completed_at')
        .is('deleted_at', null)
        .order('position');
      if (error) throw error;
      return data ?? [];
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
};

const CREATE = defineMutation('task.create', async (v: NewTask) => {
  const user_id = await currentUserId();
  const targetListId = v.listId || v.list_id || null;
  const { error } = await supabase.from('bd_tasks').insert({
    id: v.id,
    user_id,
    title: v.title.trim(),
    list_id: targetListId,
    notes: v.notes ?? '',
    due_on: v.due_on || null,
    due_at: v.due_at || null,
    priority: v.priority || null,
    stars: v.stars ?? 0,
    position: Date.now() % 2_000_000_000,
  });
  if (error) throw error;
});

const UPDATE = defineMutation('task.update', async (v: { id: string; patch: Partial<Task> }) => {
  const sanitizedPatch: Record<string, unknown> = { ...v.patch };
  if ('listId' in sanitizedPatch && !('list_id' in sanitizedPatch)) {
    sanitizedPatch.list_id = (sanitizedPatch as Record<string, unknown>).listId;
    delete (sanitizedPatch as Record<string, unknown>).listId;
  }
  if (sanitizedPatch.list_id === '') sanitizedPatch.list_id = null;
  if (sanitizedPatch.due_on === '') sanitizedPatch.due_on = null;
  if (sanitizedPatch.due_at === '') sanitizedPatch.due_at = null;
  if (sanitizedPatch.priority === '') sanitizedPatch.priority = null;

  const { error } = await supabase.from('bd_tasks').update(sanitizedPatch).eq('id', v.id);
  if (error) throw error;
});

const COMPLETE = defineMutation('task.complete', async (v: { id: string; done: boolean }) => {
  const { error } = await supabase
    .from('bd_tasks')
    .update({ done: v.done, completed_at: v.done ? new Date().toISOString() : null })
    .eq('id', v.id);
  if (error) throw error;
});

const DELETE = defineMutation('task.delete', async (v: { id: string }) => {
  // Soft delete — undo has to survive a refresh, so it is a column, not memory.
  const { error } = await supabase
    .from('bd_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('task.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_tasks', p_id: v.id });
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
    onMutate: (v: { id: string; patch: Partial<Task> }) =>
      optimistic((prev) => prev.map((t) => (t.id === v.id ? { ...t, ...v.patch } : t))),
    onError: (err, _v, ctx) => {
      rollback(err, _v, ctx);
      toast(err instanceof Error ? err.message : 'Could not update task');
    },
    onSettled: settle,
  });

  const complete = useMutation({
    mutationKey: COMPLETE,
    onMutate: (v: { id: string; done: boolean }) =>
      optimistic((prev) => prev.map((t) => (t.id === v.id ? { ...t, done: v.done } : t))),
    onError: rollback,
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
