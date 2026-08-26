/**
 * A note is one markdown document.
 *
 * The old editor stored every paragraph as its own row in `bd_note_blocks`, and
 * that model is why notes lost text: a block written before its note's row had
 * landed failed the foreign key, the rollback took the characters with it, and
 * production ended up with eight notes and zero blocks. Positions, reorders,
 * per-block debounces and a pending-text overlay all existed to hold that model
 * together.
 *
 * One string in `bd_notes.body` removes the whole class of bug — one row, one
 * debounced write, last write wins — and it is also what both of the apps being
 * copied actually do: an Evernote note is a document, an Obsidian note is a
 * markdown file.
 *
 * This module is pure: no React, no network. `node --test`-free self-check at
 * the bottom of the repo in md.check.ts.
 */

export type LineKind =
  | 'p' | 'h1' | 'h2' | 'h3'
  | 'bullet' | 'number' | 'todo'
  | 'quote' | 'callout' | 'code' | 'math' | 'sketch' | 'divider' | 'blank';

export type Line = {
  /** Index into the source array — what an edit writes back to. */
  i: number;
  kind: LineKind;
  /** The line without its marker. Code fences carry the whole run. */
  text: string;
  /** Only meaningful for `todo`. */
  done: boolean;
  /** Only meaningful for `number` — its place in the run it belongs to. */
  n: number;
};

/** Marker → kind, longest first so `###` never matches as `#`. */
const RULES: [RegExp, LineKind][] = [
  [/^### /, 'h3'],
  [/^## /, 'h2'],
  [/^# /, 'h1'],
  [/^- \[([ xX])\] /, 'todo'],
  [/^[-*+] /, 'bullet'],
  [/^\d+\. /, 'number'],
  [/^> /, 'quote'],
  [/^\|\| /, 'callout'],
  [/^(---|\*\*\*)\s*$/, 'divider'],
];

/**
 * Split a document into rendered lines. Fenced code collapses into a single
 * `code` line holding the run, and block math ($$...$$) collapses into a `math` line.
 */
export function parse(body: string): Line[] {
  const src = body.split('\n');
  const out: Line[] = [];
  let counter = 0;

  for (let i = 0; i < src.length; i++) {
    const raw = src[i];

    if (raw.startsWith('```')) {
      const start = i;
      const buf: string[] = [];
      i++;
      while (i < src.length && !src[i].startsWith('```')) buf.push(src[i++]);
      out.push({ i: start, kind: 'code', text: buf.join('\n'), done: false, n: 0 });
      counter = 0;
      continue;
    }

    if (raw.startsWith('$$')) {
      const start = i;
      // If single line $$...$$
      if (raw.endsWith('$$') && raw.length > 2 && raw.slice(2, -2).trim()) {
        out.push({ i: start, kind: 'math', text: raw.slice(2, -2).trim(), done: false, n: 0 });
        counter = 0;
        continue;
      }
      const buf: string[] = [];
      const firstLineContent = raw.slice(2).trim();
      if (firstLineContent) buf.push(firstLineContent);
      i++;
      while (i < src.length && !src[i].startsWith('$$')) buf.push(src[i++]);
      out.push({ i: start, kind: 'math', text: buf.join('\n'), done: false, n: 0 });
      counter = 0;
      continue;
    }

    if (raw.startsWith('![math-sketch](') || raw.startsWith('![sketch](')) {
      const match = raw.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (match) {
        out.push({ i, kind: 'sketch', text: match[2], done: false, n: 0 });
        counter = 0;
        continue;
      }
    }

    const hit = RULES.find(([re]) => re.test(raw));
    if (!hit) {
      out.push({ i, kind: raw.trim() ? 'p' : 'blank', text: raw, done: false, n: 0 });
      counter = 0;
      continue;
    }

    const [re, kind] = hit;
    const marker = raw.match(re)![0];
    counter = kind === 'number' ? counter + 1 : 0;
    out.push({
      i,
      kind,
      text: kind === 'divider' ? '' : raw.slice(marker.length),
      done: kind === 'todo' && /\[[xX]\]/.test(marker),
      n: counter,
    });
  }

  return out;
}

/* -------------------------------------------------------------- inline text */

export type Span =
  | { s: 'text'; text: string }
  | { s: 'bold'; text: string }
  | { s: 'italic'; text: string }
  | { s: 'code'; text: string }
  | { s: 'math'; text: string }
  | { s: 'image'; text: string; alt: string; url: string }
  | { s: 'link'; text: string };

/** Inline marks inside one line including inline LaTeX math ($...$). */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)|\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|(?<!\*)\*([^*]+)\*(?!\*)|`([^`]+)`|\$([^\$]+)\$/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ s: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined && m[2] !== undefined) {
      out.push({ s: 'image', text: m[1], alt: m[1], url: m[2] });
    } else if (m[3] !== undefined) {
      out.push({ s: 'link', text: m[3].trim() });
    } else if (m[4] !== undefined) {
      out.push({ s: 'bold', text: m[4] });
    } else if (m[5] !== undefined) {
      out.push({ s: 'italic', text: m[5] });
    } else if (m[6] !== undefined) {
      out.push({ s: 'code', text: m[6] });
    } else if (m[7] !== undefined) {
      out.push({ s: 'math', text: m[7] });
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ s: 'text', text: text.slice(last) });
  return out;
}

/** Every `[[target]]` in the document, de-duplicated, brackets stripped. */
export function wikiTargets(body: string): string[] {
  return [...new Set([...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean))];
}

/* ------------------------------------------------------------------ editing */

/** Tick or untick the checkbox on one source line, returning the new document. */
export function toggleTask(body: string, lineIndex: number): string {
  const src = body.split('\n');
  const line = src[lineIndex];
  if (line === undefined) return body;
  src[lineIndex] = /^- \[[xX]\] /.test(line)
    ? line.replace(/^- \[[xX]\] /, '- [ ] ')
    : line.replace(/^- \[ \] /, '- [x] ');
  return src.join('\n');
}

/** The markers the toolbar applies, keyed by the kind they produce. */
export const PREFIX: Partial<Record<LineKind, string>> = {
  h1: '# ', h2: '## ', h3: '### ',
  bullet: '- ', number: '1. ', todo: '- [ ] ',
  quote: '> ', callout: '|| ', math: '$$ ',
};

const ANY_MARKER = /^(#{1,3} |- \[[ xX]\] |[-*+] |\d+\. |> |\|\| )/;

/**
 * Apply (or remove) a line marker across the selection — the toolbar's
 * "make this a heading" behaviour. Toggling off is what every editor here does
 * when you press the button a second time.
 */
export function applyKind(body: string, from: number, to: number, kind: LineKind): { body: string; from: number; to: number } {
  const src = body.split('\n');
  const first = lineOf(body, from);
  const last = lineOf(body, to);
  const marker = PREFIX[kind] ?? '';
  const already = src.slice(first, last + 1).every((l) => l.startsWith(marker) && marker !== '');

  for (let i = first; i <= last; i++) {
    const bare = src[i].replace(ANY_MARKER, '');
    src[i] = already ? bare : marker + bare;
  }

  const next = src.join('\n');
  // Keep the caret on the same characters it was on, not where the markers moved it.
  const delta = next.length - body.length;
  return { body: next, from: Math.max(0, from + (already ? -marker.length : marker.length)), to: to + delta };
}

/** Wrap the selection in an inline mark, or unwrap it if it is already wrapped. */
export function wrap(body: string, from: number, to: number, mark: string): { body: string; from: number; to: number } {
  const inner = body.slice(from, to);
  const outer = body.slice(from - mark.length, to + mark.length);
  if (inner && outer === mark + inner + mark) {
    return {
      body: body.slice(0, from - mark.length) + inner + body.slice(to + mark.length),
      from: from - mark.length,
      to: to - mark.length,
    };
  }
  const text = inner || 'text';
  return {
    body: body.slice(0, from) + mark + text + mark + body.slice(to),
    from: from + mark.length,
    to: from + mark.length + text.length,
  };
}

/** Which source line a character offset falls on. */
export function lineOf(body: string, at: number): number {
  return body.slice(0, at).split('\n').length - 1;
}

/** Offset of the first character of a source line. */
export function offsetOfLine(body: string, line: number): number {
  const src = body.split('\n');
  let at = 0;
  for (let i = 0; i < line && i < src.length; i++) at += src[i].length + 1;
  return at;
}

/**
 * Enter with the list continued.
 *
 * Returns the document and caret after pressing Enter at `at`: inside a list
 * the next line starts with the same marker, and an empty list item ends the
 * list instead of adding another empty one — the behaviour Evernote, Obsidian
 * and every other editor in this family share.
 */
export function newline(body: string, at: number): { body: string; caret: number } {
  const li = lineOf(body, at);
  const start = offsetOfLine(body, li);
  const line = body.split('\n')[li] ?? '';
  const m = line.match(/^(\s*)(- \[[ xX]\] |[-*+] |(\d+)\. |> )/);

  if (m) {
    const bare = line.slice(m[0].length);
    if (!bare.trim()) {
      // Empty item: drop the marker, leave the list.
      const next = body.slice(0, start) + body.slice(start + line.length);
      return { body: next, caret: start };
    }
    const marker = m[3]
      ? `${m[1]}${Number(m[3]) + 1}. `
      : `${m[1]}${m[2].replace(/\[[xX]\]/, '[ ]')}`;
    return { body: body.slice(0, at) + '\n' + marker + body.slice(at), caret: at + 1 + marker.length };
  }

  return { body: body.slice(0, at) + '\n' + body.slice(at), caret: at + 1 };
}

/* ------------------------------------------------------------------ summary */

/** First line of real prose, for the note list. Markers stripped. */
export function preview(body: string, max = 120): string {
  for (const l of parse(body)) {
    if (l.kind === 'blank' || l.kind === 'divider') continue;
    const t = l.text.replace(/[*`]|\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
    if (t) return t.length > max ? `${t.slice(0, max)}…` : t;
  }
  return '';
}

export const wordCount = (body: string) => (body.trim() ? body.trim().split(/\s+/).length : 0);

export function taskCount(body: string): { done: number; total: number } {
  const todos = parse(body).filter((l) => l.kind === 'todo');
  return { done: todos.filter((l) => l.done).length, total: todos.length };
}
