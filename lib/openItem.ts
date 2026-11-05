'use client';
import { useEffect } from 'react';
import type { OpenItem } from './assistantLogic';

let open: OpenItem | null = null;

/** The note, task or event open on screen right now, for the fox's context. */
export const openItem = () => open;

/** Call from the page that shows an item: it counts as open while `id` is set and the page is mounted. */
export function useOpenItem(kind: OpenItem['kind'], id: string | null | undefined) {
  useEffect(() => {
    if (!id) return;
    const mine: OpenItem = { kind, id };
    open = mine;
    return () => { if (open === mine) open = null; };
  }, [kind, id]);
}
