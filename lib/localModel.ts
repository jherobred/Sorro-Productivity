'use client';
/**
 * The offline assistant: a 0.5B model that runs in the browser once downloaded
 * (about 350 MB, kept in the browser's cache). It answers from what is cached
 * on this device and cannot change anything.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'sorro-local-model';
type State = { status: 'none' | 'downloading' | 'ready' | 'error'; progress: number; message?: string };
let state: State = { status: 'none', progress: 0 };
try { if (localStorage.getItem(KEY) === 'ready') state = { status: 'ready', progress: 1 }; } catch { /* private mode */ }
const listeners = new Set<() => void>();
const set = (s: State) => { state = s; listeners.forEach(f => f()); };

let worker: Worker | null = null;
function getWorker() {
  worker ??= new Worker(new URL('./localModel.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export function useLocalModel() {
  return useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => state, () => state);
}

export function downloadLocalModel() {
  if (state.status === 'downloading') return;
  set({ status: 'downloading', progress: 0 });
  const w = getWorker();
  w.onmessage = (e) => {
    if (e.data.type === 'progress' && e.data.total) set({ status: 'downloading', progress: e.data.loaded / e.data.total });
    if (e.data.type === 'ready') { try { localStorage.setItem(KEY, 'ready'); } catch {} set({ status: 'ready', progress: 1 }); }
    if (e.data.type === 'error') set({ status: 'error', progress: 0, message: e.data.message });
  };
  w.postMessage({ type: 'load' });
}

export async function forgetLocalModel() {
  try { localStorage.removeItem(KEY); } catch {}
  worker?.terminate(); worker = null;
  try { for (const k of await caches.keys()) if (k.includes('transformers')) await caches.delete(k); } catch { /* no Cache Storage */ }
  set({ status: 'none', progress: 0 });
}

export function askLocalModel(prompt: string, facts: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    w.onmessage = (e) => {
      if (e.data.type === 'answer') resolve(e.data.text);
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
    w.postMessage({ type: 'ask', system: `You are Sorro, an offline assistant. You cannot change anything. Answer briefly from these facts only, and say so if they do not cover the question.\n${facts}`, prompt });
  });
}
