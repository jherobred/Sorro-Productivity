'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { ChatList, Thread } from './Messages';
import { PeoplePicker } from './PeoplePicker';
import { currentUserId, cachedUserId } from '@/lib/supabase';
import { useLayout } from '@/lib/useLayout';
import { useRealtime } from '@/lib/realtime';
import { useProfiles, displayOf } from '@/lib/people';
import {
  useConversations, useMembers, useMessageActions, startDm, unreadOf, titleOf, CONVOS,
} from '@/lib/messages';

/**
 * Chat, from anywhere — the bar every social app keeps in the bottom-right.
 *
 * Messages already had a home: a tab inside Community. That is the right place
 * to *read* them and the wrong place to *answer* one, because answering meant
 * leaving whatever you were doing, and a reply that costs you your page is a
 * reply that waits until later. LinkedIn, Facebook and Instagram all landed on
 * the same answer, and it is the same answer here: a collapsed bar that knows
 * how many are unread, a list when you open it, and the conversation itself in
 * the same box.
 *
 * **Desktop only, deliberately.** On a phone this pattern is wrong twice over:
 * it would sit on top of Basedly's bottom navigation, and a 320px window inside
 * a 375px screen is just the screen with a border. The Community tab is the
 * phone's answer and it already exists.
 *
 * It portals to `document.body`. `main` carries the font-scale `zoom` and a
 * page-entry transform, either of which makes it the containing block for
 * anything `position: fixed` — the rule that has now bitten this codebase three
 * times.
 */

const W = 328;
const H = 460;

export function MessengerDock() {
  const { phone } = useLayout();
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [me, setMe] = useState(() => cachedUserId() ?? '');

  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);

  const { data: profiles = {} } = useProfiles();
  const { data: convos = [] } = useConversations();
  const { data: members = [] } = useMembers();
  const A = useMessageActions(me);
  useRealtime('bd_conversations', CONVOS);

  const convo = convos.find((c) => c.id === openId) ?? null;
  const nameOf = (id: string) => displayOf(profiles, id, me).label;

  const unread = convos.filter((c) => unreadOf(c, members.find((m) => m.conversation_id === c.id && m.user_id === me))).length;

  // Signed out, or on a phone: the dock is not the answer.
  if (phone || !me || typeof document === 'undefined') return null;

  const shell = (
    <div style={{
      position: 'fixed', right: 18, bottom: 0, zIndex: 55,
      width: open ? W : 232, display: 'flex', flexDirection: 'column',
      background: 'var(--card)', border: '1px solid var(--line2)', borderBottom: 0,
      borderRadius: '14px 14px 0 0', boxShadow: 'var(--shl)', overflow: 'hidden',
      transition: 'width .18s ease',
    }}>
      {/* The bar itself: click it to open, click it again to put it away. */}
      <button
        onClick={() => { if (open && convo) setOpenId(null); else setOpen((v) => !v); }}
        className="hov"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', width: '100%',
          textAlign: 'left', minHeight: 44, flex: 'none',
        }}>
        {open && convo ? (
          <Icon name="back" size={15} color="var(--tx2)" />
        ) : (
          <Icon name="send" size={15} color="var(--accTx)" />
        )}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {open && convo ? titleOf(convo, members, me, nameOf) : 'Messaging'}
        </span>

        {!open && unread > 0 && (
          <span className="k-pulse" style={{
            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, flex: 'none',
            background: 'var(--acc)', color: 'var(--ink)', fontSize: 10.5, fontWeight: 800,
            display: 'grid', placeItems: 'center',
          }}>
            {unread}
          </span>
        )}

        <Icon name="chev" size={14} color="var(--tx3)"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform .18s ease' }} />
      </button>

      {open && (
        <div style={{ height: H, display: 'flex', flexDirection: 'column', minHeight: 0, borderTop: '1px solid var(--line)' }}>
          {convo ? (
            <Thread key={convo.id} convo={convo} members={members} profiles={profiles} me={me} A={A}
              nameOf={nameOf} compact />
          ) : (
            <>
              <div style={{ padding: '9px 10px 0', flex: 'none' }}>
                <button onClick={() => setPicking(true)} className="hov k-squish"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '8px 11px',
                    minHeight: 36, borderRadius: 10, border: '1px dashed var(--line2)',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
                  }}>
                  <Icon name="plus" size={13} color="var(--tx3)" />New chat
                </button>
              </div>
              <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
                <ChatList
                  convos={convos} members={members} profiles={profiles} me={me}
                  selected={openId} phone={false}
                  onPick={setOpenId}
                  onNew={() => setPicking(true)}
                  onNewGroup={() => setPicking(true)}
                  nameOf={nameOf}
                  hideNew />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {createPortal(shell, document.body)}
      {picking && (
        <PeoplePicker title="Message who?" me={me}
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setPicking(false);
            void startDm(ids[0]).then((id) => { if (id) { setOpen(true); setOpenId(id); } });
          }} />
      )}
    </>
  );
}
