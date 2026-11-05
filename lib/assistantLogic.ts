/** The assistant's pure parts: reversing what it did, and what to suggest on an empty chat. */

/** `after` is the body the assistant left; a restore only applies while the note still holds exactly that. */
export type Undo = { table: 'sorro_tasks' | 'sorro_events' | 'sorro_notes'; id: string; action: 'delete' | 'uncomplete' | 'restore_body'; body?: string; after?: string };

export type ToolDone = { name: string; label: string; undo?: Undo; link?: string; undone?: boolean };

export type StreamState = {
  text: string;
  /** Sent first, so a stream that drops still knows which chat the server saved into. */
  chat_id?: string;
  done?: { chat_id: string; tools: ToolDone[] };
  error?: { error: string; retry: string | null; chat_id?: string; tools: ToolDone[] };
};

/** One event of the assistant's stream applied to what has arrived so far. */
export function foldStream(s: StreamState, ev: { event: string; data: string }): StreamState {
  if (ev.event === 'start') return { ...s, chat_id: JSON.parse(ev.data).chat_id };
  if (ev.event === 'text') return { ...s, text: s.text + JSON.parse(ev.data) };
  if (ev.event === 'done') return { ...s, done: JSON.parse(ev.data) };
  if (ev.event === 'error') { const e = JSON.parse(ev.data); return { ...s, error: { error: e.error, retry: e.retry ?? null, chat_id: e.chat_id, tools: e.tools ?? [] } }; }
  return s;
}

export type OpenItem = { kind: 'note' | 'task' | 'event'; id: string };

/** Where the user is when they talk to the fox from the sheet, so "move this to Friday" has a "this". */
export function chatContext(tab: string, item: OpenItem | null): string {
  return item ? `The user is on the ${tab} tab with ${item.kind} ${item.id} open.` : `The user is on the ${tab} tab.`;
}

const REACH = new Set(['sorro_tasks', 'sorro_events', 'sorro_notes']);

/** The change to make, and `only`: what the row must still hold, so an undo never overwrites later edits. */
export function undoChange(u: Undo, now: string): { table: Undo['table']; id: string; patch: Record<string, unknown>; only: Record<string, unknown> } {
  if (!REACH.has(u.table)) throw new Error('The assistant cannot change that table.');
  if (u.action === 'delete') return { table: u.table, id: u.id, patch: { deleted_at: now }, only: { deleted_at: null } };
  if (u.action === 'uncomplete') return { table: u.table, id: u.id, patch: { done: false, completed_at: null }, only: { done: true } };
  if (u.action === 'restore_body' && typeof u.body === 'string' && typeof u.after === 'string') return { table: u.table, id: u.id, patch: { body: u.body }, only: { body: u.after } };
  throw new Error('Unknown undo.');
}

export function suggestions(s: { dueToday: number; overdue: number; eventsTomorrow: number; notebooks: string[] }): string[] {
  const out: string[] = [];
  if (s.overdue > 0) out.push('What is overdue?');
  else if (s.dueToday > 0) out.push(`What's due today?`);
  if (s.eventsTomorrow > 0) out.push(`Plan tomorrow around my ${s.eventsTomorrow} event${s.eventsTomorrow === 1 ? '' : 's'}`);
  if (s.notebooks[0]) out.push(`Summarize my ${s.notebooks[0]} notes`);
  for (const fallback of ['Plan my week', 'Add a task for tomorrow']) if (out.length < 2) out.push(fallback);
  return out.slice(0, 3);
}
