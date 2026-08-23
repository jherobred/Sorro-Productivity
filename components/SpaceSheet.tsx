'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { PeoplePicker } from './PeoplePicker';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { PAL } from '@/lib/pal';
import { useProfiles, displayOf } from '@/lib/people';
import {
  useMembers, useWorkspaceActions, ROLE_NOTE,
  type Role, type Workspace,
} from '@/lib/workspaces';

/**
 * Managing one shared space.
 *
 * The switcher could create a space and switch to it, and that was the whole
 * feature: no rename, no delete, no way to see who was in it, and no way to
 * put anybody in it — which made "shared" a word rather than a behaviour.
 *
 * Everything destructive here is reversible or confirmed, and which of the two
 * depends on whether the app can actually undo it. Deleting a space is a soft
 * delete and gets an Undo. Leaving one cannot be undone by you — only the
 * owner can add somebody — so it asks first instead of pretending.
 *
 * The role row is only drawn for the owner. Everyone else sees who is in the
 * space and what they can do, which is worth knowing and is not a control.
 */

const COLORS = [PAL.violet, PAL.indigo, PAL.cyan, PAL.mint, PAL.amber, PAL.coral, PAL.pink, PAL.lime];

export function SpaceSheet({ space, me, onClose }: {
  space: Workspace;
  me: string;
  onClose: () => void;
}) {
  const { phone } = useLayout();
  const WA = useWorkspaceActions();
  const { data: members = [] } = useMembers(space.id);
  const { data: profiles = {} } = useProfiles();
  const [inviting, setInviting] = useState(false);
  useOverlayBack(true, onClose);

  const owner = space.role === 'owner';
  const ids = members.map((m) => m.user_id);

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Manage ${space.name}`}
        className="k-bloom"
        style={{
          width: 460, maxWidth: '100%', maxHeight: phone ? '92dvh' : '86dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: space.color, flex: 'none' }} />
          <h2 style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-.02em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {space.name}
          </h2>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
            {space.role}
          </span>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {owner && (
            <>
              <section>
                <Kicker>Name</Kicker>
                <button
                  onClick={() => void ask('Rename this space', { initial: space.name, placeholder: 'Team or org name' })
                    .then((n) => { if (n && n !== space.name) WA.rename(space.id, n); })}
                  className="hov"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
                    padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line2)',
                    fontSize: 13, fontWeight: 700, color: 'var(--tx)', textAlign: 'left',
                  }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{space.name}</span>
                  <Icon name="pen" size={14} color="var(--tx3)" />
                </button>
              </section>

              <section>
                <Kicker>Colour</Kicker>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map((c) => {
                    const on = space.color.toLowerCase() === c.toLowerCase();
                    return (
                      <button key={c} onClick={() => WA.edit.mutate({ id: space.id, patch: { color: c } })}
                        aria-label={`Use this colour`} aria-pressed={on} className="k-squish"
                        style={{
                          width: 34, height: 34, borderRadius: 10, background: c, flex: 'none',
                          border: on ? '2.5px solid var(--tx)' : '2.5px solid transparent',
                        }} />
                    );
                  })}
                </div>
              </section>
            </>
          )}

          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <Kicker inline>People</Kicker>
              <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{members.length}</span>
              {owner && (
                <button onClick={() => setInviting(true)} className="hov"
                  style={{
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 9, border: '1px solid var(--line2)',
                    fontSize: 11, fontWeight: 700, color: 'var(--accTx)',
                  }}>
                  <Icon name="plus" size={12} color="var(--accTx)" />
                  Add people
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Just you so far.</div>
              )}
              {members.map((m) => {
                const who = displayOf(profiles, m.user_id, me);
                const isOwner = m.role === 'owner' || m.user_id === space.owner_id;
                return (
                  <div key={m.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                    borderRadius: 12, background: 'var(--card2)',
                  }}>
                    <span style={{
                      width: 30, height: 30, flex: 'none', borderRadius: '50%', overflow: 'hidden',
                      display: 'grid', placeItems: 'center', background: who.hue,
                      fontSize: 11, fontWeight: 800, color: '#0C0F16',
                    }}>
                      {who.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={who.photo} alt="" style={{
                          width: '100%', height: '100%', objectFit: 'cover',
                          objectPosition: `${who.fit.x}% ${who.fit.y}%`, transform: `scale(${who.fit.zoom})`,
                        }} />
                        : who.initials}
                    </span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {who.label}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
                        {ROLE_NOTE[m.role]}
                      </span>
                    </span>

                    {/* The owner's role is not a dropdown. Handing a space over
                        is a different, rarer act than changing what somebody
                        may edit, and putting them in the same control is how
                        you lose a space to a mis-tap. */}
                    {owner && !isOwner ? (
                      <select
                        value={m.role}
                        aria-label={`Role for ${who.label}`}
                        onChange={(e) => {
                          const role = e.target.value as Exclude<Role, 'owner'>;
                          WA.invite.mutate({ id: space.id, user_id: m.user_id, role });
                          toast(`${who.label} is now ${role === 'editor' ? 'an editor' : 'a viewer'}`);
                        }}
                        style={{
                          flex: 'none', minHeight: 32, padding: '0 8px', borderRadius: 9,
                          border: '1px solid var(--line2)', background: 'var(--card)',
                          color: 'var(--tx2)', fontSize: 11, fontWeight: 700,
                        }}>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 800, color: 'var(--tx3)', textTransform: 'capitalize' }}>
                        {m.role}
                      </span>
                    )}

                    {owner && !isOwner && (
                      <button
                        onClick={() => void confirmAsk(`Remove ${who.label}?`, {
                          message: 'They lose access to everything in this space. Nothing of theirs is deleted.',
                          confirmLabel: 'Remove', danger: true,
                        }).then((yes) => {
                          if (!yes) return;
                          WA.removeMember.mutate({ id: space.id, user_id: m.user_id });
                          toast(`Removed ${who.label}`);
                        })}
                        className="hov" aria-label={`Remove ${who.label}`}
                        style={{ flex: 'none', width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
                        <Icon name="close" size={12} color="var(--tx3)" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <Kicker>What a space shares</Kicker>
            <p style={{ fontSize: 11.5, lineHeight: 1.7, color: 'var(--tx3)', margin: 0 }}>
              Projects and files you create while this space is selected are visible to
              everyone in it. Anything you make in Personal stays yours, whoever you add here.
            </p>
          </section>
        </div>

        <div style={{ display: 'flex', gap: 9, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          {owner ? (
            <button
              onClick={() => void confirmAsk(`Delete “${space.name}”?`, {
                message: 'Everyone loses access. You can undo this from the message that follows.',
                confirmLabel: 'Delete', danger: true,
              }).then((yes) => { if (yes) { WA.removeWithUndo(space); onClose(); } })}
              className="hov k-squish"
              style={{
                flex: 1, minHeight: 42, borderRadius: 12, border: `1px solid ${PAL.coral}`,
                fontSize: 12.5, fontWeight: 800, color: PAL.coral,
              }}>
              Delete space
            </button>
          ) : (
            <button
              onClick={() => void confirmAsk(`Leave “${space.name}”?`, {
                message: 'Only the owner can add you back, so this one does not undo.',
                confirmLabel: 'Leave', danger: true,
              }).then((yes) => { if (yes) { WA.leaveSpace(space); onClose(); } })}
              className="hov k-squish"
              style={{
                flex: 1, minHeight: 42, borderRadius: 12, border: `1px solid ${PAL.coral}`,
                fontSize: 12.5, fontWeight: 800, color: PAL.coral,
              }}>
              Leave space
            </button>
          )}
          <button onClick={onClose} className="acc k-squish"
            style={{
              flex: 1, minHeight: 42, borderRadius: 12, background: 'var(--acc)',
              color: 'var(--ink)', fontSize: 12.5, fontWeight: 800,
            }}>
            Done
          </button>
        </div>
      </div>

      {inviting && (
        <PeoplePicker
          title={`Add to ${space.name}`}
          me={me}
          exclude={ids}
          multi
          confirmLabel="Add"
          onClose={() => setInviting(false)}
          onPick={(picked) => {
            // Editor is the default because it is what "sharing a space" means
            // to most people; a viewer is a deliberate downgrade, one tap away
            // in the row that just appeared.
            for (const id of picked) WA.invite.mutate({ id: space.id, user_id: id, role: 'editor' });
            setInviting(false);
            toast(picked.length === 1 ? 'Added 1 person' : `Added ${picked.length} people`);
          }} />
      )}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

function Kicker({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase',
      color: 'var(--tx3)', marginBottom: inline ? 0 : 9,
    }}>
      {children}
    </div>
  );
}
