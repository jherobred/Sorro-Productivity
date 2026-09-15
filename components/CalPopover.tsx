'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  x, y, onClose, label, children, width = 340,
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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const M = 10;
    const place = () => {
      const isMobile = window.innerWidth <= 640;
      const w = Math.min(el.offsetWidth || width, window.innerWidth - M * 2);
      const h = el.offsetHeight || 160;

      let left: number;
      if (isMobile) {
        left = Math.max(M, (window.innerWidth - w) / 2);
      } else {
        // Prefer the click's right; flip to its left when the bubble would
        // leave the viewport.
        left = x + 12 + w > window.innerWidth - M ? Math.max(M, x - w - 12) : x + 12;
        left = Math.min(left, window.innerWidth - w - M);
      }

      const below = y + 8;
      const wanted = below + h + M > window.innerHeight ? y - h - 8 : below;
      const top = Math.min(Math.max(M, wanted), Math.max(M, window.innerHeight - h - M));
      setPos({ left, top });
    };

    place();
    // The bubble is fixed to the viewport, so a window resize would leave it
    // stranded outside the new bounds — re-clamp whenever the frame changes.
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [x, y, width]);

  return createPortal(
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
          // The bubbles hold their own padding. A tall one on a short phone
          // screen scrolls inside itself instead of running off the bottom.
          maxHeight: 'calc(100dvh - 20px)',
          overflowY: 'auto',
          zIndex: 89,
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 18,
          boxShadow: 'var(--shl, 0 16px 48px rgba(0,0,0,0.3))',
          padding: 0,
          visibility: pos ? 'visible' : 'hidden',
        }}>
        {children}
      </div>
    </>,
    document.body,
  );
}

/** The row of icon buttons along the top of a popover. */
export function PopoverActions({ children, onClose }: { children?: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
      <span style={{ flex: 1 }} />
      {children}
      <button onClick={onClose} className="hov k-squish" aria-label="Close" title="Close"
        style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <Icon name="close" size={15} color="var(--tx2)" />
      </button>
    </div>
  );
}
