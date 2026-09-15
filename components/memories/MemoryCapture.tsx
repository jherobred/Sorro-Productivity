'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { preparePhoto } from '@/lib/preparePhoto';
import { readPhotoFacts } from '@/lib/exif';
import { currentSpot, placeName } from '@/lib/geo';
import { photoPathFor, saveMemory, type Memory } from '@/lib/memories';
import type { MemoryKind } from '@/lib/memoryName';
import { readMeal } from '@/lib/vision';
import './memories.css';

const PlacePicker = dynamic(() => import('./MemoryMap').then((m) => m.PlacePicker), { ssr: false });

export const KIND_LABEL: Record<MemoryKind, string> = { meal: 'Meal', workout: 'Workout', run: 'Run', moment: 'Moment' };
export const KIND_ICON: Record<MemoryKind, IconName> = { meal: 'food', workout: 'gym', run: 'walk', moment: 'star' };
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

export type MealFields = { name: string; slot: string; kcal: number; protein: number; carbs: number; fat: number };
export type CaptureDraft = {
  kind: MemoryKind;
  memoryId: string;
  /** Where the photo will be in storage, for a meal to point at. Null without a photo. */
  photoPath: string | null;
  at: number;
  lat: number | null;
  lng: number | null;
  place: string;
  caption: string;
  meal: MealFields | null;
  km: number | null;
  minutes: number | null;
};

function guessSlot(at: number): string {
  const h = new Date(at).getHours();
  return h < 10 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
}

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/**
 * Keep a memory: a photo, where it happened and what it was.
 *
 * The camera opens straight away. A photo from the gallery brings its own
 * place and time when the file still has them; otherwise the device's location
 * fills in, and both stay editable. For a meal, the photo is also read for its
 * name and nutrition, which land in fields you confirm. `onCommit` makes the
 * meal or workout the memory belongs to and returns its reference.
 */
export function MemoryCapture({ mode, initialKind, initialSlot, kinds, title, onClose, onCommit, onDone, detailsOnly = false }: {
  mode: 'meal' | 'fitness';
  initialKind: MemoryKind;
  /** The meal a new plate starts as, when it was chosen before opening. */
  initialSlot?: string;
  kinds?: MemoryKind[];
  title: string;
  onClose: () => void;
  onCommit: (draft: CaptureDraft) => Promise<string | null> | string | null;
  onDone?: (memory: Memory | null, draft: CaptureDraft) => void;
  /** Start on the details with no photo step, for a run logged on the way home or a meal typed in. */
  detailsOnly?: boolean;
}) {
  const [step, setStep] = useState<'photo' | 'details'>(detailsOnly ? 'details' : 'photo');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [kind, setKind] = useState<MemoryKind>(initialKind);
  const [at, setAt] = useState(() => Date.now());
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState('');
  const [locating, setLocating] = useState<'idle' | 'finding' | 'failed'>('idle');
  const [locationNote, setLocationNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [caption, setCaption] = useState('');
  const [meal, setMeal] = useState<MealFields>(() => ({ name: '', slot: initialSlot ?? guessSlot(Date.now()), kcal: 0, protein: 0, carbs: 0, fat: 0 }));
  const [reading, setReading] = useState<'idle' | 'reading' | 'read' | 'failed'>('idle');
  const [km, setKm] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [camera, setCamera] = useState<'off' | 'opening' | 'on' | 'failed'>('off');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const placeTouched = useRef(false);
  useOverlayBack(true, onClose);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; stopCamera(); };
  }, []);

  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const openCamera = async (nextFacing = facing) => {
    stopCamera();
    setCamera('opening');
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing }, width: { ideal: 1600 }, height: { ideal: 1600 } } });
      if (!alive.current) { next.getTracks().forEach((t) => t.stop()); return; }
      stream.current = next;
      setFacing(nextFacing);
      setCamera('on');
    } catch {
      if (alive.current) setCamera('failed');
    }
  };

  useEffect(() => {
    if (step === 'photo' && camera === 'off') void openCamera();
    if (step !== 'photo') stopCamera();
    // Opening once per visit to the photo step is the point; openCamera is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (camera !== 'on' || !video.current || !stream.current) return;
    video.current.srcObject = stream.current;
    void video.current.play().catch(() => undefined);
  }, [camera]);

  /** Where we are now, and what the place is called, unless you already chose one. */
  const locate = async () => {
    setLocating('finding');
    setLocationNote('');
    try {
      const here = await currentSpot();
      if (!alive.current || placeTouched.current) return;
      setSpot({ lat: here.lat, lng: here.lng });
      setLocating('idle');
      const name = await placeName(here.lat, here.lng);
      if (alive.current && !placeTouched.current && name) setPlace(name);
    } catch (e) {
      if (!alive.current) return;
      setLocating('failed');
      setLocationNote(e instanceof Error ? e.message : 'Your location could not be found.');
    }
  };

  useEffect(() => { void locate(); /* once, on open */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const takeFile = async (file: File | undefined, fromGallery: boolean) => {
    if (!file) return;
    setError('');
    try {
      if (fromGallery && /jpe?g$/i.test(file.type || file.name)) {
        const facts = readPhotoFacts(await file.arrayBuffer());
        if (facts.takenAt) setAt(facts.takenAt);
        if (facts.lat !== null && facts.lng !== null) {
          placeTouched.current = true;
          setSpot({ lat: facts.lat, lng: facts.lng });
          setLocating('idle');
          void placeName(facts.lat, facts.lng).then((name) => { if (alive.current && name) setPlace(name); });
        }
      }
      const prepared = await preparePhoto(file, `memory-${Date.now()}`);
      if (!alive.current) return;
      stopCamera();
      setPhoto(prepared);
      setStep('details');
      if (mode === 'meal') {
        setReading('reading');
        void readMeal(prepared).then(({ result }) => {
          if (!alive.current) return;
          setMeal((m) => ({
            ...m,
            name: m.name || result.name || '',
            kcal: m.kcal || Math.round(result.kcal || 0),
            protein: m.protein || Math.round(result.protein || 0),
            carbs: m.carbs || Math.round(result.carbs || 0),
            fat: m.fat || Math.round(result.fat || 0),
          }));
          setReading('read');
        }).catch(() => { if (alive.current) setReading('failed'); });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That photo could not be opened.');
    }
  };

  const shoot = async () => {
    const view = video.current;
    if (!view?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = view.videoWidth;
    canvas.height = view.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(view, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) await takeFile(new File([blob], 'camera.jpg', { type: 'image/jpeg' }), false);
  };

  const needsName = mode === 'meal' && !meal.name.trim() && !photo;
  const runBad = kind === 'run' && !(Number(km) > 0 || Number(minutes) > 0);

  const save = async () => {
    if (saving) return;
    if (mode === 'meal' && !meal.name.trim() && !meal.kcal && !photo) { setError('Give the meal a name, or take a photo of it.'); return; }
    if (runBad) { setError('Add how far or how long you ran.'); return; }
    setSaving(true);
    setError('');
    try {
      const memoryId = crypto.randomUUID();
      const draft: CaptureDraft = {
        kind, memoryId, photoPath: photo ? await photoPathFor(memoryId).catch(() => null) : null,
        at, lat: spot?.lat ?? null, lng: spot?.lng ?? null, place: place.trim(), caption: caption.trim(),
        meal: mode === 'meal' ? { ...meal, name: meal.name.trim() || 'Meal' } : null,
        km: kind === 'run' && Number(km) > 0 ? Number(km) : null,
        minutes: kind === 'run' && Number(minutes) > 0 ? Number(minutes) : null,
      };
      const ref = await onCommit(draft);
      let memory: Memory | null = null;
      // A memory is a picture or a place. A meal typed in with neither is only a meal.
      if (photo || spot || kind === 'run') {
        memory = await saveMemory({
          id: memoryId, kind, at, lat: draft.lat, lng: draft.lng, place: draft.place, caption: draft.caption || (draft.meal?.name ?? ''),
          ref, km: draft.km, minutes: draft.minutes, route: null,
        }, photo);
      }
      onDone?.(memory, draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;
  const choices = kinds ?? [initialKind];

  return createPortal(
    <div className="mem-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'mem-sheet is-' + step} role="dialog" aria-modal="true" aria-labelledby="mem-capture-title">
        <header className="mem-sheet-head">
          {step === 'details' && !detailsOnly && (
            <button type="button" className="mem-icon" aria-label="Back to the camera" onClick={() => { setPhoto(null); setReading('idle'); setStep('photo'); }}>
              <Icon name="back" size={18} />
            </button>
          )}
          <h2 id="mem-capture-title">{title}</h2>
          <button type="button" className="mem-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden
          onChange={(e) => { void takeFile(e.target.files?.[0], true); e.currentTarget.value = ''; }} />
        <input ref={nativeCamera} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { void takeFile(e.target.files?.[0], false); e.currentTarget.value = ''; }} />

        {step === 'photo' && (
          <>
            <div className="mem-stage">
              {camera === 'on' && (
                <video ref={video} muted playsInline className="mem-video" style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined} />
              )}
              {camera !== 'on' && (
                <div className="mem-stage-empty">
                  <Icon name="camera" size={34} />
                  <p>{camera === 'opening' ? 'Opening your camera…' : 'The live camera is not available here. Use your camera app or pick a photo.'}</p>
                </div>
              )}
              <span className="mem-frame" aria-hidden="true" />
              {locating === 'idle' && place && <span className="mem-stage-place"><Icon name="mapPin" size={13} />{place}</span>}
            </div>
            {error && <p className="mem-error" role="alert">{error}</p>}
            <div className="mem-shutter-row">
              <button type="button" className="mem-round" onClick={() => gallery.current?.click()} aria-label="Pick from your photos"><Icon name="image" size={20} /></button>
              <button type="button" className="mem-shutter" onClick={() => (camera === 'on' ? void shoot() : nativeCamera.current?.click())} aria-label="Take the photo" />
              <button type="button" className="mem-round" disabled={camera !== 'on'} onClick={() => void openCamera(facing === 'environment' ? 'user' : 'environment')} aria-label="Switch camera"><Icon name="refresh" size={20} /></button>
            </div>
            <div className="mem-photo-links">
              {camera !== 'on' && <button type="button" onClick={() => nativeCamera.current?.click()}>Use the camera app</button>}
              <button type="button" onClick={() => { stopCamera(); setStep('details'); }}>{mode === 'meal' ? 'Log without a photo' : 'Continue without a photo'}</button>
            </div>
          </>
        )}

        {step === 'details' && (
          <form className="mem-details" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            {preview ? (
              <div className="mem-preview">
                <img src={preview} alt="The photo you took" />
                {reading === 'reading' && <span className="mem-reading"><Icon name="spark" size={13} />Reading your plate…</span>}
                {reading === 'read' && <span className="mem-reading is-done"><Icon name="check" size={13} />Filled in from the photo. Check the numbers.</span>}
              </div>
            ) : !detailsOnly && (
              <button type="button" className="mem-add-photo" onClick={() => setStep('photo')}><Icon name="camera" size={18} />Add a photo</button>
            )}

            {choices.length > 1 && (
              <div className="mem-kinds" role="radiogroup" aria-label="What is this">
                {choices.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                    <Icon name={KIND_ICON[k]} size={15} />{KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            )}

            {mode === 'meal' && (
              <div className="mem-fields">
                <label className="mem-field is-wide">
                  <span>What you ate</span>
                  <input value={meal.name} onChange={(e) => setMeal({ ...meal, name: e.target.value })} placeholder={reading === 'reading' ? 'Reading the photo…' : 'Chicken adobo and rice'} autoFocus={!photo} />
                </label>
                <div className="mem-chips" role="radiogroup" aria-label="Meal">
                  {SLOTS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={meal.slot === s} onClick={() => setMeal({ ...meal, slot: s })}>{s}</button>
                  ))}
                </div>
                <div className="mem-numbers">
                  {([['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']] as const).map(([key, label, unit]) => (
                    <label key={key} className="mem-field">
                      <span>{label}</span>
                      <span className="mem-unit">
                        <input type="number" inputMode="numeric" min={0} value={meal[key] || ''} placeholder="0"
                          onChange={(e) => setMeal({ ...meal, [key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                        <i>{unit}</i>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {kind === 'run' && (
              <div className="mem-numbers is-two">
                <label className="mem-field">
                  <span>Distance</span>
                  <span className="mem-unit"><input type="number" inputMode="decimal" min={0} step="0.01" value={km} onChange={(e) => setKm(e.target.value)} placeholder="5.0" autoFocus={detailsOnly} /><i>km</i></span>
                </label>
                <label className="mem-field">
                  <span>Time</span>
                  <span className="mem-unit"><input type="number" inputMode="numeric" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" /><i>min</i></span>
                </label>
                {Number(km) > 0 && Number(minutes) > 0 && <p className="mem-pace">{paceText(Number(km), Number(minutes))}</p>}
              </div>
            )}

            <div className="mem-where">
              <div className="mem-where-row">
                <Icon name="mapPin" size={17} />
                <input value={place} onChange={(e) => { placeTouched.current = true; setPlace(e.target.value); }}
                  placeholder={locating === 'finding' ? 'Finding where you are…' : 'Where was this?'} aria-label="Place" />
                <button type="button" onClick={() => setPicking(true)}>{spot ? 'Move pin' : 'Pick on map'}</button>
              </div>
              <p className={'mem-where-note' + (locating === 'failed' ? ' is-warn' : '')}>
                {locating === 'finding' ? 'Using your location…'
                  : locating === 'failed' ? locationNote
                    : spot ? `Pinned at ${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}` : 'No pin yet. This memory will show in the gallery, not on the map.'}
                {locating === 'failed' && <button type="button" onClick={() => { placeTouched.current = false; void locate(); }}>Try again</button>}
              </p>
            </div>

            <label className="mem-field is-wide">
              <span>When</span>
              <input type="datetime-local" value={localInput(at)} max={localInput(Date.now() + 60_000)}
                onChange={(e) => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) { setAt(t); if (mode === 'meal') setMeal((m) => ({ ...m, slot: guessSlot(t) })); } }} />
            </label>

            <label className="mem-field is-wide">
              <span>A few words <em>optional</em></span>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder={mode === 'meal' ? 'With the block after the long exam' : kind === 'run' ? 'Sunset loop around the field' : 'New bench PR'} />
            </label>

            {error && <p className="mem-error" role="alert">{error}</p>}
            <button type="submit" className="mem-save" disabled={saving || needsName}>
              {saving ? 'Saving…' : mode === 'meal' ? 'Log this meal' : kind === 'run' ? 'Save this run' : 'Keep this memory'}
            </button>
          </form>
        )}

        {picking && (
          <PlacePicker
            initial={spot}
            onClose={() => setPicking(false)}
            onPick={(picked) => {
              placeTouched.current = true;
              setSpot({ lat: picked.lat, lng: picked.lng });
              setLocating('idle');
              if (picked.name) setPlace(picked.name);
              else void placeName(picked.lat, picked.lng).then((name) => { if (alive.current && name) setPlace(name); });
              setPicking(false);
            }} />
        )}
      </div>
    </div>,
    document.body,
  );
}

export function paceText(km: number, minutes: number): string {
  const seconds = Math.round((minutes * 60) / km);
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)} per km`;
}
