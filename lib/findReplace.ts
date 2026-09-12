/**
 * Find and replace over a note body.
 *
 * A search term is text the user typed, never a pattern: it is escaped before
 * it reaches RegExp, so a note containing `cost (total)` is searchable and a
 * term like `.*` finds the literal characters rather than the whole document.
 * The replacement goes through a function so `$1` and `$&` in it stay literal
 * too, which is the other half of the same promise.
 */

function escapeForRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(term: string, caseSensitive: boolean): RegExp | null {
  if (!term) return null;
  return new RegExp(escapeForRegex(term), caseSensitive ? 'g' : 'gi');
}

export function countMatches(body: string, term: string, caseSensitive = false): number {
  const re = matcher(term, caseSensitive);
  if (!re) return 0;
  return body.match(re)?.length ?? 0;
}

export function replaceAll(body: string, term: string, into: string, caseSensitive = false): string {
  const re = matcher(term, caseSensitive);
  if (!re) return body;
  return body.replace(re, () => into);
}

/** 220 words a minute, and never rounded down to a zero-minute read. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}
