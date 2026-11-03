/**
 * A repeating task's streak: how many of its latest instances were finished on
 * or before their due day, counting back from the newest finished one. The one
 * still open and not yet due is not a miss.
 */
type Instance = { done: boolean; due_on: string | null; completed_at?: string | null };

export function streak(instances: Instance[]): number {
  const dated = instances.filter(i => i.due_on).sort((a, b) => b.due_on!.localeCompare(a.due_on!));
  let n = 0;
  for (const i of dated) {
    if (!i.done) { if (n === 0) continue; break; }
    if (!i.completed_at || i.completed_at.slice(0, 10) > i.due_on!) break;
    n++;
  }
  return n;
}
