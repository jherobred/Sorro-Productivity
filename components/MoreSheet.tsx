'use client';
import Link from 'next/link';
import { Icon } from './Icon';
import { DESTINATIONS } from '@/lib/destinations';
import { useRouter } from 'next/navigation';
import { useOverlayBack } from '@/lib/nav';

/** Phone only: the destinations that do not fit the bottom bar, and Settings. */
export function MoreSheet({ current, onClose, onSettings }: { current?: string; onClose: () => void; onSettings: () => void }) {
  useOverlayBack(true, onClose);
  const router = useRouter();
  // Closing the sheet steps back over its own history entry. A tab change made in the same tap was undone by that step,
  // so the tab opens once the step has landed (or after a moment, if there was none to wait for).
  const open = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
    let went = false;
    const go = () => { if (went) return; went = true; removeEventListener('popstate', later); router.push(href); };
    const later = () => setTimeout(go, 0);
    addEventListener('popstate', later, { once: true });
    setTimeout(go, 400);
  };
  return <div className="sx-sheet-back" onClick={onClose}>
    <div className="sx-sheet" role="dialog" aria-modal="true" aria-label="More" data-part="S.more" onClick={e => e.stopPropagation()}>
      <span className="sx-sheet-grip" aria-hidden="true" />
      {DESTINATIONS.filter(d => !d.phoneBar).map(d => <Link key={d.id} href={'/' + d.id + '/'} aria-current={current === d.id ? 'page' : undefined} onClick={open('/' + d.id + '/')}><Icon name={d.icon} size={20} /><span>{d.name}</span></Link>)}
      <button type="button" onClick={onSettings}><Icon name="cog" size={20} /><span>Settings</span></button>
    </div>
  </div>;
}
