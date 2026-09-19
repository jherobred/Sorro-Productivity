/**
 * What an upload is allowed to be, kept apart from uploads.ts so it can be
 * tested — uploads.ts reaches for the Supabase client at module load and will
 * not import outside a browser.
 *
 * Note the ceiling on all of this: it runs in the client, and the client is the
 * APK, which anyone can unpack for the anon key. Someone calling the storage
 * API directly never executes a line of this file. The authoritative version of
 * this gate is the bucket's own `allowed_mime_types` and `file_size_limit` in
 * the Supabase dashboard. This stops the accidental and the casual path.
 */

/**
 * Deliberately excludes `image/svg+xml` and every HTML/XML type — an SVG can
 * carry a `<script>`, and one served back from a public bucket by a raw link
 * (opened directly, not through an `<img>`) executes it.
 */
export const SAFE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
]);

/** Avatar and cover only — no video there. */
export const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif',
};

export const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Files a notebook page keeps: its photos, and the PDF under a PDF annotation.
 * Without PDF here every PDF upload was refused, the refusal was swallowed, and
 * the file stayed on the device that imported it; every other device showed
 * "saved on another device". They go to `bd-files`, which is private to its
 * owner, and are only ever read back as bytes for pdf.js, never served as a page.
 */
export const PAGE_ASSET_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
export const PAGE_ASSET_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Android camera intents and some pickers hand back a File with a blank
 * `type`, and only two of the eleven call sites check the MIME themselves — so
 * a strict `type` test would reject a real photo taken from the meal or receipt
 * camera button on the APK. Fall back to the extension when the browser gives
 * us nothing. SVG stays blocked either way: it is in neither map.
 */
const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
  pdf: 'application/pdf',
};

export function effectiveType(file: { type: string; name: string }): string {
  if (file.type) return file.type;
  return EXT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
}

/** Throws if the file is not allowed. Returns the type it settled on. */
export function assertSafeFile(
  file: { type: string; name: string; size: number },
  types: Set<string> = SAFE_TYPES,
  maxBytes: number = MAX_BYTES,
): string {
  const type = effectiveType(file);
  if (!types.has(type)) throw new Error('That file type is not supported');
  if (file.size > maxBytes) throw new Error('That file is too large');
  return type;
}

/** Strip anything that is not a plain filename character, so a name cannot
 *  inject path segments into the storage key. */
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}
