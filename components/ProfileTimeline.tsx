'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Icon } from './Icon';
import { FacebookReactionButton, type ReactionType } from './FacebookReactions';
import { PostView } from './PostView';
import { ShareSheet } from './ShareSheet';
import { RowActions } from './MoneyRows';
import { useSignedUrls, useSignedUrl } from '@/lib/uploads';
import { ago } from '@/lib/scratch';
import { PAL } from '@/lib/pal';
import { toast } from '@/lib/toast';
import { useChallenges, useMembers } from '@/lib/challenges';
import { useLikes, useVotes, useCommentCounts, useComments, useCommunityActions, type Item } from '@/lib/community';
import { useReposts } from '@/lib/reposts';
import { useProfiles, displayOf } from '@/lib/people';
import { metricDef } from '@/lib/metrics';

type PostActivity = {
  id: string;
  kind: 'photo' | 'discussion';
  title: string;
  body: string;
  tag: string;
  image_path: string | null;
  images?: string[];
  created_at: string;
  archived?: boolean;
};

export function ProfileTimeline({
  userId,
  currentUserId,
  phone = false,
}: {
  userId: string;
  currentUserId?: string;
  phone?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'grid' | 'feed' | 'reposts' | 'discussions' | 'challenges'>('grid');
  const [viewing, setViewing] = useState<Item | null>(null);
  const [sharing, setSharing] = useState<Item | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const me = currentUserId || userId;
  const isMe = me === userId;

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ['profile_posts', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PostActivity[]> => {
      const [pRes, tRes] = await Promise.all([
        supabase
          .from('bd_posts')
          .select('id,title,caption,tag,image_path,created_at')
          .eq('author_id', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('bd_threads')
          .select('id,title,body,tag,created_at')
          .eq('author_id', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      const items: PostActivity[] = [
        ...(pRes.data ?? []).map((p) => ({
          id: p.id,
          kind: 'photo' as const,
          title: p.title ?? '',
          body: p.caption ?? '',
          tag: p.tag ?? '',
          image_path: p.image_path ?? null,
          images: p.image_path ? [p.image_path] : [],
          created_at: p.created_at,
        })),
        ...(tRes.data ?? []).map((t) => ({
          id: t.id,
          kind: 'discussion' as const,
          title: t.title ?? '',
          body: t.body ?? '',
          tag: t.tag ?? '',
          image_path: null,
          images: [],
          created_at: t.created_at,
        })),
      ];

      return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const { data: profiles = {} } = useProfiles();
  const { data: challenges = [] } = useChallenges();
  const { data: members = [] } = useMembers();
  const { data: likes = [] } = useLikes();
  const { data: votes = [] } = useVotes();
  const { data: counts = {} } = useCommentCounts();
  const reposts = useReposts();
  const A = useCommunityActions(me);

  const reactions = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of likes) out[`photo:${l.post_id}`] = (out[`photo:${l.post_id}`] ?? 0) + 1;
    for (const v of votes) out[`discussion:${v.thread_id}`] = (out[`discussion:${v.thread_id}`] ?? 0) + 1;
    return out;
  }, [likes, votes]);

  const myReactions = useMemo(() => {
    const out = new Set<string>();
    for (const l of likes) if (l.user_id === me) out.add(`photo:${l.post_id}`);
    for (const v of votes) if (v.user_id === me) out.add(`discussion:${v.thread_id}`);
    return out;
  }, [likes, votes, me]);

  const userChallenges = useMemo(() => {
    const userMemberEntries = members.filter((m) => m.user_id === userId);
    return userMemberEntries.map((m) => {
      const chal = challenges.find((c) => c.id === m.challenge_id);
      return { member: m, challenge: chal };
    }).filter((x): x is { member: import('@/lib/challenges').Member; challenge: import('@/lib/challenges').Challenge } => !!x.challenge);
  }, [members, challenges, userId]);

  const userReposts = useMemo(() => {
    return reposts.filter((r) => r.userId === userId);
  }, [reposts, userId]);

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => !archivedIds.has(p.id));
  }, [posts, archivedIds]);

  const toItem = (p: PostActivity): Item => ({
    id: p.id,
    kind: p.kind,
    author_id: userId,
    title: p.title,
    body: p.body,
    tag: p.tag,
    image_path: p.image_path,
    images: p.images || (p.image_path ? [p.image_path] : []),
    created_at: p.created_at,
  });

  const photoItems = visiblePosts.map(toItem);

  const handleArchive = (id: string) => {
    setArchivedIds((s) => new Set([...s, id]));
    toast('Post archived', () => {
      setArchivedIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    });
  };

  return (
    <div style={{ marginTop: 24 }}>
      {/* Instagram Style Sub-Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: phone ? 8 : 28,
          borderTop: '1px solid var(--line2)',
          borderBottom: '1px solid var(--line2)',
          padding: '4px 0',
          marginBottom: 16,
        }}
      >
        {[
          { id: 'grid', label: 'POSTS', icon: 'grid' as const },
          { id: 'feed', label: 'STREAM', icon: 'chat' as const },
          { id: 'reposts', label: `REPOSTS (${userReposts.length})`, icon: 'refresh' as const },
          { id: 'discussions', label: 'DISCUSSIONS', icon: 'edit' as const },
          { id: 'challenges', label: 'CHALLENGES', icon: 'trophy' as const },
        ].map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className="hov k-squish"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 8px',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '.08em',
                color: on ? 'var(--accTx)' : 'var(--tx3)',
                borderBottom: on ? '2px solid var(--acc)' : '2px solid transparent',
                background: 'transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              <Icon name={t.icon} size={14} color={on ? 'var(--accTx)' : 'var(--tx3)'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {loadingPosts && (
        <div style={{ padding: '36px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--tx3)' }}>
          Loading profile activity…
        </div>
      )}

      {/* 1. Instagram 3-Column Square Grid Tab */}
      {!loadingPosts && tab === 'grid' && (
        <>
          {visiblePosts.length === 0 ? (
            <EmptyProfile
              icon="grid"
              title="No posts yet"
              desc="When you share photos or updates to the community, they will appear here."
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: phone ? 4 : 12,
              }}
            >
              {visiblePosts.map((p) => {
                const item = toItem(p);
                const itemKey = `${p.kind}:${p.id}`;
                const countR = reactions[itemKey] ?? 0;
                const countC = counts[itemKey] ?? 0;

                return (
                  <InstagramGridCell
                    key={p.id}
                    post={p}
                    reactions={countR}
                    comments={countC}
                    onClick={() => setViewing(item)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 2. Full Feed / Stream Tab with Edit / Delete / Archive / Comment */}
      {!loadingPosts && tab === 'feed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visiblePosts.length === 0 ? (
            <EmptyProfile
              icon="chat"
              title="No stream activity"
              desc="Share what you are working on to start your profile stream."
            />
          ) : (
            visiblePosts.map((p) => {
              const item = toItem(p);
              const itemKey = `${p.kind}:${p.id}`;
              const countR = reactions[itemKey] ?? 0;
              const reacted = myReactions.has(itemKey);
              const countC = counts[itemKey] ?? 0;
              const isEditing = editing === p.id;
              const isCommentsOpen = openComments === p.id;

              return (
                <article
                  key={p.id}
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    boxShadow: 'var(--sh)',
                  }}
                >
                  <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
                        {p.kind === 'photo' ? 'Photo Post' : 'Discussion'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 6 }}>· {ago(p.created_at)}</span>
                    </div>

                    {p.tag && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 9.5,
                          fontWeight: 800,
                          background: 'color-mix(in srgb, var(--acc) 16%, transparent)',
                          color: 'var(--accTx)',
                        }}
                      >
                        {p.tag}
                      </span>
                    )}

                    {isMe && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => handleArchive(p.id)}
                          className="hov k-squish"
                          title="Archive post"
                          style={{ width: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center' }}
                        >
                          <Icon name="archive" size={13} color="var(--tx3)" />
                        </button>
                        <RowActions
                          label={p.title || p.body || 'Post'}
                          onEdit={() => setEditing(isEditing ? null : p.id)}
                          onDelete={() => A.remove(item)}
                        />
                      </div>
                    )}
                  </header>

                  {isEditing ? (
                    <ProfileItemEdit
                      item={item}
                      onCancel={() => setEditing(null)}
                      onSave={(title, body) => {
                        A.edit.mutate({ kind: item.kind, id: item.id, title, body });
                        setEditing(null);
                        toast('Post updated');
                      }}
                    />
                  ) : (
                    <>
                      {p.title && (
                        <h3
                          onClick={() => setViewing(item)}
                          style={{
                            padding: '0 14px 6px',
                            fontSize: 14.5,
                            fontWeight: 800,
                            letterSpacing: '-.015em',
                            margin: 0,
                            cursor: 'pointer',
                            color: 'var(--tx)',
                          }}
                        >
                          {p.title}
                        </h3>
                      )}

                      {p.image_path && (
                        <TimelineImage path={p.image_path} alt={p.title || p.body || 'Post image'} onClick={() => setViewing(item)} />
                      )}

                      {p.body && (
                        <p style={{ padding: '8px 14px 0', fontSize: 12.5, lineHeight: 1.6, margin: 0, color: 'var(--tx2)', textWrap: 'pretty' }}>
                          {p.body}
                        </p>
                      )}
                    </>
                  )}

                  {/* Footer Controls */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '10px 14px 12px',
                      borderTop: '1px solid var(--line)',
                      marginTop: 10,
                    }}
                  >
                    <FacebookReactionButton
                      itemId={itemKey}
                      kind={p.kind}
                      mine={reacted}
                      count={countR}
                      onReact={(on) => A.react.mutate({ kind: p.kind, id: p.id, on })}
                      size="sm"
                    />

                    <button
                      onClick={() => setOpenComments(isCommentsOpen ? null : p.id)}
                      className="tap"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: isCommentsOpen ? 'var(--accTx)' : 'var(--tx2)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name="chat" size={14} color={isCommentsOpen ? 'var(--accTx)' : 'var(--tx2)'} />
                      {countC > 0 ? `${countC} replies` : 'Reply'}
                    </button>

                    <button
                      onClick={() => setSharing(item)}
                      className="tap"
                      title="Share & Repost"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      <Icon name="send" size={14} color="var(--tx3)" />
                    </button>

                    <button
                      onClick={() => setViewing(item)}
                      className="hov"
                      style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--accTx)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Open ›
                    </button>
                  </div>

                  {isCommentsOpen && (
                    <ProfileCommentDrawer
                      item={item}
                      me={me}
                      profiles={profiles}
                      onComment={(body) => {
                        A.comment.mutate({ kind: item.kind, id: item.id, body });
                        toast('Reply posted');
                      }}
                    />
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* 3. Reposts Tab (LinkedIn & Instagram Style) */}
      {!loadingPosts && tab === 'reposts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {userReposts.length === 0 ? (
            <EmptyProfile
              icon="refresh"
              title="No reposts yet"
              desc="When you repost discussions or photos from the community, they will be archived here."
            />
          ) : (
            userReposts.map((r) => (
              <div
                key={r.id}
                style={{
                  borderRadius: 16,
                  padding: 14,
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  boxShadow: 'var(--sh)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>
                  <Icon name="refresh" size={13} color="var(--accTx)" />
                  <span>Reposted · {ago(r.repostedAt)}</span>
                </div>

                {r.quoteText && (
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)', margin: '0 0 10px', textWrap: 'pretty' }}>
                    “{r.quoteText}”
                  </p>
                )}

                <div
                  onClick={() => router.push('/community/')}
                  className="hov"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'var(--card2)',
                    border: '1px solid var(--line2)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Original post · {r.kind}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)', marginTop: 2 }}>
                    Click to view full thread in Community
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. Discussions Tab */}
      {!loadingPosts && tab === 'discussions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visiblePosts.filter((p) => p.kind === 'discussion').length === 0 ? (
            <EmptyProfile
              icon="edit"
              title="No discussions"
              desc="Start a discussion or ask a question in the community to see it here."
            />
          ) : (
            visiblePosts
              .filter((p) => p.kind === 'discussion')
              .map((d) => (
                <div
                  key={d.id}
                  onClick={() => setViewing(toItem(d))}
                  className="hov k-squish"
                  style={{
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: 'var(--card)',
                    border: '1px solid var(--line2)',
                    boxShadow: 'var(--sh)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--tx)' }}>{d.title || d.body}</h4>
                    {d.tag && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          padding: '2px 7px',
                          borderRadius: 6,
                          fontSize: 9.5,
                          fontWeight: 800,
                          background: 'color-mix(in srgb, var(--acc) 16%, transparent)',
                          color: 'var(--accTx)',
                        }}
                      >
                        {d.tag}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--tx2)', margin: '4px 0 0', lineHeight: 1.5 }}>{d.body}</p>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 8 }}>{ago(d.created_at)}</div>
                </div>
              ))
          )}
        </div>
      )}

      {/* 5. Challenges Tab */}
      {!loadingPosts && tab === 'challenges' && (
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {userChallenges.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <EmptyProfile
                icon="trophy"
                title="No active challenges"
                desc="Join a fitness or productivity challenge in Community to compete and earn RP."
              />
            </div>
          ) : (
            userChallenges.map(({ member: m, challenge: c }) => (
              <div
                key={c.id}
                onClick={() => router.push('/community/?focus=Challenges')}
                className="hov k-squish"
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  boxShadow: 'var(--sh)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: `color-mix(in srgb, ${c.color} 20%, transparent)`,
                    display: 'grid',
                    placeItems: 'center',
                    flex: 'none',
                  }}
                >
                  <Icon name="trophy" size={18} color={c.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--tx)' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                    {metricDef(c.metric).label} · {m.progress} {c.unit || 'pts'}
                  </div>
                </div>
                {m.placed && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      background: m.placed === 1 ? PAL.amber : 'var(--card2)',
                      color: m.placed === 1 ? '#0C0F16' : 'var(--tx2)',
                    }}
                  >
                    #{m.placed}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Post Viewer Modal */}
      {viewing && (
        <PostView
          item={viewing}
          items={photoItems}
          me={me}
          profiles={profiles}
          reactions={reactions[`${viewing.kind}:${viewing.id}`] ?? 0}
          reacted={myReactions.has(`${viewing.kind}:${viewing.id}`)}
          comments={counts[`${viewing.kind}:${viewing.id}`] ?? 0}
          onIndex={(id) => {
            const next = photoItems.find((x) => x.id === id);
            if (next) setViewing(next);
          }}
          onReact={(on) => A.react.mutate({ kind: viewing.kind, id: viewing.id, on })}
          onComment={(body) => {
            A.comment.mutate({ kind: viewing.kind, id: viewing.id, body });
            toast('Posted');
          }}
          onShare={() => setSharing(viewing)}
          onClose={() => setViewing(null)}
        />
      )}

      {/* Share / Repost Sheet */}
      {sharing && (
        <ShareSheet item={sharing} me={me} onClose={() => setSharing(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- helpers */

function InstagramGridCell({
  post,
  reactions,
  comments,
  onClick,
}: {
  post: PostActivity;
  reactions: number;
  comments: number;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const urls = useSignedUrls('bd-feed', post.image_path ? [post.image_path] : []);
  const url = urls[0];

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="hov"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--card2)',
        cursor: 'pointer',
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={post.title || post.body || 'Post'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            background: 'linear-gradient(135deg, var(--card) 0%, var(--card2) 100%)',
          }}
        >
          <Icon name="chat" size={20} color="var(--accTx)" style={{ marginBottom: 6 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {post.title || post.body}
          </span>
        </div>
      )}

      {/* Instagram Hover Stats Overlay */}
      {hover && (
        <div
          className="k-bloom"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            backdropFilter: 'blur(2px)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="heart" size={15} color="#fff" />
            {reactions}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="chat" size={15} color="#fff" />
            {comments}
          </span>
        </div>
      )}
    </div>
  );
}

function ProfileItemEdit({
  item,
  onCancel,
  onSave,
}: {
  item: Item;
  onCancel: () => void;
  onSave: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);

  return (
    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--line2)',
          background: 'var(--card2)',
          color: 'var(--tx)',
          fontSize: 13,
          fontWeight: 700,
        }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write something..."
        rows={3}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--line2)',
          background: 'var(--card2)',
          color: 'var(--tx)',
          fontSize: 12.5,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          className="hov"
          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)' }}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(title, body)}
          className="acc k-squish"
          style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--acc)', color: 'var(--ink)', fontSize: 11.5, fontWeight: 800 }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}

function ProfileCommentDrawer({
  item,
  me,
  profiles,
  onComment,
}: {
  item: Item;
  me: string;
  profiles: Record<string, import('@/lib/people').Person>;
  onComment: (b: string) => void;
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
    <div
      className="rise"
      style={{
        padding: '12px 14px 14px',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--card2)',
      }}
    >
      {isLoading && <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Loading replies…</div>}
      {!isLoading && comments.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--tx3)' }}>No replies yet.</div>
      )}

      {comments.map((c) => {
        const who = displayOf(profiles, c.author_id, me);
        return (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)' }}>
                {who.label} · <span style={{ color: 'var(--tx3)', fontWeight: 500 }}>{ago(c.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 1, color: 'var(--tx)' }}>{c.body}</div>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Write a reply…"
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid var(--line2)',
            background: 'var(--card)',
            color: 'var(--tx)',
            fontSize: 12,
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          className="acc k-squish"
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            background: 'var(--acc)',
            color: 'var(--ink)',
            fontSize: 11.5,
            fontWeight: 800,
            opacity: draft.trim() ? 1 : 0.5,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function TimelineImage({ path, alt, onClick }: { path: string; alt: string; onClick?: () => void }) {
  const urls = useSignedUrls('bd-feed', [path]);
  const url = urls[0];

  if (!url) {
    return (
      <div style={{ width: '100%', height: 180, background: 'var(--card2)', display: 'grid', placeItems: 'center' }}>
        <Icon name="image" size={24} color="var(--tx3)" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{ width: '100%', maxHeight: 360, overflow: 'hidden', background: '#000', cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

function EmptyProfile({ icon, title, desc }: { icon: import('./Icon').IconName; title: string; desc: string }) {
  return (
    <div
      style={{
        padding: '36px 16px',
        textAlign: 'center',
        borderRadius: 16,
        background: 'var(--card)',
        border: '1px solid var(--line2)',
      }}
    >
      <Icon name={icon} size={26} color="var(--tx3)" style={{ margin: '0 auto 8px' }} />
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)' }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 4, maxWidth: 320, marginInline: 'auto' }}>
        {desc}
      </div>
    </div>
  );
}
