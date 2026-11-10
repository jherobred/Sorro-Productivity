export const NEWS_KINDS = ['ai-digest', 'dev-stack', 'trending', 'hackathons', 'jobs', 'research', 'gaming', 'ph-brief', 'weekly'] as const;
export type NewsKind = typeof NEWS_KINDS[number];

export type Part = { part: number; of: number; text: string };

/** Joins a digest Grok sent in pieces. Null until parts 1..of are all in and agree on the total. */
export function assemble(parts: Part[]): string | null {
  if (!parts.length) return null;
  const of = parts[0].of;
  if (parts.some(p => p.of !== of)) return null;
  const byPart = new Map<number, string>();
  for (const p of parts) byPart.set(p.part, p.text);
  if (byPart.size !== of) return null;
  let out = '';
  for (let i = 1; i <= of; i++) {
    const t = byPart.get(i);
    if (t === undefined) return null;
    // Grok splits only between lines, so each part is whole lines: keep a line break between parts.
    out += out && !out.endsWith('\n') ? '\n' + t : t;
  }
  return out;
}

/**
 * Grok sometimes leaves its text URL-encoded twice, so a colon arrives as %3A. Every run of valid
 * %XX codes is decoded; a bare percent sign ("30% faster") and a broken code are left alone.
 */
export function decodeText(text: string): string {
  return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, run => { try { return decodeURIComponent(run); } catch { return run; } });
}

const url = (s: string | undefined) => (/^https?:\/\/\S+$/.test(s ?? '') ? s! : '');

/**
 * One field of a line. A working web address is kept exactly as sent: its own %20 or %2F must not be
 * decoded. Anything else is decoded, and an address that only read as one after decoding (https%3A//…)
 * has its spaces put back as %20.
 */
function cell(x: string): string {
  if (url(x)) return x;
  const d = decodeText(x);
  return /^https?:\/\//.test(d) && /\s/.test(d) ? encodeURI(d) : d;
}

export type Item = { headline: string; summary: string; why: string; image: string; link: string };

/**
 * Grok writes one item per line as `headline | summary | why it matters | image | link`.
 * Older tasks still send `headline | summary | link`. The first line with no pipes is the edition title.
 * Only http(s) addresses are kept for the image and the link.
 */
export function parseItems(text: string): { title: string; items: Item[] } {
  let title = '';
  const items: Item[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    if (!line) continue;
    const c = line.split('|').map(x => cell(x.trim()));
    if (c.length < 2) { if (!title) title = c[0]; continue; }
    // The link is the last cell; the image is any other web address; what is left is the summary and, last, why it matters.
    // Reading by content, not position, keeps a missing image cell or a stray | in the text from losing the link.
    const link = url(c[c.length - 1]);
    const rest = c.slice(1, link ? -1 : undefined);
    let imgAt = -1;
    rest.forEach((x, k) => { if (url(x)) imgAt = k; });
    const image = imgAt >= 0 ? rest[imgAt] : '';
    const text = rest.filter((x, k) => k !== imgAt && x);
    const why = text.length >= 2 ? text[text.length - 1] : '';
    items.push({ headline: c[0], summary: (text.length >= 2 ? text.slice(0, -1) : text).join(' | '), why, image, link });
  }
  return { title, items };
}
