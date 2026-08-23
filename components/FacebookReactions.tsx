'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { PAL } from '@/lib/pal';
import { playClick, playTick, playCelebration } from '@/lib/audio';

export type ReactionType = 'like' | 'love' | 'fire' | 'insight' | 'wow' | 'sad';

export type ReactionDef = {
  id: ReactionType;
  label: string;
  emoji: string;
  color: string;
};

export const FB_REACTIONS: ReactionDef[] = [
  { id: 'like', label: 'Like', emoji: '👍', color: '#3888FF' },
  { id: 'love', label: 'Love', emoji: '❤️', color: '#FF4365' },
  { id: 'fire', label: 'Fire', emoji: '🔥', color: '#FF8C00' },
  { id: 'insight', label: 'Insight', emoji: '💡', color: '#FFC24B' },
  { id: 'wow', label: 'Wow', emoji: '😮', color: '#FFA500' },
  { id: 'sad', label: 'Sad', emoji: '😢', color: '#4A90E2' },
];

export function getReaction(id: string | null | undefined): ReactionDef {
  return FB_REACTIONS.find((r) => r.id === id) ?? FB_REACTIONS[0];
}

const STORAGE_KEY = 'basedly-user-reactions';

export function getStoredUserReactions(): Record<string, ReactionType> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function storeUserReaction(itemId: string, reaction: ReactionType | null) {
  if (typeof window === 'undefined') return;
  try {
    const map = getStoredUserReactions();
    if (reaction) {
      map[itemId] = reaction;
    } else {
      delete map[itemId];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota
  }
}

export function FacebookReactionButton({
  itemId,
  kind,
  mine,
  count,
  onReact,
  size = 'md',
}: {
  itemId: string;
  kind?: 'photo' | 'discussion';
  mine: boolean;
  count: number;
  onReact: (on: boolean, reactionType?: ReactionType) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hoverDock, setHoverDock] = useState(false);
  const [activeReaction, setActiveReaction] = useState<ReactionType | null>(() => {
    if (!mine) return null;
    return getStoredUserReactions()[itemId] || 'like';
  });
  const [hoveredReaction, setHoveredReaction] = useState<ReactionType | null>(null);
  const [burst, setBurst] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mine && !activeReaction) {
      setActiveReaction(getStoredUserReactions()[itemId] || 'like');
    } else if (!mine && activeReaction) {
      setActiveReaction(null);
    }
  }, [mine, itemId, activeReaction]);

  const onMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setHoverDock(true);
    }, 280);
  };

  const onMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setHoverDock(false);
      setHoveredReaction(null);
    }, 320);
  };

  const onTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setHoverDock(true);
    }, 350);
  };

  const onTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  const selectReaction = (r: ReactionType, e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    setHoverDock(false);
    setHoveredReaction(null);

    const isSame = mine && activeReaction === r;
    if (isSame) {
      // Toggle off
      setActiveReaction(null);
      storeUserReaction(itemId, null);
      playTick();
      onReact(false);
    } else {
      // Set new reaction
      setActiveReaction(r);
      storeUserReaction(itemId, r);
      setBurst((n) => n + 1);
      if (r === 'love' || r === 'fire') {
        playCelebration();
      } else {
        playClick();
      }
      onReact(true, r);
    }
  };

  const handleMainClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hoverDock) {
      setHoverDock(false);
      return;
    }
    if (mine) {
      // Untoggle
      setActiveReaction(null);
      storeUserReaction(itemId, null);
      playTick();
      onReact(false);
    } else {
      // Quick like
      const nextReaction: ReactionType = 'like';
      setActiveReaction(nextReaction);
      storeUserReaction(itemId, nextReaction);
      setBurst((n) => n + 1);
      playClick();
      onReact(true, nextReaction);
    }
  };

  const currentDef = activeReaction ? getReaction(activeReaction) : null;
  const isHeart = kind === 'photo' && !activeReaction;
  const labelColor = currentDef ? currentDef.color : mine ? PAL.coral : 'var(--tx2)';

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Floating Facebook-style Reaction Dock */}
      {hoverDock && (
        <div
          className="k-bloom"
          role="toolbar"
          aria-label="Reactions"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: -8,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 999,
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            boxShadow: '0 10px 28px rgba(0,0,0,0.38), 0 2px 8px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(12px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {FB_REACTIONS.map((r, idx) => {
            const isSelected = activeReaction === r.id;
            const isHovered = hoveredReaction === r.id;
            return (
              <button
                key={r.id}
                onClick={(e) => selectReaction(r.id, e)}
                onMouseEnter={() => setHoveredReaction(r.id)}
                className="k-squish"
                title={r.label}
                aria-label={r.label}
                style={{
                  position: 'relative',
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: isHovered ? 26 : 20,
                  transform: isHovered ? 'scale(1.3) translateY(-6px)' : isSelected ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), font-size 0.18s ease',
                  background: isSelected ? `color-mix(in srgb, ${r.color} 20%, transparent)` : 'transparent',
                  animationDelay: `${idx * 25}ms`,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <span>{r.emoji}</span>
                {isHovered && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 4px)',
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: 'rgba(0,0,0,0.82)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    {r.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main reaction trigger button */}
      <button
        onClick={handleMainClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="tap k-squish"
        aria-pressed={mine}
        aria-label={currentDef ? currentDef.label : 'React'}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: size === 'sm' ? 11 : size === 'lg' ? 13.5 : 12,
          fontWeight: 700,
          color: labelColor,
          padding: '4px 6px',
          borderRadius: 8,
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
        }}
      >
        <span
          className={mine ? 'heartpop' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: currentDef ? (size === 'sm' ? 13 : 16) : 15,
            lineHeight: 1,
          }}
        >
          {currentDef ? (
            currentDef.emoji
          ) : (
            <Icon
              name={isHeart ? 'heart' : 'up'}
              size={size === 'sm' ? 13 : size === 'lg' ? 17 : 15}
              color={labelColor}
            />
          )}
        </span>

        {/* Label (Like / Love / Fire etc) */}
        <span>{currentDef ? currentDef.label : kind === 'photo' ? 'Like' : 'Upvote'}</span>

        {/* Counter Badge */}
        {count > 0 && (
          <span
            style={{
              marginLeft: 2,
              padding: '1px 6px',
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 800,
              background: mine
                ? `color-mix(in srgb, ${labelColor} 16%, transparent)`
                : 'var(--card2)',
              color: labelColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </span>
        )}

        {/* Burst particles */}
        {burst > 0 && (
          <span
            key={burst}
            aria-hidden
            style={{
              position: 'absolute',
              left: 12,
              top: 10,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          >
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <span
                  key={i}
                  className="burst"
                  style={{
                    position: 'absolute',
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: i % 2 ? currentDef?.color || PAL.coral : PAL.pink,
                    ['--px' as string]: `${Math.round(Math.cos(a) * 26)}px`,
                    ['--py' as string]: `${Math.round(Math.sin(a) * 26)}px`,
                  }}
                />
              );
            })}
          </span>
        )}
      </button>
    </div>
  );
}
