'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';

/**
 * A fixed-size stage that shows a picture **whole**.
 *
 * Instagram's desktop feed is the reference: every post occupies the same
 * rectangle whatever the photo's shape, and the photo is fitted inside it
 * rather than cropped to fill. A tall photo gets bars at the sides, a wide one
 * gets them top and bottom, and nothing is ever cut off — which matters when
 * the picture is a whiteboard, a problem set or a screenshot of a bug.
 *
 * `object-fit: cover` is what the old cards used. It fills the frame edge to
 * edge and looks tidier on a grid of holiday snaps, but it silently eats the
 * top and bottom of anything portrait. That was the wrong trade here.
 *
 * The blurred copy behind the photo is what stops the letterboxing reading as
 * dead space; Instagram, Twitter and Apple Photos all do the same.
 */
export function MediaFrame({
  src, alt, ratio = 4 / 5, maxHeight = 560, rounded = 12, onOpen, children,
}: {
  src: string | null;
  alt: string;
  /** Width ÷ height of the stage. 4:5 is Instagram's tallest portrait slot. */
  ratio?: number;
  maxHeight?: number;
  rounded?: number;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', width: '100%', aspectRatio: String(ratio), maxHeight,
        borderRadius: rounded, overflow: 'hidden', background: 'var(--card2)',
        cursor: onOpen ? 'zoom-in' : undefined,
      }}>
      {src ? (
        <>
          {/* Blurred fill behind, so the bars read as part of the picture. */}
          <img aria-hidden src={src} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: 'blur(28px) saturate(1.5)', transform: 'scale(1.15)', opacity: 0.55,
          }} />
          <img src={src} alt={alt} className="fade" style={{
            position: 'relative', width: '100%', height: '100%',
            objectFit: 'contain', display: 'block',
          }} />
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 11.5 }}>
          <Icon name="image" size={22} color="var(--tx3)" />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Full-screen viewer. Same rule — the whole picture, fitted — with room to
 * breathe and arrow keys between items.
 *
 * It portals to `document.body`, and it has to: `main` carries the font-scale
 * `zoom` and a page-entry transform, either of which makes it the containing
 * block for `position: fixed`. Rendered in place, this "full screen" overlay
 * was positioned against `main` — covering part of the page, offset wrongly,
 * with the feed showing through underneath. HANDOFF fact 2.
 */
/**
 * Zoom, inside the app.
 *
 * Opening a picture used to be an `<a target="_blank">` to a signed URL, which
 * hands it to the browser's own image viewer: a different background, no way
 * back except the tab button, no next/previous, and on Android a download
 * prompt. It also leaks a signed storage URL into browser history.
 *
 * So the pinching happens here. Wheel and pinch zoom about the pointer rather
 * than about the middle, because zooming about the middle means the thing you
 * were looking at slides away from you. Double-tap toggles, and a zoomed
 * picture pans by dragging - with the drag only starting once you are actually
 * zoomed in, or the swipe between photos would fight it.
 */
const MAX_ZOOM = 6;

function useZoom() {
  const [z, setZ] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  /** Live pointers, so two of them can be measured against each other. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);

  const reset = useCallback(() => setZ({ k: 1, x: 0, y: 0 }), []);

  /** Scale about a point, keeping whatever is under it under it. */
  const zoomAt = useCallback((next: number, cx: number, cy: number, box: DOMRect) => {
    setZ((p) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, next));
      if (k === 1) return { k: 1, x: 0, y: 0 };
      // The pointer's offset from the centre, in unscaled picture units.
      const px = cx - (box.left + box.width / 2);
      const py = cy - (box.top + box.height / 2);
      const ratio = k / p.k;
      return { k, x: px - (px - p.x) * ratio, y: py - (py - p.y) * ratio };
    });
  }, []);

  return { z, setZ, reset, zoomAt, drag, touches, pinch };
}

export function Lightbox({
  items, index, onClose, onIndex,
}: {
  items: { src: string | null; alt: string; caption?: string }[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [i, setI] = useState(index);
  const { z, setZ, reset, zoomAt, drag, touches, pinch } = useZoom();
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => setI(index), [index]);
  // A new picture starts at 1x. Carrying the zoom across would drop you into
  // the corner of the next one.
  useEffect(() => { reset(); }, [i, reset]);
  useOverlayBack(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, items.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
      if (e.key === '0') reset();
      if (e.key === '+' || e.key === '=') setZ((p) => ({ ...p, k: Math.min(MAX_ZOOM, p.k * 1.4) }));
      if (e.key === '-') setZ((p) => (p.k / 1.4 <= 1 ? { k: 1, x: 0, y: 0 } : { ...p, k: p.k / 1.4 }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, onClose, reset, setZ]);

  useEffect(() => { onIndex(i); }, [i, onIndex]);

  const item = items[i];
  if (!item) return null;

  const body = (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={item.alt}
      style={{
        position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(4,4,8,.93)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
      <button onClick={onClose} aria-label="Close" className="hov k-squish"
        style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.08)' }}>
        <Icon name="close" size={17} color="#fff" />
      </button>

      {items.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setI(Math.max(0, i - 1)); }} aria-label="Previous"
            disabled={i === 0} className="hov k-squish"
            style={{ position: 'absolute', left: 12, width: 42, height: 42, borderRadius: 21, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.08)', opacity: i === 0 ? 0.3 : 1 }}>
            <Icon name="back" size={18} color="#fff" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setI(Math.min(items.length - 1, i + 1)); }} aria-label="Next"
            disabled={i === items.length - 1} className="hov k-squish"
            style={{ position: 'absolute', right: 12, width: 42, height: 42, borderRadius: 21, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.08)', transform: 'rotate(180deg)', opacity: i === items.length - 1 ? 0.3 : 1 }}>
            <Icon name="back" size={18} color="#fff" />
          </button>
        </>
      )}

      {item.src && (
        <div
          ref={stage}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            if (z.k > 1) reset();
            else zoomAt(2.5, e.clientX, e.clientY, box);
          }}
          onWheel={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            zoomAt(z.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY, box);
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (touches.current.size === 2) {
              const [a, b] = [...touches.current.values()];
              pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: z.k };
              drag.current = null;
            } else if (z.k > 1) {
              drag.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y };
            }
          }}
          onPointerMove={(e) => {
            if (!touches.current.has(e.pointerId)) return;
            touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const box = e.currentTarget.getBoundingClientRect();

            if (touches.current.size === 2 && pinch.current) {
              const [a, b] = [...touches.current.values()];
              const dist = Math.hypot(a.x - b.x, a.y - b.y);
              zoomAt(pinch.current.k * (dist / pinch.current.dist),
                (a.x + b.x) / 2, (a.y + b.y) / 2, box);
              return;
            }
            if (drag.current) {
              setZ((p) => ({
                ...p,
                x: drag.current!.ox + (e.clientX - drag.current!.x),
                y: drag.current!.oy + (e.clientY - drag.current!.y),
              }));
            }
          }}
          onPointerUp={(e) => {
            touches.current.delete(e.pointerId);
            if (touches.current.size < 2) pinch.current = null;
            drag.current = null;
          }}
          onPointerCancel={(e) => { touches.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}
          style={{
            maxWidth: 'min(100%, 1100px)', maxHeight: '82dvh', overflow: 'hidden', borderRadius: 10,
            touchAction: 'none', cursor: z.k > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in',
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.src} alt={item.alt} className="k-zoomfade" draggable={false}
            style={{
              maxWidth: '100%', maxHeight: '82dvh', objectFit: 'contain', display: 'block',
              transform: `translate(${z.x}px, ${z.y}px) scale(${z.k})`,
              transformOrigin: 'center',
              transition: drag.current || pinch.current ? 'none' : 'transform .18s ease-out',
            }} />
        </div>
      )}

      {z.k > 1 && (
        <button onClick={(e) => { e.stopPropagation(); reset(); }} className="hov k-squish"
          style={{
            position: 'absolute', top: 16, left: 16, height: 34, padding: '0 12px', borderRadius: 17,
            background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 11.5, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}>
          {z.k.toFixed(1)}× · reset
        </button>
      )}

      {(item.caption || items.length > 1) && (
        <div style={{ marginTop: 14, textAlign: 'center', color: 'rgba(255,255,255,.78)', fontSize: 12.5, maxWidth: 700 }}>
          {item.caption}
          {items.length > 1 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,.5)', fontVariantNumeric: 'tabular-nums' }}>
              {i + 1} of {items.length}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
