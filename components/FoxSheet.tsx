'use client';
import { useEffect } from 'react';
import { FoxChat } from './FoxChat';
import { chatContext } from '@/lib/assistantLogic';

/** The fox's chat on any tab but Home: a bottom sheet on the phone, a panel on the right elsewhere. */
export function FoxSheet({ tab, onClose, onReply }: { tab: string; onClose: () => void; onReply: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return <div className="sx-sheet-back fx-back" onClick={onClose}>
    <div className="fx-sheet" role="dialog" aria-modal="true" aria-label="Talk to Sorro" data-part="S.foxsheet" onClick={e => e.stopPropagation()}>
      <span className="sx-sheet-grip" aria-hidden="true" />
      <FoxChat variant="sheet" context={chatContext(tab, location.search)} onReply={onReply} />
    </div>
  </div>;
}
