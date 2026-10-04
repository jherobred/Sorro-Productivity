export type TaskPlan = { date: string; starts_at: string | null };
type DatedTask = { id: string; source?: string | null; due_on: string | null; due_at?: string | null };

export function sameCalendarTime(a?: string | null, b?: string | null) {
  return !a && !b || !!a && !!b && Date.parse(a) === Date.parse(b);
}

export function isOriginalTaskSlot(task: DatedTask, plan: TaskPlan) {
  return task.due_on === plan.date && sameCalendarTime(task.due_at, plan.starts_at);
}

export function calendarTask<T extends DatedTask>(task: T, plans: Record<string, TaskPlan> = {}) {
  const plan = task.source === 'canvas_lms' ? plans[task.id] : undefined;
  return plan && !isOriginalTaskSlot(task, plan)
    ? { ...task, due_on: plan.date, due_at: plan.starts_at, calendar_original_due_at: task.due_at, calendar_original_due_on: task.due_on, calendar_planned: true }
    : { ...task, calendar_original_due_at: undefined, calendar_original_due_on: undefined, calendar_planned: false };
}

/** Keep the pointer's grab offset, but let a drop near a deadline restore its exact minute. */
export function taskDropHour(pointerHour: number, grabOffset: number, day: number, origin?: { day: number; hour: number } | null) {
  const hour = pointerHour - grabOffset;
  return origin && origin.day === day && Math.abs(hour - origin.hour) <= .25 ? origin.hour : snapCalendarHour(hour);
}

export function calendarPointerHour(y: number, top: number, height: number) {
  return (y - top) / height * 24;
}

type CalendarRect = { left: number; top: number; width: number; height: number };
export function canvasConnectionPath(body: CalendarRect, width: number, height: number, origin: CalendarRect, destination: CalendarRect) {
  const scaleX = width / body.width, scaleY = height / body.height;
  const x1 = (origin.left + origin.width - body.left) * scaleX - 4;
  const y1 = (origin.top - body.top) * scaleY + Math.min(origin.height * scaleY / 2, 18);
  const x2 = (destination.left + destination.width - body.left) * scaleX;
  const y2 = (destination.top - body.top) * scaleY + Math.min(destination.height * scaleY / 2, 18);
  const rail = Math.min(width - 5, Math.max(x1, x2) + 9);
  const n = (value: number) => Math.round(value * 100) / 100;
  return `M ${n(x1)} ${n(y1)} L ${n(rail)} ${n(y1)} L ${n(rail)} ${n(y2)} L ${n(x2)} ${n(y2)}`;
}

export function snapCalendarHour(hour: number, duration = 1) {
  return Math.max(0, Math.min(24 - duration, Math.round(hour * 2) / 2));
}

/** Exactly one route handles a mouse gesture; synthesized click is ignored. */
export function slotClickCreates(phone: boolean, detail: number) { return phone || detail === 0; }
