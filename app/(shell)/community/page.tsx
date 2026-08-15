'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { Challenges } from '@/components/Challenges';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { useRealtime } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { ago } from '@/lib/scratch';
import { uploadTo, useSignedUrl } from '@/lib/uploads';
import { MediaFrame, Lightbox } from '@/components/MediaFrame';

/** Ported from Basedly.dc.html markup 759–869, card styles 5932–6000. */

type Post = { id: string; author_id: string; caption: string; tag: string; image_path: string | null; created_at: string };

/**
 * The post's picture, shown whole in a fixed 4:5 stage — Instagram's desktop
 * behaviour. The old version was a 150px band with object-fit: cover, which
 * cropped the top and bottom off anything portrait; a photo of a whiteboard or
 * a problem set lost exactly the part worth posting.
 */
function PostImage({ path, tint, alt, onOpen }: { path: string | null; tint: string; alt: string; onOpen?: () => void }) {
  const url = useSignedUrl('bd-feed', path);
  if (!path) return null;
  return (
    <div style={{ background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 22%, var(--card2)), var(--card2))` }}>
      <MediaFrame src={url ?? null} alt={alt} ratio={4 / 5} maxHeight={520} rounded={0} onOpen={onOpen} />
    </div>
  );
}
type Thread = { id: string; author_id: string; title: string; body: string; tag: string; created_at: string };
type Challenge = { id: string; name: string; habit_label: string; starts_on: string; ends_on: string; color: string };

const POSTS = ['posts'] as const;
const LIKES = ['post_likes'] as const;
const THREADS = ['threads'] as const;
const VOTES = ['thread_votes'] as const;
const CHALS = ['challenges'] as const;

const TABS = ['feed', 'threads', 'challenges'] as const;
type Tab = (typeof TABS)[number];

const initials = (id: string) => id.slice(0, 2).toUpperCase();
const hueOf = (id: string) => {
  const v = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Object.values(PAL)[v % 10];
};

const ADD_POST = defineMutation('comm.addPost', async (v: { caption: string; image_path: string | null }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_posts')
    .insert({ author_id, caption: v.caption, tag: 'Update', image_path: v.image_path });
  if (error) throw error;
});
const LIKE = defineMutation('comm.like', async (v: { postId: string; on: boolean }) => {
  const user_id = await currentUserId();
  const { error } = v.on
    ? await supabase.from('bd_post_likes').insert({ post_id: v.postId, user_id })
    : await supabase.from('bd_post_likes').delete().eq('post_id', v.postId).eq('user_id', user_id);
  if (error) throw error;
});
const SAVE_POST = defineMutation('comm.save', async (v: { postId: string; on: boolean }) => {
  const user_id = await currentUserId();
  const { error } = v.on
    ? await supabase.from('bd_post_saves').insert({ post_id: v.postId, user_id })
    : await supabase.from('bd_post_saves').delete().eq('post_id', v.postId).eq('user_id', user_id);
  if (error) throw error;
});
const VOTE = defineMutation('comm.vote', async (v: { threadId: string; on: boolean }) => {
  const user_id = await currentUserId();
  const { error } = v.on
    ? await supabase.from('bd_thread_votes').insert({ thread_id: v.threadId, user_id })
    : await supabase.from('bd_thread_votes').delete().eq('thread_id', v.threadId).eq('user_id', user_id);
  if (error) throw error;
});
const REPLY = defineMutation('comm.reply', async (v: { threadId: string; body: string }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_thread_replies').insert({ thread_id: v.threadId, author_id, body: v.body });
  if (error) throw error;
});

export default function CommunityPage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>('feed');
  const [viewing, setViewing] = useState<string | null>(null);
  const [me, setMe] = useState<string>('');

  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);

  const qc = useQueryClient();
  const settle = () => { for (const k of [POSTS, LIKES, THREADS, VOTES, CHALS]) void qc.invalidateQueries({ queryKey: k }); };

  const { data: posts = [] } = useQuery({
    queryKey: POSTS,
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await supabase.from('bd_posts')
        .select('id,author_id,caption,tag,image_path,created_at').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: likes = [] } = useQuery({
    queryKey: LIKES,
    queryFn: async () => {
      const { data, error } = await supabase.from('bd_post_likes').select('post_id,user_id');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: threads = [] } = useQuery({
    queryKey: THREADS,
    queryFn: async (): Promise<Thread[]> => {
      const { data, error } = await supabase.from('bd_threads')
        .select('id,author_id,title,body,tag,created_at').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: votes = [] } = useQuery({
    queryKey: VOTES,
    queryFn: async () => {
      const { data, error } = await supabase.from('bd_thread_votes').select('thread_id,user_id');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: challenges = [] } = useQuery({
    queryKey: CHALS,
    queryFn: async (): Promise<Challenge[]> => {
      const { data, error } = await supabase.from('bd_challenges').select('id,name,habit_label,starts_on,ends_on,color');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Community is the surface BACKEND.md puts on a socket.
  useRealtime('bd_posts', POSTS);
  useRealtime('bd_post_likes', LIKES);
  useRealtime('bd_threads', THREADS);
  useRealtime('bd_thread_votes', VOTES);

  const addPost = useMutation<unknown, Error, { caption: string; image_path: string | null }>({ mutationKey: ADD_POST, onSettled: settle });
  const [pending, setPending] = useState<{ path: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const attach = async (file: File) => {
    setUploading(true);
    try {
      setPending({ path: await uploadTo('bd-feed', file), name: file.name });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const post = () => {
    const cap = draft.trim();
    if (!cap && !pending) return;
    addPost.mutate({ caption: cap || pending!.name, image_path: pending?.path ?? null });
    setDraft('');
    setPending(null);
  };
  const savePost = useMutation<unknown, Error, { postId: string; on: boolean }>({ mutationKey: SAVE_POST, onSettled: settle });
  const reply = useMutation<unknown, Error, { threadId: string; body: string }>({ mutationKey: REPLY, onSettled: settle });

  const like = useMutation({
    mutationKey: LIKE,
    onMutate: (v: { postId: string; on: boolean }) => {
      const prev = queryClient.getQueryData<{ post_id: string; user_id: string }[]>(LIKES) ?? [];
      queryClient.setQueryData(LIKES, v.on
        ? [...prev, { post_id: v.postId, user_id: me }]
        : prev.filter((l) => !(l.post_id === v.postId && l.user_id === me)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(LIKES, ctx); },
    onSettled: settle,
  });
  const vote = useMutation({
    mutationKey: VOTE,
    onMutate: (v: { threadId: string; on: boolean }) => {
      const prev = queryClient.getQueryData<{ thread_id: string; user_id: string }[]>(VOTES) ?? [];
      queryClient.setQueryData(VOTES, v.on
        ? [...prev, { thread_id: v.threadId, user_id: me }]
        : prev.filter((l) => !(l.thread_id === v.threadId && l.user_id === me)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(VOTES, ctx); },
    onSettled: settle,
  });

  const [draft, setDraft] = useState('');

  return (
    <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em' }}>Community</div>
        <div style={{ position: 'relative', display: 'flex', padding: 3, borderRadius: 12, background: 'var(--card)' }}>
          <div style={{
            position: 'absolute', top: 3, bottom: 3, left: 3, width: 'calc((100% - 6px)/3)',
            borderRadius: 9, background: prefs.accent,
            transform: `translateX(${TABS.indexOf(tab) * 100}%)`,
            transition: 'transform .34s cubic-bezier(0.16,1,0.3,1)',
          }} />
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              position: 'relative', zIndex: 1, padding: '6px 17px', borderRadius: 9,
              fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
              color: tab === t ? '#0C0F16' : 'var(--tx2)', transition: 'color .24s',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'feed' && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', marginBottom: 14,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--sh)',
          }}>
            <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: PAL.indigo, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#0C0F16' }}>
              {initials(me || 'me')}
            </span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && post()}
              placeholder={pending ? `Attached ${pending.name}` : 'Share what you are working on'}
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--tx)' }} />

            <label title="Attach an image" className="hov"
              style={{
                flex: 'none', width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center',
                border: `1px solid ${pending ? 'var(--acc)' : 'var(--line2)'}`, cursor: 'pointer',
                opacity: uploading ? 0.5 : 1,
              }}>
              <Icon name="image" size={15} color={pending ? 'var(--accTx)' : 'var(--tx2)'} />
              <input type="file" accept="image/*" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ''; }} />
            </label>

            <button onClick={post} className="acc"
              style={{ flex: 'none', padding: '8px 16px', borderRadius: 10, background: 'var(--acc)', color: '#0A0912', fontSize: 11.5, fontWeight: 800 }}>
              {uploading ? '…' : 'Post'}
            </button>
          </div>

          {/* A fixed-width column, centred — Instagram's desktop feed. Letting
              cards stretch across a wide monitor made every photo enormous and
              the reading line uncomfortably long. */}
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'minmax(0, 468px)', justifyContent: 'center', gap: 18, alignContent: 'start' }}>
            {posts.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Nothing posted yet.</div>}
            {posts.map((p) => {
              const mine = likes.some((l) => l.post_id === p.id && l.user_id === me);
              const count = likes.filter((l) => l.post_id === p.id).length;
              const c = hueOf(p.author_id);
              return (
                <div key={p.id} className="tiltup" style={{
                  position: 'relative', borderRadius: 18, overflow: 'hidden',
                  background: 'var(--card)', boxShadow: 'var(--sh)', border: '1px solid var(--line)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px 11px' }}>
                    <span style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', background: c, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#0C0F16' }}>
                      {initials(p.author_id)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.author_id === me ? 'You' : initials(p.author_id)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)' }}>{ago(p.created_at)} ago</span>
                    </span>
                    {p.tag && (
                      <span style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 800, color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
                        {p.tag}
                      </span>
                    )}
                  </div>

                  <PostImage path={p.image_path} tint={c} alt={p.caption || 'Post image'} onOpen={() => setViewing(p.id)} />

                  <div style={{ padding: '12px 13px 13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 11 }}>
                      <LikeButton mine={mine} count={count} onToggle={() => like.mutate({ postId: p.id, on: !mine })} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>
                        <Icon name="chat" size={15} color="var(--tx2)" />0
                      </span>
                      <Icon name="share" size={15} color="var(--tx3)" />
                      <button onClick={() => savePost.mutate({ postId: p.id, on: true })} aria-label="Save" style={{ marginLeft: 'auto', flex: 'none' }}>
                        <Icon name="bookmark" size={15} color="var(--tx3)" />
                      </button>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 500, textWrap: 'pretty' }}>{p.caption}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'threads' && (
        <div>
          {threads.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No threads yet.</div>}
          {threads.map((t) => (
            <ThreadRow key={t.id} t={t} me={me}
              voted={votes.some((v) => v.thread_id === t.id && v.user_id === me)}
              count={votes.filter((v) => v.thread_id === t.id).length}
              onVote={(on) => vote.mutate({ threadId: t.id, on })}
              onReply={(b) => reply.mutate({ threadId: t.id, body: b })} />
          ))}
        </div>
      )}

      {tab === 'challenges' && <Challenges />}

      {/* Tapping a post opens it full-screen, still fitted rather than cropped,
          with arrow keys between the photos in the feed. */}
      {viewing && (
        <PostLightbox posts={posts} startId={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/**
 * Like with the particle burst. The heart pops and eight particles fly out on
 * the `burst` keyframe, which reads --px/--py per particle (ANNOTATIONS §Feed).
 */
function LikeButton({ mine, count, onToggle }: { mine: boolean; count: number; onToggle: () => void }) {
  const [burst, setBurst] = useState(0);

  const fire = () => {
    if (!mine) setBurst((n) => n + 1);
    onToggle();
  };

  return (
    <button onClick={fire} aria-label="Like"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: mine ? PAL.coral : 'var(--tx2)' }}>
      <span className={mine ? 'heartpop' : undefined} style={{ display: 'flex' }}>
        <Icon name="heart" size={15} color={mine ? PAL.coral : 'var(--tx2)'} />
      </span>
      {count}

      {burst > 0 && (
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

function ThreadRow({
  t, me, voted, count, onVote, onReply,
}: {
  t: Thread; me: string; voted: boolean; count: number;
  onVote: (on: boolean) => void; onReply: (body: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [replies, setReplies] = useState<{ id: string; author_id: string; body: string; created_at: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.from('bd_thread_replies').select('id,author_id,body,created_at')
      .eq('thread_id', t.id).is('deleted_at', null).order('created_at')
      .then(({ data }) => setReplies(data ?? []));
  }, [open, t.id]);

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '14px 15px', borderRadius: 16, background: 'var(--card)',
      boxShadow: 'var(--sh)', marginBottom: 11,
      border: `1px solid ${open ? 'color-mix(in srgb, var(--acc) 34%, transparent)' : 'var(--line)'}`,
    }}>
      <button onClick={() => onVote(!voted)} aria-label="Upvote"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 'none', width: 34 }}>
        <Icon name="up" size={15} color={voted ? 'var(--accTx)' : 'var(--tx3)'} />
        <span style={{ fontSize: 11.5, fontWeight: 800, color: voted ? 'var(--accTx)' : 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          {t.tag && <span style={{ padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 800, color: PAL.sky, background: `color-mix(in srgb, ${PAL.sky} 16%, transparent)` }}>{t.tag}</span>}
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)' }}>
            {t.author_id === me ? 'You' : initials(t.author_id)} · {ago(t.created_at)} ago
          </span>
        </div>
        <button onClick={() => setOpen((v) => !v)}
          style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.35, textWrap: 'pretty' }}>
          {t.title}
        </button>
        {t.body && <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', marginTop: 6, textWrap: 'pretty' }}>{t.body}</div>}
        <button onClick={() => setOpen((v) => !v)} className="hov"
          style={{ marginTop: 9, padding: '5px 11px', borderRadius: 8, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
          {open ? 'Hide replies' : 'Show replies'}
        </button>

        {open && (
          <div className="rise" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {replies.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', background: hueOf(r.author_id), display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#0C0F16' }}>
                  {initials(r.author_id)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 2 }}>
                    {r.author_id === me ? 'You' : initials(r.author_id)} · {ago(r.created_at)} ago
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, textWrap: 'pretty' }}>{r.body}</div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { onReply(draft.trim()); setDraft(''); toast('Reply posted'); } }}
                placeholder="Write a reply"
                style={{ flex: 1, minHeight: 36, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5 }} />
              <button onClick={() => { if (draft.trim()) { onReply(draft.trim()); setDraft(''); toast('Reply posted'); } }} className="acc"
                style={{ flex: 'none', padding: '0 15px', minHeight: 36, borderRadius: 10, background: 'var(--acc)', color: '#0A0912', fontSize: 12, fontWeight: 800 }}>
                Reply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Feed photos in a full-screen viewer, in feed order. */
function PostLightbox({ posts, startId, onClose }: { posts: Post[]; startId: string; onClose: () => void }) {
  const withImages = posts.filter((p) => p.image_path);
  const [i, setI] = useState(() => Math.max(0, withImages.findIndex((p) => p.id === startId)));
  return (
    <LightboxWithUrls posts={withImages} index={i} onIndex={setI} onClose={onClose} />
  );
}

/**
 * Storage paths need signing before they can be shown, and hooks cannot be
 * called in a loop — so each slide resolves its own URL and the viewer only
 * ever holds one at a time.
 */
function LightboxWithUrls({ posts, index, onIndex, onClose }: {
  posts: Post[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const current = posts[index];
  const url = useSignedUrl('bd-feed', current?.image_path ?? null);
  if (!current) return null;
  return (
    <Lightbox
      items={posts.map((p, n) => ({
        src: n === index ? (url ?? null) : null,
        alt: p.caption || 'Post image',
        caption: p.caption,
      }))}
      index={index}
      onIndex={onIndex}
      onClose={onClose}
    />
  );
}
