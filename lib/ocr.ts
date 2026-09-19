'use client';

/**
 * Reading the writing in a scanned page, on the device.
 *
 * Tesseract runs in a worker in the page itself, in the website and the app
 * alike, so nothing leaves the device. Its engine and English data come from
 * the jsDelivr CDN the site already allows, once, and are cached after that.
 * It reads print and neat handwriting; joined-up writing is a guess.
 */

export type OcrProgress = (share: number, label: string) => void;

const LABELS: Record<string, string> = {
  'loading tesseract core': 'Getting the reader ready…',
  'initializing tesseract': 'Getting the reader ready…',
  'loading language traineddata': 'Loading English…',
  'initializing api': 'Getting the reader ready…',
  'recognizing text': 'Reading the writing…',
};

/** The lines worth keeping: blank runs closed up, and lines of stray marks with no letter or digit dropped. */
export function tidyText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, i, all) => (line ? /[\p{L}\p{N}]/u.test(line) : i > 0 && !!all[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function readText(image: HTMLCanvasElement, onProgress?: OcrProgress): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m) => onProgress?.(Math.max(0, Math.min(1, m.progress ?? 0)), LABELS[m.status] ?? 'Getting the reader ready…'),
  });
  try {
    const { data } = await worker.recognize(image);
    return tidyText(data.text ?? '');
  } finally {
    await worker.terminate();
  }
}
