'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from './Icon';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { confirmAsk } from '@/lib/ask';
import { PeoplePicker } from './PeoplePicker';
import { ago } from '@/lib/scratch';
import { useSignedUrl } from '@/lib/uploads';
import { Lightbox } from './MediaFrame';
import { ContextMenu } from './ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { useProfiles, displayOf, type Person, type Display } from '@/lib/people';
import {
  useConversations, useMembers, useMessages, useMessageActions,
  startDm, startGroup, titleOf, unreadOf, putAttachment, attachFromDrive, driveFiles,
  sizeLabel, kindOfFile, REPORT_REASONS,
  MEMBERS,
  type Conversation, type Member, type Message, type Attachment, type DriveFile, type ReportReason,
} from '@/lib/messages';
import { usePosts, useThreads, type Kind } from '@/lib/community';
import { MessageRpModal } from './community/MessageRpModal';
import { PostPickerModal } from './community/PostPickerModal';
import {
  parseRpMessage,
  sendRp,
  markRequestPaidLocally,
  isRequestPaidLocally,
  useClaimReceivedRp,
  encodePostRefMessage,
} from '@/lib/rpTransfers';
import { RANKED } from '@/lib/challenges';

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
  useClaimReceivedRp(me);
  const { phone } = useLayout();
  const { data: profiles = {} } = useProfiles();
  const { data: convos = [] } = useConversations();
  const { data: members = [] } = useMembers();
  const A = useMessageActions(me);

  const [openId, setOpenId] = useState<string | null>(null);
  /** Which picker is up: one person for a chat, several for a group. */
  const [picking, setPicking] = useState<'dm' | 'group' | null>(null);
  const convo = convos.find((c) => c.id === openId) ?? null;

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
      <div style={{ height: 'calc(100dvh - 160px)', minHeight: 460, display: 'flex', flexDirection: 'column', width: '100%' }}>
        {convo
          ? <Thread key={convo.id} convo={convo} members={members} profiles={profiles} me={me} A={A}
              onBack={() => setOpenId(null)} nameOf={nameOf} />
          : <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{list}</div>}
        {picker}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 14, height: 'calc(100dvh - 180px)', minHeight: 520, maxHeight: 880, width: '100%' }}>
      <aside className="navsb" style={{ width: 280, flex: 'none', overflowY: 'auto', minHeight: 0 }}>{list}</aside>
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

/**
 * Somebody's face.
 *
 * Every avatar in messaging was initials on a coloured disc, including for
 * people whose photo the app already had on `bd_profiles.photo_url` and was
 * drawing correctly in the feed, on projects and in the header. A chat list of
 * two-letter discs is the one place a picture does most work: you find the
 * conversation you want by the face, not by reading four names.
 */
export function Avatar({ who, size, ring }: { who: Display; size: number; ring?: string }) {
  const common: React.CSSProperties = {
    width: size, height: size, flex: 'none', borderRadius: '50%',
    border: ring ? `2px solid ${ring}` : undefined,
  };
  if (who.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={who.photo} alt="" style={{ ...common, objectFit: 'cover', display: 'block', objectPosition: `${who.fit.x}% ${who.fit.y}%`, transform: `scale(${who.fit.zoom})` }} />;
  }
  return (
    <span aria-hidden style={{
      ...common, background: who.hue, display: 'grid', placeItems: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#0C0F16',
    }}>
      {who.initials}
    </span>
  );
}

/* ------------------------------------------------------------------- list */

export function ChatList({
  convos, members, profiles, me, selected, phone, onPick, onNew, onNewGroup, nameOf, hideNew,
}: {
  convos: Conversation[]; members: Member[]; profiles: Record<string, Person>; me: string;
  selected: string | null; phone: boolean;
  onPick: (id: string) => void; onNew: () => void; onNewGroup: () => void; nameOf: (id: string) => string;
  /** The dock carries its own New chat button above the list. */
  hideNew?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: hideNew ? 'none' : 'flex', gap: 6 }}>
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
            {c.is_group ? (
              <span aria-hidden style={{
                width: 34, height: 34, flex: 'none', borderRadius: '50%', background: 'var(--card2)',
                display: 'grid', placeItems: 'center',
              }}>
                <Icon name="people" size={15} color="var(--tx2)" />
              </span>
            ) : (
              <Avatar who={who} size={34} />
            )}
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

export function Thread({
  convo, members, profiles, me, A, onBack, nameOf, compact,
}: {
  convo: Conversation; members: Member[]; profiles: Record<string, Person>; me: string;
  A: ReturnType<typeof useMessageActions>; onBack?: () => void; nameOf: (id: string) => string;
  /** The docked window: same thread, tighter, no Leave button. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { data: messages = [] } = useMessages(convo.id);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [drive, setDrive] = useState(false);
  const [rpModalOpen, setRpModalOpen] = useState(false);
  const [postPickerOpen, setPostPickerOpen] = useState(false);
  /** Which message is open in its own editor, and which is being reported. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const qc = useQueryClient();
  const foot = useRef<HTMLDivElement>(null);

  const other = members.find((m) => m.conversation_id === convo.id && m.user_id !== me);
  const recipientId = other?.user_id || '';
  const recipientName = nameOf(recipientId);

  // Opening a conversation is reading it; and a new message should not leave
  // you scrolled halfway up your own history.
  const markRead = A.markRead;
  useEffect(() => { markRead.mutate({ conversation_id: convo.id }); }, [convo.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { foot.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = () => {
    const v = draft.trim();
    if (!v && !attach) return;
    A.say(convo.id, v, undefined, attach);
    setDraft('');
    setAttach(null);
  };

  /** One path for a photo, a file off the disk, and a file out of the Drive. */
  const take = async (get: () => Promise<Attachment>) => {
    setBusy(true);
    try {
      setAttach(await get());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not attach that');
    } finally {
      setBusy(false);
    }
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
    <div style={{ ...PANEL, flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        {onBack && (
          <button onClick={onBack} className="hov" aria-label="All chats"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="back" size={14} color="var(--tx2)" />
          </button>
        )}
        <div
          onClick={() => {
            const other = members.find((m) => m.conversation_id === convo.id && m.user_id !== me);
            if (other) {
              const p = profiles[other.user_id];
              const target = p?.handle || other.user_id;
              if (target) router.push(`/profile/?u=${encodeURIComponent(target)}`);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
          className="hov"
          title="View profile"
          style={{ flex: 1, minWidth: 0, cursor: 'pointer', padding: '2px 4px', borderRadius: 8 }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx)' }}>
            {titleOf(convo, members, me, nameOf)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
            {members.filter((m) => m.conversation_id === convo.id).length} in this chat · View profile ›
          </div>
        </div>
        {convo.is_group && (
          <button onClick={() => setAdding(true)} className="hov" aria-label="Add someone"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={14} color="var(--tx2)" />
          </button>
        )}
        {!compact && <button
          onClick={() => void confirmAsk('Leave this conversation?', {
            message: 'You will stop seeing it. The others keep the history.',
            confirmLabel: 'Leave', danger: true,
          }).then((yes) => { if (yes) { A.leave.mutate({ conversation_id: convo.id }); onBack?.(); } })}
          className="hov" aria-label="Leave" title="Leave"
          style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
          <Icon name="close" size={14} color="var(--tx3)" />
        </button>}
      </header>

      <div className="navsb" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', fontSize: 11.5, color: 'var(--tx3)' }}>Say something.</div>
        )}
        {messages.map((m, i) => (
          <Bubble key={m.id} msg={m} me={me} profiles={profiles}
            first={i === 0 || messages[i - 1].author_id !== m.author_id}
            editing={editingId === m.id}
            onEditStart={() => setEditingId(m.id)}
            onEditCancel={() => setEditingId(null)}
            onEditSave={(body) => {
              setEditingId(null);
              const v = body.trim();
              if (!v || v === m.body) return;
              A.edit.mutate({ id: m.id, conversation_id: convo.id, body: v });
            }}
            onRemove={() => A.takeBack(m)}
            onReport={() => setReporting(m)} />
        ))}
        <div ref={foot} />
      </div>

      <div style={{ borderTop: '1px solid var(--line)', flex: 'none' }}>
        {/* What is going with the message, before it goes. */}
        {attach && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9, margin: '9px 12px 0', padding: '7px 9px',
            borderRadius: 11, background: 'var(--card2)', border: '1px solid var(--line2)',
          }}>
            <Icon name={attach.kind === 'image' ? 'image' : 'files'} size={14} color="var(--accTx)" />
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attach.name}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{sizeLabel(attach.size)}</span>
            <button onClick={() => setAttach(null)} className="hov" aria-label="Remove the attachment"
              style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
              <Icon name="close" size={11} color="var(--tx3)" />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, padding: '10px 12px', alignItems: 'center' }}>
          {/* A photo, anything else off the device, or something already in
              your Files. Three buttons rather than one paperclip behind a
              menu: on a phone the menu is two taps to do the commonest thing. */}
          <label className="hov" title="Send a photo" style={ATTACH_BTN}>
            <Icon name="image" size={15} color="var(--tx2)" />
            <input type="file" accept="image/*" hidden disabled={busy}
              aria-label="Send a photo"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(() => putAttachment(f)); e.target.value = ''; }} />
          </label>
          <label className="hov" title="Send a file from your device" style={ATTACH_BTN}>
            <Icon name="files" size={15} color="var(--tx2)" />
            <input type="file" hidden disabled={busy}
              aria-label="Send a file from your device"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(() => putAttachment(f)); e.target.value = ''; }} />
          </label>
          <button onClick={() => setDrive(true)} className="hov" title="Send from your Files" style={ATTACH_BTN}>
            <Icon name="files" size={15} color="var(--tx2)" />
          </button>

          {/* Refer a community post or photo */}
          <button
            type="button"
            onClick={() => setPostPickerOpen(true)}
            className="hov k-squish"
            title="Refer a post or image"
            style={{
              ...ATTACH_BTN,
              background: 'rgba(59, 130, 246, 0.14)',
              border: '1px solid rgba(96, 165, 250, 0.3)',
              color: '#60A5FA',
              fontSize: 13,
            }}
          >
            🔗
          </button>

          {/* Send or Ask RP Currency & Money Button */}
          <button
            type="button"
            onClick={() => {
              if (!recipientId) {
                toast('No recipient found in this chat');
                return;
              }
              setRpModalOpen(true);
            }}
            className="hov k-squish"
            title="Send or Ask RP / Money"
            style={{
              ...ATTACH_BTN,
              background: 'rgba(99, 102, 241, 0.16)',
              border: '1px solid rgba(129, 140, 248, 0.35)',
              color: '#818CF8',
              fontSize: 13,
            }}
          >
            💎
          </button>

          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Write a message…" aria-label="Write a message"
            style={{
              flex: 1, minHeight: 38, padding: '9px 12px', borderRadius: 11,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
            }} />
          <button onClick={send} disabled={!draft.trim() && !attach} className="hov k-squish" aria-label="Send"
            style={{
              width: 38, height: 38, flex: 'none', borderRadius: 11,
              background: draft.trim() || attach ? 'var(--acc)' : 'var(--card2)',
              color: draft.trim() || attach ? 'var(--ink)' : 'var(--tx3)',
              display: 'grid', placeItems: 'center',
            }}>
            <Icon name="send" size={15} color={draft.trim() || attach ? 'var(--ink)' : 'var(--tx3)'} />
          </button>
        </div>
      </div>

      {rpModalOpen && recipientId && (
        <MessageRpModal
          recipientId={recipientId}
          recipientName={recipientName}
          conversationId={convo.id}
          onClose={() => setRpModalOpen(false)}
          onSendMessage={(body) => {
            A.say(convo.id, body);
          }}
        />
      )}

      {postPickerOpen && (
        <PostPickerModal
          me={me}
          onClose={() => setPostPickerOpen(false)}
          onPickPost={(kind, id, title, imagePath) => {
            A.say(convo.id, encodePostRefMessage(id, title, imagePath), { kind, id });
          }}
        />
      )}

      {drive && (
        <DrivePicker onClose={() => setDrive(false)}
          onPick={(f) => { setDrive(false); void take(() => attachFromDrive(f)); }} />
      )}

      {adding && (
        <PeoplePicker title="Add to this chat" me={me} exclude={here} multi askName={false}
          confirmLabel="Add" onClose={() => setAdding(false)} onPick={(ids) => void addPeople(ids)} />
      )}

      {reporting && (
        <ReportSheet msg={reporting} onClose={() => setReporting(null)}
          onSend={(reason, note) => {
            A.report.mutate({
              message_id: reporting.id, conversation_id: reporting.conversation_id, reason, note,
            }, {
              onSuccess: () => toast('Reported — thanks, we keep a record of it'),
              onError: (e) => toast(`Could not report that — ${e.message}`),
            });
            setReporting(null);
          }} />
      )}
    </div>
  );
}

function Bubble({
  msg, me, profiles, first, editing, onEditStart, onEditCancel, onEditSave, onRemove, onReport,
}: {
  msg: Message; me: string; profiles: Record<string, Person>; first: boolean;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: (body: string) => void;
  onRemove: () => void;
  onReport: () => void;
}) {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState(msg.body);
  const mine = msg.author_id === me;
  const who = displayOf(profiles, msg.author_id, me);
  const rpData = useMemo(() => parseRpMessage(msg.body), [msg.body]);

  useEffect(() => { if (editing) setDraft(msg.body); }, [editing, msg.body]);

  /**
   * One menu, three verbs, and which of them you get depends on whose message
   * it is. Yours: edit and remove. Somebody else's: report. Nobody can edit
   * another person's words, and RLS says so as well as this does.
   *
   * Double-click still unsends, because that shortcut existed and people were
   * using it - but it is no longer the *only* way, which it was, and which is
   * why nobody found it.
   */
  const open = (x: number, y: number) => setMenu({ x, y });

  return (
    <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 7 }}>
      {/* Their face, once per run of messages. A column of the same avatar
          repeated eight times is noise; a gap that keeps the alignment is not. */}
      {!mine && (
        first
          ? (
            <button
              onClick={() => {
                const p = profiles[msg.author_id];
                const target = p?.handle || msg.author_id;
                if (target) router.push(`/profile/?u=${encodeURIComponent(target)}`);
              }}
              className="hov k-squish"
              title={`View ${who.label}'s profile`}
              style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <Avatar who={who} size={26} />
            </button>
          )
          : <span aria-hidden style={{ width: 26, flex: 'none' }} />
      )}

      <div
        onContextMenu={(e) => { e.preventDefault(); open(e.clientX, e.clientY); }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3, minWidth: 0, maxWidth: '82%' }}>
        {first && !mine && (
          <span
            onClick={() => {
              const p = profiles[msg.author_id];
              const target = p?.handle || msg.author_id;
              if (target) router.push(`/profile/?u=${encodeURIComponent(target)}`);
            }}
            className="hov"
            style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', paddingLeft: 4, cursor: 'pointer' }}
          >
            {who.label}
          </span>
        )}

        {msg.share_kind && msg.share_id && (
          <SharedPost kind={msg.share_kind} id={msg.share_id} profiles={profiles} me={me} />
        )}

        {msg.attach_path && (
          <AttachedFile path={msg.attach_path} name={msg.attach_name ?? 'File'}
            kind={msg.attach_kind ?? 'file'} size={msg.attach_size ?? 0} mine={mine} />
        )}

        {rpData ? (
          <RpBubbleContent
            rpData={rpData}
            msg={msg}
            me={me}
            whoName={who.label}
          />
        ) : editing ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 'min(320px, 74vw)' }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={2}
              aria-label="Edit your message"
              onKeyDown={(e) => {
                if (e.key === 'Escape') onEditCancel();
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave(draft); }
              }}
              style={{
                width: '100%', padding: '8px 11px', borderRadius: 12, resize: 'vertical',
                border: '1px solid var(--acc)', background: 'var(--card2)', color: 'var(--tx)',
                fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit',
              }} />
            <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={onEditCancel} className="hov"
                style={{ padding: '5px 11px', borderRadius: 9, fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
                Cancel
              </button>
              <button onClick={() => onEditSave(draft)} className="k-squish"
                style={{ padding: '5px 12px', borderRadius: 9, background: 'var(--acc)', color: 'var(--ink)', fontSize: 11, fontWeight: 800 }}>
                Save
              </button>
            </span>
          </span>
        ) : msg.body ? (
          <span onDoubleClick={() => mine && onRemove()}
            onPointerDown={(e) => {
              const t = window.setTimeout(() => open(e.clientX, e.clientY), 460);
              const stop = () => {
                clearTimeout(t);
                for (const ev of ['pointerup', 'pointermove', 'pointercancel']) window.removeEventListener(ev, stop);
              };
              for (const ev of ['pointerup', 'pointermove', 'pointercancel']) window.addEventListener(ev, stop);
            }}
            title={mine ? 'Double-click to remove, right-click or hold for more' : 'Right-click or hold to report'}
            style={{
              padding: '8px 12px', borderRadius: 14,
              borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
              background: mine ? 'var(--acc)' : 'var(--card2)',
              color: mine ? '#0A0912' : 'var(--tx)',
              fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              cursor: 'default', touchAction: 'manipulation',
            }}>
            {msg.body}
          </span>
        ) : null}

        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: 'var(--tx3)', padding: '0 4px' }}>
          {ago(msg.created_at)}
          {msg.edited_at && <span title={`Edited ${ago(msg.edited_at)}`}>· edited</span>}
        </span>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y} kind="message"
          label={msg.body ? msg.body.slice(0, 40) : 'Attachment'}
          accent={prefs.accent} dark={prefs.theme === 'dark'}
          onClose={() => setMenu(null)}
          items={mine
            ? [
              ...(msg.body ? [{ label: 'Edit', icon: 'edit' as const, run: onEditStart }] : []),
              { label: 'Copy text', icon: 'copy' as const, run: () => void navigator.clipboard?.writeText(msg.body) },
              { label: 'Remove for everyone', icon: 'trash' as const, danger: true, run: onRemove },
            ]
            : [
              { label: 'Copy text', icon: 'copy' as const, run: () => void navigator.clipboard?.writeText(msg.body) },
              { label: 'Report', icon: 'flag' as const, danger: true, run: onReport },
            ]} />
      )}
    </div>
  );
}

function RpBubbleContent({
  rpData,
  msg,
  me,
  whoName,
}: {
  rpData: NonNullable<ReturnType<typeof parseRpMessage>>;
  msg: Message;
  me: string;
  whoName: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const mine = msg.author_id === me;
  const [isPaid, setIsPaid] = useState<boolean>(
    rpData.type === 'ask_rp' || rpData.type === 'ask_money' ? rpData.isPaid : true
  );
  const [paying, setPaying] = useState<boolean>(false);

  const handlePayRpRequest = async () => {
    if (rpData.type !== 'ask_rp') return;
    setPaying(true);
    try {
      const ok = await sendRp({
        toUserId: msg.author_id,
        amount: rpData.amount,
        reason: rpData.note || 'RP invoice payment',
        conversationId: msg.conversation_id,
      });

      if (ok) {
        markRequestPaidLocally(rpData.reqId);
        setIsPaid(true);
        await qc.invalidateQueries({ queryKey: RANKED });
        toast(`💎 Paid ${rpData.amount.toLocaleString()} RP to ${whoName}!`);
      }
    } finally {
      setPaying(false);
    }
  };

  const handleMarkMoneyPaid = () => {
    if (rpData.type !== 'ask_money') return;
    markRequestPaidLocally(rpData.reqId);
    setIsPaid(true);
    toast(`💵 Marked request for $${rpData.amount.toFixed(2)} as settled!`);
  };

  // 1. Post Reference Card
  if (rpData.type === 'post_ref') {
    return (
      <div
        onClick={() => {
          router.push(`/community/#post-${rpData.postId}`);
        }}
        role="button"
        tabIndex={0}
        className="hov k-squish"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 250,
          maxWidth: '82%',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'var(--card2)',
          border: '1.5px solid var(--acc)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {rpData.imagePath && <SharedImage path={rpData.imagePath} />}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>🔗</span>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--accTx)' }}>
              Referenced Post
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', lineHeight: 1.4 }}>
            {rpData.title}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>
            Tap to view in Community ›
          </div>
        </div>
      </div>
    );
  }

  // 2. RP Send Card
  if (rpData.type === 'send_rp') {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #064E3B 0%, #022C22 100%)',
          border: '1.5px solid #10B981',
          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          color: '#F0FDF4',
          minWidth: 210,
          maxWidth: 320,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: '#34D399' }}>
            <span>💎</span>
            <span>{mine ? 'You Sent RP' : 'Received RP'}</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#6EE7B7', background: 'rgba(16,185,129,0.25)', padding: '2px 7px', borderRadius: 6 }}>
            Completed ✓
          </span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', fontFamily: 'monospace', margin: '2px 0' }}>
          {rpData.amount.toLocaleString()} RP
        </div>
        {rpData.note && (
          <div style={{ fontSize: 11.5, color: '#A7F3D0', fontStyle: 'italic', background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: 6 }}>
            "{rpData.note}"
          </div>
        )}
      </div>
    );
  }

  // 3. RP Ask / Invoice Card
  if (rpData.type === 'ask_rp') {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #2E1065 0%, #1E1B4B 100%)',
          border: '1.5px solid #8B5CF6',
          boxShadow: '0 4px 16px rgba(139, 92, 246, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          color: '#F5F3FF',
          minWidth: 220,
          maxWidth: 320,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: '#C084FC' }}>
            <span>💎</span>
            <span>{mine ? 'Your RP Request' : 'Payment Requested'}</span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: isPaid ? '#34D399' : '#FBBF24',
              background: isPaid ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
              padding: '2px 7px',
              borderRadius: 6,
            }}
          >
            {isPaid ? 'Paid ✓' : 'Pending ⏳'}
          </span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', fontFamily: 'monospace', margin: '2px 0' }}>
          {rpData.amount.toLocaleString()} RP
        </div>
        {rpData.note && (
          <div style={{ fontSize: 11.5, color: '#DDD6FE', fontStyle: 'italic', background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: 6 }}>
            "{rpData.note}"
          </div>
        )}
        {!mine && !isPaid && (
          <button
            type="button"
            disabled={paying}
            onClick={handlePayRpRequest}
            className="k-squish"
            style={{
              marginTop: 4,
              padding: '8px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: '1px solid #34D399',
              color: '#041F14',
              fontSize: 12.5,
              fontWeight: 900,
              cursor: paying ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)',
            }}
          >
            {paying ? 'Processing Transfer…' : `Pay ${rpData.amount.toLocaleString()} RP 💎`}
          </button>
        )}
      </div>
    );
  }

  // 4. Money Send Card ($)
  if (rpData.type === 'send_money') {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #064E3B 0%, #0F2E22 100%)',
          border: '1.5px solid #34D399',
          boxShadow: '0 4px 16px rgba(52, 211, 153, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          color: '#F0FDF4',
          minWidth: 210,
          maxWidth: 320,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: '#34D399' }}>
            <span>💵</span>
            <span>{mine ? 'You Sent Money' : 'Money Transfer Receipt'}</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#6EE7B7', background: 'rgba(16,185,129,0.25)', padding: '2px 7px', borderRadius: 6 }}>
            Sent ✓
          </span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', fontFamily: 'monospace', margin: '2px 0' }}>
          ${rpData.amount.toFixed(2)} <span style={{ fontSize: 13, color: '#A7F3D0' }}>USD</span>
        </div>
        {rpData.note && (
          <div style={{ fontSize: 11.5, color: '#A7F3D0', fontStyle: 'italic', background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: 6 }}>
            "{rpData.note}"
          </div>
        )}
      </div>
    );
  }

  // 5. Money Ask Card ($)
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, #451A03 0%, #291504 100%)',
        border: '1.5px solid #F59E0B',
        boxShadow: '0 4px 16px rgba(245, 158, 11, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        color: '#FFFBEB',
        minWidth: 220,
        maxWidth: 320,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: '#FCD34D' }}>
          <span>💵</span>
          <span>{mine ? 'Your Money Request' : 'Asking for Money'}</span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: isPaid ? '#34D399' : '#FBBF24',
            background: isPaid ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
            padding: '2px 7px',
            borderRadius: 6,
          }}
        >
          {isPaid ? 'Settled ✓' : 'Requested ⏳'}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', fontFamily: 'monospace', margin: '2px 0' }}>
        ${rpData.amount.toFixed(2)} <span style={{ fontSize: 13, color: '#FDE68A' }}>USD</span>
      </div>
      {rpData.note && (
        <div style={{ fontSize: 11.5, color: '#FEF3C7', fontStyle: 'italic', background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: 6 }}>
          "{rpData.note}"
        </div>
      )}
      {!mine && !isPaid && (
        <button
          type="button"
          onClick={handleMarkMoneyPaid}
          className="k-squish"
          style={{
            marginTop: 4,
            padding: '8px 14px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            border: '1px solid #FCD34D',
            color: '#1E1002',
            fontSize: 12.5,
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(245, 158, 11, 0.4)',
          }}
        >
          Mark as Paid / Settle ${rpData.amount.toFixed(2)} 💵
        </button>
      )}
    </div>
  );
}

/**
 * Reporting a message.
 *
 * A reason, from a fixed list, and room to say what happened. The list is an
 * enum in the database (0012) rather than free text, because a queue of
 * hand-typed categories cannot be sorted, counted or triaged.
 *
 * What this does *not* do is delete anything. The message stays where it is and
 * the row goes to a queue - a report that hid content on the strength of one
 * press would be a mute button pointed at whoever you disagreed with.
 */
function ReportSheet({
  msg, onClose, onSend,
}: { msg: Message; onClose: () => void; onSend: (reason: ReportReason, note: string) => void }) {
  const { phone } = useLayout();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [note, setNote] = useState('');
  useOverlayBack(true, onClose);

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Report this message"
        className="k-bloom"
        style={{
          width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)',
          padding: phone ? '16px 16px calc(20px + env(safe-area-inset-bottom))' : 18,
        }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 4 }}>Report this message</h2>
        <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.65, margin: '0 0 12px' }}>
          It stays visible for now. Reporting sends it to be looked at, and what happened to it is
          on record either way.
        </p>

        {msg.body && (
          <p style={{
            fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx2)', margin: '0 0 12px', padding: '8px 11px',
            borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--line)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {msg.body}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          {REPORT_REASONS.map((r) => (
            <button key={r.id} onClick={() => setReason(r.id)} role="radio" aria-checked={reason === r.id}
              className="hov"
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10,
                minHeight: 42, textAlign: 'left', fontSize: 12, fontWeight: 700,
                border: `1px solid ${reason === r.id ? 'var(--acc)' : 'var(--line2)'}`,
                background: reason === r.id ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'transparent',
                color: reason === r.id ? 'var(--tx)' : 'var(--tx2)',
              }}>
              <span aria-hidden style={{
                width: 15, height: 15, flex: 'none', borderRadius: '50%',
                border: `1.5px solid ${reason === r.id ? 'var(--acc)' : 'var(--line2)'}`,
                background: reason === r.id ? 'var(--acc)' : 'transparent',
              }} />
              {r.label}
            </button>
          ))}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600}
          placeholder="Anything that helps (optional)" aria-label="More detail"
          style={{
            width: '100%', padding: '9px 11px', borderRadius: 11, resize: 'vertical', marginBottom: 12,
            border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)',
            fontSize: 12, lineHeight: 1.6, fontFamily: 'inherit',
          }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="hov"
            style={{ flex: 1, minHeight: 42, borderRadius: 11, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
            Cancel
          </button>
          <button onClick={() => onSend(reason, note.trim())} className="k-squish"
            style={{ flex: 1, minHeight: 42, borderRadius: 11, background: 'var(--pal-coral)', color: '#fff', fontSize: 12.5, fontWeight: 800 }}>
            Send report
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
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
  const [zoom, setZoom] = useState(false);
  return (
    <span style={{ display: 'block', aspectRatio: '4 / 3', background: 'var(--card)' }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" onClick={(e) => { e.stopPropagation(); setZoom(true); }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
      )}
      {zoom && (
        <Lightbox items={[{ src: url, alt: 'Shared photo' }]} index={0}
          onClose={() => setZoom(false)} onIndex={() => {}} />
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

/**
 * A file somebody sent.
 *
 * A picture is the picture; anything else is a row you can open, because a
 * spreadsheet rendered as a grey rectangle tells you nothing its filename does
 * not. The object lives in `bd-feed`, which is the bucket whose read policy
 * lets the other people in the chat see it at all — see migration 0008.
 */
function AttachedFile({
  path, name, kind, size, mine,
}: { path: string; name: string; kind: string; size: number; mine: boolean }) {
  const url = useSignedUrl('bd-feed', path);
  const [zoom, setZoom] = useState(false);

  if (kind === 'image') {
    return (
      <>
        {/* Opens in Basedly, not in the browser. `target="_blank"` handed the
            picture to the browser's own viewer: a different background, no way
            back but the tab button, a download prompt on Android, and a signed
            storage URL left in history. */}
        <button onClick={() => setZoom(true)} title={name} aria-label={`Open ${name}`}
          style={{ display: 'block', maxWidth: '78%', borderRadius: 14, overflow: 'hidden', background: 'var(--card2)', cursor: 'zoom-in' }}>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover' }} />
          )}
        </button>
        {zoom && (
          <Lightbox items={[{ src: url, alt: name, caption: name }]} index={0}
            onClose={() => setZoom(false)} onIndex={() => {}} />
        )}
      </>
    );
  }

  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" download={name}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, maxWidth: '78%', padding: '9px 12px',
        borderRadius: 14, border: '1px solid var(--line2)',
        background: mine ? 'color-mix(in srgb, var(--acc) 14%, var(--card2))' : 'var(--card2)',
      }}>
      <span style={{
        width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center',
        background: 'var(--card)',
      }}>
        <Icon name={ICON_FOR[kind] ?? 'files'} size={15} color="var(--accTx)" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
          {sizeLabel(size)}{size ? ' · ' : ''}tap to open
        </span>
      </span>
      <Icon name="download" size={14} color="var(--tx3)" />
    </a>
  );
}

const ICON_FOR: Record<string, IconName> = {
  image: 'image', video: 'play', audio: 'play', pdf: 'files', doc: 'text',
  sheet: 'grid', slides: 'photo', archive: 'archive', file: 'files',
};

/**
 * Your Files, as a place to send from.
 *
 * The ask was to point at something already in the app rather than finding it
 * on the device a second time. It is copied on send rather than linked —
 * `lib/messages.ts` explains why that is the honest option and not the lazy one.
 */
function DrivePicker({ onClose, onPick }: { onClose: () => void; onPick: (f: DriveFile) => void }) {
  const { phone } = useLayout();
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [q, setQ] = useState('');
  useOverlayBack(true, onClose);

  useEffect(() => { void driveFiles().then(setFiles).catch(() => setFiles([])); }, []);

  const needle = q.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => !needle || f.name.toLowerCase().includes(needle));

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 97, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send from your Files"
        className="k-bloom"
        style={{
          width: 420, maxWidth: '100%', maxHeight: '78dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px 10px' }}>
          <Icon name="files" size={16} color="var(--accTx)" />
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Send from your Files</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div style={{ padding: '0 15px 10px' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your files"
            aria-label="Search your files"
            style={{
              width: '100%', minHeight: 38, padding: '9px 12px', borderRadius: 11,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
            }} />
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 9px 10px' }}>
          {files === null && (
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center', padding: 24 }}>Reading your files…</p>
          )}
          {files !== null && shown.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center', padding: 24, lineHeight: 1.7 }}>
              {q ? 'Nothing matching.' : 'Nothing in Files yet.'}
            </p>
          )}
          {shown.map((f) => (
            <button key={f.id} onClick={() => onPick(f)} className="hov"
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 10px',
                borderRadius: 11, textAlign: 'left', minHeight: 46,
              }}>
              <span style={{
                width: 30, height: 30, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center',
                background: 'var(--card2)',
              }}>
                <Icon name={ICON_FOR[f.kind || kindOfFile(f.name)] ?? 'files'} size={14} color="var(--accTx)" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>{sizeLabel(f.size_bytes)}</span>
              </span>
              <Icon name="send" size={13} color="var(--tx3)" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

const ATTACH_BTN: React.CSSProperties = {
  width: 34, height: 34, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer',
};
