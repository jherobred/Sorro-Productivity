'use client';
import { useLayoutEffect, useState, type RefObject } from 'react';
import { canvasConnectionPath } from '@/lib/calendarPlanning';

/** Anchor to rendered boxes, including packed columns and the live drag preview. */
export function CanvasConnections({ root, layoutKey }: { root: RefObject<HTMLDivElement | null>; layoutKey: string }) {
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const body = root.current;
    if (!body) return;
    const measure = () => {
      const bounds = body.getBoundingClientRect();
      // Basedly can scale its workspace with CSS zoom. Rects include that scale;
      // SVG coordinates are in the element's unscaled layout space.
      const tasks = new Map(Array.from(body.querySelectorAll<HTMLElement>('[data-calendar-task-id]')).map(el => [el.dataset.calendarTaskId, el]));
      const next = Array.from(body.querySelectorAll<HTMLElement>('[data-calendar-ghost-id]')).flatMap(ghost => {
        const task = tasks.get(ghost.dataset.calendarGhostId);
        if (!task) return [];
        return [canvasConnectionPath(bounds, body.clientWidth, body.clientHeight, ghost.getBoundingClientRect(), task.getBoundingClientRect())];
      });
      setPaths(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    const surface = body.closest('.k-zoomfade');
    surface?.addEventListener('animationend', measure);
    return () => { observer.disconnect(); surface?.removeEventListener('animationend', measure); };
  }, [root, layoutKey]);
  return <svg className="cal-task-connections" width="100%" height="100%" aria-hidden="true">
    <defs><marker id="canvas-plan-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
    {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" markerStart="url(#canvas-plan-arrow)" markerEnd="url(#canvas-plan-arrow)"/>)}
  </svg>;
}
