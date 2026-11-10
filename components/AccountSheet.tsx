'use client';
/**
 * S.account: you, in one card. Who is signed in, the other accounts one tap away, your spaces,
 * Settings and Sign out. On a computer it opens beside the name it was opened from, at the foot
 * of the sidebar; on a phone it rises as a sheet, since the avatar is at the top of the screen.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { useWorkspaces, useWorkspaceActions, type Workspace } from '@/lib/workspaces';
import { SpaceSheet } from './SpaceSheet';
import { useAccounts, switchTo, addAccount, forget, signOutAll } from '@/lib/accounts';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import './account.css';

export function AccountSheet({ me, onClose, onSettings }: {
  me: { id: string; name: string; handle: string | null; photo: string | null };
  onClose: () => void;
  onSettings: () => void;
}) {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const { data: workspaces = [] } = useWorkspaces();
  const WA = useWorkspaceActions();
  const accounts = useAccounts();
  const others = accounts.filter(a => a.user_id !== me.id);
  const email = accounts.find(a => a.user_id === me.id)?.email;
  /** The space being managed, on top of this card. */
  const [managing, setManaging] = useState<Workspace | null>(null);
  useOverlayBack(true, onClose);

  const body = <div className="ac-back" data-phone={phone} onClick={onClose}>
    <div className="ac" role="dialog" aria-modal="true" aria-label="Your account" data-part="S.account" onClick={e => e.stopPropagation()}>
      {phone && <span className="sx-sheet-grip" aria-hidden="true" />}
      <header className="ac-me">
        <Face name={me.name} photo={me.photo} size={44} />
        <div><strong>{me.name || 'Your account'}</strong>{email && <small>{email}</small>}</div>
        <button type="button" className="ac-x" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
      </header>

      {others.length > 0 && <section aria-label="Other accounts">
        <h3>Switch account</h3>
        {others.map(a => <div key={a.user_id} className="ac-row">
          <button type="button" className="ac-item" onClick={() => void switchTo(a.user_id)}>
            <Face name={a.name} photo={a.photo} size={28} />
            <span><strong>{a.name}</strong><small>{a.email}</small></span>
          </button>
          <button type="button" className="ac-mini" aria-label={`Remove ${a.name} from this device`} title="Remove from this device" onClick={() => { forget(a.user_id); toast(`Removed ${a.name}`); }}><Icon name="close" size={12} /></button>
        </div>)}
      </section>}

      <section aria-label="Spaces">
        <h3>Space</h3>
        <button type="button" className="ac-item" role="menuitemradio" aria-checked={prefs.workspace === null} onClick={() => { void update({ workspace: null }); toast('Personal'); }}>
          <i style={{ background: prefs.accent }} /><span><strong>Personal</strong></span>{prefs.workspace === null && <Icon name="check" size={14} />}
        </button>
        {workspaces.map(w => <div key={w.id} className="ac-row">
          <button type="button" className="ac-item" role="menuitemradio" aria-checked={prefs.workspace === w.id} onClick={() => { void update({ workspace: w.id }); toast(`Switched to ${w.name}`); }}>
            <i style={{ background: w.color }} /><span><strong>{w.name}</strong><small>{w.role}</small></span>{prefs.workspace === w.id && <Icon name="check" size={14} />}
          </button>
          <button type="button" className="ac-mini" aria-label={`Manage ${w.name}`} title={`Manage ${w.name}`} onClick={() => setManaging(w)}><Icon name="cog" size={13} /></button>
        </div>)}
        <button type="button" className="ac-item ac-quiet" onClick={() => { void ask('New space', { placeholder: 'Team or org name', confirmLabel: 'Create' }).then(n => { if (n) WA.add(n, PAL.violet); }); }}>
          <Icon name="plus" size={15} /><span>New space</span>
        </button>
      </section>

      <section className="ac-foot">
        <button type="button" className="ac-item" onClick={() => { onClose(); void addAccount(); }}><Icon name="plus" size={16} /><span>Add another account</span></button>
        <button type="button" className="ac-item" onClick={() => { onClose(); onSettings(); }}><Icon name="cog" size={16} /><span>Settings</span></button>
        <button type="button" className="ac-item ac-out" onClick={() => { void signOutAll(); toast('Signed out'); }}><Icon name="back" size={16} /><span>{accounts.length > 1 ? 'Sign out of every account' : 'Sign out'}</span></button>
      </section>
    </div>
    {managing && <SpaceSheet space={managing} me={me.id} onClose={() => setManaging(null)} />}
  </div>;

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

/** A photo when there is one, initials when there is not. */
export function Face({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img loading="lazy" decoding="async" src={photo} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />;
  }
  const initials = (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <span className="ac-face" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>;
}
