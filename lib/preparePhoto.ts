/**
 * A photo or image file as a page will keep it: decoded, scaled so its longest
 * edge is at most MAX_EDGE, and re-encoded as WebP. A phone camera frame is
 * far larger than a page needs, and this is what keeps journal and document
 * images from filling private storage.
 */
const MAX_EDGE = 2000;

export async function preparePhoto(source: Blob, name: string): Promise<File> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(source); }
  catch { throw new Error('That photo could not be opened. Choose a JPG, PNG or WebP image.'); }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('That photo could not be prepared.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
  if (!blob) throw new Error('That photo could not be prepared.');
  return new File([blob], name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

