/** The assistant's pure parts: reversing what it did, and what to suggest on an empty chat. */

export type Undo = { table: 'sorro_tasks' | 'sorro_events' | 'sorro_notes'; id: string; action: 'delete' | 'uncomplete' | 'restore_body'; body?: string };

const REACH = new Set(['sorro_tasks', 'sorro_events', 'sorro_notes']);

export function undoChange(u: Undo, now: string): { table: Undo['table']; id: string; patch: Record<string, unknown> } {
  if (!REACH.has(u.table)) throw new Error('The assistant cannot change that table.');
  if (u.action === 'delete') return { table: u.table, id: u.id, patch: { deleted_at: now } };
  if (u.action === 'uncomplete') return { table: u.table, id: u.id, patch: { done: false, completed_at: null } };
  if (u.action === 'restore_body' && typeof u.body === 'string') return { table: u.table, id: u.id, patch: { body: u.body } };
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
