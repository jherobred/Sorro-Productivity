'use client';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { Fox } from './Fox';
import { FoxText } from './FoxText';
import type { ShownNudge } from '@/lib/useFoxNudges';

/** What the fox says first: a card under the top strip, on the right. Reply, move today's leftovers, or dismiss. Every one is kept in the bell's log. */
export function FoxBubble({ nudge, onOpen, onDismiss, onMove }: { nudge: ShownNudge; onOpen(): void; onDismiss(): void; onMove?(): void }) {
  const n = nudge.moveIds?.length ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  // Leaving the card from inside it puts the keyboard back on the fox, not on the page body.
  const leave = (f: () => void) => () => { const inside = ref.current?.contains(document.activeElement); f(); if (inside) document.querySelector<HTMLElement>('.sx-fox-btn')?.focus(); };
  useEffect(() => {
    // Only when the card has focus: Escape closing a menu or sheet elsewhere must not throw away the day's wrap-up.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && ref.current?.contains(document.activeElement)) leave(onDismiss)(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  });
  // Only the line is announced; the buttons are reachable but not read out as part of the message.
  return <div ref={ref} className="fx-bubble" role="region" aria-label="Sorro says" data-part="S.foxbubble" data-kind={nudge.kind}>
    <span className="fx-bubble-fox" aria-hidden="true"><Fox pose="alert" size={22} /></span>
    <div className="fx-bubble-body">
      <p className="fx-bubble-who">Sorro</p>
      <p className="fx-bubble-line" role="status"><FoxText text={nudge.line} /></p>
      <div className="fx-bubble-row">
        <button type="button" className="fx-bubble-act" data-main="true" onClick={onOpen}>Reply</button>
        {onMove && n > 0 && <button type="button" className="fx-bubble-act" onClick={leave(onMove)}>Move {n} to tomorrow</button>}
      </div>
    </div>
    <button type="button" className="fx-bubble-close" aria-label="Dismiss" onClick={leave(onDismiss)}><Icon name="close" size={14} /></button>
  </div>;
}
