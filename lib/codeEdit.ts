/**
 * Bracket and quote pairing for the code editor.
 *
 * Pure string maths so it can be tested without a DOM. Every function returns
 * the whole next source plus where the caret belongs, because that is what a
 * controlled textarea needs to apply in one update.
 *
 * Three behaviours, and the third is what stops the first from being annoying:
 * typing an opener inserts the pair, typing over a selection wraps it, and
 * typing the closer that is already sitting under the caret steps over it
 * instead of adding a second one.
 */

export type Edit = { code: string; caret: number };

const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set(Object.values(PAIRS));
/** Quotes close themselves, so they are their own opener and closer. */
const SYMMETRIC = new Set(['"', "'", '`']);
/** True only for a real opener, never for an absent character. */
const opens = (ch: string | undefined, next: string | undefined) =>
  !!ch && Object.prototype.hasOwnProperty.call(PAIRS, ch) && PAIRS[ch] === next;

/**
 * What typing `typed` should do. Returns null to let the browser handle it.
 */
export function typeCharacter(code: string, start: number, end: number, typed: string): Edit | null {
  const closing = PAIRS[typed];
  const selected = code.slice(start, end);

  if (closing && selected) {
    return { code: code.slice(0, start) + typed + selected + closing + code.slice(end), caret: end + 2 };
  }

  // Stepping over a closer the editor itself inserted.
  if (CLOSERS.has(typed) && start === end && code[start] === typed) {
    return { code, caret: start + 1 };
  }

  if (closing && start === end) {
    // A quote directly against a word is an apostrophe, not an empty pair.
    if (SYMMETRIC.has(typed) && /[\w'"`]/.test(code[start - 1] ?? '')) return null;
    return { code: code.slice(0, start) + typed + closing + code.slice(end), caret: start + 1 };
  }

  return null;
}

/** Backspace between an empty pair removes both halves. */
export function deleteBackward(code: string, start: number, end: number): Edit | null {
  if (start !== end || start === 0) return null;
  const before = code[start - 1], after = code[start];
  if (!opens(before, after)) return null;
  return { code: code.slice(0, start - 1) + code.slice(start + 1), caret: start - 1 };
}

/** The indentation of the line the offset sits on. */
export function indentAt(code: string, offset: number): string {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(code.slice(lineStart, offset))?.[0] ?? '';
}

/**
 * Enter inside an empty pair opens the block out, so `{|}` becomes a brace on
 * its own line with the caret indented between them.
 */
export function newline(code: string, start: number, end: number, unit = '    '): Edit | null {
  if (start !== end) return null;
  const indent = indentAt(code, start);
  const before = code[start - 1], after = code[start];
  if (opens(before, after) && !SYMMETRIC.has(before)) {
    const opened = '\n' + indent + unit + '\n' + indent;
    return { code: code.slice(0, start) + opened + code.slice(start), caret: start + 1 + indent.length + unit.length };
  }
  if (before === '{' || before === '[' || before === '(') {
    return { code: code.slice(0, start) + '\n' + indent + unit + code.slice(start), caret: start + 1 + indent.length + unit.length };
  }
  if (!indent) return null;
  return { code: code.slice(0, start) + '\n' + indent + code.slice(start), caret: start + 1 + indent.length };
}
