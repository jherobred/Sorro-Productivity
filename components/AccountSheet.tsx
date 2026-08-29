'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { useWorkspaces, useWorkspaceActions, type Workspace } from '@/lib/workspaces';
import { SpaceSheet } from './SpaceSheet';
import { useAccounts, switchTo, addAccount, forget, signOutAll } from '@/lib/accounts';
import { profileLink } from '@/lib/people';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';

/**
 * You, in one place.
 *
 * Three things were scattered and one of them was unreachable. Switching
 * account lived in a menu at the foot of the **desktop sidebar** — which does
 * not exist on a phone, so on the layout most of this app is used in there was
 * no way to switch, add or sign out at all. Editing your profile was a whole
 * page in More. Sign out was in two places, neither of them obvious.
 *
 * They are the same subject, so they are one sheet, opened from your own face
 * in the top right on every layout — the corner every app has trained people to
 * reach for. The full avatar builder stays on its own page, because it is a
 * workbench and not a setting.
 */
export function AccountSheet({
  me, onClose, onSettings,
}: {
  me: { id: string; name: string; handle: string | null; photo: string | null };
  onClose: () => void;
  onSettings: () => void;
}) {
  const router = useRouter();
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const { data: workspaces = [] } = useWorkspaces();
  const WA = useWorkspaceActions();
  const accounts = useAccounts();
  const [copied, setCopied] = useState(false);
  /** The space being managed, on top of this sheet. */
  const [managing, setManaging] = useState<Workspace | null>(null);
  useOverlayBack(true, onClose);

  const link = profileLink(me.handle);

  const go = (href: string) => { onClose(); router.push(href); };

  /**
   * Copy, or hand off to the system share sheet where there is one. Both, in
   * that order, because `navigator.share` needs a gesture and a secure context
   * and is simply absent on most desktop browsers.
   */
  const share = async () => {
    if (!link) { toast('Set a handle first — your link is built from it'); go('/profile/'); return; }
    try {
      if (navigator.share) { await navigator.share({ title: me.name || 'Basedly', url: link }); return; }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast('Link copied');
    } catch { /* dismissed the share sheet, or no clipboard permission */ }
  };

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'flex-start', justifyContent: phone ? 'center' : 'flex-end',
      padding: phone ? 0 : 'calc(56px + env(safe-area-inset-top)) 16px 16px',
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Your account"
        className="k-bloom"
        style={{
          width: 360, maxWidth: '100%', maxHeight: phone ? '88dvh' : '82dvh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 16, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div className="navsb" style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: phone ? '8px 14px calc(16px + env(safe-area-inset-bottom))' : '12px 14px 14px',
        }}>
          {phone && (
            <span aria-hidden style={{
              display: 'block', width: 36, height: 5, borderRadius: 99,
              background: 'var(--line2)', margin: '4px auto 12px',
            }} />
          )}

          {/* ---------------------------------------------------------- you */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '2px 2px 12px' }}>
            <Face name={me.name} photo={me.photo} size={46} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me.name || 'Your account'}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me.handle ? `@${me.handle}` : 'No handle yet'}
              </span>
            </span>
            <button onClick={() => go('/profile/')} className="hov k-squish" title="Edit your profile"
              aria-label="Edit your profile"
              style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
              <Icon name="pen" size={15} color="var(--tx2)" />
            </button>
          </div>

          {/* Your link. A handle is the only thing that makes one, which is why
              this says so rather than showing a dead button. */}
          <button onClick={() => void share()} className="hov k-squish"
            style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 11px',
              borderRadius: 11, border: '1px dashed var(--line2)', minHeight: 44, marginBottom: 12,
            }}>
            <Icon name={copied ? 'check' : 'upload'} size={14} color="var(--accTx)" />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
                {me.handle ? 'Share your profile link' : 'Set a handle to get a link'}
              </span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {link ?? 'People need it to message you'}
              </span>
            </span>
          </button>

          {/* ----------------------------------------------------- accounts */}
          <Kicker>Accounts</Kicker>

          {accounts.map((a) => {
            const on = a.user_id === me.id;
            return (
              <div key={a.user_id} className="hov"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 11, minHeight: 46 }}>
                <button onClick={() => { if (!on) void switchTo(a.user_id); else onClose(); }}
                  role="menuitemradio" aria-checked={on}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <Face name={a.name} photo={a.photo} size={28} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.email}
                    </span>
                  </span>
                </button>
                {on
                  ? <Icon name="check" size={14} color="var(--accTx)" />
                  : (
                    <button onClick={() => { forget(a.user_id); toast(`Removed ${a.name}`); }}
                      className="hov" aria-label={`Remove ${a.name} from this device`} title="Remove from this device"
                      style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
                      <Icon name="close" size={11} color="var(--tx3)" />
                    </button>
                  )}
              </div>
            );
          })}

          {accounts.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6, padding: '4px 8px 8px', margin: 0 }}>
              Only this one so far. Add another and swapping between them is a tap — no signing
              out, no signing back in.
            </p>
          )}

          <button onClick={() => { onClose(); void addAccount(); }} className="hov k-squish" style={ROW}>
            <Icon name="plus" size={14} color="var(--accTx)" />
            <span style={{ flex: 1, textAlign: 'left', color: 'var(--accTx)' }}>Add another account</span>
          </button>

          {/* --------------------------------------------------- workspaces */}
          <Kicker>Space</Kicker>

          <button onClick={() => { void update({ workspace: null }); toast('Personal'); }}
            role="menuitemradio" aria-checked={prefs.workspace === null} className="hov" style={ROW}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: prefs.accent, flex: 'none' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>Personal</span>
            {prefs.workspace === null && <Icon name="check" size={13} color="var(--accTx)" />}
          </button>

          {/* Switching and managing are two different intentions, so they are
              two different targets in one row. The row switches; the cog opens
              the space — rename, colour, people, delete. A long list of spaces
              with no way in was the whole complaint. */}
          {workspaces.map((w) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => { void update({ workspace: w.id }); toast(`Switched to ${w.name}`); }}
                role="menuitemradio" aria-checked={prefs.workspace === w.id} className="hov" style={{ ...ROW, flex: 1, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: w.color, flex: 'none' }} />
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{w.role}</span>
                {prefs.workspace === w.id && <Icon name="check" size={13} color="var(--accTx)" />}
              </button>
              <button onClick={() => setManaging(w)} className="hov k-squish"
                aria-label={`Manage ${w.name}`} title={`Manage ${w.name}`}
                style={{ flex: 'none', width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
                <Icon name="cog" size={13} color="var(--tx3)" />
              </button>
            </div>
          ))}

          <button onClick={() => {
            void ask('New space', { placeholder: 'Team or org name', confirmLabel: 'Create' })
              .then((n) => { if (n) WA.add(n, PAL.violet); });
          }} className="hov" style={{ ...ROW, color: 'var(--tx3)' }}>
            <Icon name="plus" size={13} color="var(--tx3)" />
            <span style={{ flex: 1, textAlign: 'left' }}>New space</span>
          </button>

          {/* ------------------------------------------------------- the app */}
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 4px' }} />

          <button onClick={() => { onClose(); onSettings(); }} className="hov k-squish" style={ROW}>
            <Icon name="cog" size={14} color="var(--tx3)" />
            <span style={{ flex: 1, textAlign: 'left' }}>Settings</span>
            <Icon name="chev" size={12} color="var(--tx3)" />
          </button>

          <button onClick={() => { void signOutAll(); toast('Signed out'); }} className="hov k-squish"
            style={{ ...ROW, color: 'var(--pal-coral)' }}>
            <Icon name="back" size={14} color="var(--pal-coral)" />
            <span style={{ flex: 1, textAlign: 'left' }}>Sign out of every account</span>
          </button>
        </div>
      </div>

      {managing && (
        <SpaceSheet space={managing} me={me.id} onClose={() => setManaging(null)} />
      )}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '9px 8px', borderRadius: 10, minHeight: 42, fontSize: 12, fontWeight: 700, color: 'var(--tx2)',
};

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase',
      color: 'var(--tx3)', padding: '10px 8px 5px',
    }}>{children}</div>
  );
}

/** A photo when there is one, initials when there is not. */
export function Face({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img loading="lazy" decoding="async" src={photo} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />;
  }
  const initials = (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--card2)', flex: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--tx2)',
    }}>{initials}</span>
  );
}
