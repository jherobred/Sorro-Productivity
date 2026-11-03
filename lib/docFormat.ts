import { parse, spans, inlineMarkup, type Line } from './md.ts';
import { rebrandBody } from './storageKeys.ts';

/**
 * The Document page format.
 *
 * A document used to be one Markdown string, which cannot hold what a word
 * processor needs: fonts, sizes, colours, alignment, spacing, page setup,
 * comments. It is now a versioned record behind a marker, the same way boards
 * and study pages are stored, still in the one `sorro_notes.body` column:
 *
 *   <!-- sorro-doc:v1 -->
 *   {"version":1,"kind":"document","tabs":[{"id","title","html"}],"page":{…},"comments":[…]}
 *
 * Nothing is migrated in bulk. A Markdown page opens converted in memory and
 * is only written back as a record once somebody edits it, and that record
 * keeps the original Markdown in `source`, so the bytes the page had before
 * are never lost to the conversion.
 *
 * Tab HTML is whatever the editor serialised from its own schema. It is never
 * put into the page with innerHTML: the editor parses it against that schema,
 * which drops anything it does not know. The helpers here that read it back
 * without a DOM only ever produce plain text.
 */

export const DOC_MARKER = '<!-- sorro-doc:v1 -->\n';

export type DocTab = { id: string; title: string; html: string };
export type DocReply = { id: string; text: string; created: string };
export type DocComment = { id: string; text: string; quote: string; created: string; resolved?: boolean; replies?: DocReply[] };
export type PaperSize = 'letter' | 'legal' | 'tabloid' | 'executive' | 'a3' | 'a4' | 'a5';
export type DocPage = {
  size: PaperSize;
  orientation: 'portrait' | 'landscape';
  /** Inches, like Google Docs' page setup. */
  margins: { top: number; right: number; bottom: number; left: number };
  color: string;
  pageless: boolean;
};
export type DocRecord = {
  version: 1;
  kind: 'document';
  tabs: DocTab[];
  page?: DocPage;
  comments?: DocComment[];
  /** What this page was before it became a record. Kept, never read back into the editor. */
  source?: { format: 'markdown'; text: string };
};

/** Width and height in inches, portrait. */
export const PAPER: Record<PaperSize, { name: string; w: number; h: number }> = {
  letter: { name: 'Letter (8.5" x 11")', w: 8.5, h: 11 },
  legal: { name: 'Legal (8.5" x 14")', w: 8.5, h: 14 },
  tabloid: { name: 'Tabloid (11" x 17")', w: 11, h: 17 },
  executive: { name: 'Executive (7.25" x 10.5")', w: 7.25, h: 10.5 },
  a3: { name: 'A3 (29.7cm x 42cm)', w: 11.69, h: 16.54 },
  a4: { name: 'A4 (21cm x 29.7cm)', w: 8.27, h: 11.69 },
  a5: { name: 'A5 (14.8cm x 21cm)', w: 5.83, h: 8.27 },
};

export const DEFAULT_PAGE: DocPage = {
  size: 'letter', orientation: 'portrait', margins: { top: 1, right: 1, bottom: 1, left: 1 }, color: '#ffffff', pageless: false,
};

/** CSS pixels per inch, which is what the page is laid out in. */
export const DPI = 96;

export function pagePixels(page: DocPage) {
  const paper = PAPER[page.size] ?? PAPER.letter;
  const [w, h] = page.orientation === 'landscape' ? [paper.h, paper.w] : [paper.w, paper.h];
  return {
    width: Math.round(w * DPI), height: Math.round(h * DPI),
    top: Math.round(page.margins.top * DPI), right: Math.round(page.margins.right * DPI),
    bottom: Math.round(page.margins.bottom * DPI), left: Math.round(page.margins.left * DPI),
  };
}

/* ---------------------------------------------------------------- validity */

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const inches = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;

function validPage(v: unknown): v is DocPage {
  if (!record(v) || !record(v.margins)) return false;
  const m = v.margins;
  return Object.prototype.hasOwnProperty.call(PAPER, String(v.size))
    && (v.orientation === 'portrait' || v.orientation === 'landscape')
    && inches(m.top) && inches(m.right) && inches(m.bottom) && inches(m.left)
    && str(v.color) && /^#[0-9a-f]{6}$/i.test(v.color) && typeof v.pageless === 'boolean';
}

function validComment(v: unknown): v is DocComment {
  if (!record(v) || !str(v.id) || !str(v.text) || !str(v.quote) || !str(v.created)) return false;
  if (v.resolved !== undefined && typeof v.resolved !== 'boolean') return false;
  return v.replies === undefined || (Array.isArray(v.replies) && v.replies.every((r) => record(r) && str(r.id) && str(r.text) && str(r.created)));
}

/**
 * The record in a body, or null when the body is not one or cannot be trusted.
 * Null for a body that starts with the marker means "unreadable", and the
 * editor must show it read-only rather than open an empty document over it.
 */
export function readDoc(body: string): DocRecord | null {
  body = rebrandBody(body);
  if (!body.startsWith(DOC_MARKER)) return null;
  try {
    const data: unknown = JSON.parse(body.slice(DOC_MARKER.length));
    if (!record(data) || data.version !== 1 || data.kind !== 'document') return null;
    if (!Array.isArray(data.tabs) || !data.tabs.length) return null;
    const ids = new Set<string>();
    for (const tab of data.tabs) {
      if (!record(tab) || !str(tab.id) || !str(tab.title) || !str(tab.html) || ids.has(tab.id)) return null;
      ids.add(tab.id);
    }
    if (data.page !== undefined && !validPage(data.page)) return null;
    if (data.comments !== undefined && (!Array.isArray(data.comments) || !data.comments.every(validComment))) return null;
    if (data.source !== undefined && (!record(data.source) || data.source.format !== 'markdown' || !str(data.source.text))) return null;
    return data as DocRecord;
  } catch { return null; }
}

export const writeDoc = (doc: DocRecord) => DOC_MARKER + JSON.stringify(doc);

export const isDocBody = (body: string) => rebrandBody(body).startsWith(DOC_MARKER);

/* ------------------------------------------------------------ plain text */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Text of serialised editor HTML, without a DOM. Blocks become line breaks. */
export function htmlText(html: string): string {
  return html
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr|div|table)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Everything a person wrote in the document, every tab, for previews and links. */
export function docText(doc: DocRecord): string {
  return doc.tabs.map((tab) => htmlText(tab.html)).join('\n\n');
}

/* ------------------------------------------------------ Markdown to HTML */

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Links and images only keep addresses that are safe to put in an attribute. */
function safeUrl(url: string): string | null {
  const clean = url.trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(clean)) return clean;
  return null;
}

/** The old editor uploaded images and wrote the private storage path where a URL belongs. */
const STORAGE_PATH = /^[0-9a-z-]{2,64}\/[0-9a-f-]{36}-[^/\s]+$/i;

function inline(text: string): string {
  return spans(text).map((span) => {
    switch (span.s) {
      case 'bold': return `<strong>${escape(span.text)}</strong>`;
      case 'italic': return `<em>${escape(span.text)}</em>`;
      case 'code': return `<code>${escape(span.text)}</code>`;
      case 'math': return `<span data-type="math-inline" data-latex="${escape(span.text)}"></span>`;
      // Kept as the text it is, so links between notes still resolve by title.
      case 'link': return escape(`[[${span.text}]]`);
      case 'image': {
        if (STORAGE_PATH.test(span.url.trim())) {
          const path = span.url.trim();
          return `<img data-path="${escape(path)}" data-local-id="${escape('storage:' + path)}" data-name="${escape(path.split('/').pop() || 'image')}" alt="${escape(span.alt)}">`;
        }
        const url = safeUrl(span.url);
        return url ? `<img src="${escape(url)}" alt="${escape(span.alt)}">` : escape(span.alt ? `[${span.alt}]` : '');
      }
      case 'video': {
        const url = safeUrl(span.url);
        return url ? `<a href="${escape(url)}">${escape('Video: ' + url)}</a>` : '';
      }
      default: {
        const markup = inlineMarkup(span.text);
        if (markup?.tag === 'span' && /^[#a-z0-9(),.%\s-]+$/i.test(markup.color)) return `<span style="color: ${markup.color}">${escape(markup.text)}</span>`;
        if (markup?.tag === 'mark' && /^[#a-z0-9(),.%\s-]+$/i.test(markup.background)) return `<mark data-color="${escape(markup.background)}" style="background-color: ${markup.background}">${escape(markup.text)}</mark>`;
        return escape(span.text);
      }
    }
  }).join('');
}

const paragraph = (text: string) => `<p>${inline(text)}</p>`;

function tableHtml(rows: string[][], header: boolean): string {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const body = rows.map((row, r) => {
    const cells = Array.from({ length: width }, (_, c) => {
      const tag = header && r === 0 ? 'th' : 'td';
      return `<${tag}>${paragraph(row[c] ?? '')}</${tag}>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><tbody>${body}</tbody></table>`;
}

/**
 * Markdown as the old Document editor wrote it, as editor HTML. Every line kind
 * lib/md.ts recognises has somewhere to go, so a converted page shows the same
 * content it did, and anything that cannot be represented becomes its text
 * rather than disappearing.
 */
export function markdownToHtml(markdown: string): string {
  const lines = parse(markdown);
  const out: string[] = [];
  let i = 0;
  const run = (kind: Line['kind']) => {
    const group: Line[] = [];
    while (i < lines.length && lines[i].kind === kind) group.push(lines[i++]);
    return group;
  };
  while (i < lines.length) {
    const line = lines[i];
    switch (line.kind) {
      case 'blank': i++; break;
      case 'h1': case 'h2': case 'h3': {
        const level = line.kind.slice(1);
        out.push(`<h${level}>${inline(line.text)}</h${level}>`); i++; break;
      }
      case 'bullet':
        out.push(`<ul>${run('bullet').map((l) => `<li>${paragraph(l.text)}</li>`).join('')}</ul>`); break;
      case 'number':
        out.push(`<ol>${run('number').map((l) => `<li>${paragraph(l.text)}</li>`).join('')}</ol>`); break;
      case 'todo':
        out.push(`<ul data-type="taskList">${run('todo').map((l) => `<li data-type="taskItem" data-checked="${l.done}">${paragraph(l.text)}</li>`).join('')}</ul>`); break;
      case 'quote':
        out.push(`<blockquote>${run('quote').map((l) => paragraph(l.text)).join('')}</blockquote>`); break;
      case 'callout':
        out.push(`<blockquote>${run('callout').map((l) => paragraph(l.text)).join('')}</blockquote>`); break;
      case 'code':
        out.push(`<pre><code>${escape(line.text)}</code></pre>`); i++; break;
      case 'math':
        out.push(`<div data-type="math-block" data-latex="${escape(line.text)}"></div>`); i++; break;
      case 'sketch': {
        const url = safeUrl(line.text);
        out.push(url ? `<p><img src="${escape(url)}" alt="Sketch"></p>` : paragraph(line.text)); i++; break;
      }
      case 'video': {
        const url = safeUrl(line.text);
        out.push(url ? `<p><a href="${escape(url)}">${escape('Video: ' + url)}</a></p>` : paragraph(line.text)); i++; break;
      }
      case 'divider': out.push('<hr>'); i++; break;
      case 'table': {
        const rows = line.text.split('\n').filter((r) => r.trim())
          .filter((r) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(r.trim()))
          .map((r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
        const hasSeparator = /^\|?\s*:?-{2,}/.test(line.text.split('\n')[1]?.trim() ?? '');
        out.push(tableHtml(rows, hasSeparator)); i++; break;
      }
      case 'columns': {
        const columns = line.text.split(':::').map((part) => part.trim()).filter(Boolean);
        const cells = columns.map((col) => `<td>${col.split('\n').map(paragraph).join('')}</td>`).join('');
        out.push(`<table><tbody><tr>${cells || '<td><p></p></td>'}</tr></tbody></table>`); i++; break;
      }
      default: out.push(paragraph(line.text)); i++;
    }
  }
  return out.join('') || '<p></p>';
}

/* ------------------------------------------------------------- opening */

export type OpenedDoc =
  | { state: 'record'; doc: DocRecord }
  | { state: 'converted'; doc: DocRecord }
  | { state: 'unreadable'; raw: string };

/**
 * What the editor should open for a Document page body. A Markdown page is
 * converted in memory only. A body with the record marker that does not read
 * back is reported as unreadable so nothing gets written over it.
 */
export function openDoc(body: string): OpenedDoc {
  if (isDocBody(body)) {
    const doc = readDoc(body);
    return doc ? { state: 'record', doc } : { state: 'unreadable', raw: body };
  }
  return {
    state: 'converted',
    doc: {
      version: 1, kind: 'document',
      tabs: [{ id: 'tab-1', title: 'Tab 1', html: markdownToHtml(body) }],
      ...(body.trim() ? { source: { format: 'markdown' as const, text: body } } : {}),
    },
  };
}
