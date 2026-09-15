'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { makeCutout, prepareCover, type CutoutProgress } from '@/lib/coverProcessing';
import { saveObjectCover, type CoverTarget } from '@/lib/objectCovers';
import { coverArt, COVER_PHOTO_STYLE, COVER_FILL_STYLE } from './NotebookCover';
import { usePrefs } from '@/lib/prefs';
import { PhotoAdjust, type CropShape } from './PhotoAdjust';
import styles from './CoverCapture.module.css';

type Phase = 'choose' | 'camera' | 'photo' | 'processing' | 'adjust' | 'review' | 'applying' | 'done';
const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * The size of the cover this photo is for, measured from the card itself when
 * it is on screen, so the preview and the "Fill the cover" crop match it.
 */
function measureCover(target: CoverTarget): { w: number; h: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-object-cover="${CSS.escape(`${target.kind}:${target.id}`)}"]`);
  const box = el?.getBoundingClientRect();
  return box && box.width > 40 && box.height > 40 ? { w: box.width, h: box.height } : null;
}

export function CoverCapture({ target, onClose, onApplied }: {
  target: CoverTarget; onClose: () => void; onApplied?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [original, setOriginal] = useState<Blob | null>(null);
  const [cutout, setCutout] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<CutoutProgress>({ phase: 'download' });
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [saveState, setSaveState] = useState<'synced' | 'device'>('synced');
  const [returnTo, setReturnTo] = useState<'photo' | 'review'>('photo');
  // Measured once: the card behind the dialog does not change size while it is open.
  const [cover] = useState(() => measureCover(target));
  const { prefs, update: updatePrefs } = usePrefs();
  // Whether the photo sits inside the cover's margin or fills the whole cover, previewed here and saved with the cover.
  const [fill, setFill] = useState(() => target.kind === 'notebook' && !!prefs.coverFill?.[target.id]);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const cameraRequest = useRef(0);
  useOverlayBack(true, onClose);

  const coverAspect = target.kind === 'notebook' ? (cover ? cover.w / cover.h : 1.6) : 1;
  const [phoneWidth] = useState(() => typeof window !== 'undefined' && innerWidth <= 600);
  const shapes: CropShape[] = [
    ...(target.kind === 'notebook' ? [{ id: 'cover', label: 'Fill the cover', aspect: coverAspect }] : []),
    { id: 'square', label: 'Square', aspect: 1 },
    { id: 'portrait', label: 'Portrait', aspect: 3 / 4 },
    { id: 'landscape', label: 'Landscape', aspect: 4 / 3 },
    { id: 'original', label: 'Original', aspect: null },
  ];

  const stopCamera = () => {
    cameraRequest.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraReady(false);
  };
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      alive.current = false;
      cameraRequest.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      operation.current?.abort();
      previous?.focus();
    };
  }, []);
  const shown = cutout ?? original;
  useEffect(() => {
    if (!shown) { setPreview(''); return; }
    const url = URL.createObjectURL(shown);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [shown]);
  useEffect(() => {
    if (phase !== 'camera' || !stream.current || !video.current) return;
    video.current.srcObject = stream.current;
    void video.current.play().catch(() => setError('Tap the camera preview to start it.'));
  }, [phase, cameraPending]);

  async function choose(file?: File) {
    if (!file) return;
    stopCamera();
    setError('');
    try {
      const blob = await prepareCover(file);
      if (!alive.current) return;
      setOriginal(blob); setCutout(null); setPhase('photo');
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not open that photo.'); }
  }

  async function openCamera(nextFacing = facing) {
    stopCamera(); setError(''); setCameraPending(true); setPhase('camera');
    const request = cameraRequest.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open a live camera. Use your camera app or choose a photo below.');
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
      if (!alive.current || request !== cameraRequest.current) { nextStream.getTracks().forEach((track) => track.stop()); return; }
      stream.current = nextStream;
      if (video.current) { video.current.srcObject = nextStream; await video.current.play(); }
      setFacing(nextFacing);
    } catch (e) {
      if (!alive.current || request !== cameraRequest.current) return;
      const name = e instanceof DOMException ? e.name : '';
      setError(name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser settings, or choose a photo.'
        : name === 'NotFoundError' ? 'No camera was found. Choose a photo instead.'
        : e instanceof Error ? e.message : 'Could not open the camera. Choose a photo instead.');
    } finally { if (alive.current && request === cameraRequest.current) setCameraPending(false); }
  }

  async function capture() {
    const view = video.current;
    if (!view?.videoWidth) return;
    // The viewfinder is square and fills it, so the photo is the square in the
    // middle of the frame: exactly what was on screen.
    const size = Math.min(view.videoWidth, view.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.getContext('2d')?.drawImage(view, (view.videoWidth - size) / 2, (view.videoHeight - size) / 2, size, size, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) await choose(new File([blob], 'camera.png', { type: 'image/png' }));
  }

  async function removeBackground() {
    if (!original) return;
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setError(''); setProgress({ phase: 'download' }); setPhase('processing');
    try {
      const blob = await makeCutout(original, (value) => { if (alive.current) setProgress(value); }, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      setCutout(blob); setPhase('review');
    } catch (e) {
      if (!alive.current || controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Could not remove the background.'); setPhase('photo');
    }
  }

  const adjust = (from: 'photo' | 'review') => { setError(''); setReturnTo(from); setPhase('adjust'); };
  const adjusted = (blob: Blob) => {
    // The crop replaces whatever was being shown: the cutout when there is one.
    if (cutout) setCutout(blob); else setOriginal(blob);
    setPhase(returnTo);
  };

  async function apply() {
    if (!shown) return;
    setError(''); setPhase('applying');
    try {
      const saved = await saveObjectCover(target, shown);
      if (target.kind === 'notebook') {
        const next = { ...(prefs.coverFill ?? {}) };
        if (fill) next[target.id] = true; else delete next[target.id];
        void updatePrefs({ coverFill: next });
      }
      onApplied?.();
      if (!alive.current) return;
      setSaveState(saved); setPhase('done');
      // The actual library card receives the image. Where it is visible, show
      // the object travelling to that exact card rather than an invented one.
      requestAnimationFrame(() => {
        if (!alive.current || document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const source = photo.current;
        const destination = document.querySelector(`[data-object-cover="${CSS.escape(`${target.kind}:${target.id}`)}"]`);
        if (!source || !destination) return;
        const from = source.getBoundingClientRect(), to = destination.getBoundingClientRect();
        if (to.width < 20 || to.bottom < 0 || to.top > innerHeight) return;
        const flying = source.cloneNode(true) as HTMLImageElement;
        Object.assign(flying.style, { position: 'fixed', zIndex: '10010', inset: 'auto', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, objectFit: 'contain', pointerEvents: 'none' });
        document.body.append(flying);
        const animation = flying.animate([
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(${Math.min(to.width / from.width, to.height / from.height) * .78})`, opacity: 0 },
        ], { duration: 720, easing: 'cubic-bezier(.2,.8,.2,1)' });
        animation.onfinish = () => flying.remove();
        animation.oncancel = () => flying.remove();
      });
    } catch { if (alive.current) { setError('Your cover could not be saved on this device. Free some storage and try again.'); setPhase(cutout ? 'review' : 'photo'); } }
  }

  const processing = phase === 'processing';
  const reviewing = phase === 'review' || phase === 'applying' || phase === 'done';
  const percent = progress.total ? Math.round((progress.loaded ?? 0) / progress.total * 100) : null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.backdrop} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cover-capture-title" tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
          const first = items[0], last = items.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className={styles.header}>
          <div><h2 id="cover-capture-title">{phase === 'done' ? 'Your cover is ready.' : phase === 'adjust' ? 'Crop and adjust.' : target.kind === 'notebook' ? 'Make this notebook yours.' : 'Give this task a cover.'}</h2></div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close cover camera"><Icon name="close" size={20} /></button>
        </header>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        <input ref={nativeInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.currentTarget.value = ''; }} />

        {phase === 'adjust' && shown ? (
          <PhotoAdjust source={shown} shapes={shapes} initialShape={target.kind === 'notebook' ? 'cover' : 'square'}
            onCancel={() => setPhase(returnTo)} onDone={adjusted} />
        ) : <>
          {reviewing ? (
            // The same shape as the card it goes on, with the photo placed the way the card places it.
            <div className={styles.coverPreview} style={{ aspectRatio: String(coverAspect), width: `min(calc(100% - ${phoneWidth ? 40 : 52}px), calc(min(52dvh, 480px) * ${coverAspect}))` }}>
              <div className={styles.coverArt} style={{ background: coverArt(target.id, target.color) }}>
                {preview && <img ref={photo} src={preview} alt={cutout ? 'Your photo with the background removed' : 'Your selected cover photo'} style={fill ? COVER_FILL_STYLE : COVER_PHOTO_STYLE} />}
              </div>
              {phase === 'done' && <span className={styles.savedBadge}><Icon name="check" size={14} />On your {target.kind === 'notebook' ? 'library shelf' : 'task'}</span>}
            </div>
          ) : (
            <div className={styles.stage} data-mode={phase}>
              {phase === 'choose' && <div className={styles.invitation}><div className={styles.cameraMark}><Icon name="camera" size={38} /></div><h3>A favourite object.<br />A familiar cover.</h3><p>Photograph something you love, then put it on <strong>{target.title}</strong>.</p></div>}
              {phase === 'camera' && <><video ref={video} muted playsInline onLoadedData={() => setCameraReady(true)} onClick={() => void video.current?.play()} className={styles.video} /><div className={styles.viewfinder} aria-hidden /><span className={styles.cameraHint}>{cameraPending ? 'Opening your camera…' : 'One object. A little space around it.'}</span></>}
              {preview && phase !== 'camera' && phase !== 'choose' && <img ref={photo} className={styles.photo} src={preview} alt={cutout ? 'Your photo with the background removed' : 'Your selected cover photo'} />}
              {processing && <div className={styles.scan} aria-hidden />}
            </div>
          )}
          {reviewing && <p className={styles.coverTitle}><span>{target.kind === 'notebook' ? 'My notebook' : 'My task'}</span><strong>{target.title}</strong></p>}
          <div className={styles.body}>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {phase === 'choose' && <><div className={styles.actions}><button className={styles.primary} onClick={() => void openCamera()}><Icon name="camera" size={18} />Open camera</button><button className={styles.secondary} onClick={() => fileInput.current?.click()}><Icon name="image" size={18} />Choose photo</button></div><p className={styles.caption}>Your photo stays on your device while you edit. Only the cover you apply syncs to your account.</p></>}
            {phase === 'camera' && <><div className={styles.actions}><button className={styles.secondary} aria-label="Switch camera" onClick={() => void openCamera(facing === 'environment' ? 'user' : 'environment')} disabled={cameraPending}><Icon name="refresh" size={20} /></button><button className={styles.shutter} aria-label="Take photo" onClick={() => void capture()} disabled={!cameraReady} /><button className={styles.secondary} onClick={() => fileInput.current?.click()}>Photos</button></div><button className={styles.textButton} onClick={() => nativeInput.current?.click()}>Use my device’s camera app</button></>}
            {phase === 'photo' && <><div className={styles.actions}><button className={styles.primary} onClick={() => void removeBackground()}>Remove background</button><button className={styles.secondary} onClick={() => setPhase('review')}>Keep full photo</button><button className={styles.secondary} onClick={() => adjust('photo')}><Icon name="crop" size={17} />Crop</button></div><p className={styles.caption}>Free processing on your device. First use downloads about 220 MB of AI tools, then reuses the browser cache. A cutout can take a minute on a phone. Wi-Fi recommended.</p><button className={styles.textButton} onClick={() => fileInput.current?.click()}>Choose another photo</button></>}
            {processing && <div className={styles.progress} role="status" aria-live="polite"><strong>{progress.phase === 'download' ? 'Getting the cutout tools…' : 'Finding the edges of your object…'}</strong><p>{progress.phase === 'download' ? progress.total ? `${mb(progress.loaded ?? 0)} of ${mb(progress.total)}` : 'Checking the model cache and connection' : 'Working on your device. Your photo is not sent to an AI service.'}</p><div className={styles.progressTrack} role="progressbar" aria-label="Background removal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.phase === 'download' && percent !== null ? percent : undefined}><span style={{ width: percent !== null && progress.phase === 'download' ? `${percent}%` : '35%' }} className={progress.phase === 'processing' || percent === null ? styles.indeterminate : undefined} /></div><button className={styles.textButton} onClick={() => { operation.current?.abort(); setPhase('photo'); }}>Cancel processing</button></div>}
            {phase === 'review' && <><p className={styles.reviewCopy}>Here’s how it will look on <strong>{target.title}</strong>.</p>{target.kind === 'notebook' && <div className={styles.fitChoice} role="radiogroup" aria-label="How the photo sits on the cover"><button type="button" role="radio" aria-checked={!fill} onClick={() => setFill(false)}>Inside a margin</button><button type="button" role="radio" aria-checked={fill} onClick={() => setFill(true)}>Fill the whole cover</button></div>}<div className={styles.actions}><button className={styles.primary} onClick={() => void apply()}>Apply to {target.kind}<Icon name="arrowRight" size={17} /></button><button className={styles.secondary} onClick={() => adjust('review')}><Icon name="crop" size={17} />Crop</button><button className={styles.secondary} onClick={() => { setCutout(null); setPhase('photo'); }}>Try again</button></div></>}
            {phase === 'applying' && <p className={styles.reviewCopy} role="status">Saving your cover…</p>}
            {phase === 'done' && <><p className={styles.reviewCopy} role="status">{saveState === 'synced' ? 'Saved and ready on your other devices.' : 'Saved on this device. It will sync when you’re connected and signed in.'}</p><button className={styles.primary} onClick={onClose}>Done<Icon name="check" size={17} /></button></>}
          </div>
        </>}
      </div>
    </div>, document.body,
  );
}
