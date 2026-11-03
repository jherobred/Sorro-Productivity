/** What the assistant may do, in the shape Gemini's function calling reads, and the checks its arguments must pass. */

type Schema = { type: string; description?: string; enum?: string[]; properties?: Record<string, Schema> ; required?: string[] };
export type Tool = { name: string; description: string; parameters: Schema };

const str = (description: string, extra: Partial<Schema> = {}): Schema => ({ type: 'string', description, ...extra });

export const TOOLS: Tool[] = [
  { name: 'create_task', description: 'Add a task to the user\'s Sorro tasks.', parameters: { type: 'object', properties: {
    title: str('What to do, short.'), due_on: str('Due date YYYY-MM-DD, if the user gave one.'),
    priority: str('Only if asked.', { enum: ['low', 'med', 'high'] }), notes: str('Extra detail, optional.'), list: str('List name such as School, optional.'),
  }, required: ['title'] } },
  { name: 'list_tasks', description: 'Read the user\'s open tasks.', parameters: { type: 'object', properties: {
    range: str('Which tasks.', { enum: ['today', 'week', 'overdue', 'all'] }),
  }, required: ['range'] } },
  { name: 'complete_task', description: 'Mark one task done. Use an id from list_tasks.', parameters: { type: 'object', properties: { id: str('Task id.') }, required: ['id'] } },
  { name: 'create_event', description: 'Add an event to the user\'s Sorro calendar.', parameters: { type: 'object', properties: {
    title: str('Event name.'), starts_at: str('Start, ISO 8601 with the user\'s offset.'), ends_at: str('End, ISO 8601 with offset.'), location: str('Place, optional.'),
  }, required: ['title', 'starts_at', 'ends_at'] } },
  { name: 'list_events', description: 'Read calendar events between two dates.', parameters: { type: 'object', properties: {
    from: str('First day YYYY-MM-DD.'), to: str('Last day YYYY-MM-DD.'),
  }, required: ['from', 'to'] } },
  { name: 'find_free_time', description: 'Find open slots on one day between 07:00 and 22:00.', parameters: { type: 'object', properties: {
    date: str('Day YYYY-MM-DD.'), minutes: { type: 'number', description: 'Length of the slot needed.' },
  }, required: ['date', 'minutes'] } },
  { name: 'search_notes', description: 'Search the user\'s notes by words in the title or text.', parameters: { type: 'object', properties: { query: str('Words to find.') }, required: ['query'] } },
  { name: 'create_note', description: 'Write a new note page in markdown.', parameters: { type: 'object', properties: {
    title: str('Page title.'), body: str('Markdown text.'), notebook: str('Notebook name, optional; the first notebook otherwise.'),
  }, required: ['title', 'body'] } },
  { name: 'append_note', description: 'Add text to the end of an existing note. Use an id from search_notes.', parameters: { type: 'object', properties: { id: str('Note id.'), text: str('Markdown to add.') }, required: ['id', 'text'] } },
  { name: 'read_news', description: 'Read the user\'s news digests for a day (Grok automations).', parameters: { type: 'object', properties: { date: str('Day YYYY-MM-DD, today if left out.') } } },
];

/** Tools that change data; each returns an undo descriptor and shows a card with Undo. */
export const WRITES = new Set(['create_task', 'complete_task', 'create_event', 'create_note', 'append_note']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function realDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const instant = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));
const text = (s: unknown, max = 2000): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max;

export type Checked = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

export function validateArgs(name: string, a: Record<string, unknown>): Checked {
  const bad = (error: string): Checked => ({ ok: false, error });
  switch (name) {
    case 'create_task':
      if (!text(a.title, 200)) return bad('A task needs a title.');
      if (a.due_on !== undefined && !realDay(a.due_on)) return bad('due_on must be a real date, YYYY-MM-DD.');
      if (a.priority !== undefined && !['low', 'med', 'high'].includes(String(a.priority))) return bad('priority is low, med or high.');
      return { ok: true, value: { title: String(a.title).trim(), due_on: a.due_on, priority: a.priority, notes: typeof a.notes === 'string' ? a.notes : '', list: a.list } };
    case 'list_tasks':
      return ['today', 'week', 'overdue', 'all'].includes(String(a.range)) ? { ok: true, value: { range: a.range } } : bad('range is today, week, overdue or all.');
    case 'complete_task':
    case 'append_note':
      if (typeof a.id !== 'string' || !UUID.test(a.id)) return bad('Use an id returned by a list or search.');
      if (name === 'append_note' && !text(a.text, 20000)) return bad('Nothing to add.');
      return { ok: true, value: { ...a } };
    case 'create_event':
      if (!text(a.title, 200)) return bad('An event needs a title.');
      if (!instant(a.starts_at) || !instant(a.ends_at)) return bad('starts_at and ends_at must be ISO 8601 times.');
      if (Date.parse(a.ends_at) <= Date.parse(a.starts_at)) return bad('The event must end after it starts.');
      return { ok: true, value: { ...a, title: String(a.title).trim() } };
    case 'list_events':
      if (!realDay(a.from) || !realDay(a.to) || a.to < a.from) return bad('from and to are dates, from first.');
      return { ok: true, value: { ...a } };
    case 'find_free_time':
      if (!realDay(a.date)) return bad('date must be YYYY-MM-DD.');
      if (typeof a.minutes !== 'number' || a.minutes < 5 || a.minutes > 600) return bad('minutes is between 5 and 600.');
      return { ok: true, value: { ...a } };
    case 'search_notes':
      return text(a.query, 200) ? { ok: true, value: { query: String(a.query).trim() } } : bad('Say what to search for.');
    case 'create_note':
      if (!text(a.title, 200) || typeof a.body !== 'string') return bad('A note needs a title and a body.');
      return { ok: true, value: { ...a } };
    case 'read_news':
      if (a.date !== undefined && !realDay(a.date)) return bad('date must be YYYY-MM-DD.');
      return { ok: true, value: { ...a } };
    default:
      return bad(`There is no tool called ${name}.`);
  }
}

/** Free slots of at least `minutes` between 07:00 and 22:00, given the busy intervals as minutes from midnight. */
export function freeSlots(busy: [number, number][], minutes: number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = 7 * 60;
  for (const [s, e] of [...busy].sort((a, b) => a[0] - b[0])) {
    if (s - cursor >= minutes) out.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (22 * 60 - cursor >= minutes) out.push([cursor, 22 * 60]);
  return out;
}
