'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { preparePhoto } from '@/lib/preparePhoto';
import styles from './CoverCapture.module.css';

type Phase = 'choose' | 'camera' | 'review' | 'saving';

/**
 * Take a photo with the camera, or pick one, then keep it.
 *
 * The same dialog, stage and shutter as the notebook cover camera, so the two
 * feel like one tool. It stops every camera track on each way out: closing,
 * choosing a file, switching lenses and unmounting.
 */
export function PhotoCapture({ heading, invitation, confirmLabel, withCaption = false, onClose, onKeep }: {
  heading: string;
  invitation: { title: ReactNode; text: ReactNode };
  confirmLabel: string;
  withCaption?: boolean;
  onClose: () => void;
  onKeep: (photo: File, caption: string) => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [source, setSource] = useState<'camera' | 'file'>('file');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const alive = useRef(true);
  useOverlayBack(true, onClose);

  const stopCamera = () => {
    request.current++;
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
      request.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (phase !== 'camera' || !stream.current || !video.current) return;
    video.current.srcObject = stream.current;
    void video.current.play().catch(() => setError('Tap the camera preview to start it.'));
  }, [phase, cameraPending]);

  async function choose(file?: Blob, name = 'photo', from: 'camera' | 'file' = 'file') {
    if (!file) return;
    setSource(from);
    stopCamera();
    setError('');
    try {
      const prepared = await preparePhoto(file, name);
      if (!alive.current) return;
      setPhoto(prepared);
      setPhase('review');
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : 'That photo could not be opened.'); setPhase('choose'); }
    }
  }

  async function openCamera(nextFacing = facing) {
    stopCamera(); setError(''); setCameraPending(true); setPhase('camera');
    const mine = request.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open a live camera. Use your camera app or choose a photo below.');
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1920 } } });
      if (!alive.current || mine !== request.current) { next.getTracks().forEach((track) => track.stop()); return; }
      stream.current = next;
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      setFacing(nextFacing);
    } catch (e) {
      if (!alive.current || mine !== request.current) return;
      const code = e instanceof DOMException ? e.name : '';
      setError(code === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser settings, or choose a photo.'
        : code === 'NotFoundError' ? 'No camera was found. Choose a photo instead.'
        : e instanceof Error ? e.message : 'Could not open the camera. Choose a photo instead.');
    } finally { if (alive.current && mine === request.current) setCameraPending(false); }
  }

  async function capture() {
    const view = video.current;
    if (!view?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = view.videoWidth; canvas.height = view.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    // The front camera preview is mirrored. The kept photo should not be.
    context.drawImage(view, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) await choose(blob, `camera-${new Date().toISOString().slice(0, 10)}`, 'camera');
  }

  async function keep() {
    if (!photo) return;
    setError(''); setPhase('saving');
    try {
      await onKeep(photo, caption.trim());
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : 'That photo could not be saved.'); setPhase('review'); }
    }
  }

  if (typeof document === 'undefined') return null;
  const reviewing = phase === 'review' || phase === 'saving';

  return createPortal(
    <div className={styles.backdrop} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="photo-capture-title" tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []).filter((el) => el.getClientRects().length);
          const first = items[0], last = items.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className={styles.header}>
          <div><h2 id="photo-capture-title">{heading}</h2></div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close camera"><Icon name="close" size={20} /></button>
        </header>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
          onChange={(event) => { const file = event.target.files?.[0]; void choose(file, file?.name); event.currentTarget.value = ''; }} />
        <input ref={nativeInput} type="file" accept="image/*" capture="environment" hidden
          onChange={(event) => { const file = event.target.files?.[0]; void choose(file, file?.name, 'camera'); event.currentTarget.value = ''; }} />
        <div className={styles.stage} data-mode={reviewing ? 'choose' : phase}>
          {phase === 'choose' && <div className={styles.invitation}><div className={styles.cameraMark}><Icon name="camera" size={38} /></div><h3>{invitation.title}</h3><p>{invitation.text}</p></div>}
          {phase === 'camera' && <>
            <video ref={video} muted playsInline onLoadedData={() => setCameraReady(true)} onClick={() => void video.current?.play()}
              className={styles.video} style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined} />
            <div className={styles.viewfinder} aria-hidden />
            <span className={styles.cameraHint}>{cameraPending ? 'Opening your camera…' : 'Frame the moment you want to keep.'}</span>
          </>}
          {reviewing && preview && (withCaption
            ? <figure className="capture-polaroid">
                <div className="capture-polaroid-window"><img src={preview} alt="The photo you took" /></div>
                <figcaption><input aria-label="Photo description" placeholder="Say what this was…" value={caption} maxLength={140}
                  onChange={(event) => setCaption(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void keep(); }} /></figcaption>
              </figure>
            : <img className={styles.photo} src={preview} alt="The photo you took" />)}
        </div>
        <div className={styles.body}>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {phase === 'choose' && <div className={styles.actions}>
            <button className={styles.primary} onClick={() => void openCamera()}><Icon name="camera" size={18} />Open camera</button>
            <button className={styles.secondary} onClick={() => fileInput.current?.click()}><Icon name="image" size={18} />Choose photo</button>
          </div>}
          {phase === 'camera' && <>
            <div className={styles.actions}>
              <button className={styles.secondary} aria-label="Switch camera" onClick={() => void openCamera(facing === 'environment' ? 'user' : 'environment')} disabled={cameraPending}><Icon name="refresh" size={20} /></button>
              <button className={styles.shutter} aria-label="Take photo" onClick={() => void capture()} disabled={!cameraReady} />
              <button className={styles.secondary} onClick={() => fileInput.current?.click()}>Photos</button>
            </div>
            <button className={styles.textButton} onClick={() => nativeInput.current?.click()}>Use my device’s camera app</button>
          </>}
          {reviewing && <div className={styles.actions}>
            <button className={styles.primary} disabled={phase === 'saving'} onClick={() => void keep()}>{phase === 'saving' ? 'Adding your photo…' : confirmLabel}<Icon name="check" size={17} /></button>
            <button className={styles.secondary} disabled={phase === 'saving'} onClick={() => { setPhoto(null); if (source === 'camera') void openCamera(); else fileInput.current?.click(); }}>{source === 'camera' ? 'Retake' : 'Choose another'}</button>
          </div>}
        </div>
      </div>
    </div>, document.body,
  );
}
