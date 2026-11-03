'use client';
import Link from 'next/link';
import { Icon } from './Icon';
import { DESTINATIONS } from '@/lib/destinations';
import { useOverlayBack } from '@/lib/nav';

/** Phone only: the destinations that do not fit the bottom bar, and Settings. */
export function MoreSheet({ current, onClose, onSettings }: { current?: string; onClose: () => void; onSettings: () => void }) {
  useOverlayBack(true, onClose);
  return <div className="sx-sheet-back" onClick={onClose}>
    <div className="sx-sheet" role="dialog" aria-modal="true" aria-label="More" data-part="S.more" onClick={e => e.stopPropagation()}>
      <span className="sx-sheet-grip" aria-hidden="true" />
      {DESTINATIONS.filter(d => !d.phoneBar).map(d => <Link key={d.id} href={'/' + d.id + '/'} aria-current={current === d.id ? 'page' : undefined} onClick={onClose}><Icon name={d.icon} size={20} /><span>{d.name}</span></Link>)}
      <button type="button" onClick={onSettings}><Icon name="cog" size={20} /><span>Settings</span></button>
    </div>
  </div>;
}
