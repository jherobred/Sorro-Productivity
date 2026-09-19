/**
 * The file id inside a Google Drive share link, in any of the shapes Drive
 * hands out: /file/d/<id>/view, open?id=<id>, uc?id=<id>&export=download, and
 * the drive.usercontent.google.com download link. Kept apart from the fetching
 * so it can be tested without a browser.
 */
const ID = /^[A-Za-z0-9_-]{20,}$/;
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com']);

export function driveFileId(link: string): string | null {
  const text = link.trim();
  if (ID.test(text)) return text;                       // a bare id pasted on its own
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || !DRIVE_HOSTS.has(url.hostname)) return null;
  const inPath = /\/(?:file\/)?d\/([A-Za-z0-9_-]{20,})/.exec(url.pathname)?.[1];
  const inQuery = url.searchParams.get('id');
  const id = inPath ?? inQuery;
  return id && ID.test(id) ? id : null;
}

/** Where Drive serves the bytes of a publicly shared file, past its large-file warning page. */
export const driveDownloadUrl = (id: string) =>
  `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
