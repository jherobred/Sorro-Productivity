'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { TabRail } from '@/components/TabRail';
import { Composer } from '@/components/Composer';
import { Challenges } from '@/components/Challenges';
import { MediaFrame } from '@/components/MediaFrame';
import { PostView } from '@/components/PostView';
import { ShareSheet } from '@/components/ShareSheet';
import { Messages } from '@/components/Messages';
import { RowActions } from '@/components/MoneyRows';
import { FacebookReactionButton } from '@/components/FacebookReactions';
import { currentUserId } from '@/lib/supabase';
import { usePrefs } from '@/lib/prefs';
import { BOT_NAME } from '@/lib/bot';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { ago } from '@/lib/scratch';
import { useSignedUrls } from '@/lib/uploads';
import { useProfiles, displayOf } from '@/lib/people';
import { useReposts } from '@/lib/reposts';
import { useBookmarks, toggleBookmark } from '@/lib/bookmarks';
import { usePostViews, recordPostView } from '@/lib/views';
import { StoriesTray } from '@/components/stories/StoriesTray';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { StoryCreator } from '@/components/stories/StoryCreator';
import {
  useFeed, useFeedPending, useLikes, useVotes, useCommentCounts, useComments, useCommunityActions,
  key, type Filter, type Item, type Sort,
} from '@/lib/community';
import { FeedSkeleton } from '@/components/Skeleton';
import { playCelebration, playClick } from '@/lib/audio';
import { useFollows } from '@/lib/follows';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: 'Latest' },
  { id: 'top', label: 'Top' },
];

type SubTab = 'posts' | 'replies' | 'reposts' | 'media' | 'bookmarks' | 'challenges';

export default function CommunityPage() {
  const router = useRouter();
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [tab, setTab] = useState<'feed' | 'messages' | 'challenges'>('feed');
  const [subTab, setSubTab] = useState<SubTab>('posts');
  const [me, setMe] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [filter, setFilter] = useState<Filter>('all');
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Item | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { isFollowing, toggleFollow } = useFollows();
  const [showMoreTrends, setShowMoreTrends] = useState(false);
  const [activeStoryUser, setActiveStoryUser] = useState<string | null>(null);
  const [isCreatingStory, setIsCreatingStory] = useState(false);

  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFocus = () => {
      const sp = new URLSearchParams(window.location.search);
      const focus = sp.get('focus') || sp.get('tab');
      if (focus) {
        const lower = focus.toLowerCase();
        if (lower === 'feed') setTab('feed');
        else if (lower === 'messages') setTab('messages');
        else if (lower === 'challenges') setTab('challenges');
      }
    };

    syncFocus();
    window.addEventListener('popstate', syncFocus);
    const onCustomFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ section: string; focus: string }>).detail;
      if (detail && detail.section === 'community' && detail.focus) {
        const lower = detail.focus.toLowerCase();
        if (lower === 'feed') setTab('feed');
        else if (lower === 'messages') setTab('messages');
        else if (lower === 'challenges') setTab('challenges');
      }
    };
    window.addEventListener('basedly:focus', onCustomFocus);

    return () => {
      window.removeEventListener('popstate', syncFocus);
      window.removeEventListener('basedly:focus', onCustomFocus);
    };
  }, []);

  const { data: profiles = {} } = useProfiles();
  const { data: likes = [] } = useLikes();
  const { data: votes = [] } = useVotes();
  const { data: counts = {} } = useCommentCounts();
  const reposts = useReposts();
  const bookmarks = useBookmarks();
  const views = usePostViews();
  const A = useCommunityActions(me);

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

  const rawItems = useFeed(sort, filter, reactions, prefs.hideBot);
  const loading = useFeedPending();

  const items = useMemo(() => {
    let list = rawItems;

    if (subTab === 'media') {
      list = list.filter((i) => i.image_path || (i.images && i.images.length > 0));
    } else if (subTab === 'replies') {
      list = list.filter((i) => (counts[key(i)] ?? 0) > 0);
    } else if (subTab === 'reposts') {
      const repostedIds = new Set(reposts.map((r) => r.itemId));
      list = list.filter((i) => repostedIds.has(i.id));
    } else if (subTab === 'bookmarks') {
      const bSet = new Set(bookmarks);
      list = list.filter((i) => bSet.has(key(i)));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const p = profiles[i.author_id];
        const name = p?.name?.toLowerCase() || '';
        const handle = p?.handle?.toLowerCase() || '';
        const title = i.title?.toLowerCase() || '';
        const body = i.body?.toLowerCase() || '';
        const tag = i.tag?.toLowerCase() || '';
        return name.includes(q) || handle.includes(q) || title.includes(q) || body.includes(q) || tag.includes(q);
      });
    }

    return list;
  }, [rawItems, subTab, searchQuery, counts, reposts, bookmarks, profiles]);

  const photos = items.filter((i) => i.image_path);
  const open_ = viewing ? items.find((i) => key(i) === viewing) ?? null : null;

  const storeBasedlyUsers = useMemo(() => {
    const list: Array<{
      userId: string;
      name: string;
      handle: string;
      photo: string | null;
      animal: string | null;
      desc?: string;
    }> = [];

    const dbUsers = Object.values(profiles).filter((p) => p.user_id !== me);
    const seen = new Set<string>();

    for (const p of dbUsers) {
      const h = (p.handle || p.user_id.slice(0, 8)).replace(/^@/, '');
      if (!seen.has(h.toLowerCase())) {
        seen.add(h.toLowerCase());
        list.push({
          userId: p.user_id,
          name: p.name || `@${h}`,
          handle: h,
          photo: p.photo_url || null,
          animal: p.animal || null,
          desc: 'Basedly Member',
        });
      }
    }

    return list;
  }, [profiles, me]);

  const matchingMembers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim().replace(/^@/, '');
    return storeBasedlyUsers.filter(
      (u) => u.handle.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );
  }, [searchQuery, storeBasedlyUsers]);

  const realBasedlyTrends = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    for (const item of rawItems) {
      if (item.tag && item.tag.trim()) {
        const clean = item.tag.replace(/^#/, '').trim();
        if (clean) {
          tagCounts[clean] = (tagCounts[clean] ?? 0) + 1;
        }
      }
    }

    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return [
        { cat: 'Basedly · Habits', tag: '#DeepFocus', rawTag: 'DeepFocus', count: '1 post' },
        { cat: 'Basedly · Challenges', tag: '#WeeklySprint', rawTag: 'WeeklySprint', count: '1 post' },
      ];
    }

    return sorted.map(([tag, count]) => ({
      cat: 'Trending on Basedly',
      tag: `#${tag}`,
      rawTag: tag,
      count: `${count} ${count === 1 ? 'post' : 'posts'}`,
    }));
  }, [rawItems]);

  return (
    <div style={{
      maxWidth: 1280,
      marginInline: 'auto',
      padding: phone ? '12px 10px 24px' : '16px 20px 32px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <TabRail
          tabs={[
            { id: 'feed', label: 'Feed', icon: 'chat' },
            { id: 'messages', label: 'Messages', icon: 'send' },
            { id: 'challenges', label: 'Challenges', icon: 'trophy' },
          ]}
          value={tab} onChange={setTab} phone={phone} label="Community sections" />

        {tab === 'feed' && (
          <button
            onClick={() => setComposing(true)}
            className="acc k-squish"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 999,
              background: 'var(--acc)', color: '#0A0912', fontSize: 13, fontWeight: 800,
              boxShadow: '0 4px 14px color-mix(in srgb, var(--acc) 30%, transparent)',
            }}
          >
            <Icon name="plus" size={14} color="#0A0912" />
            Post
          </button>
        )}
      </div>

      {tab === 'feed' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: phone ? '1fr' : 'minmax(0, 1fr) 350px',
          gap: 20,
          alignItems: 'start',
        }}>
          <main style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: 'var(--sh)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px 10px',
              borderBottom: '1px solid var(--line)',
              background: 'color-mix(in srgb, var(--card) 90%, transparent)',
              backdropFilter: 'blur(12px)',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => router.back()}
                  className="hov k-squish"
                  title="Back"
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'grid', placeItems: 'center',
                    border: 'none', background: 'transparent', color: 'var(--tx)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="back" size={16} color="var(--tx)" />
                </button>
                <div>
                  <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: 'var(--tx)' }}>
                    Community Feed
                  </h1>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>
                    {items.length} {items.length === 1 ? 'post' : 'posts'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {SORTS.map((s) => (
                  <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}
                    icon={s.id === 'top' ? 'flame' : 'spark'}>{s.label}</Chip>
                ))}
                <Chip on={prefs.hideBot} icon={prefs.hideBot ? 'eye' : 'spark'}
                  onClick={() => { void update({ hideBot: !prefs.hideBot }); toast(prefs.hideBot ? `${BOT_NAME} is back` : `${BOT_NAME} hidden`); }}>
                  {prefs.hideBot ? `Show Bot` : `Hide Bot`}
                </Chip>
              </div>
            </div>

            {/* Instagram Stories Tray */}
            <StoriesTray
              me={me}
              onOpenViewer={(userId) => setActiveStoryUser(userId)}
              onCreateStory={() => setIsCreatingStory(true)}
            />

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              borderBottom: '1px solid var(--line)',
              background: 'var(--card)',
            }}>
              {(['posts', 'replies', 'reposts', 'media', 'bookmarks', 'challenges'] as SubTab[]).map((st) => {
                const on = subTab === st;
                const labels: Record<SubTab, string> = {
                  posts: 'Posts ▾',
                  replies: 'Replies',
                  reposts: 'Reposts',
                  media: 'Media',
                  bookmarks: 'Saved',
                  challenges: 'Challenges',
                };
                return (
                  <button
                    key={st}
                    onClick={() => {
                      if (st === 'challenges') {
                        setTab('challenges');
                      } else {
                        setSubTab(st);
                      }
                    }}
                    className="hov"
                    style={{
                      padding: '12px 4px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      position: 'relative',
                    }}
                  >
                    <span style={{
                      fontSize: 12.5,
                      fontWeight: on ? 800 : 600,
                      color: on ? 'var(--tx)' : 'var(--tx3)',
                      transition: 'color 0.15s',
                    }}>
                      {labels[st]}
                    </span>
                    {on && (
                      <span style={{
                        position: 'absolute',
                        bottom: 0,
                        height: 3.5,
                        width: 36,
                        borderRadius: 999,
                        background: 'var(--acc)',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 10, color: 'var(--tx)' }}>
                Let&apos;s get you set up
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }} className="navsb">
                {[
                  { id: 'topics', title: 'Follow 3 Topics', icon: 'chat', badge: '3 left', bg: 'linear-gradient(135deg, #FF7A00, #FF0055)' },
                  { id: 'accounts', title: 'Follow 5 accounts', icon: 'people', badge: 'DONE ✓', bg: 'linear-gradient(135deg, #A855F7, #6366F1)' },
                  { id: 'profile', title: 'Complete your profile', icon: 'photo', badge: 'DONE ✓', bg: 'linear-gradient(135deg, #06B6D4, #3B82F6)' },
                  { id: 'alerts', title: 'Turn on streak alerts', icon: 'flame', badge: 'ACTIVE 🔥', bg: 'linear-gradient(135deg, #10B981, #059669)' },
                ].map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      if (c.id === 'profile') router.push('/profile');
                      else toast(`Goal: ${c.title}`);
                    }}
                    className="hov k-squish"
                    style={{
                      flex: '0 0 160px',
                      height: 100,
                      borderRadius: 14,
                      background: c.bg,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'rgba(0,0,0,0.3)',
                        fontSize: 9.5,
                        fontWeight: 800,
                        backdropFilter: 'blur(4px)',
                      }}>
                        {c.badge}
                      </span>
                      <Icon name={c.icon as any} size={15} color="#fff" />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>
                      {c.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: 12,
              padding: '14px 16px',
              borderBottom: '1px solid var(--line)',
              alignItems: 'center',
            }}>
              <Avatar id={me} profiles={profiles} me={me} size={38} />
              <button
                onClick={() => setComposing(true)}
                className="hov"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx3)',
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>What is happening?!</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <Icon name="image" size={15} color="var(--accTx)" />
                  <Icon name="chat" size={15} color="var(--accTx)" />
                </span>
              </button>
            </div>

            {searchQuery && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                background: 'var(--card2)',
                borderBottom: '1px solid var(--line)',
                fontSize: 12,
                color: 'var(--tx2)',
              }}>
                <span>Filtered by: <strong>{searchQuery}</strong></span>
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    border: 'none', background: 'transparent', color: 'var(--accTx)',
                    fontWeight: 700, cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Clear filter
                </button>
              </div>
            )}

            {searchQuery && matchingMembers.length > 0 && (
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--line)',
                background: 'var(--card)',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--tx3)', marginBottom: 8 }}>
                  People matching &ldquo;{searchQuery}&rdquo;
                </div>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {matchingMembers.map((m) => {
                    const isFollowed = isFollowing(m.handle) || (m.userId ? isFollowing(m.userId) : false);
                    return (
                      <div
                        key={m.handle}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          borderRadius: 12,
                          background: 'var(--card2)',
                          border: '1px solid var(--line2)',
                          flex: 'none',
                        }}
                      >
                        <div
                          onClick={() => router.push(`/profile/?u=${encodeURIComponent(m.handle)}`)}
                          className="hov k-squish"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                        >
                          <span style={{
                            width: 32, height: 32, borderRadius: '50%', background: 'var(--card)',
                            border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', fontSize: 14,
                          }}>
                            {m.animal || '🦝'}
                          </span>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)', whiteSpace: 'nowrap' }}>{m.name}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>@{m.handle}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleFollow({ userId: m.userId, handle: m.handle, name: m.name })}
                          className="acc k-squish"
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 800,
                            background: isFollowed ? 'var(--card)' : 'var(--acc)',
                            color: isFollowed ? 'var(--tx)' : 'var(--ink)',
                            border: isFollowed ? '1px solid var(--line2)' : 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {isFollowed ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {loading && <FeedSkeleton count={3} />}

            {!loading && items.length === 0 && (
              <div style={{ padding: '60px 16px', textAlign: 'center', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.8 }}>
                No posts found {searchQuery ? `matching "${searchQuery}"` : 'in this tab.'}<br />
                <span style={{ fontSize: 11.5 }}>Be the first to share an update or photo with the community!</span>
              </div>
            )}

            {!loading && items.map((item) => (
              <XPostCard
                key={key(item)}
                item={item}
                me={me}
                profiles={profiles}
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
                onShare={() => setSharing(item)}
                onTagClick={(tag) => { setSearchQuery(tag.replace(/^#/, '')); toast(`Filter: ${tag}`); }}
              />
            ))}
          </main>

          {!phone && (
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                borderRadius: 999,
                padding: '0 14px',
                minHeight: 42,
              }}>
                <Icon name="search" size={15} color="var(--tx3)" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Basedly"
                  aria-label="Search Basedly"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--tx)',
                    padding: '8px 10px',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      border: 'none',
                      background: 'var(--card)',
                      color: 'var(--tx3)',
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}>
                    ✕
                  </button>
                )}
              </div>

              {/* "You might like" Widget Card */}
              <div style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 18,
                padding: '14px 16px',
                boxShadow: 'var(--sh)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 12, color: 'var(--tx)' }}>
                  You might like
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {storeBasedlyUsers.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '6px 0', lineHeight: 1.5 }}>
                      No other members yet. Invite your friends from the People tab!
                    </div>
                  )}

                  {storeBasedlyUsers.slice(0, 5).map((s) => {
                    const isFollowed = isFollowing(s.handle) || (s.userId ? isFollowing(s.userId) : false);
                    return (
                      <div key={s.handle} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                        <div
                          onClick={() => router.push(`/profile/?u=${encodeURIComponent(s.handle)}`)}
                          className="hov k-squish"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0, flex: 1 }}
                        >
                          {s.photo ? (
                            <img src={s.photo} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{
                              width: 38, height: 38, borderRadius: '50%', background: 'var(--card2)',
                              border: '1px solid var(--line2)',
                              display: 'grid', placeItems: 'center', fontSize: 17,
                            }}>
                              {s.animal || '🦝'}
                            </span>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
                              @{s.handle}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleFollow({ userId: s.userId, handle: s.handle, name: s.name })}
                          className="hov k-squish"
                          style={{
                            padding: '6px 14px',
                            borderRadius: 999,
                            border: isFollowed ? '1px solid var(--line2)' : 'none',
                            background: isFollowed ? 'var(--card2)' : 'var(--tx)',
                            color: isFollowed ? 'var(--tx)' : 'var(--bg)',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                            flex: 'none',
                          }}
                        >
                          {isFollowed ? 'Following' : 'Follow'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => router.push('/people')}
                  className="hov"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    marginTop: 14,
                    paddingTop: 10,
                    borderTop: '1px solid var(--line2)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accTx)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Show more
                </button>
              </div>

              {/* "What's happening" Trends Widget Card */}
              <div style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 18,
                padding: '14px 16px',
                boxShadow: 'var(--sh)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 12, color: 'var(--tx)' }}>
                  What’s happening
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(showMoreTrends ? realBasedlyTrends : realBasedlyTrends.slice(0, 5)).map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => { setSearchQuery(t.rawTag); toast(`Filter: ${t.tag}`); }}
                      className="hov"
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>{t.cat}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', margin: '1px 0' }}>{t.tag}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{t.count}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowMoreTrends(!showMoreTrends)}
                  className="hov"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--line2)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accTx)',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {showMoreTrends ? 'Show less' : 'Show more'}
                </button>
              </div>

              <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6, padding: '0 8px' }}>
                <span>Terms of Service</span> · <span>Privacy Policy</span> · <span>Cookie Policy</span><br />
                <span>Accessibility</span> · <span>Ads Info</span> · <span>© 2026 Basedly Corp.</span>
              </div>
            </aside>
          )}
        </div>
      )}

      {tab === 'messages' && <Messages me={me} />}

      {tab === 'challenges' && <Challenges />}

      {composing && (
        <Composer onClose={() => setComposing(false)} onPost={A.post} />
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

      {activeStoryUser && (
        <StoryViewer
          initialUserId={activeStoryUser}
          me={me}
          onClose={() => setActiveStoryUser(null)}
          onOpenHighlightEditor={(storyId) => {
            setActiveStoryUser(null);
            router.push('/profile');
          }}
        />
      )}

      {isCreatingStory && (
        <StoryCreator
          me={me}
          onClose={() => setIsCreatingStory(false)}
        />
      )}
    </div>
  );
}

function XPostCard({
  item, me, profiles, reactions, reacted, comments, editing, open,
  onToggleComments, onReact, onComment, onEdit, onEditCancel, onEditSave, onDelete, onOpen, onShare, onTagClick,
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
  onOpen: () => void;
  onShare: () => void;
  onTagClick?: (tag: string) => void;
}) {
  const router = useRouter();
  const who = displayOf(profiles, item.author_id, me);
  const isMine = item.author_id === me;
  const targetHandle = profiles[item.author_id]?.handle || item.author_id;

  const views = usePostViews();
  const bookmarks = useBookmarks();
  const reposts = useReposts();

  const itemKey = key(item);
  const isSaved = bookmarks.includes(itemKey);
  const repostCount = reposts.filter((r) => r.itemId === item.id).length;
  const viewCount = views[itemKey] ?? 1;

  useEffect(() => {
    recordPostView(itemKey);
  }, [itemKey]);

  return (
    <article style={{
      display: 'flex',
      gap: 12,
      padding: '14px 16px',
      borderBottom: '1px solid var(--line)',
      background: 'transparent',
      transition: 'background 0.15s',
    }}>
      <div
        onClick={() => targetHandle && router.push(`/profile/?u=${encodeURIComponent(targetHandle)}`)}
        className="hov k-squish"
        title={`View ${who.label}'s profile`}
        style={{ cursor: 'pointer', flex: 'none' }}
      >
        <Avatar id={item.author_id} profiles={profiles} me={me} size={42} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div
            onClick={() => targetHandle && router.push(`/profile/?u=${encodeURIComponent(targetHandle)}`)}
            className="hov"
            style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 0 }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {who.label}
            </span>
            <span style={{ color: '#1D9BF0', fontSize: 12 }}>✓</span>
            {who.bot && <BotTag />}
            <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 500 }}>
              @{targetHandle}
            </span>
          </div>

          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 500 }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 500 }}>
            {ago(item.created_at)}
          </span>

          {item.tag && (
            <button
              onClick={() => onTagClick?.(item.tag)}
              className="hov k-squish"
              title={`Filter by ${item.tag}`}
              style={{
                marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                color: who.hue, background: `color-mix(in srgb, ${who.hue} 16%, transparent)`,
                border: 'none', cursor: 'pointer',
              }}
            >
              {item.tag}
            </button>
          )}

          {isMine && (
            <span style={{ marginLeft: item.tag ? 6 : 'auto' }}>
              <RowActions label={(item.title || item.body || 'post').slice(0, 30)} onEdit={onEdit} onDelete={onDelete} />
            </span>
          )}
        </header>

        {editing ? (
          <div style={{ margin: '8px 0' }}>
            <ItemEdit item={item} onCancel={onEditCancel} onSave={onEditSave} />
          </div>
        ) : (
          <div style={{ cursor: 'pointer' }} onClick={onOpen}>
            {item.title && (
              <h2 style={{
                fontSize: 14.5, fontWeight: 800, letterSpacing: '-0.015em',
                lineHeight: 1.35, margin: '2px 0 6px', color: 'var(--tx)',
              }}>
                {item.title}
              </h2>
            )}

            {item.body && (
              <div style={{ fontSize: 13, lineHeight: 1.55, fontWeight: 500, color: 'var(--tx2)', textWrap: 'pretty', marginBottom: 8 }}>
                {item.body}
              </div>
            )}

            {item.images.length > 0 && (
              <div style={{ borderRadius: 14, overflow: 'hidden', margin: '8px 0 10px', border: '1px solid var(--line2)' }}>
                <PostImages paths={item.images} tint={who.hue} alt={item.title || item.body || 'Post image'} onOpen={onOpen} />
              </div>
            )}
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 460,
          marginTop: 8,
        }}>
          <button
            onClick={onToggleComments}
            className="hov k-squish"
            aria-label="Reply"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
              border: 'none', color: open ? 'var(--accTx)' : 'var(--tx3)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Icon name="chat" size={15} color={open ? 'var(--accTx)' : 'var(--tx3)'} />
            <span>{comments || ''}</span>
          </button>

          <button
            onClick={onShare}
            className="hov k-squish"
            aria-label="Repost"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
              border: 'none', color: repostCount > 0 ? 'var(--accTx)' : 'var(--tx3)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Icon name="undo" size={14} color={repostCount > 0 ? 'var(--accTx)' : 'var(--tx3)'} />
            <span>{repostCount || ''}</span>
          </button>

          <FacebookReactionButton
            itemId={key(item)}
            kind={item.kind}
            mine={reacted}
            count={reactions}
            onReact={onReact}
            size="sm"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--tx3)', fontSize: 11, fontWeight: 600 }}>
            <Icon name="eye" size={14} color="var(--tx3)" />
            <span>{viewCount}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => toggleBookmark(itemKey)}
              className="hov k-squish"
              title={isSaved ? 'Remove bookmark' : 'Bookmark'}
              style={{ background: 'transparent', border: 'none', color: isSaved ? 'var(--accTx)' : 'var(--tx3)', cursor: 'pointer' }}
            >
              <Icon name="star" size={14} color={isSaved ? 'var(--accTx)' : 'var(--tx3)'} />
            </button>
            <button
              onClick={onShare}
              className="hov k-squish"
              title="Share / Send"
              style={{ background: 'transparent', border: 'none', color: 'var(--tx3)', cursor: 'pointer' }}
            >
              <Icon name="send" size={14} color="var(--tx3)" />
            </button>
          </div>
        </div>

        {open && (
          <div style={{ marginTop: 12 }}>
            <CommentPanel item={item} me={me} profiles={profiles} onComment={onComment} />
          </div>
        )}
      </div>
    </article>
  );
}

function CommentPanel({
  item, me, profiles, onComment,
}: {
  item: Item; me: string; profiles: Record<string, import('@/lib/people').Person>; onComment: (b: string) => void;
}) {
  const router = useRouter();
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
      padding: '12px 14px',
      borderRadius: 14,
      background: 'var(--card2)',
      border: '1px solid var(--line2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {isLoading && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Loading replies…</div>}
      {!isLoading && comments.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No replies yet. Post your thought!</div>
      )}

      {comments.map((c) => {
        const who = displayOf(profiles, c.author_id, me);
        const handle = profiles[c.author_id]?.handle || c.author_id;
        return (
          <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <button
              onClick={() => handle && router.push(`/profile/?u=${encodeURIComponent(handle)}`)}
              className="hov k-squish"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Avatar id={c.author_id} profiles={profiles} me={me} size={28} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)' }}>
                {who.label} · <span style={{ color: 'var(--tx3)', fontWeight: 500 }}>{ago(c.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.55, textWrap: 'pretty', color: 'var(--tx2)' }}>{c.body}</div>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Post your reply" aria-label="Post your reply"
          style={{
            flex: 1, minHeight: 36, padding: '8px 12px', borderRadius: 999,
            border: '1px solid var(--line2)', background: 'var(--card)', color: 'var(--tx)', fontSize: 12.5,
          }} />
        <button onClick={send} className="acc k-squish" disabled={!draft.trim()}
          style={{
            flex: 'none', padding: '0 16px', minHeight: 36, borderRadius: 999,
            background: 'var(--acc)', color: '#0A0912', fontSize: 12, fontWeight: 800,
            opacity: draft.trim() ? 1 : 0.45,
          }}>
          Reply
        </button>
      </div>
    </div>
  );
}

function Avatar({
  id, profiles, me, size,
}: { id: string; profiles: Record<string, import('@/lib/people').Person>; me: string; size: number }) {
  const who = displayOf(profiles, id, me);
  if (who.photo) {
    return <img src={who.photo} alt="" style={{ width: size, height: size, flex: 'none', borderRadius: '50%', objectFit: 'cover', objectPosition: `${who.fit.x}% ${who.fit.y}%`, transform: `scale(${who.fit.zoom})` }} />;
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

function PostImages({ paths, tint, alt, onOpen }: { paths: string[]; tint: string; alt: string; onOpen: () => void }) {
  const urls = useSignedUrls('bd-feed', paths);
  const [at, setAt] = useState(0);
  const wrap = { background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 22%, var(--card2)), var(--card2))` };

  if (paths.length === 0) return null;

  if (paths.length === 1) {
    return (
      <div style={wrap}>
        <MediaFrame src={urls[0] ?? null} alt={alt} ratio={16 / 10} maxHeight={520} rounded={0} onOpen={onOpen} />
      </div>
    );
  }

  return (
    <div style={{ ...wrap, position: 'relative' }}>
      <div
        className="hbar"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '100%',
          overflowX: 'auto', scrollSnapType: 'x mandatory', scrollBehavior: 'smooth',
        }}>
        {paths.map((path, i) => (
          <div key={path} style={{ scrollSnapAlign: 'center' }}>
            <MediaFrame src={urls[i] ?? null} alt={i === 0 ? alt : `${alt} (${i + 1} of ${paths.length})`}
              ratio={16 / 10} maxHeight={520} rounded={0} onOpen={onOpen} />
          </div>
        ))}
      </div>

      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 10,
        display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none',
      }}>
        {paths.map((path, i) => (
          <span key={path} style={{
            width: i === at ? 16 : 5, height: 5, borderRadius: 3,
            background: i === at ? '#fff' : 'rgba(255,255,255,.5)',
            transition: 'width .2s',
          }} />
        ))}
      </div>

      <span style={{
        position: 'absolute', right: 10, top: 10, padding: '3px 9px', borderRadius: 8,
        background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10.5, fontWeight: 800,
        fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
      }}>
        {at + 1}/{paths.length}
      </span>
    </div>
  );
}

function Chip({
  on, onClick, icon, children,
}: { on: boolean; onClick: () => void; icon?: 'flame' | 'spark' | 'eye'; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className="k-chip" style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, minHeight: 28,
      fontSize: 11, fontWeight: 700,
      border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
      background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
      color: on ? 'var(--accTx)' : 'var(--tx2)',
      cursor: 'pointer',
    }}>
      {icon && <Icon name={icon} size={11} color={on ? 'var(--accTx)' : 'var(--tx3)'} />}
      {children}
    </button>
  );
}

function BotTag() {
  return (
    <span style={{
      flex: 'none', padding: '1px 6px', borderRadius: 5, fontSize: 8.5,
      fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
      color: 'var(--tx3)', border: '1px solid var(--line2)',
    }}>
      Bot
    </span>
  );
}

function ItemEdit({ item, onSave, onCancel }: { item: Item; onSave: (t: string, b: string) => void; onCancel: () => void }) {
  const [t, setT] = useState(item.title);
  const [b, setB] = useState(item.body);
  const ok = item.kind === 'photo' ? true : !!t.trim();

  return (
    <div className="k-bloom" style={{ padding: '8px 0' }}>
      {item.kind === 'discussion' && (
        <input autoFocus value={t} onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} aria-label="Title"
          style={{ width: '100%', minHeight: 36, padding: '6px 0', fontSize: 13.5, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)', borderBottom: '1px solid var(--line2)', background: 'transparent' }} />
      )}
      <textarea autoFocus={item.kind === 'photo'} value={b} onChange={(e) => setB(e.target.value)} rows={3}
        placeholder={item.kind === 'photo' ? 'Caption' : 'Detail'} aria-label="Body"
        style={{ width: '100%', padding: '8px 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx2)', resize: 'vertical', background: 'transparent', border: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => ok && onSave(t.trim(), b.trim())} className="acc k-squish"
          style={{ minHeight: 34, padding: '0 14px', borderRadius: 8, background: 'var(--acc)', color: '#0A0912', fontSize: 11.5, fontWeight: 800, opacity: ok ? 1 : 0.45 }}>
          Save
        </button>
        <button onClick={onCancel} className="hov k-squish"
          style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
