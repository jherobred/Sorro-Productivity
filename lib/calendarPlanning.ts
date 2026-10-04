export type TaskPlan = { date: string; starts_at: string | null };
type DatedTask = { id: string; source?: string | null; due_on: string | null; due_at?: string | null };

export function calendarTask<T extends DatedTask>(task: T, plans: Record<string, TaskPlan> = {}) {
  const plan = task.source === 'canvas_lms' ? plans[task.id] : undefined;
  return plan ? { ...task, due_on: plan.date, due_at: plan.starts_at, calendar_original_due_at: task.due_at, calendar_planned: true }
    : { ...task, calendar_original_due_at: undefined, calendar_planned: false };
}

export function snapCalendarHour(hour: number, duration = 1) {
  return Math.max(0, Math.min(24 - duration, Math.round(hour * 2) / 2));
}

/** Exactly one route handles a mouse gesture; synthesized click is ignored. */
export function slotClickCreates(phone: boolean, detail: number) { return phone || detail === 0; }
