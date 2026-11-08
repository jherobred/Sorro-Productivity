'use client';
import { useEffect, useRef } from 'react';
import { FoxChat, focusFoxComposer } from './FoxChat';
import { chatContext } from '@/lib/assistantLogic';
import { openItem } from '@/lib/openItem';

/** The fox's chat on any tab but Home: a bottom sheet on the phone, a panel on the right elsewhere. */
export function FoxSheet({ tab, onClose, onReply }: { tab: string; onClose: () => void; onReply: () => void }) {
  // Focus moves into the sheet on open, stays inside it on Tab, and returns to the fox on close.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    focusFoxComposer();
    return () => { (back?.isConnected ? back : document.querySelector<HTMLElement>('.sx-fox-btn'))?.focus(); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, a[href], input')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return <div className="sx-sheet-back fx-back" onClick={onClose}>
    <div ref={box} className="fx-sheet" role="dialog" aria-modal="true" aria-label="Talk to Sorro" data-part="S.foxsheet" onClick={e => e.stopPropagation()}>
      <span className="sx-sheet-grip" aria-hidden="true" />
      <FoxChat variant="sheet" context={chatContext(tab, openItem())} onReply={onReply} />
    </div>
  </div>;
}
