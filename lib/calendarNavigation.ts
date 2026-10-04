export type CalendarView = 'month' | 'week' | 'day' | 'agenda' | 'countdown';

/** Page from the selected date, never from the first column of its week. */
export function moveCalendarDate(selected: Date, view: CalendarView, direction: number) {
  const next = new Date(selected);
  next.setHours(12, 0, 0, 0);
  if (view === 'month') {
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
  } else next.setDate(next.getDate() + direction * (view === 'day' ? 1 : 7));
  return next;
}

/** A stable rail for the selected month, including its neighboring weeks. */
export function calendarStripDates(selected: Date) {
  const start = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
  start.setDate(start.getDate() - 7);
  return Array.from({ length: 76 }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return date;
  });
}
