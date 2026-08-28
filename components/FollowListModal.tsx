'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { useFollows, type FollowItem } from '@/lib/follows';

export function FollowListModal({
  initialTab = 'followers',
  onClose,
}: {
  initialTab?: 'followers' | 'following';
  onClose: () => void;
}) {
  useOverlayBack(true, onClose);
  const router = useRouter();
  const [tab, setTab] = useState<'followers' | 'following'>(initialTab);
  const { following, followers, isFollowing, toggleFollow } = useFollows();

  const list: FollowItem[] = tab === 'followers' ? followers : following;

  const body = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          width: 440,
          maxWidth: '100%',
          maxHeight: '80dvh',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 20,
          padding: 18,
          boxShadow: 'var(--shl)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setTab('followers')}
              className="k-squish"
              style={{
                padding: '6px 12px',
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                background: tab === 'followers' ? 'var(--card2)' : 'transparent',
                color: tab === 'followers' ? 'var(--tx)' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              Followers ({followers.length})
            </button>
            <button
              onClick={() => setTab('following')}
              className="k-squish"
              style={{
                padding: '6px 12px',
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 800,
                border: 'none',
                background: tab === 'following' ? 'var(--card2)' : 'transparent',
                color: tab === 'following' ? 'var(--tx)' : 'var(--tx3)',
                cursor: 'pointer',
              }}
            >
              Following ({following.length})
            </button>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* User items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 12.5 }}>
              {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </div>
          ) : (
            list.map((item) => {
              const followingUser = isFollowing(item.targetHandle) || (item.targetId ? isFollowing(item.targetId) : false);

              return (
                <div
                  key={item.targetHandle}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 12,
                    background: 'var(--card2)',
                  }}
                >
                  <div
                    onClick={() => {
                      onClose();
                      router.push(`/profile/?u=${encodeURIComponent(item.targetHandle)}`);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'var(--card)',
                        border: '1px solid var(--line2)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 14,
                        fontWeight: 800,
                        color: 'var(--tx)',
                        flex: 'none',
                      }}
                    >
                      {item.targetName.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.targetName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                        @{item.targetHandle}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleFollow({ userId: item.targetId, handle: item.targetHandle, name: item.targetName })}
                    className="hov k-squish"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      border: followingUser ? '1px solid var(--line2)' : 'none',
                      background: followingUser ? 'var(--card)' : 'var(--tx)',
                      color: followingUser ? 'var(--tx)' : 'var(--bg)',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      flex: 'none',
                    }}
                  >
                    {followingUser ? 'Following' : 'Follow'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  // `main` carries the font-scale zoom and the page-entry transform, so it is
  // the containing block for anything fixed inside it. Portal to the body or
  // this overlay is positioned against the page, not the viewport.
  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
