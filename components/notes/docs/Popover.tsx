'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayBack } from '@/lib/nav';

/**
 * A panel that drops from a toolbar button: the colour grids, the zoom and
 * size lists, the table picker. It closes on Escape, Back, or a press anywhere
 * outside it, and never leaves the screen.
 */
export function Popover({ anchor, onClose, children, label, className = '' }: {
  anchor: DOMRect;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });
  const close = useRef(onClose);
  close.current = onClose;
  useOverlayBack(true, () => close.current());

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = anchor.bottom + 4;
    const top = below + r.height > innerHeight - 8 && anchor.top - r.height - 4 > 8 ? anchor.top - r.height - 4 : below;
    setPos({ left: Math.max(8, Math.min(anchor.left, innerWidth - r.width - 8)), top: Math.max(8, top) });
  }, [anchor]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || (!ref.current?.contains(target) && !target.closest('[data-popover-anchor]'))) close.current();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close.current(); } };
    document.addEventListener('pointerdown', outside);
    ref.current?.addEventListener('keydown', key);
    const el = ref.current;
    return () => { document.removeEventListener('pointerdown', outside); el?.removeEventListener('keydown', key); };
  }, []);

  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={'doc-popover ' + className} style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>,
    document.body,
  );
}
