'use client';

import { useEffect, useState } from 'react';
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
export function Lightbox({
  items, index, onClose, onIndex,
}: {
  items: { src: string | null; alt: string; caption?: string }[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [i, setI] = useState(index);
  useEffect(() => setI(index), [index]);
  useOverlayBack(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, items.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, onClose]);

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
        // eslint-disable-next-line @next/next/no-img-element
        <img onClick={(e) => e.stopPropagation()} src={item.src} alt={item.alt} className="k-zoomfade"
          style={{ maxWidth: 'min(100%, 1100px)', maxHeight: '82dvh', objectFit: 'contain', borderRadius: 10, display: 'block' }} />
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
