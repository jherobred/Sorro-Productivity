'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { ShownNudge } from '@/lib/useFoxNudges';

/** What the fox says first, under the fox. Tap to talk about it, or move today's leftovers to tomorrow. */
export function FoxBubble({ nudge, onOpen, onDismiss, onMove }: { nudge: ShownNudge; onOpen(): void; onDismiss(): void; onMove?(): void }) {
  const n = nudge.moveIds?.length ?? 0;
  // Fixed to the fox's spot on screen, so the sidebar rail's overflow cannot clip it.
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = ref.current?.parentElement?.querySelector('.sx-fox')?.getBoundingClientRect();
      if (r) setAt({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, innerWidth - 16 - (ref.current?.offsetWidth ?? 280))) });
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, []);
  // Leaving the bubble from inside it puts the keyboard back on the fox, not on the page body.
  const leave = (f: () => void) => () => { const inside = ref.current?.contains(document.activeElement); f(); if (inside) document.querySelector<HTMLElement>('.sx-fox-btn')?.focus(); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') leave(onDismiss)(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  });
  // Only the line is announced; the buttons are reachable but not read out as part of the message.
  return <div ref={ref} className="fx-bubble" role="region" aria-label="Sorro says" data-part="S.foxbubble" data-kind={nudge.kind} style={at ?? { visibility: 'hidden' }}>
    <button type="button" className="fx-bubble-line" onClick={onOpen}><span role="status">{nudge.line}</span></button>
    <div className="fx-bubble-row">
      {onMove && n > 0 && <button type="button" className="fx-bubble-act" onClick={leave(onMove)}>Move {n} to tomorrow</button>}
      <button type="button" className="fx-bubble-close" aria-label="Dismiss" onClick={leave(onDismiss)}><Icon name="close" size={14} /></button>
    </div>
  </div>;
}
