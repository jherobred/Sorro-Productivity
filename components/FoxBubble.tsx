'use client';
import { useLayoutEffect, useRef, useState } from 'react';
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
  return <div ref={ref} className="fx-bubble" role="status" data-part="S.foxbubble" data-kind={nudge.kind} style={at ?? { visibility: 'hidden' }}>
    <button type="button" className="fx-bubble-line" onClick={onOpen}>{nudge.line}</button>
    <div className="fx-bubble-row">
      {onMove && n > 0 && <button type="button" className="fx-bubble-act" onClick={onMove}>Move {n} to tomorrow</button>}
      <button type="button" className="fx-bubble-close" aria-label="Dismiss" onClick={onDismiss}><Icon name="close" size={14} /></button>
    </div>
  </div>;
}
