/** Image preparation shared by camera and upload. No model is imported here. */
import { assertSafeFile, IMAGE_EXT } from './uploadGuard';

export async function prepareCover(file: File): Promise<Blob> {
  assertSafeFile(file, new Set(Object.keys(IMAGE_EXT)));
  const image = await createImageBitmap(file).catch(() => { throw new Error('This image could not be opened. Try a JPEG, PNG or WebP photo.'); });
  try {
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo editing is unavailable in this browser.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not prepare that photo.')), 'image/png',
    ));
  } finally { image.close(); }
}

export type CutoutProgress = { phase: 'download' | 'processing'; loaded?: number; total?: number };

/** Terminating the dedicated worker really cancels its download/inference. */
export function makeCutout(blob: Blob, progress: (value: CutoutProgress) => void, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./cover.worker.ts', import.meta.url), { type: 'module' });
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => { clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { finish(); reject(new Error('The cutout took too long on this device. Try a simpler photo, or keep the original.')); }, 240_000);
    worker.onerror = () => { finish(); reject(new Error('Background removal could not start. Check your connection, or use the original photo.')); };
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'progress') progress(message.progress);
      if (message.type === 'result') { finish(); resolve(message.blob as Blob); }
      if (message.type === 'error') { finish(); reject(new Error(message.message)); }
    };
    worker.postMessage(blob);
  });
}
