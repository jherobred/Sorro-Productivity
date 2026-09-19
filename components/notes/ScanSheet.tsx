'use client';

/**
 * The scanner: a photo of a whiteboard or a notebook page, turned into a note.
 *
 * Take or choose a photo, drag its four corners onto the page's corners, pick
 * how it should look, and the writing is read off it on the device. The text
 * comes back to check and correct before it is kept, with the cleaned-up scan
 * alongside it if you want the original too.
 */

import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { readText } from '@/lib/ocr';
import { blackWhite, magicColour, pageSize, rotateRight, warpQuad, type Pixels, type Pt } from '@/lib/scanImage';

type Look = 'colour' | 'bw' | 'original';
const LOOKS: { id: Look; label: string }[] = [
  { id: 'colour', label: 'Magic colour' },
  { id: 'bw', label: 'Black & white' },
  { id: 'original', label: 'Original' },
];
const MAX_SIDE = 2400;

export type ScanResult = { text: string; image: File | null };

async function pixelsOf(file: File): Promise<Pixels> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('This device could not open the photo.'); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: img.width, height: img.height, data: img.data };
}

function toCanvas(p: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.width; canvas.height = p.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return canvas;
}

const inset = (p: Pixels): Pt[] => {
  const dx = p.width * 0.03, dy = p.height * 0.03;
  return [{ x: dx, y: dy }, { x: p.width - dx, y: dy }, { x: p.width - dx, y: p.height - dy }, { x: dx, y: p.height - dy }];
};

export function ScanSheet({ onClose, onDone, doneLabel }: {
  onClose: () => void;
  onDone: (result: ScanResult) => void | Promise<void>;
  /** What keeping it does here: "Add to this page", "Make a page from it". */
  doneLabel: string;
}) {
  useOverlayBack(true, onClose);
  const [stage, setStage] = useState<'pick' | 'adjust' | 'reading' | 'review'>('pick');
  const [photo, setPhoto] = useState<Pixels | null>(null);
  const [corners, setCorners] = useState<Pt[]>([]);
  const [look, setLook] = useState<Look>('colour');
  const [progress, setProgress] = useState({ share: 0, label: '' });
  const [text, setText] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [scanUrl, setScanUrl] = useState('');
  const scan = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  // The photo as something an <img> can show, for dragging the corners over.
  useEffect(() => {
    if (!photo) return;
    let url = '';
    toCanvas(photo).toBlob((b) => { if (b) { url = URL.createObjectURL(b); setPreviewUrl(url); } }, 'image/jpeg', 0.82);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);
  useEffect(() => () => { if (scanUrl) URL.revokeObjectURL(scanUrl); }, [scanUrl]);

  const open = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('Choose a photo.');
      const p = await pixelsOf(file);
      setPhoto(p); setCorners(inset(p)); setStage('adjust');
    } catch (e) { setError(e instanceof Error ? e.message : 'That photo could not be opened.'); }
  };

  const turn = () => {
    if (!photo) return;
    // A quarter turn right carries each corner round with it, so the old bottom left becomes the new top left.
    const moved = corners.map((c) => ({ x: photo.height - c.y, y: c.x }));
    setCorners([moved[3], moved[0], moved[1], moved[2]]);
    setPhoto(rotateRight(photo));
  };

  /** Drag a corner: the pointer over the photo, in the photo's own pixels. */
  const drag = (index: number) => (e: PE) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const move = (m: PointerEvent) => {
      const r = frame.current?.getBoundingClientRect();
      if (!r || !photo) return;
      const x = Math.max(0, Math.min(photo.width, (m.clientX - r.left) / r.width * photo.width));
      const y = Math.max(0, Math.min(photo.height, (m.clientY - r.top) / r.height * photo.height));
      setCorners((cs) => cs.map((c, i) => (i === index ? { x, y } : c)));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const read = async () => {
    if (!photo) return;
    setStage('reading'); setError(''); setProgress({ share: 0, label: 'Straightening the page…' });
    try {
      // Let the progress show before the pixel work takes the thread.
      await new Promise((r) => setTimeout(r, 30));
      const size = pageSize(corners);
      const flat = warpQuad(photo, corners, size.width, size.height);
      const bw = blackWhite(flat);
      const shown = look === 'bw' ? bw : look === 'colour' ? magicColour(flat) : flat;
      scan.current = toCanvas(shown);
      scan.current.toBlob((b) => { if (b) setScanUrl(URL.createObjectURL(b)); }, 'image/webp', 0.86);
      // The reader always gets the black-and-white page: shadows are what it misreads.
      const words = await readText(toCanvas(bw), (share, label) => setProgress({ share, label }));
      setText(words);
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The writing could not be read.');
      setStage('adjust');
    }
  };

  const finish = async () => {
    setSaving(true); setError('');
    try {
      let image: File | null = null;
      if (keep && scan.current) {
        const blob = await new Promise<Blob | null>((r) => scan.current!.toBlob(r, 'image/webp', 0.86));
        if (blob) image = new File([blob], `Scan ${new Date().toISOString().slice(0, 10)}.webp`, { type: 'image/webp' });
      }
      await onDone({ text: text.trim(), image });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The scan could not be kept.');
    } finally { setSaving(false); }
  };

  if (typeof document === 'undefined') return null;
  const quad = corners.map((c) => `${c.x},${c.y}`).join(' ');
  return createPortal(
    <div className="scan-scrim" role="dialog" aria-modal="true" aria-label="Scan a page">
      <div className="scan-sheet">
        <header className="scan-head">
          <h2>{stage === 'review' ? 'Check what it read' : 'Scan writing'}</h2>
          <button type="button" className="scan-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        {stage === 'pick' && (
          <div className="scan-pick">
            <p>Photograph a whiteboard or a page of your notebook. The writing becomes text you can edit, and the page a clean scan.</p>
            <button type="button" className="scan-big" onClick={() => camera.current?.click()}><Icon name="camera" size={22} /><span><b>Take a photo</b><small>Hold the camera square to the page, in good light</small></span></button>
            <button type="button" className="scan-big" onClick={() => library.current?.click()}><Icon name="photo" size={22} /><span><b>Choose a photo</b><small>One you already took</small></span></button>
            <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={library} hidden type="file" accept="image/*" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        )}

        {stage === 'adjust' && photo && (
          <div className="scan-adjust">
            <p className="scan-hint">Drag the four corners onto the corners of the page.</p>
            <div className="scan-frame" ref={frame} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
              {previewUrl && <img src={previewUrl} alt="Your photo" draggable={false} />}
              <svg viewBox={`0 0 ${photo.width} ${photo.height}`} preserveAspectRatio="none" aria-hidden="true">
                <polygon points={quad} className="scan-quad" />
              </svg>
              {corners.map((c, i) => (
                <button key={i} type="button" className="scan-corner" aria-label={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' corner'}
                  style={{ left: `${(c.x / photo.width) * 100}%`, top: `${(c.y / photo.height) * 100}%` }} onPointerDown={drag(i)} />
              ))}
            </div>
            <div className="scan-controls">
              <div className="scan-looks" role="radiogroup" aria-label="How the scan looks">
                {LOOKS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={look === l.id} onClick={() => setLook(l.id)}>{l.label}</button>)}
              </div>
              <button type="button" className="scan-ghost" onClick={turn}><Icon name="rotate" size={16} />Turn</button>
              <button type="button" className="scan-ghost" onClick={() => setCorners(inset(photo))}><Icon name="crop" size={16} />Whole photo</button>
            </div>
            <div className="scan-actions">
              <button type="button" className="scan-ghost" onClick={() => { setPhoto(null); setStage('pick'); }}>Another photo</button>
              <button type="button" className="studio-button primary" onClick={() => void read()}><Icon name="text" size={17} />Read the writing</button>
            </div>
          </div>
        )}

        {stage === 'reading' && (
          <div className="scan-reading" role="status">
            <b>{progress.label}</b>
            <div className="scan-bar"><i style={{ width: `${Math.round(progress.share * 100)}%` }} /></div>
            <small>This runs on your device. The first scan also downloads the reader, about 4 MB.</small>
          </div>
        )}

        {stage === 'review' && (
          <div className="scan-review">
            {scanUrl && <img className="scan-result" src={scanUrl} alt="The cleaned-up scan" />}
            <label className="scan-text">
              <span>Text <em>{text ? 'edit anything it misread' : 'nothing was read, type it in or keep just the scan'}</em></span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Nothing was read from this page." />
            </label>
            <label className="scan-keep"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep the scan with the text</label>
            <div className="scan-actions">
              <button type="button" className="scan-ghost" onClick={() => setStage('adjust')}>Back to the photo</button>
              <button type="button" className="studio-button primary" disabled={saving || (!text.trim() && !keep)} onClick={() => void finish()}><Icon name="check" size={17} />{saving ? 'Saving…' : doneLabel}</button>
            </div>
          </div>
        )}

        {error && <p className="scan-error" role="alert">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
