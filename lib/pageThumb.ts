import { readDoc, htmlText } from './docFormat.ts';
import { readBoard, readFreePage, readStudy, richText, type BoardItem } from './pageKinds.ts';
import { readJournalBook, bookDays } from './journalPage.ts';
import { parse } from './md.ts';
import { pdfMargin } from './pdfLayout.ts';

/**
 * What a page's first sheet looks like, reduced to what a thumbnail can draw.
 *
 * The notebook list shows a small copy of each page instead of an icon. Drawing
 * the real editors that small would mount a word processor, a board and a code
 * editor per row, so each format is read once into lines and shapes here, and
 * the row only paints those. Pure, so it can be checked without a browser.
 */

export type ThumbTone = 'title' | 'heading' | 'body' | 'quote' | 'item' | 'todo' | 'done' | 'code' | 'media' | 'rule';
export type ThumbLine = { tone: ThumbTone; text: string };
export type ThumbShape =
  | { type: 'stroke'; points: string; color: string; width: number; opacity: number }
  | { type: 'note'; x: number; y: number; w: number; h: number; fill: string; text: string }
  | { type: 'image'; x: number; y: number; w: number; h: number }
  | { type: 'card'; x: number; y: number; w: number; h: number; title: string };
export type ThumbBox = { x: number; y: number; w: number; h: number };

export type Thumb =
  | { kind: 'document'; lines: ThumbLine[] }
  | { kind: 'board'; box: ThumbBox | null; shapes: ThumbShape[] }
  | { kind: 'pdf'; box: ThumbBox; shapes: ThumbShape[]; pages: number }
  | { kind: 'journal'; lines: string[]; photos: number }
  | { kind: 'code'; language: string; lines: string[] }
  | { kind: 'checklist'; items: { text: string; done: boolean }[] }
  | { kind: 'flashcards'; front: string; back: string; count: number }
  | { kind: 'cornell'; cues: string[]; notes: string[]; summary: string };

const LINES = 16;
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const firstLines = (text: string, count: number) => text.split('\n').map((line) => line.replace(/\s+$/, '')).filter((line) => line.trim()).slice(0, count);

/** Serialised editor HTML, block by block, without a DOM. */
function htmlLines(html: string): ThumbLine[] {
  const out: ThumbLine[] = [];
  const block = /<(h[1-6]|p|li|blockquote|pre)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (let match = block.exec(html); match && out.length < LINES; match = block.exec(html)) {
    const [, tag, attrs, inner] = match;
    const name = tag.toLowerCase();
    const text = clean(htmlText(inner));
    if (!text) { if (/<img\b/i.test(inner)) out.push({ tone: 'media', text: '' }); continue; }
    if (name === 'pre') { for (const line of firstLines(htmlText(inner), 3)) out.push({ tone: 'code', text: line }); continue; }
    const tone: ThumbTone = /data-style="title"/.test(attrs) ? 'title'
      : name === 'h1' || name === 'h2' || name === 'h3' ? 'heading'
      : name === 'blockquote' ? 'quote'
      : name === 'li' && /data-checked="true"/.test(attrs) ? 'done'
      : name === 'li' && /data-checked=/.test(attrs) ? 'todo'
      : name === 'li' ? 'item'
      : 'body';
    out.push({ tone, text });
  }
  return out;
}

const INLINE = /\*\*|__|[*_`]|\[\[|\]\]|~~/g;

function markdownLines(body: string): ThumbLine[] {
  const out: ThumbLine[] = [];
  for (const line of parse(body)) {
    if (out.length >= LINES) break;
    const text = clean(line.text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(INLINE, ''));
    switch (line.kind) {
      case 'blank': break;
      case 'h1': out.push({ tone: out.length ? 'heading' : 'title', text }); break;
      case 'h2': case 'h3': out.push({ tone: 'heading', text }); break;
      case 'todo': out.push({ tone: line.done ? 'done' : 'todo', text }); break;
      case 'bullet': case 'number': out.push({ tone: 'item', text }); break;
      case 'quote': case 'callout': out.push({ tone: 'quote', text }); break;
      case 'code': for (const code of firstLines(line.text, 3)) out.push({ tone: 'code', text: code }); break;
      case 'divider': out.push({ tone: 'rule', text: '' }); break;
      case 'p': if (text) out.push({ tone: 'body', text }); break;
      default: out.push({ tone: 'media', text: '' });
    }
  }
  return out;
}

/** Every Nth point, so a long stroke stays a short path at thumbnail size. */
function sampled(item: BoardItem, max = 40): string {
  const points = item.points ?? [];
  const step = Math.max(1, Math.ceil(points.length / max));
  const kept = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return kept.map((p) => `${Math.round((item.x + p[0]) * 10) / 10},${Math.round((item.y + p[1]) * 10) / 10}`).join(' ');
}

function boardShapes(items: BoardItem[]): ThumbShape[] {
  return items.slice(0, 240).map((item): ThumbShape => {
    if (item.type === 'stroke') return { type: 'stroke', points: sampled(item), color: item.color, width: item.width ?? 3, opacity: item.opacity ?? (item.brush === 'highlighter' ? 0.35 : 1) };
    if (item.type === 'image') return { type: 'image', x: item.x, y: item.y, w: item.w, h: item.h };
    if (item.type === 'schema') return { type: 'card', x: item.x, y: item.y, w: item.w, h: item.h, title: item.title ?? '' };
    return { type: 'note', x: item.x, y: item.y, w: item.w, h: item.h, fill: item.background ?? '#ffeba3', text: clean(item.text ?? '').slice(0, 80) };
  });
}

function bounds(items: BoardItem[]): ThumbBox | null {
  if (!items.length) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const i of items) { left = Math.min(left, i.x); top = Math.min(top, i.y); right = Math.max(right, i.x + i.w); bottom = Math.max(bottom, i.y + i.h); }
  const pad = Math.max(24, (right - left) * 0.06, (bottom - top) * 0.06);
  return { x: left - pad, y: top - pad, w: right - left + pad * 2, h: bottom - top + pad * 2 };
}

export function pageThumb(body: string): Thumb {
  const doc = readDoc(body);
  if (doc) return { kind: 'document', lines: htmlLines(doc.tabs[0]?.html ?? '') };

  const board = readBoard(body);
  if (board?.kind === 'pdf' && board.pdf?.pages.length) {
    const page = board.pdf.pages[0], left = pdfMargin(board.pdf);
    const box = { x: left, y: page.y, w: page.w, h: page.h };
    // Only what was written on the first sheet, so the thumbnail is that sheet.
    const onPage = board.items.filter((i) => i.x < box.x + box.w && i.x + i.w > box.x && i.y < box.y + box.h && i.y + i.h > box.y);
    return { kind: 'pdf', box, shapes: boardShapes(onPage), pages: board.pdf.pages.length };
  }
  if (board) return { kind: 'board', box: bounds(board.items), shapes: boardShapes(board.items) };

  // A free page is note boxes where they were put, which the board drawing
  // already knows how to paint.
  const free = readFreePage(body);
  if (free) {
    const boxes = free.boxes.slice(0, 12).map((b) => ({ type: 'note' as const, x: b.x, y: b.y, w: b.w, h: b.h ?? 120, fill: b.tint || '#ffffff', text: clean(richText(b.doc)).slice(0, 80) }));
    const box = boxes.length ? {
      x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)),
      w: Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)),
      h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)),
    } : null;
    return { kind: 'board', box, shapes: boxes };
  }

  const study = readStudy(body);
  if (study?.kind === 'checklist') return { kind: 'checklist', items: study.items.slice(0, 9).map((i) => ({ text: clean(i.text), done: i.done })) };
  if (study?.kind === 'flashcards') return { kind: 'flashcards', front: clean(study.cards[0]?.front ?? ''), back: clean(study.cards[0]?.back ?? ''), count: study.cards.length };
  if (study?.kind === 'cornell') return { kind: 'cornell', cues: firstLines(study.cues, 6), notes: firstLines(study.notes, 12), summary: clean(study.summary).slice(0, 140) };
  if (study?.kind === 'code') return { kind: 'code', language: study.language, lines: study.code.split('\n').slice(0, 18) };

  if (body.startsWith('# Journal · ')) {
    const book = readJournalBook({ body, created_at: '1970-01-01T12:00:00' });
    const days = bookDays(book);
    const day = days.filter((d) => book.entries[d].prose.trim()).at(-1) ?? days.at(-1);
    const entry = day ? book.entries[day] : undefined;
    return { kind: 'journal', lines: firstLines(entry?.prose ?? '', 10), photos: entry?.photos.length ?? 0 };
  }
  return { kind: 'document', lines: markdownLines(body) };
}
