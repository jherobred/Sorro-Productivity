'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TabRail } from '@/components/TabRail';
import { Composer } from '@/components/Composer';
import { Challenges } from '@/components/Challenges';
import { MediaFrame } from '@/components/MediaFrame';
import { PostView } from '@/components/PostView';
import { ShareSheet } from '@/components/ShareSheet';
import { Messages } from '@/components/Messages';
import { RowActions } from '@/components/MoneyRows';
import { currentUserId } from '@/lib/supabase';
import { useRealtime } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { ago } from '@/lib/scratch';
import { useSignedUrl } from '@/lib/uploads';
import { useProfiles, displayOf } from '@/lib/people';
import {
  useFeed, useLikes, useVotes, useCommentCounts, useComments, useCommunityActions,
  key, POSTS, THREADS, LIKES, VOTES, type Filter, type Item, type Sort,
} from '@/lib/community';

/**
 * Community: one stream.
 *
 * Photos and discussions used to live on separate tabs, which meant deciding
 * which half of the room to walk into before you had said anything. They are
 * the same room. A card is a photo with a caption or a title with a body, it
 * has one reaction, one comment thread, and it sits in one list you sort by
 * new or by top — Reddit's controls around Instagram's cards, which is what
 * both apps have been converging on for years.
 *
 * Three smaller things this fixes, all of them the sort you notice daily:
 * posts no longer tilt as they arrive (a card that moves while you are trying
 * to read it is an animation for the developer, not the reader); a picture
 * posted without a caption stays without one, instead of being labelled
 * `IMG_20260812.jpg`; and everybody has a name, because `bd_profiles` is
 * readable and an author called "A4" is the app admitting it never looked.
 */

const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'top', label: 'Top' },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'photo', label: 'Photos' },
  { id: 'discussion', label: 'Discussions' },
];

export default function CommunityPage() {
  const { phone } = useLayout();
  const [tab, setTab] = useState<'feed' | 'messages' | 'challenges'>('feed');
  const [me, setMe] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [filter, setFilter] = useState<Filter>('all');
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Item | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);

  const { data: profiles = {} } = useProfiles();
  const { data: likes = [] } = useLikes();
  const { data: votes = [] } = useVotes();
  const { data: counts = {} } = useCommentCounts();
  const A = useCommunityActions(me);

  useRealtime('bd_posts', POSTS);
  useRealtime('bd_post_likes', LIKES);
  useRealtime('bd_threads', THREADS);
  useRealtime('bd_thread_votes', VOTES);

  /** Reactions per item, in the one shape the sort and the cards both want. */
  const reactions = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of likes) out[`photo:${l.post_id}`] = (out[`photo:${l.post_id}`] ?? 0) + 1;
    for (const v of votes) out[`discussion:${v.thread_id}`] = (out[`discussion:${v.thread_id}`] ?? 0) + 1;
    return out;
  }, [likes, votes]);

  const mine = useMemo(() => {
    const out = new Set<string>();
    for (const l of likes) if (l.user_id === me) out.add(`photo:${l.post_id}`);
    for (const v of votes) if (v.user_id === me) out.add(`discussion:${v.thread_id}`);
    return out;
  }, [likes, votes, me]);

  const items = useFeed(sort, filter, reactions);
  // The arrows in the opened post step through the pictures, the way a gallery
  // does; a discussion opens on its own.
  const photos = items.filter((i) => i.image_path);
  const open_ = viewing ? items.find((i) => key(i) === viewing) ?? null : null;

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="sronly">Community</h1>
        <TabRail
          tabs={[
            { id: 'feed', label: 'Feed', icon: 'chat' },
            { id: 'messages', label: 'Messages', icon: 'send' },
            { id: 'challenges', label: 'Challenges', icon: 'trophy' },
          ]}
          value={tab} onChange={setTab} phone={phone} label="Community sections" />
      </div>

      {tab === 'feed' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'minmax(0, 560px)', justifyContent: 'center', gap: 14 }}>
          {/* Start a post. A button, not a text field: the field was one line
              with a paperclip, which is not where anyone wants to write. */}
          <button onClick={() => setComposing(true)} className="hov k-squish" style={{
            display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', textAlign: 'left',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--sh)',
          }}>
            <Avatar id={me} profiles={profiles} me={me} size={34} />
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--tx3)' }}>
              Ask something, or show what you are working on
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <span style={CHIP}><Icon name="image" size={14} color="var(--tx2)" /></span>
              <span style={CHIP}><Icon name="chat" size={14} color="var(--tx2)" /></span>
            </span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {SORTS.map((s) => (
              <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}
                icon={s.id === 'top' ? 'flame' : 'spark'}>{s.label}</Chip>
            ))}
            <span style={{ width: 1, height: 20, background: 'var(--line2)', margin: '0 4px' }} />
            {FILTERS.map((f) => (
              <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>
            ))}
          </div>

          {items.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.8 }}>
              Nothing here yet.<br />
              <span style={{ fontSize: 11 }}>Post a photo of what you are working on, or ask the room something.</span>
            </div>
          )}

          {items.map((item) => (
            <FeedCard
              key={key(item)} item={item} me={me} profiles={profiles}
              reactions={reactions[key(item)] ?? 0}
              reacted={mine.has(key(item))}
              comments={counts[key(item)] ?? 0}
              editing={editing === key(item)}
              open={open === key(item)}
              onToggleComments={() => setOpen(open === key(item) ? null : key(item))}
              onReact={(on) => A.react.mutate({ kind: item.kind, id: item.id, on })}
              onComment={(body) => { A.comment.mutate({ kind: item.kind, id: item.id, body }); toast('Posted'); }}
              onEdit={() => setEditing(key(item))}
              onEditCancel={() => setEditing(null)}
              onEditSave={(title, body) => { A.edit.mutate({ kind: item.kind, id: item.id, title, body }); setEditing(null); toast('Updated'); }}
              onDelete={() => A.remove(item)}
              onOpen={() => setViewing(key(item))}
              onShare={() => setSharing(item)} />
          ))}
        </div>
      )}

      {tab === 'messages' && <Messages me={me} />}

      {tab === 'challenges' && <Challenges />}

      {composing && (
        <Composer
          onClose={() => setComposing(false)}
          onPhoto={(v) => { A.addPost.mutate({ id: crypto.randomUUID(), ...v }); toast('Posted'); }}
          onDiscussion={(v) => { A.addThread.mutate({ id: crypto.randomUUID(), ...v }); toast('Posted'); }} />
      )}

      {open_ && (
        <PostView
          item={open_} items={photos} me={me} profiles={profiles}
          reactions={reactions[key(open_)] ?? 0}
          reacted={mine.has(key(open_))}
          comments={counts[key(open_)] ?? 0}
          onIndex={(id) => { const n = photos.find((p) => p.id === id); if (n) setViewing(key(n)); }}
          onReact={(on) => A.react.mutate({ kind: open_.kind, id: open_.id, on })}
          onComment={(body) => { A.comment.mutate({ kind: open_.kind, id: open_.id, body }); toast('Posted'); }}
          onShare={() => setSharing(open_)}
          onClose={() => setViewing(null)} />
      )}

      {sharing && <ShareSheet item={sharing} me={me} onClose={() => setSharing(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------- card */

function FeedCard({
  item, me, profiles, reactions, reacted, comments, editing, open,
  onToggleComments, onReact, onComment, onEdit, onEditCancel, onEditSave, onDelete, onOpen, onShare,
}: {
  item: Item;
  me: string;
  profiles: Record<string, import('@/lib/people').Person>;
  reactions: number;
  reacted: boolean;
  comments: number;
  editing: boolean;
  open: boolean;
  onToggleComments: () => void;
  onReact: (on: boolean) => void;
  onComment: (body: string) => void;
  onEdit: () => void;
  onEditCancel: () => void;
  onEditSave: (title: string, body: string) => void;
  onDelete: () => void;
  /** Opens the post on its own, picture beside the conversation. */
  onOpen: () => void;
  onShare: () => void;
}) {
  const who = displayOf(profiles, item.author_id, me);
  const isMine = item.author_id === me;

  return (
    <article style={{
      position: 'relative', borderRadius: 18, overflow: 'hidden',
      background: 'var(--card)', boxShadow: 'var(--sh)', border: '1px solid var(--line)',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px 10px' }}>
        <Avatar id={item.author_id} profiles={profiles} me={me} size={32} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {who.label}
            </span>
            {who.bot && <BotTag />}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)' }}>
            {who.sub ? `${who.sub} · ` : ''}{ago(item.created_at)}
          </span>
        </div>

        {item.tag && (
          <span style={{
            marginLeft: 'auto', flex: 'none', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 800,
            color: who.hue, background: `color-mix(in srgb, ${who.hue} 16%, transparent)`,
          }}>
            {item.tag}
          </span>
        )}

        {/* Your own post, and only yours: RLS would refuse anyone else's. */}
        {isMine && (
          <span style={{ marginLeft: item.tag ? 0 : 'auto', flex: 'none' }}>
            <RowActions label={(item.title || item.body || 'post').slice(0, 30)} onEdit={onEdit} onDelete={onDelete} />
          </span>
        )}
      </header>

      {editing ? (
        <div style={{ padding: '0 13px 13px' }}>
          <ItemEdit item={item} onCancel={onEditCancel} onSave={onEditSave} />
        </div>
      ) : (
        <>
          {item.title && (
            <h2 onClick={onOpen} style={{
              padding: '0 13px 8px', fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em',
              lineHeight: 1.35, textWrap: 'pretty', cursor: 'pointer',
            }}>
              {item.title}
            </h2>
          )}

          {item.image_path && <PostImage path={item.image_path} tint={who.hue} alt={item.body || 'Post image'} onOpen={onOpen} />}

          {item.body && (
            <div style={{ padding: '11px 13px 0', fontSize: 12.5, lineHeight: 1.6, fontWeight: 500, textWrap: 'pretty' }}>
              {item.body}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 13px 12px' }}>
        <ReactButton kind={item.kind} mine={reacted} count={reactions} onToggle={() => onReact(!reacted)} />
        <button onClick={onToggleComments} className="tap" aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: open ? 'var(--accTx)' : 'var(--tx2)' }}>
          <Icon name="chat" size={15} color={open ? 'var(--accTx)' : 'var(--tx2)'} />{comments}
        </button>
        <button onClick={onShare} className="tap" aria-label="Share this post">
          <Icon name="send" size={15} color="var(--tx3)" />
        </button>
        <button onClick={onOpen} className="tap" aria-label="Open this post"
          style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--tx3)' }}>
          Open
        </button>
      </div>

      {open && (
        <CommentPanel item={item} me={me} profiles={profiles} onComment={onComment} />
      )}
    </article>
  );
}

/* --------------------------------------------------------------- comments */

function CommentPanel({
  item, me, profiles, onComment,
}: {
  item: Item; me: string; profiles: Record<string, import('@/lib/people').Person>; onComment: (b: string) => void;
}) {
  const { data: comments = [], isLoading } = useComments(item.kind, item.id, true);
  const [draft, setDraft] = useState('');

  const send = () => {
    const v = draft.trim();
    if (!v) return;
    onComment(v);
    setDraft('');
  };

  return (
    <div className="rise" style={{
      padding: '12px 13px 13px', borderTop: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', gap: 11,
    }}>
      {isLoading && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Loading…</div>}
      {!isLoading && comments.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No replies yet. Be the one.</div>
      )}

      {comments.map((c) => {
        const who = displayOf(profiles, c.author_id, me);
        return (
          <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Avatar id={c.author_id} profiles={profiles} me={me} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 2 }}>
                {who.label} · {ago(c.created_at)}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, textWrap: 'pretty' }}>{c.body}</div>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Write a reply" aria-label="Write a reply"
          style={{
            flex: 1, minHeight: 36, padding: '9px 12px', borderRadius: 10,
            border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
          }} />
        <button onClick={send} className="acc k-squish" disabled={!draft.trim()}
          style={{
            flex: 'none', padding: '0 15px', minHeight: 36, borderRadius: 10,
            background: 'var(--acc)', color: '#0A0912', fontSize: 12, fontWeight: 800,
            opacity: draft.trim() ? 1 : 0.45,
          }}>
          Reply
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function Avatar({
  id, profiles, me, size,
}: { id: string; profiles: Record<string, import('@/lib/people').Person>; me: string; size: number }) {
  const who = displayOf(profiles, id, me);
  if (who.photo) {
    return <img src={who.photo} alt="" style={{ width: size, height: size, flex: 'none', borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', background: who.hue,
      display: 'grid', placeItems: 'center', fontSize: size * 0.34, fontWeight: 700, color: '#0C0F16',
    }}>
      {who.initials}
    </span>
  );
}

/**
 * A photo, shown whole in a fixed 4:5 stage — Instagram's desktop behaviour.
 * `object-fit: cover` looks tidier on a grid of holiday snaps and silently eats
 * the top and bottom of a photographed whiteboard, which is most of what gets
 * posted here.
 */
function PostImage({ path, tint, alt, onOpen }: { path: string | null; tint: string; alt: string; onOpen: () => void }) {
  const url = useSignedUrl('bd-feed', path);
  if (!path) return null;
  return (
    <div style={{ background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 22%, var(--card2)), var(--card2))` }}>
      <MediaFrame src={url ?? null} alt={alt} ratio={4 / 5} maxHeight={520} rounded={0} onOpen={onOpen} />
    </div>
  );
}

/**
 * One gesture for both kinds. A photo is liked and a discussion is upvoted —
 * the same act with different iconography, so the card does not need two
 * different buttons and the reader does not need to learn two.
 */
function ReactButton({ kind, mine, count, onToggle }: { kind: Item['kind']; mine: boolean; count: number; onToggle: () => void }) {
  const [burst, setBurst] = useState(0);
  const photo = kind === 'photo';
  const colour = mine ? (photo ? PAL.coral : 'var(--accTx)') : 'var(--tx2)';

  return (
    <button onClick={() => { if (!mine) setBurst((n) => n + 1); onToggle(); }} className="tap"
      aria-pressed={mine} aria-label={photo ? 'Like' : 'Upvote'}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: colour }}>
      <span className={mine ? 'heartpop' : undefined} style={{ display: 'flex' }}>
        <Icon name={photo ? 'heart' : 'up'} size={15} color={colour} />
      </span>
      {count}

      {burst > 0 && photo && (
        <span key={burst} aria-hidden style={{ position: 'absolute', left: 7, top: 8, width: 0, height: 0, pointerEvents: 'none' }}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <span key={i} className="burst" style={{
                position: 'absolute', width: 5, height: 5, borderRadius: '50%',
                background: i % 2 ? PAL.coral : PAL.pink,
                ['--px' as string]: `${Math.round(Math.cos(a) * 26)}px`,
                ['--py' as string]: `${Math.round(Math.sin(a) * 26)}px`,
              }} />
            );
          })}
        </span>
      )}
    </button>
  );
}

function Chip({
  on, onClick, icon, children,
}: { on: boolean; onClick: () => void; icon?: 'flame' | 'spark'; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="k-chip" style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 999, minHeight: 32,
      fontSize: 11.5, fontWeight: 700,
      border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
      background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
      color: on ? 'var(--accTx)' : 'var(--tx2)',
    }}>
      {icon && <Icon name={icon} size={12} color={on ? 'var(--accTx)' : 'var(--tx3)'} />}
      {children}
    </button>
  );
}

/** Says what wrote this. Small, permanent, and never optional. */
function BotTag() {
  return (
    <span style={{
      flex: 'none', padding: '2px 7px', borderRadius: 6, fontSize: 9,
      fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
      color: 'var(--tx3)', border: '1px solid var(--line2)',
    }}>
      Bot
    </span>
  );
}

/** Title and body together, so one edit is one save. */
function ItemEdit({ item, onSave, onCancel }: { item: Item; onSave: (t: string, b: string) => void; onCancel: () => void }) {
  const [t, setT] = useState(item.title);
  const [b, setB] = useState(item.body);
  const ok = item.kind === 'photo' ? true : !!t.trim();

  return (
    <div className="k-bloom">
      {item.kind === 'discussion' && (
        <input autoFocus value={t} onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} aria-label="Title"
          style={{ width: '100%', minHeight: 38, padding: '7px 0', fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)', borderBottom: '1px solid var(--line2)' }} />
      )}
      <textarea autoFocus={item.kind === 'photo'} value={b} onChange={(e) => setB(e.target.value)} rows={3}
        placeholder={item.kind === 'photo' ? 'Caption' : 'Detail'} aria-label="Body"
        style={{ width: '100%', padding: '8px 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', resize: 'vertical', background: 'transparent' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => ok && onSave(t.trim(), b.trim())} className="acc k-squish"
          style={{ minHeight: 36, padding: '0 14px', borderRadius: 9, background: 'var(--acc)', color: '#0A0912', fontSize: 11.5, fontWeight: 800, opacity: ok ? 1 : 0.45 }}>
          Save
        </button>
        <button onClick={onCancel} className="hov k-squish"
          style={{ minHeight: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const CHIP: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line2)',
  display: 'grid', placeItems: 'center',
};
