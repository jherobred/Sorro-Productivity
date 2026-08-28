'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import {
  type StorySlide, type Highlight,
  useAllStories, recordStoryView, deleteStory, voteOnStoryPoll,
  useHighlights, addStoryToHighlight,
} from '@/lib/stories';
import { useProfiles, displayOf } from '@/lib/people';
import { ago } from '@/lib/scratch';
import { toast } from '@/lib/toast';
import { playClick, playCelebration } from '@/lib/audio';
import { startDm, useMessageActions } from '@/lib/messages';
import { useOverlayBack } from '@/lib/nav';

const DURATION_PER_SLIDE = 5000; // 5 seconds per slide
const QUICK_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏', '🎉', '💯'];

export function StoryViewer({
  initialUserId,
  initialSlideIndex = 0,
  highlightMode = false,
  highlightSlides,
  highlightTitle,
  me,
  onClose,
  onOpenHighlightEditor,
}: {
  initialUserId: string;
  initialSlideIndex?: number;
  highlightMode?: boolean;
  highlightSlides?: StorySlide[];
  highlightTitle?: string;
  me: string;
  onClose: () => void;
  onOpenHighlightEditor?: (storyId: string) => void;
}) {
  useOverlayBack(true, onClose);

  const allStories = useAllStories();
  const { data: profiles = {} } = useProfiles();
  const highlights = useHighlights(me);
  const msgActions = useMessageActions(me);

  // Group active stories by user
  const userOrder = useMemo(() => {
    if (highlightMode) return [initialUserId];
    const now = new Date().toISOString();
    const active = allStories.filter((s) => !s.isArchived && s.expiresAt > now);
    const set = new Set<string>();
    if (initialUserId) set.add(initialUserId);
    for (const s of active) set.add(s.userId);
    return Array.from(set);
  }, [allStories, initialUserId, highlightMode]);

  const [currentUserIdx, setCurrentUserIdx] = useState(() => {
    const idx = userOrder.indexOf(initialUserId);
    return idx >= 0 ? idx : 0;
  });

  const activeUserId = userOrder[currentUserIdx] || initialUserId;

  const currentSlides = useMemo(() => {
    if (highlightMode && highlightSlides) {
      return highlightSlides;
    }
    const now = new Date().toISOString();
    return allStories.filter((s) => s.userId === activeUserId && (!s.isArchived && s.expiresAt > now));
  }, [highlightMode, highlightSlides, allStories, activeUserId]);

  const [slideIdx, setSlideIdx] = useState(initialSlideIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);

  const activeSlide: StorySlide | undefined = currentSlides[slideIdx];
  const isOwner = activeSlide?.userId === me;
  const who = displayOf(profiles, activeUserId, me);

  // Record view on slide change
  useEffect(() => {
    if (activeSlide && me) {
      recordStoryView(activeSlide.id, me);
    }
  }, [activeSlide?.id, me]);

  // Timer loop for progress bar
  useEffect(() => {
    if (isPaused || showViewersSheet || showMoreMenu || showHighlightPicker || !activeSlide) return;

    const interval = 50; // ms
    const step = (interval / DURATION_PER_SLIDE) * 100;

    // The advance stays outside the state updater: an updater must be pure, and
    // React re-invokes them (StrictMode, a rebased concurrent render), which fired
    // handleNextSlide twice and skipped a slide.
    let p = progress;
    const timer = setInterval(() => {
      p += step;
      if (p < 100) { setProgress(p); return; }
      clearInterval(timer);
      setProgress(0);
      handleNextSlide();
    }, interval);

    return () => clearInterval(timer);
  }, [isPaused, showViewersSheet, showMoreMenu, showHighlightPicker, slideIdx, activeUserId, activeSlide]);

  const handleNextSlide = () => {
    if (slideIdx < currentSlides.length - 1) {
      setSlideIdx((prev) => prev + 1);
      setProgress(0);
    } else {
      // Move to next user if available
      if (currentUserIdx < userOrder.length - 1) {
        setCurrentUserIdx((prev) => prev + 1);
        setSlideIdx(0);
        setProgress(0);
      } else {
        onClose();
      }
    }
  };

  const handlePrevSlide = () => {
    if (slideIdx > 0) {
      setSlideIdx((prev) => prev - 1);
      setProgress(0);
    } else {
      // Move to previous user if available
      if (currentUserIdx > 0) {
        setCurrentUserIdx((prev) => prev - 1);
        setSlideIdx(0);
        setProgress(0);
      }
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !activeSlide) return;
    const cid = await startDm(activeSlide.userId);
    if (cid) {
      msgActions.say(cid, `Replied to your story: "${replyText.trim()}"`, {
        kind: 'photo',
        id: activeSlide.id,
      });
      playCelebration();
      toast(`Sent reply to ${who.label}`);
      setReplyText('');
    }
  };

  const handleSendQuickReaction = async (emoji: string) => {
    if (!activeSlide) return;
    recordStoryView(activeSlide.id, me, emoji);
    const cid = await startDm(activeSlide.userId);
    if (cid) {
      msgActions.say(cid, `Reacted ${emoji} to your story`);
    }
    playCelebration();
    toast(`Reacted ${emoji}`);
  };

  const handleDeleteCurrentSlide = () => {
    if (!activeSlide) return;
    deleteStory(activeSlide.id);
    if (currentSlides.length <= 1) {
      onClose();
    } else {
      handleNextSlide();
    }
  };

  if (!activeSlide) {
    return null;
  }

  const body = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background click to close overlay on desktop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(16px)',
        }}
      />

      {/* Main Story Container Frame (Instagram 9:16 Aspect) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          height: '100dvh',
          maxHeight: 900,
          background: activeSlide.bgGradient || '#121212',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          zIndex: 1,
        }}
        onPointerDown={() => setIsPaused(true)}
        onPointerUp={() => setIsPaused(false)}
        onPointerCancel={() => setIsPaused(false)}
      >
        {/* Story Media Background */}
        {activeSlide.mediaUrl && (
          <img
            src={activeSlide.mediaUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: getCssFilter(activeSlide.filter),
            }}
          />
        )}

        {/* Story Text Overlays */}
        {activeSlide.textOverlays.map((t) => (
          <div
            key={t.id}
            style={{
              position: 'absolute',
              top: `${t.y}%`,
              left: `${t.x}%`,
              transform: 'translate(-50%, -50%)',
              color: t.color || '#ffffff',
              fontSize: t.fontSize || 18,
              fontWeight: 800,
              textAlign: t.align || 'center',
              background: t.bgChip ? 'rgba(0,0,0,0.65)' : 'transparent',
              padding: t.bgChip ? '6px 14px' : '0',
              borderRadius: 10,
              maxWidth: '85%',
              wordBreak: 'break-word',
              textShadow: t.bgChip ? 'none' : '0 2px 8px rgba(0,0,0,0.8)',
              zIndex: 3,
            }}
          >
            {t.text}
          </div>
        ))}

        {/* Story Interactive Stickers */}
        {activeSlide.stickers.map((stk) => (
          <div
            key={stk.id}
            style={{
              position: 'absolute',
              top: `${stk.y}%`,
              left: `${stk.x}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 4,
              width: '85%',
              maxWidth: 320,
            }}
          >
            {stk.type === 'poll' && (
              <div style={{
                background: 'rgba(255,255,255,0.95)',
                borderRadius: 16,
                padding: '12px 14px',
                color: '#121212',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'center', marginBottom: 10 }}>
                  {stk.data.question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(stk.data.options || ['Yes', 'No']).map((opt, idx) => {
                    const totalVotes = Object.values(stk.data.votes || {}).reduce((a, b) => a + b, 0);
                    const optVotes = stk.data.votes?.[idx] || 0;
                    const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                    const voted = stk.data.userVote !== undefined;

                    return (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          voteOnStoryPoll(activeSlide.id, stk.id, idx);
                        }}
                        style={{
                          position: 'relative',
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(0,0,0,0.1)',
                          background: voted ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.03)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          overflow: 'hidden',
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: '#121212',
                        }}
                      >
                        {voted && (
                          <div style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${pct}%`,
                            background: stk.data.userVote === idx ? 'rgba(0, 149, 246, 0.35)' : 'rgba(0,0,0,0.12)',
                            transition: 'width 0.4s ease',
                          }} />
                        )}
                        <span style={{ position: 'relative', zIndex: 1 }}>{opt}</span>
                        {voted && <span style={{ position: 'relative', zIndex: 1, fontWeight: 800 }}>{pct}%</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {stk.type === 'streak' && (
              <div style={{
                background: 'linear-gradient(135deg, #FF6B00, #FF0055)',
                borderRadius: 16,
                padding: '10px 16px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: '0 8px 24px rgba(255, 107, 0, 0.4)',
              }}>
                <span style={{ fontSize: 24 }}>🔥</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.9 }}>
                    {stk.data.habitName || 'Active Streak'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {stk.data.streakCount || 1} DAYS STRONG
                  </div>
                </div>
              </div>
            )}

            {stk.type === 'habit' && (
              <div style={{
                background: 'rgba(0,0,0,0.85)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 14,
                padding: '8px 14px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backdropFilter: 'blur(8px)',
              }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{stk.data.habitName}</span>
              </div>
            )}
          </div>
        ))}

        {/* Top Vignette Gradient Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 5,
        }} />

        {/* Top Segmented Progress Bars */}
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          display: 'flex',
          gap: 4,
          zIndex: 10,
        }}>
          {currentSlides.map((_, idx) => {
            const width = idx < slideIdx ? 100 : idx === slideIdx ? progress : 0;
            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  height: 2.5,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.35)',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  width: `${width}%`,
                  height: '100%',
                  background: '#ffffff',
                  transition: idx === slideIdx ? 'width 0.05s linear' : 'none',
                }} />
              </div>
            );
          })}
        </div>

        {/* Top Header Bar */}
        <div style={{
          position: 'absolute',
          top: 20,
          left: 14,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          color: '#ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `color-mix(in srgb, ${who.hue} 30%, #333)`,
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              fontSize: 16,
            }}>
              {profiles[activeUserId]?.photo_url ? (
                <img src={profiles[activeUserId].photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                who.animal || '🦝'
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                  {highlightMode ? highlightTitle : who.label}
                </span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {ago(activeSlide.createdAt)}
                </span>
              </div>
              {highlightMode && (
                <span style={{ fontSize: 10.5, opacity: 0.75 }}>
                  Story Highlight
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              aria-label="More story options"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoreMenu(!showMoreMenu);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: 6,
              }}
            >
              <Icon name="dots" size={16} color="#ffffff" />
            </button>

            <button
              aria-label="Close story"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: 6,
              }}
            >
              <Icon name="close" size={16} color="#ffffff" />
            </button>
          </div>
        </div>

        {/* Tap Navigation Zones */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          zIndex: 2,
        }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              handlePrevSlide();
            }}
            style={{ width: '30%', height: '100%', cursor: 'pointer' }}
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleNextSlide();
            }}
            style={{ width: '70%', height: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* Bottom Interaction Area */}
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 14,
          right: 14,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {isOwner ? (
            /* Story Owner Action Bar */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(12px)',
              borderRadius: 999,
              padding: '8px 16px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowViewersSheet(true);
                }}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Icon name="eye" size={16} color="#ffffff" />
                <span>{activeSlide.viewers.length} Activity</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHighlightPicker(true);
                }}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Icon name="heart" size={16} color="#ffffff" />
                <span>Highlight</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCurrentSlide();
                }}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: 'none',
                  color: '#FF453A',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Icon name="trash" size={16} color="#FF453A" />
                <span>Delete</span>
              </button>
            </div>
          ) : (
            /* Viewer Reply & Emoji Floats Bar */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 2,
              }} className="navsb">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendQuickReaction(em);
                    }}
                    className="hov k-squish"
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '50%',
                      width: 36,
                      height: 36,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 18,
                      cursor: 'pointer',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(12px)',
                borderRadius: 999,
                padding: '6px 14px',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder={`Send message to ${who.label.split(' ')[0]}...`}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />

                {replyText.trim() && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendReply();
                    }}
                    className="hov k-squish"
                    style={{
                      background: '#0095F6',
                      border: 'none',
                      borderRadius: 999,
                      padding: '4px 12px',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Viewers & Activity Bottom Sheet */}
        {showViewersSheet && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              background: 'rgba(0,0,0,0.92)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ffffff', fontSize: 16, fontWeight: 800 }}>
                <Icon name="eye" size={18} color="#ffffff" />
                <span>Story Viewers ({activeSlide.viewers.length})</span>
              </div>
              <button
                onClick={() => setShowViewersSheet(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeSlide.viewers.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', marginTop: 40, fontSize: 13 }}>
                  No views yet. Your story was posted {ago(activeSlide.createdAt)}.
                </div>
              ) : (
                activeSlide.viewers.map((v, i) => {
                  const viewerWho = displayOf(profiles, v.userId, me);
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.1)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 18,
                        }}>
                          {viewerWho.animal || '🦝'}
                        </div>
                        <div>
                          <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
                            {viewerWho.label}
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                            {ago(v.viewedAt)}
                          </div>
                        </div>
                      </div>

                      {v.reaction && (
                        <span style={{ fontSize: 20 }}>{v.reaction}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Highlight Picker Modal Sheet */}
        {showHighlightPicker && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 25,
              background: 'rgba(0,0,0,0.92)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 800 }}>
                Save to Highlight
              </span>
              <button
                onClick={() => setShowHighlightPicker(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }} className="navsb">
              {/* + New Highlight Option */}
              <div
                onClick={() => {
                  setShowHighlightPicker(false);
                  onOpenHighlightEditor?.(activeSlide.id);
                }}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                <div style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  border: '1px dashed rgba(255,255,255,0.4)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#ffffff',
                }}>
                  <Icon name="plus" size={20} color="#ffffff" />
                </div>
                <span style={{ color: '#ffffff', fontSize: 11, fontWeight: 700 }}>New</span>
              </div>

              {/* Existing Highlights */}
              {highlights.map((hl) => (
                <div
                  key={hl.id}
                  onClick={() => {
                    addStoryToHighlight(hl.id, activeSlide.id);
                    setShowHighlightPicker(false);
                  }}
                  className="hov k-squish"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    flex: 'none',
                  }}
                >
                  <div style={{
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.3)',
                    overflow: 'hidden',
                    background: '#222',
                  }}>
                    {hl.coverUrl ? (
                      <img src={hl.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 20 }}>
                        ✨
                      </div>
                    )}
                  </div>
                  <span style={{ color: '#ffffff', fontSize: 11, fontWeight: 700, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hl.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // `main` carries the font-scale zoom and the page-entry transform, so it is
  // the containing block for anything fixed inside it. Portal to the body or
  // this overlay is positioned against the page, not the viewport.
  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

function getCssFilter(filterName?: string): string {
  switch (filterName) {
    case 'clarendon': return 'contrast(1.2) saturate(1.25)';
    case 'gingham': return 'sepia(0.05) contrast(0.9) brightness(1.05)';
    case 'moon': return 'grayscale(1) contrast(1.1) brightness(1.1)';
    case 'juno': return 'contrast(1.15) saturate(1.4) hue-rotate(-5deg)';
    case 'lark': return 'contrast(0.9) saturate(1.1) brightness(1.1)';
    case 'slumber': return 'saturate(0.65) brightness(1.05) sepia(0.2)';
    default: return 'none';
  }
}
