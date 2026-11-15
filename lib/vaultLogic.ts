/** The Vault's sorting, filtering and folders. Pure, so `node --test` runs it. */
import type { LinkItem } from './linkText.ts';

export type VaultFile = { id: string; name: string; kind: string; size_bytes: number; storage_path: string; starred: boolean; created_at: string; folder_id?: string | null };
export type VaultFolder = { id: string; name: string; parent_id: string | null; position?: number };
export type VaultFilter = 'all' | 'links' | 'images' | 'docs' | 'other';
export type VaultSort = 'new' | 'old' | 'name' | 'size' | 'type';
export type VaultItem =
  | { type: 'link'; id: string; title: string; sub: string; kept: boolean; at: string; folder: string | null; link: LinkItem }
  | { type: 'file'; id: string; title: string; sub: string; kept: boolean; at: string; folder: string | null; file: VaultFile };

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
const typeRank = (i: VaultItem) => i.type === 'link' ? 'a' : i.file.kind;
const sizeOf = (i: VaultItem) => i.type === 'file' ? i.file.size_bytes : 0;

/** Where the shelf looks: `undefined` is every folder at once, `null` the top level, a string one folder. */
export type VaultPlace = string | null | undefined;

/**
 * Links and files on one shelf: pinned and starred first, then by `sort` (newest by default).
 * `q` matches the name, the site, the note and the category. `place` keeps one folder's items.
 */
export function vaultItems(links: LinkItem[], files: VaultFile[], filter: VaultFilter, q: string, place: VaultPlace = undefined, sort: VaultSort = 'new'): VaultItem[] {
  const items: VaultItem[] = [
    ...links.map((l): VaultItem => ({ type: 'link', id: l.id, title: l.label || host(l.url), sub: host(l.url), kept: l.pinned, at: l.created_at, folder: l.folder || null, link: l })),
    ...files.map((f): VaultItem => ({ type: 'file', id: f.id, title: f.name, sub: fileSize(f.size_bytes), kept: f.starred, at: f.created_at, folder: f.folder_id ?? null, file: f })),
  ];
  const want = q.trim().toLowerCase();
  const by: Record<VaultSort, (a: VaultItem, b: VaultItem) => number> = {
    new: (a, b) => b.at.localeCompare(a.at),
    old: (a, b) => a.at.localeCompare(b.at),
    name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    size: (a, b) => sizeOf(b) - sizeOf(a) || b.at.localeCompare(a.at),
    type: (a, b) => typeRank(a).localeCompare(typeRank(b)) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
  };
  return items
    .filter(i => place === undefined || i.folder === place)
    .filter(i => filter === 'all' || (i.type === 'link' ? filter === 'links' : filter === (i.file.kind === 'img' ? 'images' : i.file.kind === 'doc' ? 'docs' : 'other')))
    .filter(i => !want || [i.title, i.sub, i.type === 'link' ? `${i.link.note} ${i.link.category} ${i.link.url}` : ''].join(' ').toLowerCase().includes(want))
    .sort((a, b) => Number(b.kept) - Number(a.kept) || by[sort](a, b));
}

/** The folders inside `parent` (null for the top), by name. */
export function childFolders(folders: VaultFolder[], parent: string | null): VaultFolder[] {
  return folders.filter(f => (f.parent_id ?? null) === parent)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** The trail from the top down to `id`, for the breadcrumbs. A missing or looping parent stops the walk. */
export function folderPath(folders: VaultFolder[], id: string | null): VaultFolder[] {
  const byId = new Map(folders.map(f => [f.id, f]));
  const path: VaultFolder[] = [];
  for (let at = id ? byId.get(id) : undefined; at && !path.includes(at); at = at.parent_id ? byId.get(at.parent_id) : undefined) path.unshift(at);
  return path;
}

/** `id` and every folder under it, so a folder is never moved into itself. */
export function folderTree(folders: VaultFolder[], id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

/** How many items sit in each folder, counting the folders under it too. */
export function folderCounts(folders: VaultFolder[], items: VaultItem[]): Map<string, number> {
  const direct = new Map<string, number>();
  for (const i of items) if (i.folder) direct.set(i.folder, (direct.get(i.folder) ?? 0) + 1);
  return new Map(folders.map(f => [f.id, [...folderTree(folders, f.id)].reduce((n, id) => n + (direct.get(id) ?? 0), 0)]));
}

/** A folder name that is not blank and not taken by a sibling: "New folder", "New folder 2"… */
export function freshFolderName(folders: VaultFolder[], parent: string | null, wanted = 'New folder'): string {
  const base = wanted.trim().slice(0, 80) || 'New folder';
  const taken = new Set(childFolders(folders, parent).map(f => f.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** A renamed file keeps its extension when the new name leaves it off: "Draft.pdf" renamed "Final" is "Final.pdf". */
export function renameFile(old: string, wanted: string): string {
  const name = wanted.trim().slice(0, 200);
  if (!name) return old;
  const ext = old.match(/\.[a-z0-9]{1,8}$/i)?.[0];
  return ext && !/\.[a-z0-9]{1,8}$/i.test(name) ? name + ext : name;
}
