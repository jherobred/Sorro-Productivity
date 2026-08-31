'use client';

import { useEffect, useRef } from 'react';
import { fireworks } from '@/lib/fireworks';

/**
 * Fullscreen celebration canvas host for task completion fireworks.
 * Pointer-events none and strictly zero performance overhead when idle.
 */
export function FireworksHost() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    fireworks.init(canvas);

    return () => {
      fireworks.destroy();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 999999,
      }}
      aria-hidden="true"
    />
  );
}
