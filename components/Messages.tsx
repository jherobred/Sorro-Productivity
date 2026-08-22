'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { useLayout } from '@/lib/useLayout';
import { useRealtime } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { confirmAsk } from '@/lib/ask';
import { PeoplePicker } from './PeoplePicker';
import { ago } from '@/lib/scratch';
import { useSignedUrl } from '@/lib/uploads';
import { useProfiles, displayOf, type Person } from '@/lib/people';
import {
  useConversations, useMembers, useMessages, useMessageActions,
  startDm, startGroup, titleOf, unreadOf,
  CONVOS, MEMBERS, messagesKey, type Conversation, type Member, type Message,
} from '@/lib/messages';
import { usePosts, useThreads, type Kind } from '@/lib/community';

/**
 * Messages.
 *
 * The list on the left, the conversation on the right, and on a phone the list
 * *is* the screen until you open one — the same shape as the notebook and the
 * canvas, because it is the same problem and people should only have to learn
 * it once.
 *
 * A shared post renders from the live row rather than from anything copied into
 * the message, so a post that gets edited or taken down changes here too.
 */

export function Messages({ me }: { me: string }) {
  const { phone } = useLayout();
  const { data: profiles = {} } = useProfiles();
  const { data: convos = [] } = useConversations();
  const { data: members = [] } = useMembers();
  const A = useMessageActions(me);

  const [openId, setOpenId] = useState<string | null>(null);
  /** Which picker is up: one person for a chat, several for a group. */
  const [picking, setPicking] = useState<'dm' | 'group' | null>(null);
  const convo = convos.find((c) => c.id === openId) ?? null;

  useRealtime('bd_conversations', CONVOS);

  useEffect(() => {
    if (!phone && !convo && convos.length) setOpenId(convos[0].id);
    if (openId && !convos.some((c) => c.id === openId)) setOpenId(null);
  }, [phone, convo, convos, openId]);

  const nameOf = (id: string) => displayOf(profiles, id, me).label;

  /**
   * Both of these used to be a text box that wanted a handle spelled right.
   * You pick a face now, and a group is named and filled in the same pass
   * rather than created empty and populated from a header button nobody found.
   */
  const startChat = async (ids: string[]) => {
    setPicking(null);
    const id = await startDm(ids[0]);
    if (id) setOpenId(id);
  };

  const makeGroup = async (ids: string[], name: string) => {
    setPicking(null);
    const id = await startGroup(name, ids);
    if (id) { setOpenId(id); toast(`${name} started with ${ids.length + 1}`); }
  };

  const list = (
    <ChatList
      convos={convos} members={members} profiles={profiles} me={me} selected={openId} phone={phone}
      onPick={setOpenId} onNew={() => setPicking('dm')} onNewGroup={() => setPicking('group')} nameOf={nameOf} />
  );

  const picker = picking && (
    <PeoplePicker
      title={picking === 'dm' ? 'Message who?' : 'New group'}
      me={me} multi={picking === 'group'} askName={picking === 'group'}
      confirmLabel="Create"
      onClose={() => setPicking(null)}
      onPick={(ids, name) => void (picking === 'dm' ? startChat(ids) : makeGroup(ids, name))} />
  );

  if (phone) {
    return (
      <>
        {convo
          ? <Thread key={convo.id} convo={convo} members={members} profiles={profiles} me={me} A={A}
              onBack={() => setOpenId(null)} nameOf={nameOf} />
          : <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{list}</div>}
        {picker}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 14, height: 'min(72dvh, 720px)' }}>
      <aside className="navsb" style={{ width: 268, flex: 'none', overflowY: 'auto', minHeight: 0 }}>{list}</aside>
      {convo ? (
        <Thread key={convo.id} convo={convo} members={members} profiles={profiles} me={me} A={A} nameOf={nameOf} />
      ) : (
        <div style={{ ...PANEL, flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.8 }}>
            No conversations yet.<br />
            <span style={{ fontSize: 11 }}>Start one, or send someone a post from the feed.</span>
          </div>
        </div>
      )}
      {picker}
    </div>
  );
}

/* ------------------------------------------------------------------- list */

function ChatList({
  convos, members, profiles, me, selected, phone, onPick, onNew, onNewGroup, nameOf,
}: {
  convos: Conversation[]; members: Member[]; profiles: Record<string, Person>; me: string;
  selected: string | null; phone: boolean;
  onPick: (id: string) => void; onNew: () => void; onNewGroup: () => void; nameOf: (id: string) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onNew} className="hov k-squish" style={{ ...NEW_BTN, flex: 1 }}>
          <Icon name="plus" size={13} color="var(--tx3)" />New chat
        </button>
        <button onClick={onNewGroup} className="hov k-squish" aria-label="New group"
          style={{ ...NEW_BTN, width: 40, justifyContent: 'center' }}>
          <Icon name="people" size={14} color="var(--tx3)" />
        </button>
      </div>

      {convos.length === 0 && (
        <div style={{ padding: '18px 10px', fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center' }}>
          Nothing yet.
        </div>
      )}

      {convos.map((c) => {
        const on = c.id === selected;
        const mine = members.find((m) => m.conversation_id === c.id && m.user_id === me);
        const unread = unreadOf(c, mine);
        const other = members.find((m) => m.conversation_id === c.id && m.user_id !== me)?.user_id ?? me;
        const who = displayOf(profiles, other, me);
        return (
          <button key={c.id} onClick={() => onPick(c.id)} aria-current={on ? 'true' : undefined} className="hov"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', minHeight: phone ? 52 : 46,
              borderRadius: 11, textAlign: 'left',
              border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
              background: on ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'var(--card)',
              boxShadow: on ? 'none' : 'var(--sh)',
            }}>
            <span aria-hidden style={{
              width: 30, height: 30, flex: 'none', borderRadius: '50%',
              background: c.is_group ? 'var(--card2)' : who.hue,
              display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700,
              color: c.is_group ? 'var(--tx2)' : '#0C0F16',
            }}>
              {c.is_group ? <Icon name="people" size={14} color="var(--tx2)" /> : who.initials}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 12.5, fontWeight: unread ? 800 : 700,
                color: on ? 'var(--accTx)' : 'var(--tx2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {titleOf(c, members, me, nameOf)}
              </span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--tx3)' }}>{ago(c.updated_at)}</span>
            </span>
            {unread && <span aria-label="Unread" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)', flex: 'none' }} />}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- thread */

function Thread({
  convo, members, profiles, me, A, onBack, nameOf,
}: {
  convo: Conversation; members: Member[]; profiles: Record<string, Person>; me: string;
  A: ReturnType<typeof useMessageActions>; onBack?: () => void; nameOf: (id: string) => string;
}) {
  const { data: messages = [] } = useMessages(convo.id);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const foot = useRef<HTMLDivElement>(null);

  useRealtime('bd_messages', messagesKey(convo.id), `conversation_id=eq.${convo.id}`);

  // Opening a conversation is reading it; and a new message should not leave
  // you scrolled halfway up your own history.
  const markRead = A.markRead;
  useEffect(() => { markRead.mutate({ conversation_id: convo.id }); }, [convo.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { foot.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = () => {
    const v = draft.trim();
    if (!v) return;
    A.say(convo.id, v);
    setDraft('');
  };

  const here = members.filter((m) => m.conversation_id === convo.id).map((m) => m.user_id);

  const addPeople = async (ids: string[]) => {
    setAdding(false);
    const { supabase } = await import('@/lib/supabase');
    const { error } = await supabase.from('bd_conversation_members')
      .insert(ids.map((user_id) => ({ conversation_id: convo.id, user_id })));
    toast(error ? error.message : ids.length === 1 ? `Added ${nameOf(ids[0])}` : `Added ${ids.length} people`);
    if (!error) void qc.invalidateQueries({ queryKey: MEMBERS });
  };

  return (
    <div style={{ ...PANEL, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        {onBack && (
          <button onClick={onBack} className="hov" aria-label="All chats"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="back" size={14} color="var(--tx2)" />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleOf(convo, members, me, nameOf)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
            {members.filter((m) => m.conversation_id === convo.id).length} in this chat
          </div>
        </div>
        {convo.is_group && (
          <button onClick={() => setAdding(true)} className="hov" aria-label="Add someone"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={14} color="var(--tx2)" />
          </button>
        )}
        <button
          onClick={() => void confirmAsk('Leave this conversation?', {
            message: 'You will stop seeing it. The others keep the history.',
            confirmLabel: 'Leave', danger: true,
          }).then((yes) => { if (yes) { A.leave.mutate({ conversation_id: convo.id }); onBack?.(); } })}
          className="hov" aria-label="Leave" title="Leave"
          style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
          <Icon name="close" size={14} color="var(--tx3)" />
        </button>
      </header>

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', fontSize: 11.5, color: 'var(--tx3)' }}>Say something.</div>
        )}
        {messages.map((m, i) => (
          <Bubble key={m.id} msg={m} me={me} profiles={profiles}
            first={i === 0 || messages[i - 1].author_id !== m.author_id}
            onUnsend={() => A.unsend.mutate({ id: m.id, conversation_id: convo.id })} />
        ))}
        <div ref={foot} />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--line)', flex: 'none' }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Message" aria-label="Message"
          style={{
            flex: 1, minHeight: 38, padding: '9px 12px', borderRadius: 11,
            border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
          }} />
        <button onClick={send} disabled={!draft.trim()} className="acc k-squish" aria-label="Send"
          style={{
            flex: 'none', width: 42, minHeight: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
            background: 'var(--acc)', opacity: draft.trim() ? 1 : 0.45,
          }}>
          <Icon name="send" size={15} color="#0A0912" />
        </button>
      </div>

      {adding && (
        <PeoplePicker title="Add to this chat" me={me} exclude={here} multi askName={false}
          confirmLabel="Add" onClose={() => setAdding(false)} onPick={(ids) => void addPeople(ids)} />
      )}
    </div>
  );
}

function Bubble({
  msg, me, profiles, first, onUnsend,
}: { msg: Message; me: string; profiles: Record<string, Person>; first: boolean; onUnsend: () => void }) {
  const mine = msg.author_id === me;
  const who = displayOf(profiles, msg.author_id, me);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3 }}>
      {first && !mine && (
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', paddingLeft: 4 }}>{who.label}</span>
      )}

      {msg.share_kind && msg.share_id && (
        <SharedPost kind={msg.share_kind} id={msg.share_id} profiles={profiles} me={me} />
      )}

      {msg.body && (
        <span onDoubleClick={() => mine && onUnsend()}
          title={mine ? 'Double-click to unsend' : undefined}
          style={{
            maxWidth: '78%', padding: '8px 12px', borderRadius: 14,
            borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
            background: mine ? 'var(--acc)' : 'var(--card2)',
            color: mine ? '#0A0912' : 'var(--tx)',
            fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          }}>
          {msg.body}
        </span>
      )}

      <span style={{ fontSize: 9.5, color: 'var(--tx3)', padding: '0 4px' }}>{ago(msg.created_at)}</span>
    </div>
  );
}

/**
 * A post someone sent, rendered from the live row. If they deleted it after
 * sending, this says so rather than showing a copy of something withdrawn.
 */
function SharedPost({
  kind, id, profiles, me,
}: { kind: Kind; id: string; profiles: Record<string, Person>; me: string }) {
  const { data: posts = [] } = usePosts();
  const { data: threads = [] } = useThreads();

  const post = kind === 'photo' ? posts.find((p) => p.id === id) : null;
  const thread = kind === 'discussion' ? threads.find((t) => t.id === id) : null;
  const author = post?.author_id ?? thread?.author_id ?? '';
  const who = author ? displayOf(profiles, author, me) : null;

  if (!post && !thread) {
    return (
      <span style={{
        maxWidth: '78%', padding: '9px 12px', borderRadius: 13, border: '1px dashed var(--line2)',
        fontSize: 11.5, color: 'var(--tx3)',
      }}>
        That post is no longer there.
      </span>
    );
  }

  return (
    <span style={{
      maxWidth: '78%', width: 250, display: 'block', borderRadius: 13, overflow: 'hidden',
      border: '1px solid var(--line2)', background: 'var(--card2)',
    }}>
      {post?.image_path && <SharedImage path={post.image_path} />}
      <span style={{ display: 'block', padding: '9px 11px' }}>
        {who && <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--tx3)' }}>{who.label}</span>}
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          fontSize: 12, lineHeight: 1.5, fontWeight: thread ? 700 : 500, marginTop: 2,
        }}>
          {thread ? thread.title : post?.caption || 'Photo'}
        </span>
      </span>
    </span>
  );
}

function SharedImage({ path }: { path: string }) {
  const url = useSignedUrl('bd-feed', path);
  return (
    <span style={{ display: 'block', aspectRatio: '4 / 3', background: 'var(--card)' }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
    </span>
  );
}

const PANEL: React.CSSProperties = {
  background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)', border: '1px solid var(--line)',
};
const NEW_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', minHeight: 38,
  borderRadius: 11, border: '1px dashed var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
};
