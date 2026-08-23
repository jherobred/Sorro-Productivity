'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { CENTRED, MIN_ZOOM, MAX_ZOOM, pan, setZoom, type Fit } from '@/lib/photoFit';

/**
 * A picture inside a frame you can move it around in.
 *
 * **Nothing is re-encoded.** The frame stores three numbers — where the
 * picture sits horizontally, vertically, and how far it is zoomed in — and
 * applies them as CSS. The file in storage is always the one you uploaded, so
 * you can reframe the same photo every week and the tenth attempt is exactly
 * as sharp as the first. A canvas crop would write a new, smaller file each
 * time and every reframe would be a crop of a crop.
 *
 * It also means changing the frame is not an upload: dragging your avatar to
 * centre your face is three numbers on a row you were saving anyway.
 *
 * `x` and `y` are percentages, the same ones `object-position` takes, so 50/50
 * is dead centre and that is the default for a picture nobody has touched.
 */

// The maths lives in lib/photoFit.ts, with lib/photoFit.check.ts on it — the
// drag direction and the clamping are the parts that can be silently wrong.
export { CENTRED, toFit, type Fit } from '@/lib/photoFit';

/** Read-only. What every other screen shows. */
export function PhotoFrame({ src, fit, alt, radius = 0 }: {
  src: string | null;
  fit: Fit;
  alt: string;
  radius?: number | string;
}) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{
        width: '100%', height: '100%', display: 'block', borderRadius: radius,
        objectFit: 'cover',
        objectPosition: `${fit.x}% ${fit.y}%`,
        transform: `scale(${fit.zoom})`,
        // Without this the scaled image paints over its own rounded corners.
        transformOrigin: 'center',
      }}
    />
  );
}

/**
 * The same frame, draggable, with a zoom slider under it.
 *
 * Drag distance is divided by the zoom, so at 3× the picture does not shoot
 * off the edge from a 20-pixel nudge — the further in you are, the finer the
 * control, which is how every photo cropper behaves and the only way the last
 * few pixels of framing are reachable on a phone.
 *
 * Pinch is the browser's two-finger gesture on the slider's own track rather
 * than a custom multi-touch handler: one input element already does
 * keyboard, screen reader and drag, and reimplementing it to add pinch would
 * lose all three.
 */
export function FrameEditor({ src, fit, onChange, ratio = 1, radius = 16, height }: {
  src: string;
  fit: Fit;
  onChange: (f: Fit) => void;
  /** Width ÷ height of the frame. 1 for an avatar, 3 for a cover. */
  ratio?: number;
  radius?: number;
  /** Fixed pixel height instead of an aspect ratio, for the avatar's square. */
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const touchDistRef = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = box.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    setDragging(true);

    let lastX = e.clientX;
    let lastY = e.clientY;
    let live = fit;

    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      live = pan(live, ev.clientX - lastX, ev.clientY - lastY, r.width, r.height);
      lastX = ev.clientX;
      lastY = ev.clientY;
      onChange(live);
    };

    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    onChange(setZoom(fit, fit.zoom + delta));
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      if (touchDistRef.current !== null) {
        const factor = dist / touchDistRef.current;
        onChange(setZoom(fit, fit.zoom * factor));
      }
      touchDistRef.current = dist;
    }
  };

  const onTouchEnd = () => {
    touchDistRef.current = null;
  };

  const stepZoom = (delta: number) => {
    onChange(setZoom(fit, fit.zoom + delta));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        ref={box}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'relative', width: '100%',
          ...(height ? { height } : { aspectRatio: String(ratio) }),
          borderRadius: radius, overflow: 'hidden', background: 'var(--card2)',
          cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none',
          border: '1.5px solid var(--acc)',
          boxShadow: 'var(--sh)',
        }}
      >
        <PhotoFrame src={src} fit={fit} alt="Drag to reposition" />

        {!dragging && (
          <span style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 999,
            background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 11.5, fontWeight: 800,
            backdropFilter: 'blur(6px)', pointerEvents: 'none',
          }}>
            <Icon name="hand" size={13} color="#fff" />
            Drag to pan · Scroll to zoom
          </span>
        )}

        <div style={{
          position: 'absolute', right: 8, bottom: 8, padding: '3px 8px', borderRadius: 6,
          background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10, fontWeight: 800,
          backdropFilter: 'blur(4px)', pointerEvents: 'none',
        }}>
          {fit.zoom.toFixed(1)}×
        </div>
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card2)', padding: '8px 12px', borderRadius: 12, border: '1px solid var(--line2)' }}>
        <button
          onClick={() => stepZoom(-0.2)}
          className="hov k-squish"
          title="Zoom Out"
          style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', background: 'var(--card)', color: 'var(--tx)' }}
        >
          -
        </button>
        <input
          type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.02} value={fit.zoom}
          aria-label="Zoom"
          onChange={(e) => onChange(setZoom(fit, Number(e.target.value)))}
          style={{ flex: 1, accentColor: 'var(--acc)', cursor: 'pointer' }}
        />
        <button
          onClick={() => stepZoom(0.2)}
          className="hov k-squish"
          title="Zoom In"
          style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', background: 'var(--card)', color: 'var(--tx)' }}
        >
          +
        </button>

        <span style={{ width: 1, height: 18, background: 'var(--line2)', margin: '0 2px' }} />

        <button
          onClick={() => onChange(CENTRED)}
          className="hov k-squish"
          style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--line2)', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', background: 'var(--card)' }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
