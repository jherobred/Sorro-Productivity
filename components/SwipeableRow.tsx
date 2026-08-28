'use client';

import { useState, useRef, useCallback } from 'react';
import { Icon, type IconName } from './Icon';
import { playTick, playClick } from '@/lib/audio';

interface SwipeableRowProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightActionIcon?: IconName;
  rightActionColor?: string;
  leftActionIcon?: IconName;
  leftActionColor?: string;
  threshold?: number;
  disabled?: boolean;
}

export function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightActionIcon = 'check',
  rightActionColor = 'var(--pal-mint)',
  leftActionIcon = 'trash',
  leftActionColor = 'var(--pal-coral)',
  threshold = 68,
  disabled = false,
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const elementRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [contenteditable="true"]')) {
      return;
    }

    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    pointerIdRef.current = e.pointerId;
    isDraggingRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startXRef.current === null || startYRef.current === null) return;
    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    // Check if horizontal intent is confirmed before capturing pointer
    if (!isDraggingRef.current) {
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isDraggingRef.current = true;
        setIsSwiping(true);
        try {
          elementRef.current?.setPointerCapture(pointerIdRef.current!);
        } catch { /* ignore */ }
      } else if (Math.abs(deltaY) > 8) {
        // Vertical scroll intent — cancel swipe
        startXRef.current = null;
        startYRef.current = null;
        return;
      } else {
        return;
      }
    }

    // Dampen drag past 120px
    const maxDrag = 140;
    const clamped = Math.max(-maxDrag, Math.min(maxDrag, deltaX));
    setOffsetX(clamped);
  };

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (startXRef.current === null) return;

      const wasDragging = isDraggingRef.current;
      if (wasDragging && pointerIdRef.current !== null) {
        try {
          elementRef.current?.releasePointerCapture(pointerIdRef.current);
        } catch { /* ignore */ }
      }

      const delta = offsetX;
      setIsSwiping(false);
      startXRef.current = null;
      startYRef.current = null;
      pointerIdRef.current = null;
      isDraggingRef.current = false;

      if (wasDragging) {
        if (delta >= threshold && onSwipeRight) {
          playTick();
          setOffsetX(120);
          setTimeout(() => {
            onSwipeRight();
            setOffsetX(0);
          }, 180);
        } else if (delta <= -threshold && onSwipeLeft) {
          playClick();
          setOffsetX(-120);
          setTimeout(() => {
            onSwipeLeft();
            setOffsetX(0);
          }, 180);
        } else {
          setOffsetX(0);
        }
      } else {
        setOffsetX(0);
      }
    },
    [offsetX, threshold, onSwipeRight, onSwipeLeft]
  );

  const isTriggeredRight = offsetX >= threshold;
  const isTriggeredLeft = offsetX <= -threshold;

  return (
    <div
      ref={elementRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'pan-y',
        userSelect: 'none',
        borderRadius: 12,
      }}
    >
      {/* Background action reveal beneath card */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          background:
            offsetX > 0
              ? `color-mix(in srgb, ${rightActionColor} ${isTriggeredRight ? '30%' : '14%'}, var(--card2))`
              : offsetX < 0
              ? `color-mix(in srgb, ${leftActionColor} ${isTriggeredLeft ? '30%' : '14%'}, var(--card2))`
              : 'transparent',
          transition: isSwiping ? 'none' : 'background .25s ease',
          borderRadius: 12,
        }}
      >
        {/* Right swipe indicator (left side icon) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: offsetX > 20 ? Math.min(1, (offsetX - 20) / 40) : 0,
            transform: `scale(${isTriggeredRight ? 1.15 : 0.95})`,
            transition: 'transform .15s ease',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: rightActionColor,
              color: '#0A0912',
              display: 'grid',
              placeItems: 'center',
              boxShadow: isTriggeredRight ? `0 0 12px ${rightActionColor}` : 'none',
            }}
          >
            <Icon name={rightActionIcon} size={14} color="#0A0912" />
          </span>
        </div>

        {/* Left swipe indicator (right side icon) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity: offsetX < -20 ? Math.min(1, (-offsetX - 20) / 40) : 0,
            transform: `scale(${isTriggeredLeft ? 1.15 : 0.95})`,
            transition: 'transform .15s ease',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: leftActionColor,
              color: '#0A0912',
              display: 'grid',
              placeItems: 'center',
              boxShadow: isTriggeredLeft ? `0 0 12px ${leftActionColor}` : 'none',
            }}
          >
            <Icon name={leftActionIcon} size={14} color="#0A0912" />
          </span>
        </div>
      </div>

      {/* Foreground sliding card */}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
          background: 'var(--card)',
          position: 'relative',
          zIndex: 2,
          borderRadius: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}
