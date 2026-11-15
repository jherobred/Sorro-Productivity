/**
 * Sorro's own note types. The New page menu offers Note, Board, Reminders,
 * Markup and Artifact. Note keeps Page's format, Board and Markup reuse the
 * board format, Reminders and Artifact are new formats. Every body written
 * before still opens as what it was: an old Document stays a Document until
 * the user converts it, and Map, Recall, Cornell, Fieldbook, Code, Checklist,
 * Flashcards and free pages keep their editors though they are no longer offered.
 */
import { isDocBody, markdownToHtml } from './docFormat.ts';
import { parse } from './md.ts';
import { readBoard, readStudy, readFreePage, initialBody, writeBoard } from './pageKinds.ts';

/** Icon names as the Icon component knows them; kept as a string union here so lib stays free of components. */
export type IconName = 'text' | 'grid' | 'files' | 'week' | 'book' | 'pen' | 'code' | 'check';

export type SorroType = 'note' | 'board' | 'reminders' | 'markup' | 'artifact'
  | 'map' | 'recall' | 'cornell' | 'fieldbook' | 'code' | 'document' | 'checklist' | 'flashcards' | 'freepage';

/** What the New page menu offers, in order. */
export const SORRO_TYPES = [
  { type: 'note', name: 'Note', icon: 'text', description: 'Write the way Notes does. Title, body, lists, checklist, table, scan.' },
  { type: 'board', name: 'Board', icon: 'pen', description: 'A full whiteboard. Select, draw, type, stickies, shapes, frames.' },
  { type: 'reminders', name: 'Reminders', icon: 'check', description: 'A list with a circle, a date, a flag and subtasks.' },
  { type: 'markup', name: 'Markup', icon: 'files', description: 'A PDF, page or picture, with marks on top of it.' },
  { type: 'artifact', name: 'Artifact', icon: 'code', description: 'HTML from Claude, or any page you import. Preview and source.' },
] as const;
export type NewType = (typeof SORRO_TYPES)[number]['type'];

const TEXT = '<!-- sorro-text:v1 -->\n';
const RECALL = '<!-- sorro-recall:v1 -->\n';
const REMINDERS = '<!-- sorro-reminders:v1 -->\n';
const ARTIFACT = '<!-- sorro-artifact:v1 -->\n';

export const writeText = (html: string) => TEXT + html;

/** The html a Note (once called Page) edits: its own format, or plain markdown converted in memory. Null for every other format. */
export function textHtml(body: string): string | null {
  if (body.startsWith(TEXT)) return body.slice(TEXT.length);
  if (body.startsWith('<!-- ') || body.startsWith('# Journal · ')) return null;
  return markdownToHtml(body);
}

/** One reminder. due is a calendar day, YYYY-MM-DD; a subtask names its parent. */
export type Reminder = { id: string; title: string; note: string; due?: string; flag: boolean; done: boolean; parent?: string };
export type RemindersDoc = { version: 1; items: Reminder[] };
export const writeReminders = (r: RemindersDoc) => REMINDERS + JSON.stringify(r);
export function readReminders(body: string): RemindersDoc | null {
  if (!body.startsWith(REMINDERS)) return null;
  try {
    const d = JSON.parse(body.slice(REMINDERS.length));
    if (d?.version !== 1 || !Array.isArray(d.items)) return null;
    const ok = d.items.every((i: Reminder) => !!i && typeof i.id === 'string' && typeof i.title === 'string' && typeof i.note === 'string'
      && typeof i.flag === 'boolean' && typeof i.done === 'boolean'
      && (i.due === undefined || /^\d{4}-\d{2}-\d{2}$/.test(i.due)) && (i.parent === undefined || typeof i.parent === 'string'));
    return ok ? d as RemindersDoc : null;
  } catch { return null; }
}

export const REMINDER_LISTS = ['Today', 'Scheduled', 'All', 'Flagged', 'Completed'] as const;
export type ReminderList = (typeof REMINDER_LISTS)[number];
/**
 * Which reminders a list shows, each parent followed by its subtasks. Today
 * holds anything due today or earlier. Under a parent that shows, its open
 * subtasks follow it; a subtask that matches on its own shows when its parent does not.
 */
export function remindersIn(items: Reminder[], list: ReminderList, today: string): Reminder[] {
  const keep = (r: Reminder) => list === 'Completed' ? r.done : !r.done && (
    list === 'Today' ? !!r.due && r.due <= today
      : list === 'Scheduled' ? !!r.due
        : list === 'Flagged' ? r.flag : true);
  const ids = new Set(items.map(r => r.id));
  const out: Reminder[] = [];
  for (const top of items.filter(r => !r.parent || !ids.has(r.parent))) {
    const subs = items.filter(r => r.parent === top.id);
    if (keep(top)) out.push(top, ...subs.filter(s => list === 'Completed' ? s.done : !s.done));
    else out.push(...subs.filter(keep));
  }
  return out;
}

/** An imported or pasted HTML page: a Claude artifact or any .html file. */
export type ArtifactDoc = { version: 1; name: string; html: string; from?: string };
export const writeArtifact = (a: ArtifactDoc) => ARTIFACT + JSON.stringify(a);
export function readArtifact(body: string): ArtifactDoc | null {
  if (!body.startsWith(ARTIFACT)) return null;
  try {
    const d = JSON.parse(body.slice(ARTIFACT.length));
    return d?.version === 1 && typeof d.name === 'string' && typeof d.html === 'string' ? d as ArtifactDoc : null;
  } catch { return null; }
}

export type Review = { ease: number; interval: number; due: string };
export type RecallDoc = { html: string; schedule: Record<string, Review> };
export const writeRecall = (r: RecallDoc) => RECALL + JSON.stringify(r);
export function readRecall(body: string): RecallDoc | null {
  if (!body.startsWith(RECALL)) return null;
  try {
    const d = JSON.parse(body.slice(RECALL.length));
    return typeof d?.html === 'string' && d.schedule && typeof d.schedule === 'object' ? d as RecallDoc : null;
  } catch { return null; }
}

export function sorroType(body: string): SorroType {
  if (body.startsWith(RECALL)) return 'recall';
  if (body.startsWith(TEXT)) return 'note';
  if (body.startsWith(REMINDERS)) return 'reminders';
  if (body.startsWith(ARTIFACT)) return 'artifact';
  if (isDocBody(body)) return 'document';
  if (body.startsWith('# Journal · ')) return 'fieldbook';
  if (readFreePage(body)) return 'freepage';
  const board = readBoard(body);
  if (board) return board.kind === 'pdf' ? 'markup' : board.map ? 'map' : 'board';
  const study = readStudy(body);
  if (study) return study.kind === 'cornell' ? 'cornell' : study.kind === 'code' ? 'code' : study.kind;
  return 'note';
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
function key(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/** Each h2 or h3 is a question; everything until the next heading is its answer. */
export function recallCards(html: string): { key: string; question: string; answer: string }[] {
  const parts = html.split(/(?=<h[23][\s>])/i);
  return parts.flatMap(part => {
    const m = /^<h[23][^>]*>([\s\S]*?)<\/h[23]>([\s\S]*)$/i.exec(part);
    if (!m) return [];
    const question = plain(m[1]);
    return question ? [{ key: key(question), question, answer: m[2].trim() }] : [];
  });
}

function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** SM-2, simplified: grade 0 missed, 1 hard, 2 good, 3 easy. Days step with setDate, never in milliseconds. */
export function nextReview(prev: Review | undefined, grade: 0 | 1 | 2 | 3, today: string): Review {
  const ease = Math.max(1.3, (prev?.ease ?? 2.5) + [-0.3, -0.15, 0, 0.15][grade]);
  const interval = grade === 0 ? 1 : !prev ? 1 : prev.interval === 1 ? (grade === 3 ? 4 : 3) : Math.round(prev.interval * (grade === 1 ? 1.2 : ease));
  return { ease, interval, due: addDays(today, interval) };
}

/** Names for every type, including the older ones that are still opened but no longer offered. */
export const TYPE_INFO: Record<SorroType, { name: string; icon: IconName }> = {
  ...Object.fromEntries(SORRO_TYPES.map(t => [t.type, { name: t.name, icon: t.icon }])) as Record<NewType, { name: string; icon: IconName }>,
  map: { name: 'Map', icon: 'grid' }, recall: { name: 'Recall', icon: 'files' }, cornell: { name: 'Cornell', icon: 'week' },
  fieldbook: { name: 'Fieldbook', icon: 'book' }, code: { name: 'Code', icon: 'code' }, freepage: { name: 'Free page', icon: 'pen' },
  document: { name: 'Document', icon: 'text' }, checklist: { name: 'Checklist', icon: 'check' }, flashcards: { name: 'Flashcards', icon: 'files' },
};

export function newBody(type: NewType): string {
  if (type === 'note') return writeText('');
  if (type === 'board') return writeBoard({ version: 1, kind: 'whiteboard', items: [] });
  if (type === 'markup') return initialBody('pdf');
  if (type === 'reminders') return writeReminders({ version: 1, items: [] });
  return writeArtifact({ version: 1, name: 'Untitled page', html: '' });
}

/** An old Document as a Note: every tab's text, each under its tab's name when there is more than one. */
export function documentToPage(tabs: { title: string; html: string }[]): string {
  return writeText(tabs.length === 1 ? tabs[0].html : tabs.map(t => `<h1>${t.title.replace(/</g, '&lt;')}</h1>${t.html}`).join(''));
}

const RICH_LINES = new Set(['math', 'sketch', 'table', 'columns', 'video']);

/**
 * True when the Note editor can hold everything in this body. Markdown with
 * math, sketches, tables, columns, video or images stays in the Document
 * editor, which keeps them; so does a structured body that failed to parse.
 */
export function pageCanHold(body: string): boolean {
  if (body.startsWith(TEXT) || body.startsWith(RECALL)) return true;
  if (textHtml(body) === null) return false;
  if (/!\[[^\]]*\]\([^)]*\)/.test(body)) return false;
  return !parse(body).some(l => RICH_LINES.has(l.kind));
}

/** Convert to Note only when no table, math, image, embed or comment would be dropped. */
export function documentSafeForPage(doc: { tabs: { title?: string; html: string }[]; comments?: unknown[] }): boolean {
  if (doc.comments?.length) return false;
  return !doc.tabs.some(t => /<(table|img|iframe|video)\b|data-type="(math|sketch)/i.test(t.html));
}
