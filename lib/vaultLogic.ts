/** The Vault's sorting and filtering. Pure, so `node --test` runs it. */
import type { LinkItem } from './linkText.ts';

export type VaultFile = { id: string; name: string; kind: string; size_bytes: number; storage_path: string; starred: boolean; created_at: string };
export type VaultFilter = 'all' | 'links' | 'images' | 'docs' | 'other';
export type VaultItem =
  | { type: 'link'; id: string; title: string; sub: string; kept: boolean; at: string; link: LinkItem }
  | { type: 'file'; id: string; title: string; sub: string; kept: boolean; at: string; file: VaultFile };

/** sorro_files.kind for a MIME type: the table only allows doc, img, vid, audio, zip and other. */
export function vaultKind(mime: string): string {
  if (mime.startsWith('image/')) return 'img';
  if (mime.startsWith('video/')) return 'vid';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'doc';
  return 'other';
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** Links and files on one shelf: pinned and starred first, then newest. `q` matches the name, the site, the note and the category. */
export function vaultItems(links: LinkItem[], files: VaultFile[], filter: VaultFilter, q: string): VaultItem[] {
  const items: VaultItem[] = [
    ...links.map((l): VaultItem => ({ type: 'link', id: l.id, title: l.label || host(l.url), sub: host(l.url), kept: l.pinned, at: l.created_at, link: l })),
    ...files.map((f): VaultItem => ({ type: 'file', id: f.id, title: f.name, sub: fileSize(f.size_bytes), kept: f.starred, at: f.created_at, file: f })),
  ];
  const want = q.trim().toLowerCase();
  return items
    .filter(i => filter === 'all' || (i.type === 'link' ? filter === 'links' : filter === (i.file.kind === 'img' ? 'images' : i.file.kind === 'doc' ? 'docs' : 'other')))
    .filter(i => !want || [i.title, i.sub, i.type === 'link' ? `${i.link.note} ${i.link.category} ${i.link.url}` : ''].join(' ').toLowerCase().includes(want))
    .sort((a, b) => Number(b.kept) - Number(a.kept) || b.at.localeCompare(a.at));
}
