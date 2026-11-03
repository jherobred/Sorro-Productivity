'use client';

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { usePosts, useThreads, type Kind } from '@/lib/community';
import { useProfiles, displayOf } from '@/lib/people';
import { useSignedUrl } from '@/lib/uploads';
import { ago } from '@/lib/scratch';
import { useLayout } from '@/lib/useLayout';

export function PostPickerModal({
  me,
  onClose,
  onPickPost,
}: {
  me: string;
  onClose: () => void;
  onPickPost: (kind: Kind, id: string, title: string, imagePath?: string) => void;
}) {
  const { phone } = useLayout();
  const { data: posts = [] } = usePosts();
  const { data: threads = [] } = useThreads();
  const { data: profiles = {} } = useProfiles();

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  const items = useMemo(() => {
    const list: {
      id: string;
      kind: Kind;
      author_id: string;
      title: string;
      caption: string;
      image_path: string | null;
      tag: string;
      created_at: string;
    }[] = [
      ...posts.map((p) => ({
        id: p.id,
        kind: 'photo' as Kind,
        author_id: p.author_id,
        title: p.title || p.caption || 'Photo Post',
        caption: p.caption,
        image_path: p.image_path,
        tag: p.tag,
        created_at: p.created_at,
      })),
      ...threads.map((t) => ({
        id: t.id,
        kind: 'discussion' as Kind,
        author_id: t.author_id,
        title: t.title || 'Discussion',
        caption: t.body,
        image_path: null,
        tag: t.tag,
        created_at: t.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const term = q.trim().toLowerCase();
    return list.filter((it) => {
      if (tab === 'mine' && it.author_id !== me) return false;
      if (!term) return true;
      return (
        it.title.toLowerCase().includes(term) ||
        it.caption.toLowerCase().includes(term) ||
        it.tag.toLowerCase().includes(term)
      );
    });
  }, [posts, threads, q, tab, me]);

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Refer a Post or Image"
        className="k-bloom"
        style={{
          width: 500,
          maxWidth: '100%',
          maxHeight: phone ? '85vh' : '75vh',
          borderRadius: phone ? '20px 20px 0 0' : 20,
          background: 'linear-gradient(180deg, #131722 0%, #0B0E17 100%)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(99, 102, 241, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#F8FAFC',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🔗</span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#F8FAFC' }}>
                Refer a Post or Image
              </h2>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                Select a community post to share in this chat
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hov k-squish"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="close" size={14} color="#94A3B8" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px 8px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setTab('all')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                background: tab === 'all' ? 'var(--acc)' : 'rgba(255,255,255,0.06)',
                color: tab === 'all' ? 'var(--accent-ink)' : 'var(--tx2)',
                cursor: 'pointer',
              }}
            >
              All Community Posts
            </button>
            <button
              type="button"
              onClick={() => setTab('mine')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                border: 'none',
                background: tab === 'mine' ? 'var(--acc)' : 'rgba(255,255,255,0.06)',
                color: tab === 'mine' ? 'var(--accent-ink)' : 'var(--tx2)',
                cursor: 'pointer',
              }}
            >
              My Posts
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search posts by title, tag, or content…"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                color: 'var(--tx)',
                fontSize: 12.5,
              }}
            />
          </div>
        </div>

        {/* List of Posts */}
        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--tx3)', fontSize: 12 }}>
              No matching posts found.
            </div>
          )}

          {items.map((it) => {
            const who = displayOf(profiles, it.author_id, me);
            return (
              <PostItemRow
                key={it.id}
                item={it}
                authorName={who.label}
                onSelect={() => {
                  onPickPost(it.kind, it.id, it.title, it.image_path || undefined);
                  onClose();
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}

function PostItemRow({
  item,
  authorName,
  onSelect,
}: {
  item: {
    id: string;
    kind: Kind;
    title: string;
    caption: string;
    image_path: string | null;
    tag: string;
    created_at: string;
  };
  authorName: string;
  onSelect: () => void;
}) {
  const url = useSignedUrl('bd-feed', item.image_path || '');

  return (
    <button
      type="button"
      onClick={onSelect}
      className="hov k-squish"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 12px',
        borderRadius: 12,
        background: 'var(--card2)',
        border: '1px solid var(--line2)',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {/* Thumbnail */}
      {item.image_path ? (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            overflow: 'hidden',
            flex: 'none',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
              <Icon name="image" size={14} color="var(--tx3)" />
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(99, 102, 241, 0.12)',
            color: '#818CF8',
            fontSize: 18,
          }}
        >
          💬
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)' }}>{authorName}</span>
          {item.tag && (
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--line2)',
                color: 'var(--tx2)',
                textTransform: 'uppercase',
              }}
            >
              {item.tag}
            </span>
          )}
          <span style={{ fontSize: 9.5, color: 'var(--tx3)', marginLeft: 'auto' }}>{ago(item.created_at)}</span>
        </div>

        <div
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            color: 'var(--tx)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
      </div>

      <div style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: 'var(--accTx)' }}>
        Refer 🔗
      </div>
    </button>
  );
}
