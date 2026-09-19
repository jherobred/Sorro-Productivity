'use client';

/**
 * A photo, full screen, to look at closely.
 *
 * Pinch or scroll to zoom where the fingers or the pointer are, double-tap to
 * jump in and out, drag to move around a zoomed photo, and swipe or use the
 * arrows to go between photos. Back, Escape or the close button put it away.
 */

import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';

/** `removable` false keeps the delete button off a photo that is managed somewhere else, like a cover. */
export type ZoomPhoto = { src: string | null; alt: string; removable?: boolean };
type View = { s: number; x: number; y: number };
const MIN = 1, MAX = 6, TAP_ZOOM = 2.5;
const REST: View = { s: 1, x: 0, y: 0 };

export function PhotoZoom({ photos, start = 0, onClose, onDelete }: {
  photos: ZoomPhoto[];
  start?: number;
  onClose: () => void;
  /** Offered when the photos can be taken away from here. */
  onDelete?: (index: number) => void;
}) {
  useOverlayBack(true, onClose);
  const [index, setIndex] = useState(Math.min(start, Math.max(0, photos.length - 1)));
  const [view, setView] = useState<View>(REST);
  const viewRef = useRef(view); viewRef.current = view;
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: 'pan' | 'swipe' | 'pinch'; start: { x: number; y: number }; view: View; dist?: number; mid?: { x: number; y: number } } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  const photo = photos[index];
  useEffect(() => { setView(REST); }, [index]);
  useEffect(() => { if (index >= photos.length) setIndex(Math.max(0, photos.length - 1)); }, [photos.length, index]);

  /** A point on screen, measured from the middle of the stage, where the photo is centred. */
  const fromCentre = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
  };
  /** Keep the photo covering the stage wherever it can; a photo narrower than the stage stays centred. */
  const clamp = (v: View): View => {
    const s = Math.min(MAX, Math.max(MIN, v.s));
    if (s === 1) return REST;
    const w = img.current?.offsetWidth ?? 0, h = img.current?.offsetHeight ?? 0;
    const sw = stage.current?.clientWidth ?? 0, sh = stage.current?.clientHeight ?? 0;
    const mx = Math.max(0, (w * s - sw) / 2), my = Math.max(0, (h * s - sh) / 2);
    return { s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  };
  /** Zoom to `s` keeping the screen point `m` (from the centre) over the same spot of the photo. */
  const zoomAt = (v: View, s: number, m: { x: number; y: number }): View => {
    const k = Math.min(MAX, Math.max(MIN, s)) / v.s;
    return clamp({ s: v.s * k, x: m.x - (m.x - v.x) * k, y: m.y - (m.y - v.y) * k });
  };
  const go = (by: number) => setIndex((i) => Math.min(photos.length - 1, Math.max(0, i + by)));

  const down = (e: PE) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer already lifted */ }
    const p = fromCentre(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', start: p, view: viewRef.current, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    gesture.current = { kind: viewRef.current.s > 1 ? 'pan' : 'swipe', start: p, view: viewRef.current };
  };
  const move = (e: PE) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = fromCentre(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(g.view, g.view.s * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.dist!), g.mid!);
      setView(clamp({ ...zoomed, x: zoomed.x + mid.x - g.mid!.x, y: zoomed.y + mid.y - g.mid!.y }));
    } else if (g.kind === 'pan') {
      setView(clamp({ ...g.view, x: g.view.x + p.x - g.start.x, y: g.view.y + p.y - g.start.y }));
    } else if (g.kind === 'swipe') {
      setView({ s: 1, x: (p.x - g.start.x) * 0.9, y: 0 });
    }
  };
  const up = (e: PE) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'pinch') { if (pointers.current.size < 2) gesture.current = null; return; }
    gesture.current = null;
    if (!g || !p) return;
    const moved = Math.hypot(p.x - g.start.x, p.y - g.start.y);
    if (g.kind === 'swipe') {
      const dx = p.x - g.start.x;
      setView(REST);
      if (Math.abs(dx) > 70) { go(dx < 0 ? 1 : -1); return; }
    }
    if (moved > 8) return;
    // A second tap close to the first jumps in there, or back out.
    const now = performance.now(), last = lastTap.current;
    if (last && now - last.at < 320 && Math.hypot(p.x - last.x, p.y - last.y) < 30) {
      lastTap.current = null;
      setView((v) => (v.s > 1.05 ? REST : zoomAt(v, TAP_ZOOM, p)));
      return;
    }
    lastTap.current = { at: now, x: p.x, y: p.y };
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = fromCentre(e.clientX, e.clientY);
      setView((v) => zoomAt(v, v.s * Math.exp(-e.deltaY * 0.0022), m));
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') setView((v) => zoomAt(v, v.s * 1.4, { x: 0, y: 0 }));
      else if (e.key === '-') setView((v) => zoomAt(v, v.s / 1.4, { x: 0, y: 0 }));
      else if (e.key === '0') setView(REST);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keys);
    return () => { el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', keys); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (typeof document === 'undefined' || !photo) return null;
  return createPortal(
    <div className="zoom-scrim" role="dialog" aria-modal="true" aria-label={photo.alt || 'Photo'}>
      <div className="zoom-top">
        <span className="zoom-count">{photos.length > 1 ? `${index + 1} of ${photos.length}` : ''}</span>
        <div className="zoom-tools">
          <button type="button" aria-label="Zoom out" onClick={() => setView((v) => zoomAt(v, v.s / 1.4, { x: 0, y: 0 }))} disabled={view.s <= 1}><Icon name="zoomOut" size={18} /></button>
          <button type="button" aria-label="Actual fit" className="zoom-level" onClick={() => setView(REST)}>{Math.round(view.s * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => setView((v) => zoomAt(v, v.s * 1.4, { x: 0, y: 0 }))} disabled={view.s >= MAX}><Icon name="zoomIn" size={18} /></button>
          {onDelete && photo.removable !== false && <button type="button" aria-label="Delete this photo" onClick={() => onDelete(index)}><Icon name="trash" size={18} /></button>}
          <button type="button" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
      </div>
      <div ref={stage} className={'zoom-stage' + (view.s > 1 ? ' is-zoomed' : '')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {photo.src
          ? <img ref={img} src={photo.src} alt={photo.alt} draggable={false} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }} />
          : <span className="zoom-wait">Loading the photo…</span>}
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" className="zoom-step is-prev" aria-label="Previous photo" disabled={index === 0} onClick={() => go(-1)}><Icon name="chevronLeft" size={22} /></button>
          <button type="button" className="zoom-step is-next" aria-label="Next photo" disabled={index === photos.length - 1} onClick={() => go(1)}><Icon name="chevronRight" size={22} /></button>
        </>
      )}
    </div>,
    document.body,
  );
}
