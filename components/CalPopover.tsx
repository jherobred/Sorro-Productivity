'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';

/**
 * The bubble Google Calendar opens next to whatever you clicked.
 *
 * The calendar used to put event actions behind a right-click context menu.
 * Two things were wrong with that: a right-click is not discoverable — nothing
 * on the grid suggests it — and it does not exist at all on a touch screen, so
 * on a phone an event could be dragged but never opened, renamed or deleted.
 *
 * A left click is the obvious gesture, and the answer to it should appear
 * where the click landed rather than in a corner. This positions against the
 * click point and flips to whichever side has room, so a 23:00 event opens
 * upward and one on Sunday opens leftward.
 */
export function CalPopover({
  x, y, onClose, label, children, width = 300,
}: {
  x: number; y: number;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useOverlayBack(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Measure first, then place — a bubble that renders off-screen and corrects
  // itself on the next frame reads as a flicker.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const M = 10;
    const w = el.offsetWidth || width;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(M, x + 12), window.innerWidth - w - M);
    const below = y + 8;
    // Flip above when there is no room below, then clamp both edges — guarding
    // only the bottom let a bubble near the top of the screen render off it.
    const wanted = below + h + M > window.innerHeight ? y - h - 8 : below;
    const top = Math.min(Math.max(M, wanted), Math.max(M, window.innerHeight - h - M));
    setPos({ left, top });
  }, [x, y, width]);

  return (
    <>
      {/* Click-away. Transparent, because a scrim would say "modal" and this
          is not one — the grid behind stays readable and in context. */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 88 }} />
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        className="k-bloom"
        style={{
          position: 'fixed',
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          width,
          maxWidth: 'calc(100vw - 20px)',
          zIndex: 89,
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 14,
          boxShadow: 'var(--shl)',
          padding: 14,
          visibility: pos ? 'visible' : 'hidden',
        }}>
        {children}
      </div>
    </>
  );
}

/** The row of icon buttons along the top of a popover. */
export function PopoverActions({ children, onClose }: { children?: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8 }}>
      <span style={{ flex: 1 }} />
      {children}
      <button onClick={onClose} className="hov k-squish" aria-label="Close" title="Close"
        style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
        <Icon name="close" size={14} color="var(--tx2)" />
      </button>
    </div>
  );
}
