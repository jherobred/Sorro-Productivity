'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * One tooltip for everything in the document editor that carries
 * `data-doc-tip`. The toolbar scrolls sideways, which would clip a tooltip
 * drawn inside it, so this one is placed on the page instead, under the
 * control, after a short hover or straight away on keyboard focus.
 */
export function DocTooltip({ root }: { root: RefObject<HTMLElement | null> }) {
  const [tip, setTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warm = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const show = (target: HTMLElement, instant: boolean) => {
      clearTimeout(timer.current);
      const text = target.dataset.docTip;
      if (!text) return;
      const place = () => {
        const r = target.getBoundingClientRect();
        setTip({ text, left: r.left + r.width / 2, top: r.bottom + 6 });
        warm.current = Date.now();
      };
      if (instant || Date.now() - warm.current < 700) place(); else timer.current = setTimeout(place, 450);
    };
    const hide = () => { clearTimeout(timer.current); setTip((current) => { if (current) warm.current = Date.now(); return null; }); };
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-doc-tip]');
      if (target) show(target, false); else hide();
    };
    const focus = (event: FocusEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-doc-tip]');
      if (target?.matches(':focus-visible')) show(target, true);
    };
    el.addEventListener('pointerover', over);
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focusin', focus);
    el.addEventListener('focusout', hide);
    el.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(timer.current);
      el.removeEventListener('pointerover', over);
      el.removeEventListener('pointerleave', hide);
      el.removeEventListener('focusin', focus);
      el.removeEventListener('focusout', hide);
      el.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [root]);

  if (!tip || typeof document === 'undefined') return null;
  return createPortal(
    <div className="doc-tooltip" role="tooltip" style={{ left: Math.max(60, Math.min(tip.left, innerWidth - 60)), top: tip.top }}>{tip.text}</div>,
    document.body,
  );
}
