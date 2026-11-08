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
    out += t;
  }
  return out;
}

export type Item = { headline: string; summary: string; why: string; image: string; link: string };
const url = (s: string | undefined) => (/^https?:\/\/\S+$/.test(s ?? '') ? s! : '');

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
    const c = line.split('|').map(x => x.trim());
    if (c.length >= 5) items.push({ headline: c[0], summary: c[1], why: c[2], image: url(c[3]), link: url(c[4]) });
    else if (c.length >= 2) items.push({ headline: c[0], summary: c[1] ?? '', why: '', image: '', link: url(c[2]) });
    else if (!title) title = line;
  }
  return { title, items };
}
