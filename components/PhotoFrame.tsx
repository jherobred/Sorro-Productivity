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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div
        ref={box}
        onPointerDown={onPointerDown}
        // Vertical panning has to beat the page's scroll, or dragging the
        // picture down scrolls the page instead on every touch device.
        style={{
          position: 'relative', width: '100%',
          ...(height ? { height } : { aspectRatio: String(ratio) }),
          borderRadius: radius, overflow: 'hidden', background: 'var(--card2)',
          cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none',
          border: '1px solid var(--line2)',
        }}
      >
        <PhotoFrame src={src} fit={fit} alt="Drag to reposition" />

        {!dragging && (
          <span style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
            background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 700,
            pointerEvents: 'none',
          }}>
            <Icon name="hand" size={13} color="#fff" />
            Drag to reposition
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="zoomIn" size={13} color="var(--tx3)" />
        <input
          type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.02} value={fit.zoom}
          aria-label="Zoom"
          onChange={(e) => onChange(setZoom(fit, Number(e.target.value)))}
          style={{ flex: 1, accentColor: 'var(--acc)' }}
        />
        <button
          onClick={() => onChange(CENTRED)}
          className="hov"
          style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid var(--line2)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)', flex: 'none' }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
