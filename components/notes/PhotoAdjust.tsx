'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { clampPlacement, coverScale, frameFor, outputSize, turned, type Placement, type Size } from '@/lib/cropMath';
import styles from './CoverCapture.module.css';

export type CropShape = { id: string; label: string; aspect: number | null };

/**
 * Crop and adjust a cover photo before it is applied.
 *
 * The frame holds still and the photo moves behind it: drag to move, pinch,
 * scroll or use the slider to zoom, and turn it a quarter at a time. The arrow
 * keys move it and plus and minus zoom, so it works without a pointer too.
 * Nothing is sent anywhere; the crop is drawn on this device.
 */
export function PhotoAdjust({ source, shapes, initialShape, onCancel, onDone }: {
  source: Blob;
  shapes: CropShape[];
  initialShape: string;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('');
  const [image, setImage] = useState<Size | null>(null);
  const [stageSize, setStageSize] = useState<Size>({ w: 0, h: 0 });
  const [shape, setShape] = useState(initialShape);
  const [place, setPlace] = useState<Placement>({ x: 0, y: 0, zoom: 1, turn: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const element = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(source);
    setUrl(next);
    const img = new Image();
    img.onload = () => { element.current = img; setImage({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = next;
    return () => URL.revokeObjectURL(next);
  }, [source]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const current = shapes.find((s) => s.id === shape) ?? shapes[0];
  const aspect = current.aspect ?? (image ? turned(image, place.turn).w / turned(image, place.turn).h : 1);
  const frame = frameFor(stageSize, aspect);
  const ready = !!image && frame.w > 0;
  const scale = ready ? coverScale(image!, frame, place.turn) * place.zoom : 1;
  // Updates go through the previous placement, so several pointer moves between two renders all count.
  const change = (fn: (p: Placement) => Placement) => { if (image) setPlace((p) => clampPlacement(fn(p), image, frame)); };

  // A new shape or turn can leave the photo short of the frame; pull it back in.
  useEffect(() => { if (image && frame.w) setPlace((p) => clampPlacement(p, image, frame)); }, [shape, image, frame.w, frame.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    const img = element.current;
    if (!img || !image) return;
    setBusy(true);
    try {
      const out = outputSize(image, frame, place);
      const canvas = document.createElement('canvas');
      canvas.width = out.w; canvas.height = out.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Photo editing is unavailable in this browser.');
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(out.w / 2, out.h / 2);
      ctx.scale(out.w / frame.w, out.w / frame.w);
      ctx.translate(place.x, place.y);
      ctx.rotate((place.turn * Math.PI) / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -image.w / 2, -image.h / 2, image.w, image.h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) onDone(blob);
    } finally { setBusy(false); }
  };

  const zoomBy = (factor: number) => change((p) => ({ ...p, zoom: p.zoom * factor }));
  const wheel = useRef(zoomBy);
  wheel.current = zoomBy;
  // A native listener, because React's wheel handler cannot stop the dialog scrolling underneath.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); wheel.current(e.deltaY < 0 ? 1.08 : 1 / 1.08); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className={styles.adjust}>
      <div ref={stage} className={styles.adjustStage} tabIndex={0} role="application"
        aria-label="Crop and position the photo. Drag to move it, pinch or scroll to zoom. Arrow keys move it, plus and minus zoom."
        onPointerDown={(e) => {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* The pointer already ended; moves still arrive while it is over the stage. */ }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: place.zoom };
          }
        }}
        onPointerMove={(e) => {
          const last = pointers.current.get(e.pointerId);
          if (!last) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size >= 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const zoom = pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.current.distance));
            change((p) => ({ ...p, zoom }));
          } else {
            const dx = e.clientX - last.x, dy = e.clientY - last.y;
            change((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
          }
        }}
        onPointerUp={(e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; }}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 40 : 10;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const move = moves[e.key];
          if (move) { e.preventDefault(); change((p) => ({ ...p, x: p.x + move[0], y: p.y + move[1] })); }
          if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.1); }
          if (e.key === '-') { e.preventDefault(); zoomBy(1 / 1.1); }
        }}>
        {ready && url && (
          <img src={url} alt="" draggable={false} className={styles.adjustImage}
            style={{ width: image!.w, height: image!.h, marginLeft: -image!.w / 2, marginTop: -image!.h / 2, transform: `translate(${place.x}px, ${place.y}px) rotate(${place.turn * 90}deg) scale(${scale})` }} />
        )}
        {ready && <div className={styles.adjustFrame} style={{ width: frame.w, height: frame.h }} aria-hidden><i /><i /></div>}
        {!ready && <span className={styles.cameraHint}>Opening your photo…</span>}
      </div>
      <div className={styles.adjustTools}>
        <div className={styles.adjustShapes} role="radiogroup" aria-label="Crop shape">
          {shapes.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={shape === s.id} onClick={() => setShape(s.id)}>{s.label}</button>
          ))}
        </div>
        <div className={styles.adjustRow}>
          <button type="button" className={styles.iconButton} aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}><Icon name="zoomOut" size={18} /></button>
          <input type="range" min={1} max={4} step={0.01} value={place.zoom} aria-label="Zoom" onChange={(e) => { const zoom = Number(e.target.value); change((p) => ({ ...p, zoom })); }} />
          <button type="button" className={styles.iconButton} aria-label="Zoom in" onClick={() => zoomBy(1.15)}><Icon name="zoomIn" size={18} /></button>
          <button type="button" className={styles.iconButton} aria-label="Turn a quarter to the right" title="Turn" onClick={() => change((p) => ({ ...p, turn: ((p.turn + 1) % 4) as Placement['turn'], x: 0, y: 0 }))}><Icon name="rotate" size={18} /></button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={!ready || busy} onClick={() => void finish()}><Icon name="check" size={17} />{busy ? 'Cropping…' : 'Use this crop'}</button>
          <button type="button" className={styles.secondary} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
