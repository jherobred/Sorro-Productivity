'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Icon } from './Icon';
import { FacebookReactionButton, type ReactionType } from './FacebookReactions';
import { useSignedUrls } from '@/lib/uploads';
import { ago } from '@/lib/scratch';
import { PAL } from '@/lib/pal';
import { useChallenges, useMembers } from '@/lib/challenges';
import { useLikes, useVotes, useCommentCounts, useCommunityActions } from '@/lib/community';
import { metricDef } from '@/lib/metrics';

type PostActivity = {
  id: string;
  kind: 'photo' | 'discussion';
  title: string;
  body: string;
  tag: string;
  image_path: string | null;
  created_at: string;
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
  const [filter, setFilter] = useState<'all' | 'posts' | 'discussions' | 'challenges'>('all');

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
          created_at: p.created_at,
        })),
        ...(tRes.data ?? []).map((t) => ({
          id: t.id,
          kind: 'discussion' as const,
          title: t.title ?? '',
          body: t.body ?? '',
          tag: t.tag ?? '',
          image_path: null,
          created_at: t.created_at,
        })),
      ];

      return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const { data: challenges = [] } = useChallenges();
  const { data: members = [] } = useMembers();
  const { data: likes = [] } = useLikes();
  const { data: votes = [] } = useVotes();
  const { data: counts = {} } = useCommentCounts();
  const A = useCommunityActions(currentUserId || userId);

  const reactions = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of likes) out[`photo:${l.post_id}`] = (out[`photo:${l.post_id}`] ?? 0) + 1;
    for (const v of votes) out[`discussion:${v.thread_id}`] = (out[`discussion:${v.thread_id}`] ?? 0) + 1;
    return out;
  }, [likes, votes]);

  const myReactions = useMemo(() => {
    const out = new Set<string>();
    const me = currentUserId || userId;
    for (const l of likes) if (l.user_id === me) out.add(`photo:${l.post_id}`);
    for (const v of votes) if (v.user_id === me) out.add(`discussion:${v.thread_id}`);
    return out;
  }, [likes, votes, currentUserId, userId]);

  const userChallenges = useMemo(() => {
    const userMemberEntries = members.filter((m) => m.user_id === userId);
    return userMemberEntries.map((m) => {
      const chal = challenges.find((c) => c.id === m.challenge_id);
      return { member: m, challenge: chal };
    }).filter((x): x is { member: import('@/lib/challenges').Member; challenge: import('@/lib/challenges').Challenge } => !!x.challenge);
  }, [members, challenges, userId]);

  const filteredPosts = useMemo(() => {
    if (filter === 'posts') return posts.filter((p) => p.kind === 'photo');
    if (filter === 'discussions') return posts.filter((p) => p.kind === 'discussion');
    if (filter === 'challenges') return [];
    return posts;
  }, [posts, filter]);

  return (
    <div style={{ marginTop: 24 }}>
      {/* Activity Filter Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--line2)',
          paddingBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <Icon name="chat" size={16} color="var(--accTx)" />
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
            Community Timeline
          </h2>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {[
            { id: 'all', label: `All (${posts.length + userChallenges.length})` },
            { id: 'posts', label: `Photos (${posts.filter((p) => p.kind === 'photo').length})` },
            { id: 'discussions', label: `Discussions (${posts.filter((p) => p.kind === 'discussion').length})` },
            { id: 'challenges', label: `Challenges (${userChallenges.length})` },
          ].map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className="k-chip"
                style={{
                  padding: '4px 11px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                  background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                  color: on ? 'var(--accTx)' : 'var(--tx2)',
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Challenges Section */}
      {(filter === 'all' || filter === 'challenges') && userChallenges.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 10 }}>
            Active Challenges & Competitions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {userChallenges.map(({ member: m, challenge: c }) => (
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
                    width: 36,
                    height: 36,
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
            ))}
          </div>
        </div>
      )}

      {/* Posts Timeline Feed */}
      {filter !== 'challenges' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingPosts && (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--tx3)' }}>
              Loading activity timeline…
            </div>
          )}

          {!loadingPosts && filteredPosts.length === 0 && (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                borderRadius: 16,
                background: 'var(--card)',
                border: '1px solid var(--line2)',
              }}
            >
              <Icon name="chat" size={24} color="var(--tx3)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>No posts shared yet</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 4 }}>
                Posts, photos, and discussions will appear here in chronological order.
              </div>
            </div>
          )}

          {filteredPosts.map((post) => {
            const itemKey = `${post.kind}:${post.id}`;
            const itemReactions = reactions[itemKey] ?? 0;
            const reacted = myReactions.has(itemKey);
            const commentCount = counts[itemKey] ?? 0;

            return (
              <article
                key={post.id}
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  boxShadow: 'var(--sh)',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)' }}>
                      Shared {post.kind === 'photo' ? 'a photo' : 'a discussion'} · {ago(post.created_at)}
                    </span>
                  </div>
                  {post.tag && (
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
                      {post.tag}
                    </span>
                  )}
                </div>

                {/* Content */}
                {post.title && (
                  <h3
                    onClick={() => router.push('/community/')}
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
                    {post.title}
                  </h3>
                )}

                {post.image_path && (
                  <TimelineImage path={post.image_path} alt={post.title || post.body || 'Post image'} />
                )}

                {post.body && (
                  <p style={{ padding: '8px 14px 0', fontSize: 12.5, lineHeight: 1.6, margin: 0, color: 'var(--tx2)', textWrap: 'pretty' }}>
                    {post.body}
                  </p>
                )}

                {/* Footer Reactions & Comments */}
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
                    kind={post.kind}
                    mine={reacted}
                    count={itemReactions}
                    onReact={(on) => A.react.mutate({ kind: post.kind, id: post.id, on })}
                    size="sm"
                  />

                  <button
                    onClick={() => router.push('/community/')}
                    className="tap"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--tx2)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="chat" size={14} color="var(--tx2)" />
                    {commentCount > 0 ? `${commentCount} replies` : 'Reply'}
                  </button>

                  <button
                    onClick={() => router.push('/community/')}
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
                    View in Community ›
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineImage({ path, alt }: { path: string; alt: string }) {
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
    <div style={{ width: '100%', maxHeight: 360, overflow: 'hidden', background: '#000' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
