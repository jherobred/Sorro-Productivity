/// <reference lib="webworker" />
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

const worker = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
let generator: Promise<TextGenerationPipeline> | null = null;

const load = () => generator ??= (pipeline as (t: string, m: string, o: object) => Promise<unknown>)('text-generation', MODEL, {
  device: 'wasm', dtype: 'q4',
  progress_callback: (v: { status: string; file: string; loaded: number; total: number }) => { if (v.status === 'progress' && v.file.endsWith('.onnx')) worker.postMessage({ type: 'progress', loaded: v.loaded, total: v.total }); },
}) as Promise<TextGenerationPipeline>;

worker.onmessage = async (e: MessageEvent<{ type: 'load' } | { type: 'ask'; system: string; prompt: string }>) => {
  try {
    const gen = await load();
    if (e.data.type === 'load') { worker.postMessage({ type: 'ready' }); return; }
    const out = await gen([{ role: 'system', content: e.data.system }, { role: 'user', content: e.data.prompt }], { max_new_tokens: 256, do_sample: false });
    const messages = (out as unknown as { generated_text: { role: string; content: string }[] }[])[0].generated_text;
    worker.postMessage({ type: 'answer', text: messages[messages.length - 1].content });
  } catch (err) {
    worker.postMessage({ type: 'error', message: (err as Error).message || 'The offline model could not run here.' });
  }
};
