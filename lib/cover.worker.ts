/// <reference lib="webworker" />
import { env, pipeline, RawImage } from '@huggingface/transformers';

const worker = self as unknown as DedicatedWorkerGlobalScope;
// Keep the UI, camera controls and browser Back responsive during inference.
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

worker.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    // Decode the photo here instead of handing the pipeline a blob: URL. The
    // pipeline fetches URL inputs, and the site's connect-src does not allow
    // blob:, so every cutout on the website was refused the moment the model
    // finished loading.
    const input = await RawImage.fromBlob(event.data);
    const segment = await pipeline('background-removal', 'studioludens/birefnet-lite-512', {
      device: 'wasm', dtype: 'fp32',
      revision: '4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7',
      progress_callback: (value) => {
        if (value.status === 'progress' && value.file.endsWith('.onnx')) {
          worker.postMessage({ type: 'progress', progress: { phase: 'download', loaded: value.loaded, total: value.total } });
        }
      },
    });
    worker.postMessage({ type: 'progress', progress: { phase: 'processing' } });
    const [result] = await segment(input);
    const canvas = new OffscreenCanvas(result.width, result.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot finish this cutout. Use the original photo instead.');
    const rgba = new Uint8ClampedArray(result.data);
    ctx.putImageData(new ImageData(rgba, result.width, result.height), 0, 0);
    // Trim empty margins so the object reads as a sticker on the cover.
    let left = result.width, top = result.height, right = -1, bottom = -1;
    for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
      if (rgba[(y * result.width + x) * 4 + 3] > 40) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) throw new Error('No clear subject was found. Try a photo with one object against a plain background.');
    const pad = 16;
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(result.width - 1, right + pad); bottom = Math.min(result.height - 1, bottom + pad);
    const cropped = new OffscreenCanvas(right - left + 1, bottom - top + 1);
    cropped.getContext('2d')!.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    const blob = await cropped.convertToBlob({ type: 'image/png' });
    worker.postMessage({ type: 'result', blob });
    await segment.dispose();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('Cutout worker:', error);
    worker.postMessage({ type: 'error', message: error instanceof Error && /subject|browser/.test(error.message)
      ? error.message : process.env.NODE_ENV !== 'production' ? String(error) : 'The cutout could not finish. Check your connection or try another photo. You can also keep the original.' });
  }
};
