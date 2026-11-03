'use client';

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from './supabase';
import { driveDownloadUrl } from './driveLink';
import { PAGE_ASSET_MAX_BYTES } from './uploadGuard';

const NOT_SHARED = 'That Drive file could not be opened as a PDF. In Drive, set General access to “Anyone with the link”, then paste the link again.';

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** `attachment; filename="Week 6.pdf"` and its UTF-8 form, down to the name. */
function nameFrom(disposition: string | null | undefined): string | null {
  if (!disposition) return null;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (utf) { try { return decodeURIComponent(utf); } catch { /* fall through to the plain form */ } }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
}

/**
 * A PDF shared on Google Drive, as a file this device can keep and upload.
 *
 * The app fetches it natively, where Drive's missing CORS headers do not
 * matter. The website cannot read a Drive download at all, so it asks the
 * `drive-pdf` Edge Function to fetch the file for it.
 */
export async function fetchDrivePdf(id: string): Promise<File> {
  let bytes: Uint8Array;
  let name: string | null = null;
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url: driveDownloadUrl(id), responseType: 'blob', connectTimeout: 20_000, readTimeout: 90_000 });
    if (res.status === 404) throw new Error('Drive could not find that file. Check the link.');
    if (res.status >= 400) throw new Error(NOT_SHARED);
    bytes = typeof res.data === 'string' ? fromBase64(res.data) : new Uint8Array(await (res.data as Blob).arrayBuffer());
    name = nameFrom(res.headers['Content-Disposition'] ?? res.headers['content-disposition']);
  } else {
    const { data, error, response } = await supabase.functions.invoke<Blob>('drive-pdf', { body: { id } });
    if (error) {
      const detail = await (error as { context?: Response }).context?.text().catch(() => '');
      let message = '';
      try { message = JSON.parse(detail ?? '').message ?? ''; } catch { /* not JSON */ }
      if (message) throw new Error(message);
      throw new Error('The website could not reach Google Drive. Import the PDF from this computer instead, or use the Sorro app.');
    }
    bytes = new Uint8Array(await (data as Blob).arrayBuffer());
    try { name = decodeURIComponent(response?.headers.get('x-file-name') ?? '') || null; } catch { name = null; }
  }
  if (bytes.length > PAGE_ASSET_MAX_BYTES) throw new Error('That PDF is over 40 MB.');
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error(NOT_SHARED);
  const clean = (name ?? 'Drive PDF').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  return new File([bytes.buffer as ArrayBuffer], /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`, { type: 'application/pdf' });
}
