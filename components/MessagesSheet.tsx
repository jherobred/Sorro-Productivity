'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { ChatList, Thread } from './Messages';
import { PeoplePicker } from './PeoplePicker';
import { currentUserId, cachedUserId } from '@/lib/supabase';
import { useOverlayBack } from '@/lib/nav';
import { useProfiles, displayOf } from '@/lib/people';
import {
  useConversations, useMembers, useMessageActions, startDm, unreadOf,
} from '@/lib/messages';

/**
 * Chat from anywhere, on a phone.
 *
 * The desktop has `MessengerDock` — the collapsed bar in the bottom-right that
 * Facebook, LinkedIn and Instagram all landed on. That pattern is wrong twice
 * over on a phone: it sits on top of Basedly's own navigation, and a 328px
 * window inside a 375px screen is just the screen with a border. So the phone
 * got nothing, and answering a message meant leaving whatever you were doing
 * for the Community tab.
 *
 * This is the phone's version of the same idea and it is deliberately *not* a
 * floating bubble: nothing hovers over the page, nothing has to be dragged out
 * of the way. A count on the header icon, and the conversation full screen when
 * you open it — the shape every phone messaging app already uses, which is also
 * the shape that obstructs nothing until you ask for it.
 */

/** The unread count for the header button. Cheap: two cached queries. */
export function useUnreadCount(): number {
  const [me, setMe] = useState(() => cachedUserId() ?? '');
  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);
  const { data: convos = [] } = useConversations();
  const { data: members = [] } = useMembers();
  if (!me) return 0;
  return convos.filter((c) =>
    unreadOf(c, members.find((m) => m.conversation_id === c.id && m.user_id === me))).length;
}

export function MessagesSheet({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState(() => cachedUserId() ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState<'dm' | 'group' | null>(null);
  useOverlayBack(true, () => (openId ? setOpenId(null) : onClose()));

  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);

  const { data: profiles = {} } = useProfiles();
  const { data: convos = [] } = useConversations();
  const { data: members = [] } = useMembers();
  const A = useMessageActions(me);

  const convo = convos.find((c) => c.id === openId) ?? null;
  const nameOf = (id: string) => displayOf(profiles, id, me).label;

  const body = (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 94, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', flex: 'none', borderBottom: '1px solid var(--line)' }}>
        <button onClick={() => (convo ? setOpenId(null) : onClose())} className="hov"
          aria-label={convo ? 'All chats' : 'Close messages'}
          style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center' }}>
          <Icon name={convo ? 'back' : 'close'} size={15} color="var(--tx2)" />
        </button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {convo ? nameOf(members.find((m) => m.conversation_id === convo.id && m.user_id !== me)?.user_id ?? me) : 'Messages'}
        </span>
        {!convo && (
          <>
            <button onClick={() => setPicking('group')} className="hov" aria-label="New group"
              style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center' }}>
              <Icon name="people" size={15} color="var(--tx2)" />
            </button>
            <button onClick={() => setPicking('dm')} className="k-squish" aria-label="New chat"
              style={{ width: 34, height: 34, flex: 'none', borderRadius: 10, background: 'var(--acc)', display: 'grid', placeItems: 'center' }}>
              <Icon name="plus" size={15} color="var(--accent-ink)" />
            </button>
          </>
        )}
      </div>

      {convo ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: 10 }}>
          <Thread key={convo.id} convo={convo} members={members} profiles={profiles} me={me} A={A}
            nameOf={nameOf} />
        </div>
      ) : (
        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
          <ChatList
            convos={convos} members={members} profiles={profiles} me={me}
            selected={openId} phone onPick={setOpenId}
            onNew={() => setPicking('dm')} onNewGroup={() => setPicking('group')}
            nameOf={nameOf} hideNew />
        </div>
      )}

      {picking && (
        <PeoplePicker
          title={picking === 'dm' ? 'Message who?' : 'New group'}
          me={me} multi={picking === 'group'} askName={picking === 'group'}
          confirmLabel="Create"
          onClose={() => setPicking(null)}
          onPick={(ids, name) => {
            setPicking(null);
            if (picking === 'dm') {
              void startDm(ids[0]).then((id) => { if (id) setOpenId(id); });
            } else {
              void import('@/lib/messages').then(({ startGroup }) =>
                startGroup(name, ids).then((id) => { if (id) setOpenId(id); }));
            }
          }} />
      )}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
