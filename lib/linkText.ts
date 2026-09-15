/**
 * The text side of saved links, with no database in it, so
 * `node --test lib/linkText.check.ts` can cover it. See lib/links.ts.
 */

export const LINK_PREFIX = '@@link';

export type LinkItem = {
  id: string;
  url: string;
  label: string;
  note: string;
  /** A category name, or '' for none. */
  category: string;
  pinned: boolean;
  position: number;
  created_at: string;
};

type Stored = { u: string; l?: string; n?: string; c?: string };

export function encodeLink(v: Pick<LinkItem, 'url' | 'label' | 'note' | 'category'>): string {
  const body: Stored = { u: v.url };
  if (v.label) body.l = v.label;
  if (v.note) body.n = v.note;
  if (v.category) body.c = v.category;
  return LINK_PREFIX + JSON.stringify(body);
}

export function decodeLink(row: { id: string; text: string; pinned: boolean; position: number; created_at: string }): LinkItem | null {
  if (!row.text?.startsWith(LINK_PREFIX)) return null;
  try {
    const body = JSON.parse(row.text.slice(LINK_PREFIX.length)) as Stored;
    const url = safeUrl(body.u);
    if (!url) return null;
    return { id: row.id, url, label: body.l ?? '', note: body.n ?? '', category: body.c ?? '', pinned: !!row.pinned, position: row.position ?? 0, created_at: row.created_at };
  } catch {
    return null;
  }
}

/**
 * A link worth saving: web addresses only, so nothing that runs script can be
 * stored and then clicked. A bare domain like "ust.edu.ph" gets https added.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  let text = (raw ?? '').trim();
  if (!text || /\s/.test(text)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    if (!/^[^/]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) return null;
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** The first web address in a paste or a drop, which is often a line of text around it. */
export function findUrl(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const line of lines) {
    const direct = safeUrl(line);
    if (direct) return direct;
    const match = line.match(/https?:\/\/[^\s<>"']+/i);
    if (match) {
      const found = safeUrl(match[0].replace(/[),.;]+$/, ''));
      if (found) return found;
    }
  }
  return null;
}

/** "docs.google.com/document", readable, for a card and a label to start from. */
export function siteOf(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, '');
    return { host: u.hostname.replace(/^www\./, ''), path: path === '/' ? '' : path };
  } catch {
    return { host: url, path: '' };
  }
}
