/**
 * Sorro's own note types. Page and Recall are new formats; the rest reuse the
 * editors that already exist. Every body written before still opens as what it
 * was: an old Document stays a Document until the user converts it.
 */
import { isDocBody, markdownToHtml } from './docFormat.ts';
import { parse } from './md.ts';
import { readBoard, readStudy, readFreePage, initialBody, writeBoard, type PageKind } from './pageKinds.ts';

/** Icon names as the Icon component knows them; kept as a string union here so lib stays free of components. */
export type IconName = 'text' | 'grid' | 'files' | 'week' | 'book' | 'pen' | 'code' | 'check';

export type SorroType = 'page' | 'map' | 'recall' | 'cornell' | 'fieldbook' | 'board' | 'code' | 'pdf' | 'document' | 'checklist' | 'flashcards';

/** What the New page menu offers, in order. */
export const SORRO_TYPES = [
  { type: 'page', name: 'Page', icon: 'text', description: 'Write; formatting appears as you type' },
  { type: 'map', name: 'Map', icon: 'grid', description: 'Boxes and arrows for how ideas connect' },
  { type: 'recall', name: 'Recall', icon: 'files', description: 'Headings become questions to test yourself' },
  { type: 'cornell', name: 'Cornell', icon: 'week', description: 'Cues, lecture notes and a summary' },
  { type: 'fieldbook', name: 'Fieldbook', icon: 'book', description: 'Dated entries with photos' },
  { type: 'board', name: 'Board', icon: 'pen', description: 'Draw and write anywhere, made for a stylus' },
  { type: 'code', name: 'Code', icon: 'code', description: 'Java, HTML, CSS and JavaScript you can run' },
  { type: 'pdf', name: 'PDF', icon: 'files', description: 'Read and mark up a PDF' },
] as const;

const TEXT = '<!-- sorro-text:v1 -->\n';
const RECALL = '<!-- sorro-recall:v1 -->\n';

export const writeText = (html: string) => TEXT + html;

/** The html a Page edits: its own format, or plain markdown converted in memory. Null for every other format. */
export function textHtml(body: string): string | null {
  if (body.startsWith(TEXT)) return body.slice(TEXT.length);
  if (body.startsWith('<!-- ') || body.startsWith('# Journal · ')) return null;
  return markdownToHtml(body);
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
  if (body.startsWith(TEXT)) return 'page';
  if (isDocBody(body)) return 'document';
  if (body.startsWith('# Journal · ')) return 'fieldbook';
  if (readFreePage(body)) return 'board';
  const board = readBoard(body);
  if (board) return board.kind === 'pdf' ? 'pdf' : board.map ? 'map' : 'board';
  const study = readStudy(body);
  if (study) return study.kind === 'cornell' ? 'cornell' : study.kind === 'code' ? 'code' : study.kind;
  return 'page';
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
  ...Object.fromEntries(SORRO_TYPES.map(t => [t.type, { name: t.name, icon: t.icon }])) as Record<(typeof SORRO_TYPES)[number]['type'], { name: string; icon: IconName }>,
  document: { name: 'Document', icon: 'text' }, checklist: { name: 'Checklist', icon: 'check' }, flashcards: { name: 'Flashcards', icon: 'files' },
};

/** The drawing on each New page choice, borrowed from the editor it opens in. */
export const TYPE_ART: Record<(typeof SORRO_TYPES)[number]['type'], PageKind> = {
  page: 'document', map: 'whiteboard', recall: 'flashcards', cornell: 'cornell', fieldbook: 'journal', board: 'freepage', code: 'code', pdf: 'pdf',
};

export function newBody(type: (typeof SORRO_TYPES)[number]['type']): string {
  if (type === 'page') return writeText('');
  if (type === 'recall') return writeRecall({ html: '<h2>Your first question?</h2><p>Write the answer here.</p>', schedule: {} });
  if (type === 'map') return writeBoard({ version: 1, kind: 'whiteboard', items: [], map: true });
  return initialBody(TYPE_ART[type]);
}

/** An old Document as a Page: every tab's text, each under its tab's name when there is more than one. */
export function documentToPage(tabs: { title: string; html: string }[]): string {
  return writeText(tabs.length === 1 ? tabs[0].html : tabs.map(t => `<h1>${t.title.replace(/</g, '&lt;')}</h1>${t.html}`).join(''));
}

const RICH_LINES = new Set(['math', 'sketch', 'table', 'columns', 'video']);

/**
 * True when the Page editor can hold everything in this body. Markdown with
 * math, sketches, tables, columns, video or images stays in the Document
 * editor, which keeps them; so does a structured body that failed to parse.
 */
export function pageCanHold(body: string): boolean {
  if (body.startsWith(TEXT) || body.startsWith(RECALL)) return true;
  if (textHtml(body) === null) return false;
  if (/!\[[^\]]*\]\([^)]*\)/.test(body)) return false;
  return !parse(body).some(l => RICH_LINES.has(l.kind));
}

/** Convert to Page only when no table, math, image, embed or comment would be dropped. */
export function documentSafeForPage(doc: { tabs: { title?: string; html: string }[]; comments?: unknown[] }): boolean {
  if (doc.comments?.length) return false;
  return !doc.tabs.some(t => /<(table|img|iframe|video)\b|data-type="(math|sketch)/i.test(t.html));
}
