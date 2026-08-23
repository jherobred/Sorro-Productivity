'use client';

import React, { useState, useMemo } from 'react';
import { Icon } from '@/components/Icon';
import {
  type Highlight, type StorySlide,
  useAllStories,
  createHighlight, updateHighlight, deleteHighlight,
} from '@/lib/stories';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';

export function HighlightEditorModal({
  me,
  highlight,
  initialStoryId,
  onClose,
}: {
  me: string;
  highlight?: Highlight;
  initialStoryId?: string;
  onClose: () => void;
}) {
  useOverlayBack(true, onClose);

  const allStories = useAllStories();
  const myStories = useMemo(() => allStories.filter((s) => s.userId === me), [allStories, me]);

  const [step, setStep] = useState<'select_stories' | 'details'>(highlight ? 'details' : 'select_stories');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (highlight) return new Set(highlight.storyIds);
    if (initialStoryId) return new Set([initialStoryId]);
    return new Set(myStories.slice(0, 1).map((s) => s.id));
  });

  const [title, setTitle] = useState(highlight?.title || 'Highlights');
  const [coverUrl, setCoverUrl] = useState(highlight?.coverUrl || '');

  const toggleSelectStory = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (selectedIds.size === 0) {
      toast('Select at least one story for your highlight');
      return;
    }

    const storyIds = Array.from(selectedIds);
    const firstCover = coverUrl || myStories.find((s) => selectedIds.has(s.id))?.mediaUrl;

    if (highlight) {
      updateHighlight(highlight.id, {
        title: title.trim() || 'Highlight',
        coverUrl: firstCover,
        storyIds,
      });
    } else {
      createHighlight({
        userId: me,
        title: title.trim() || 'Highlight',
        coverUrl: firstCover,
        storyIds,
      });
    }

    onClose();
  };

  const handleDelete = () => {
    if (highlight) {
      deleteHighlight(highlight.id);
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 230,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'var(--card)',
        borderRadius: 18,
        border: '1px solid var(--line)',
        boxShadow: 'var(--sh)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--line)',
        }}>
          <button
            onClick={() => {
              if (step === 'details' && !highlight) setStep('select_stories');
              else onClose();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {step === 'details' && !highlight ? 'Back' : 'Cancel'}
          </button>

          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)' }}>
            {highlight ? 'Edit Highlight' : 'New Highlight'}
          </span>

          <button
            onClick={() => {
              if (step === 'select_stories') {
                if (selectedIds.size === 0) {
                  toast('Please select at least 1 story');
                  return;
                }
                setStep('details');
              } else {
                handleSave();
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#0095F6',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {step === 'select_stories' ? 'Next' : 'Done'}
          </button>
        </div>

        {/* Step 1: Select Stories from Archive Grid */}
        {step === 'select_stories' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12 }}>
              Select stories from your archive ({selectedIds.size} selected)
            </div>

            {myStories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--tx3)', fontSize: 13 }}>
                You have no stories posted yet.<br />
                Post a story first to add it to a highlight!
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
              }}>
                {myStories.map((s) => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleSelectStory(s.id)}
                      className="hov"
                      style={{
                        position: 'relative',
                        aspectRatio: '9/16',
                        borderRadius: 10,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: s.bgGradient || '#222',
                        border: isSelected ? '2.5px solid #0095F6' : '1px solid var(--line2)',
                      }}
                    >
                      {s.mediaUrl && (
                        <img
                          src={s.mediaUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}

                      {/* Selection Checkbox */}
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: isSelected ? '#0095F6' : 'rgba(0,0,0,0.4)',
                        border: '1.5px solid #ffffff',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 900,
                      }}>
                        {isSelected && '✓'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Name & Cover Details */}
        {step === 'details' && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Cover Preview Circle */}
            <div style={{
              width: 84,
              height: 84,
              borderRadius: '50%',
              padding: 3,
              border: '2px solid var(--line2)',
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
                {coverUrl ? (
                  <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 32 }}>✨</span>
                )}
              </div>
            </div>

            {/* Title Input */}
            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Highlight Name
              </label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Highlights"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  fontSize: 14,
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>

            {/* Optional Cover URL */}
            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Cover Image URL (optional)
              </label>
              <input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--line2)',
                  background: 'var(--card2)',
                  color: 'var(--tx)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            {/* Delete Highlight option if editing */}
            {highlight && (
              <button
                onClick={handleDelete}
                className="hov"
                style={{
                  marginTop: 10,
                  background: 'transparent',
                  border: 'none',
                  color: '#FF3B30',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Delete Highlight
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
