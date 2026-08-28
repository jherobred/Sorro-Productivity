'use client';

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useUserStoryArchive, type StorySlide } from '@/lib/stories';
import { useOverlayBack } from '@/lib/nav';
import { ago } from '@/lib/scratch';
import { StoryViewer } from './StoryViewer';
import { HighlightEditorModal } from './HighlightEditorModal';

export function StoryArchiveModal({
  me,
  onClose,
}: {
  me: string;
  onClose: () => void;
}) {
  useOverlayBack(true, onClose);

  const archive = useUserStoryArchive(me);
  const [viewingStory, setViewingStory] = useState<StorySlide | null>(null);
  const [highlightingStoryId, setHighlightingStoryId] = useState<string | null>(null);

  const body = (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 210,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 460,
        background: 'var(--card)',
        borderRadius: 18,
        border: '1px solid var(--line)',
        boxShadow: 'var(--sh)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '85vh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="archive" size={18} color="var(--tx)" />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)' }}>
              Stories Archive ({archive.length})
            </span>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Stories Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {archive.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--tx3)', fontSize: 13, lineHeight: 1.6 }}>
              No stories in your archive yet.<br />
              Any stories you publish will automatically be preserved here.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}>
              {archive.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setViewingStory(s)}
                  className="hov k-squish"
                  style={{
                    position: 'relative',
                    aspectRatio: '9/16',
                    borderRadius: 10,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: s.bgGradient || '#222',
                    border: '1px solid var(--line2)',
                  }}
                >
                  {s.mediaUrl && (
                    <img
                      src={s.mediaUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}

                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 6px 4px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {ago(s.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Story Viewer Replay */}
      {viewingStory && (
        <StoryViewer
          initialUserId={me}
          highlightMode={true}
          highlightSlides={[viewingStory]}
          highlightTitle="Story Archive"
          me={me}
          onClose={() => setViewingStory(null)}
          onOpenHighlightEditor={(storyId) => {
            setViewingStory(null);
            setHighlightingStoryId(storyId);
          }}
        />
      )}

      {/* Highlight Editor */}
      {highlightingStoryId && (
        <HighlightEditorModal
          me={me}
          initialStoryId={highlightingStoryId}
          onClose={() => setHighlightingStoryId(null)}
        />
      )}
    </div>
  );

  // `main` carries the font-scale zoom and the page-entry transform, so it is
  // the containing block for anything fixed inside it. Portal to the body or
  // this overlay is positioned against the page, not the viewport.
  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
