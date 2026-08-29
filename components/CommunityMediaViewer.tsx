'use client';

import React, { useState } from 'react';
import {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContent,
  MorphingDialogClose,
  MorphingDialogImage,
  MorphingDialogContainer,
} from '@/components/core/morphing-dialog';
import { MessageSquare, Repeat2, Heart, Send } from 'lucide-react';
import { useComments, useCommunityActions, type Item } from '@/lib/community';
import { useReposts, repostPost } from '@/lib/reposts';
import { displayOf, type Person } from '@/lib/people';
import { ago } from '@/lib/scratch';
import { toast } from '@/lib/toast';

export function CommunityMediaViewer({
  item,
  src,
  alt,
  profiles = {},
  me = '',
}: {
  item: Item;
  src: string;
  alt?: string;
  profiles?: Record<string, Person>;
  me?: string;
}) {
  const { data: comments = [] } = useComments(item.kind, item.id, true);
  const reposts = useReposts();
  const A = useCommunityActions(me);
  const [commentText, setCommentText] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const isReposted = reposts.some((r) => r.itemId === item.id && r.userId === me);
  const d = displayOf(profiles, item.author_id, me);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount((c) => (isLiked ? Math.max(0, c - 1) : c + 1));
    A.react.mutate({ kind: item.kind, id: item.id, on: !isLiked });
  };

  const handleRepost = () => {
    repostPost({
      itemId: item.id,
      kind: item.kind,
      authorId: item.author_id,
      userId: me,
    });
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    A.comment.mutate({ kind: item.kind, id: item.id, body: commentText.trim() });
    setCommentText('');
    toast('Comment posted 💬');
  };

  return (
    <MorphingDialog
      transition={{
        duration: 0.3,
        ease: 'easeInOut',
      }}
    >
      <MorphingDialogTrigger className="relative w-full overflow-hidden rounded-xl bg-zinc-900 cursor-pointer">
        <MorphingDialogImage
          src={src}
          alt={alt || item.title || 'Community photo'}
          className="h-auto max-h-[500px] w-full rounded-xl object-cover hover:scale-[1.01] transition-transform duration-300"
        />
      </MorphingDialogTrigger>

      <MorphingDialogContainer>
        <MorphingDialogContent className="relative flex flex-col lg:flex-row w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-[var(--card)] border border-zinc-700 shadow-2xl">
          {/* Media Image Side */}
          <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] lg:min-h-[550px]">
            <MorphingDialogImage
              src={src}
              alt={alt || item.title || 'Community photo'}
              className="h-auto max-h-[85vh] w-full object-contain"
            />
          </div>

          {/* Comment & Info Side */}
          <div className="flex w-full lg:w-[380px] flex-col bg-[var(--card2)] border-t lg:border-t-0 lg:border-l border-[var(--line)]">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-[var(--line)]">
              <div className="h-9 w-9 rounded-full bg-[var(--card)] flex items-center justify-center font-bold text-sm border border-[var(--line2)] text-[var(--tx)]">
                {d.photo ? (
                  <img loading="lazy" decoding="async" src={d.photo} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  (d.label || 'U').slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-[var(--tx)] truncate">
                  {d.label || 'Community Member'}
                </span>
                <span className="text-xs text-[var(--tx3)]">
                  {ago(item.created_at)}
                </span>
              </div>
            </div>

            {/* Post text */}
            {(item.title || item.body) && (
              <div className="p-4 border-b border-[var(--line)] max-h-32 overflow-y-auto">
                {item.title && (
                  <h4 className="text-sm font-bold text-[var(--tx)] mb-1">{item.title}</h4>
                )}
                {item.body && (
                  <p className="text-xs leading-relaxed text-[var(--tx2)] whitespace-pre-wrap">{item.body}</p>
                )}
              </div>
            )}

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[140px]">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--tx3)] mb-2">
                Comments ({comments.length})
              </div>
              {comments.map((c) => {
                const cDisplay = displayOf(profiles, c.author_id, me);
                return (
                  <div key={c.id} className="flex gap-2.5 text-xs">
                    <div className="h-6 w-6 rounded-full bg-[var(--card)] flex items-center justify-center font-bold text-[10px] text-[var(--tx2)] flex-none">
                      {(cDisplay.label || 'U').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 bg-[var(--card)] p-2 rounded-lg border border-[var(--line)]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[var(--tx)]">{cDisplay.label || 'User'}</span>
                        <span className="text-[10px] text-[var(--tx3)]">{ago(c.created_at)}</span>
                      </div>
                      <p className="text-[var(--tx2)] mt-0.5 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                );
              })}
              {comments.length === 0 && (
                <div className="text-xs text-[var(--tx3)] text-center py-6">
                  No comments yet. Start the conversation!
                </div>
              )}
            </div>

            {/* Social Action Bar (Like, Repost, Comment count) */}
            <div className="flex items-center justify-between p-3 px-4 border-t border-[var(--line)] bg-[var(--card)]">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleLike}
                  className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                    isLiked ? 'text-red-500' : 'text-[var(--tx2)] hover:text-red-500'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-500' : ''}`} />
                  <span>{likeCount}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRepost}
                  className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                    isReposted ? 'text-emerald-500' : 'text-[var(--tx2)] hover:text-emerald-500'
                  }`}
                >
                  <Repeat2 className="h-4 w-4" />
                  <span>{isReposted ? 'Reposted' : 'Repost'}</span>
                </button>

                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--tx3)]">
                  <MessageSquare className="h-4 w-4" />
                  <span>{comments.length}</span>
                </div>
              </div>
            </div>

            {/* Comment Input */}
            <form onSubmit={handleSendComment} className="flex items-center gap-2 p-3 border-t border-[var(--line)] bg-[var(--card2)]">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 bg-[var(--card)] border border-[var(--line2)] rounded-lg px-3 py-1.5 text-xs text-[var(--tx)] placeholder-[var(--tx3)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--acc)] text-black disabled:opacity-40 transition-opacity"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>

          <MorphingDialogClose className="fixed right-6 top-6 h-fit w-fit rounded-full bg-white/90 p-1.5 text-zinc-900 shadow-md hover:bg-white" />
        </MorphingDialogContent>
      </MorphingDialogContainer>
    </MorphingDialog>
  );
}
