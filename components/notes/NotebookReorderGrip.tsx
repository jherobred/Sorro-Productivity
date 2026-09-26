'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

export function NotebookReorderGrip({ id, name, order, onMove }: {
  id: string; name: string; order: string[]; onMove: (from: string, to: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const target = useRef<HTMLElement | null>(null);
  const source = useRef<HTMLElement | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (target.current) delete target.current.dataset.dropTarget;
    if (source.current) delete source.current.dataset.dragging;
    target.current = null; source.current = null; start.current = null; setDragging(false);
  };
  return <button className="notebook-drag-handle" aria-label={`Reorder ${name}`} aria-describedby="notebook-order-help" aria-pressed={dragging} title="Drag to reorder. Arrow keys move one place."
    onPointerDown={e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); e.currentTarget.focus();
      source.current = e.currentTarget.closest<HTMLElement>('[data-notebook-id]');
      start.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }}
    onPointerMove={e => {
      if (!start.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < 6) return;
      setDragging(true);
      if (source.current) source.current.dataset.dragging = 'true';
      const next = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-notebook-id]') ?? null;
      if (next !== target.current) {
        if (target.current) delete target.current.dataset.dropTarget;
        target.current = next;
        if (next && next.dataset.notebookId !== id) next.dataset.dropTarget = 'true';
      }
      let scroller = source.current?.parentElement;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (e.clientY < r.top + 60) scroller.scrollBy(0, -16);
        else if (e.clientY > Math.min(r.bottom, window.innerHeight) - 60) scroller.scrollBy(0, 16);
      }
    }}
    onPointerUp={e => {
      const to = target.current?.dataset.notebookId;
      clear();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (to && to !== id) onMove(id, to);
    }}
    onPointerCancel={clear} onLostPointerCapture={clear}
    onKeyDown={e => {
      if (e.key === 'Escape') { clear(); return; }
      const direction = ['ArrowLeft','ArrowUp'].includes(e.key) ? -1 : ['ArrowRight','ArrowDown'].includes(e.key) ? 1 : 0;
      if (!direction) return;
      e.preventDefault();
      const to = order[order.indexOf(id) + direction];
      if (to) onMove(id, to);
    }}><Icon name="more" size={16}/></button>;
}
