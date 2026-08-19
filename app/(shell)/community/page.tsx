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
import { RowActions } from '@/components/MoneyRows';
import { isBot, BOT_NAME } from '@/lib/bot';

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
/** A caption is a paragraph; a label is a handle. Trim it to one. */
const short = (t: string, n = 34) => (t.length > n ? t.slice(0, n).trimEnd() + '…' : t);
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
const ADD_THREAD = defineMutation('comm.addThread', async (v: { id: string; title: string; body: string; tag: string }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_threads').insert({ ...v, author_id });
  if (error) throw error;
});
const EDIT_THREAD = defineMutation('comm.editThread', async (v: { id: string; title: string; body: string }) => {
  const { error } = await supabase.from('bd_threads').update({ title: v.title, body: v.body }).eq('id', v.id);
  if (error) throw error;
});
// Posts and threads are soft-deleted, which is what makes Undo cheap: the row
// is still there, only its deleted_at is set.
const DEL_THREAD = defineMutation('comm.delThread', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_threads').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});
const EDIT_POST = defineMutation('comm.editPost', async (v: { id: string; caption: string }) => {
  const { error } = await supabase.from('bd_posts').update({ caption: v.caption }).eq('id', v.id);
  if (error) throw error;
});
const DEL_POST = defineMutation('comm.delPost', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_posts').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});
const RESTORE = defineMutation('comm.restore', async (v: { table: 'bd_posts' | 'bd_threads'; id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: v.table, p_id: v.id });
  if (error) throw error;
});

const REPLY = defineMutation('comm.reply', async (v: { threadId: string; body: string }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_thread_replies').insert({ thread_id: v.threadId, author_id, body: v.body });
  if (error) throw error;
});

/** Optimistically drop a row, then hand Undo the row it captured. */
function useSoftDelete<T extends { id: string }>(
  key: readonly unknown[],
  table: 'bd_posts' | 'bd_threads',
  delKey: readonly [string],
  settle: () => void,
) {
  const del = useMutation<unknown, Error, { id: string }, T[]>({
    mutationKey: delKey,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<T[]>(key) ?? [];
      queryClient.setQueryData<T[]>(key, prev.filter((r) => r.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(key, ctx); },
    onSettled: settle,
  });
  const restore = useMutation<unknown, Error, { table: 'bd_posts' | 'bd_threads'; id: string; row: T }>({
    mutationKey: RESTORE,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<T[]>(key) ?? [];
      if (!prev.some((r) => r.id === v.id)) queryClient.setQueryData<T[]>(key, [v.row, ...prev]);
    },
    onSettled: settle,
  });
  return (row: T, name: string) => {
    del.mutate({ id: row.id });
    toast(`Deleted “${name}”`, () => restore.mutate({ table, id: row.id, row }));
  };
}

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

  // One editor open at a time: `post:<id>` / `thread:<id>` / 'thread:new'.
  const [editing, setEditing] = useState<string | null>(null);
  const [nt, setNt] = useState({ title: '', body: '' });

  const removePost = useSoftDelete<Post>(POSTS, 'bd_posts', DEL_POST, settle);
  const removeThread = useSoftDelete<Thread>(THREADS, 'bd_threads', DEL_THREAD, settle);

  const patchRow = <T extends { id: string }>(key: readonly unknown[], id: string, p: Partial<T>) => {
    const prev = queryClient.getQueryData<T[]>(key) ?? [];
    queryClient.setQueryData<T[]>(key, prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  };

  const editPost = useMutation<unknown, Error, { id: string; caption: string }>({
    mutationKey: EDIT_POST,
    onMutate: (v) => patchRow<Post>(POSTS, v.id, { caption: v.caption }),
    onSettled: settle,
  });
  const addThread = useMutation<unknown, Error, { id: string; title: string; body: string; tag: string }>({
    mutationKey: ADD_THREAD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Thread[]>(THREADS) ?? [];
      queryClient.setQueryData<Thread[]>(THREADS, [
        { ...v, author_id: me, created_at: new Date().toISOString() }, ...prev,
      ]);
    },
    onSettled: settle,
  });
  const editThread = useMutation<unknown, Error, { id: string; title: string; body: string }>({
    mutationKey: EDIT_THREAD,
    onMutate: (v) => patchRow<Thread>(THREADS, v.id, { title: v.title, body: v.body }),
    onSettled: settle,
  });

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="sronly">Community</h1>
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
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.author_id === me ? 'You' : isBot(p.author_id) ? BOT_NAME : initials(p.author_id)}
                        {isBot(p.author_id) && <BotTag />}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)' }}>{ago(p.created_at)}</span>
                    </span>
                    {p.tag && (
                      <span style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 800, color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
                        {p.tag}
                      </span>
                    )}
                    {/* Your own post, and only yours: RLS would refuse anyone else's. */}
                    {p.author_id === me && (
                      <span style={{ marginLeft: p.tag ? 0 : 'auto', flex: 'none' }}>
                        <RowActions label={short(p.caption) || 'post'}
                          onEdit={() => setEditing(`post:${p.id}`)}
                          onDelete={() => removePost(p, short(p.caption) || 'post')} />
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
                      <button onClick={() => savePost.mutate({ postId: p.id, on: true })} aria-label="Save" className="tap" style={{ marginLeft: 'auto', flex: 'none' }}>
                        <Icon name="bookmark" size={15} color="var(--tx3)" />
                      </button>
                    </div>
                    {editing === `post:${p.id}` ? (
                      <EditText value={p.caption} placeholder="Caption"
                        onCancel={() => setEditing(null)}
                        onSave={(v) => { editPost.mutate({ id: p.id, caption: v }); setEditing(null); toast('Post updated'); }} />
                    ) : (
                      <div style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 500, textWrap: 'pretty' }}>{p.caption}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'threads' && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {editing === 'thread:new' ? (
            <div className="k-bloom" style={{ padding: '14px 15px', borderRadius: 16, background: 'var(--card)', boxShadow: 'var(--sh)', border: '1px solid var(--line2)', marginBottom: 12 }}>
              <input autoFocus value={nt.title} onChange={(e) => setNt((v) => ({ ...v, title: e.target.value }))}
                placeholder="What is your question?"
                style={{ width: '100%', minHeight: 40, padding: '9px 0', fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)' }} />
              <textarea value={nt.body} onChange={(e) => setNt((v) => ({ ...v, body: e.target.value }))}
                placeholder="Add detail (optional)" rows={3}
                style={{ width: '100%', padding: '8px 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', resize: 'vertical', background: 'transparent' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="acc k-squish" disabled={!nt.title.trim()}
                  onClick={() => {
                    addThread.mutate({ id: crypto.randomUUID(), title: nt.title.trim(), body: nt.body.trim(), tag: 'Ask' });
                    setNt({ title: '', body: '' });
                    setEditing(null);
                    toast('Thread posted');
                  }}
                  style={{ minHeight: 38, padding: '0 16px', borderRadius: 10, background: 'var(--acc)', color: '#0A0912', fontSize: 12, fontWeight: 800, opacity: nt.title.trim() ? 1 : 0.45 }}>
                  Post thread
                </button>
                <button onClick={() => { setEditing(null); setNt({ title: '', body: '' }); }} className="hov k-squish"
                  style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditing('thread:new')} className="hov k-squish"
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', minHeight: 46, padding: '10px 14px', borderRadius: 14, border: '1.5px dashed var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12 }}>
              <Icon name="plus" size={15} color="var(--tx3)" />Start a thread
            </button>
          )}

          {threads.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No threads yet.</div>}
          {threads.map((t) => (
            <ThreadRow key={t.id} t={t} me={me}
              voted={votes.some((v) => v.thread_id === t.id && v.user_id === me)}
              count={votes.filter((v) => v.thread_id === t.id).length}
              editing={editing === `thread:${t.id}`}
              onEdit={() => setEditing(`thread:${t.id}`)}
              onEditCancel={() => setEditing(null)}
              onEditSave={(title, body) => { editThread.mutate({ id: t.id, title, body }); setEditing(null); toast('Thread updated'); }}
              onDelete={() => removeThread(t, short(t.title))}
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
    <button onClick={fire} className="tap" aria-label="Like"
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
  t, me, voted, count, editing, onEdit, onEditCancel, onEditSave, onDelete, onVote, onReply,
}: {
  t: Thread; me: string; voted: boolean; count: number; editing: boolean;
  onEdit: () => void; onEditCancel: () => void; onEditSave: (title: string, body: string) => void;
  onDelete: () => void; onVote: (on: boolean) => void; onReply: (body: string) => void;
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
            {t.author_id === me ? 'You' : isBot(t.author_id) ? BOT_NAME : initials(t.author_id)} · {ago(t.created_at)}
          </span>
          {/* A machine-written post that reads as a person's is a small
              deception, and one that repeats every two hours is not small. */}
          {isBot(t.author_id) && <BotTag />}
          {t.author_id === me && !editing && (
            <span style={{ marginLeft: 'auto' }}>
              <RowActions label={short(t.title)} onEdit={onEdit} onDelete={onDelete} />
            </span>
          )}
        </div>
        {editing ? (
          <ThreadEdit title={t.title} body={t.body} onCancel={onEditCancel} onSave={onEditSave} />
        ) : (
          <>
            <button onClick={() => setOpen((v) => !v)}
              style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.35, textWrap: 'pretty' }}>
              {t.title}
            </button>
            {t.body && <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', marginTop: 6, textWrap: 'pretty' }}>{t.body}</div>}
          </>
        )}
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
                    {r.author_id === me ? 'You' : initials(r.author_id)} · {ago(r.created_at)}
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

/** One line of text, edited in place. Used for a post's caption. */
function EditText({ value, placeholder, onSave, onCancel }: {
  value: string; placeholder: string; onSave: (v: string) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()); if (e.key === 'Escape') onCancel(); }}
        style={{ flex: 1, minWidth: 0, minHeight: 36, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5 }} />
      <button onClick={() => v.trim() && onSave(v.trim())} className="acc k-squish"
        style={{ flex: 'none', minHeight: 36, padding: '0 13px', borderRadius: 9, background: 'var(--acc)', color: '#0A0912', fontSize: 11.5, fontWeight: 800 }}>Save</button>
      <button onClick={onCancel} className="hov k-squish"
        style={{ flex: 'none', minHeight: 36, padding: '0 11px', borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>Cancel</button>
    </div>
  );
}

/** Title and body together, so a thread edit is one save rather than two. */
function ThreadEdit({ title, body, onSave, onCancel }: {
  title: string; body: string; onSave: (title: string, body: string) => void; onCancel: () => void;
}) {
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  return (
    <div className="k-bloom">
      <input autoFocus value={t} onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        style={{ width: '100%', minHeight: 38, padding: '7px 0', fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)', borderBottom: '1px solid var(--line2)' }} />
      <textarea value={b} onChange={(e) => setB(e.target.value)} rows={3} placeholder="Add detail (optional)"
        style={{ width: '100%', padding: '8px 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', resize: 'vertical', background: 'transparent' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => t.trim() && onSave(t.trim(), b.trim())} className="acc k-squish"
          style={{ minHeight: 36, padding: '0 14px', borderRadius: 9, background: 'var(--acc)', color: '#0A0912', fontSize: 11.5, fontWeight: 800 }}>Save</button>
        <button onClick={onCancel} className="hov k-squish"
          style={{ minHeight: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>Cancel</button>
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
