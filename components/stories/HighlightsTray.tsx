'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  useHighlights, useAllStories,
  type Highlight, type StorySlide,
  deleteHighlight,
} from '@/lib/stories';
import { HighlightEditorModal } from './HighlightEditorModal';
import { StoryViewer } from './StoryViewer';

export function HighlightsTray({
  userId,
  isMe,
  me,
}: {
  userId: string;
  isMe: boolean;
  me: string;
}) {
  const highlights = useHighlights(userId);
  const allStories = useAllStories();

  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const activeHighlightSlides: StorySlide[] = React.useMemo(() => {
    if (!activeHighlight) return [];
    return activeHighlight.storyIds
      .map((id) => allStories.find((s) => s.id === id))
      .filter((s): s is StorySlide => !!s);
  }, [activeHighlight, allStories]);

  if (highlights.length === 0 && !isMe) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      overflowX: 'auto',
      padding: '14px 0',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }} className="navsb">
      {/* 1. "+ New" Highlight Button (for profile owner) */}
      {isMe && (
        <div
          onClick={() => setIsCreatingNew(true)}
          className="k-squish hov"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            flex: 'none',
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: '1px solid var(--line2)',
            background: 'var(--card2)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--tx)',
          }}>
            <Icon name="plus" size={22} color="var(--tx)" />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
            New
          </span>
        </div>
      )}

      {/* 2. Highlight Circles */}
      {highlights.map((hl) => {
        const coverStory = allStories.find((s) => hl.storyIds.includes(s.id));
        const coverImg = hl.coverUrl || coverStory?.mediaUrl;

        return (
          <div
            key={hl.id}
            onClick={() => setActiveHighlight(hl)}
            className="k-squish hov"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              flex: 'none',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              padding: 2.5,
              border: '1px solid var(--line2)',
              background: 'var(--card)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}>
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'var(--card2)',
                display: 'grid',
                placeItems: 'center',
              }}>
                {coverImg ? (
                  <img
                    src={coverImg}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: 22 }}>✨</span>
                )}
              </div>
            </div>

            <span style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--tx)',
              maxWidth: 72,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}>
              {hl.title}
            </span>

            {/* Edit / Manage trigger for owner */}
            {isMe && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingHighlight(hl);
                }}
                title="Edit highlight"
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--card2)',
                  border: '1px solid var(--line2)',
                  color: 'var(--tx3)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  fontSize: 9,
                }}
              >
                <Icon name="edit" size={9} color="var(--tx2)" />
              </button>
            )}
          </div>
        );
      })}

      {/* Fullscreen Highlight Story Viewer */}
      {activeHighlight && activeHighlightSlides.length > 0 && (
        <StoryViewer
          initialUserId={userId}
          highlightMode={true}
          highlightSlides={activeHighlightSlides}
          highlightTitle={activeHighlight.title}
          me={me}
          onClose={() => setActiveHighlight(null)}
          onOpenHighlightEditor={(storyId) => {
            setActiveHighlight(null);
            setIsCreatingNew(true);
          }}
        />
      )}

      {/* Highlight Editor Modal (Create or Edit) */}
      {(isCreatingNew || editingHighlight) && (
        <HighlightEditorModal
          me={me}
          highlight={editingHighlight || undefined}
          onClose={() => {
            setIsCreatingNew(false);
            setEditingHighlight(null);
          }}
        />
      )}
    </div>
  );
}
