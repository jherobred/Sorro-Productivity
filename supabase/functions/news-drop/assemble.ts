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

/**
 * Grok writes one item per line as `headline | summary | link`. The first line
 * that has no pipes is the edition title.
 */
export function parseItems(text: string): { title: string; items: { headline: string; summary: string; link: string }[] } {
  let title = '';
  const items: { headline: string; summary: string; link: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, '');
    if (!line) continue;
    const cells = line.split('|').map(c => c.trim());
    if (cells.length >= 2) items.push({ headline: cells[0], summary: cells[1] ?? '', link: /^https?:\/\//.test(cells[2] ?? '') ? cells[2] : '' });
    else if (!title) title = line;
  }
  return { title, items };
}
