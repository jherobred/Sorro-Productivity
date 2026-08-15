'use client';

/**
 * A promise-based replacement for window.prompt / window.confirm.
 *
 * Not a style preference: Android's WebView disables both by default, so on the
 * APK — the primary build — every `window.prompt` returns null and the button
 * that called it does nothing at all. These resolve through a real dialog that
 * works the same on web and on the phone, and can be dismissed with Escape or
 * the back gesture like every other overlay.
 */

export type AskRequest = {
  id: number;
  kind: 'prompt' | 'confirm';
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (v: string | null) => void;
};

type Listener = (r: AskRequest | null) => void;

let current: AskRequest | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(current);
}

export function subscribeAsk(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}

export function resolveAsk(value: string | null) {
  const r = current;
  current = null;
  emit();
  r?.resolve(value);
}

/** Returns the typed text, or null if dismissed. */
export function ask(
  title: string,
  opts: { message?: string; placeholder?: string; initial?: string; confirmLabel?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    // One at a time: a second request while one is open cancels the first
    // rather than stacking dialogs the user cannot see behind each other.
    current?.resolve(null);
    current = {
      id: nextId++, kind: 'prompt', title,
      message: opts.message, placeholder: opts.placeholder, initial: opts.initial ?? '',
      confirmLabel: opts.confirmLabel ?? 'Save', danger: false, resolve,
    };
    emit();
  });
}

/** Resolves true when confirmed. */
export function confirmAsk(
  title: string,
  opts: { message?: string; confirmLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = {
      id: nextId++, kind: 'confirm', title,
      message: opts.message, confirmLabel: opts.confirmLabel ?? 'Confirm',
      danger: opts.danger ?? false,
      resolve: (v) => resolve(v !== null),
    };
    emit();
  });
}
