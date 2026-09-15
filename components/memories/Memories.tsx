'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { editMemory, removeMemory, restoreMemory, useMemories, useMemoryPhoto, useMemoryPhotos, type Memory } from '@/lib/memories';
import type { MemoryKind } from '@/lib/memoryName';
import { KIND_ICON, KIND_LABEL, paceText } from './MemoryCapture';
import './memories.css';

const MemoryMap = dynamic(() => import('./MemoryMap').then((m) => m.MemoryMap), { ssr: false, loading: () => <div className="mem-map is-loading" /> });
const MiniMap = dynamic(() => import('./MemoryMap').then((m) => m.MiniMap), { ssr: false });
const PlacePicker = dynamic(() => import('./MemoryMap').then((m) => m.PlacePicker), { ssr: false });

const PLURAL: Record<MemoryKind, string> = { meal: 'Meals', workout: 'Workouts', run: 'Runs', moment: 'Moments' };

function whenText(at: number, time24: boolean) {
  const d = new Date(at);
  const today = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });
  if (days === 0) return `Today, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })}, ${time}`;
}

/**
 * Memories for one tracker: a map of where they happened and a gallery of
 * the photos, the same set either way, filtered by kind. Tapping any of them
 * opens it full screen.
 */
export function MemoriesPanel({ kinds, title = 'Memories', onCapture, captureLabel = 'Capture', describe, empty }: {
  kinds: MemoryKind[];
  title?: string;
  onCapture: () => void;
  captureLabel?: string;
  /** What a memory is linked to, in words, like "Chicken adobo · 620 kcal". */
  describe?: (m: Memory) => string | null;
  empty: string;
}) {
  const { list } = useMemories(kinds);
  const [view, setView] = useState<'map' | 'gallery'>('gallery');
  const [filter, setFilter] = useState<MemoryKind | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = useMemo(() => (filter === 'all' ? list : list.filter((m) => m.kind === filter)), [list, filter]);
  const placed = shown.filter((m) => m.lat !== null).length;
  const places = new Set(shown.map((m) => m.place).filter(Boolean)).size;

  return (
    <section className="mem-panel" aria-label={title}>
      <header className="mem-panel-head">
        <div>
          <h2>{title}</h2>
          <p>{list.length ? `${shown.length} ${shown.length === 1 ? 'memory' : 'memories'}${places ? ` · ${places} ${places === 1 ? 'place' : 'places'}` : ''}${placed < shown.length ? ` · ${shown.length - placed} without a pin` : ''}` : 'Your photos, and a map of where each one was taken.'}</p>
        </div>
        <div className="mem-seg" role="tablist" aria-label="Show memories as">
          <button type="button" role="tab" aria-selected={view === 'gallery'} onClick={() => setView('gallery')}><Icon name="grid" size={15} />Gallery</button>
          <button type="button" role="tab" aria-selected={view === 'map'} onClick={() => setView('map')}><Icon name="mapPin" size={15} />Map</button>
        </div>
        <button type="button" className="mem-capture" onClick={onCapture}><Icon name="camera" size={16} />{captureLabel}</button>
      </header>

      {kinds.length > 1 && list.length > 0 && (
        <div className="mem-filters" role="radiogroup" aria-label="Kind">
          <button type="button" role="radio" aria-checked={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          {kinds.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}>
              <Icon name={KIND_ICON[k]} size={13} />{PLURAL[k]}<b>{list.filter((m) => m.kind === k).length}</b>
            </button>
          ))}
        </div>
      )}

      {view === 'map'
        ? <MemoryMap memories={shown} onOpen={(m) => setOpenId(m.id)} />
        : <MemoryGallery memories={shown} onOpen={(m) => setOpenId(m.id)} onCapture={onCapture} emptyText={empty} />}

      {openId && (
        <MemoryViewer memories={shown} id={openId} onChange={setOpenId} onClose={() => setOpenId(null)} describe={describe} />
      )}
    </section>
  );
}

export function MemoryGallery({ memories, onOpen, onCapture, emptyText }: {
  memories: Memory[];
  onOpen: (m: Memory) => void;
  onCapture: () => void;
  emptyText: string;
}) {
  const photos = useMemoryPhotos(memories);
  const months = useMemo(() => {
    const groups: { label: string; items: Memory[] }[] = [];
    for (const m of memories) {
      const label = new Date(m.at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
    return groups;
  }, [memories]);

  if (!memories.length) {
    return (
      <button type="button" className="mem-empty" onClick={onCapture}>
        <span><Icon name="camera" size={26} /></span>
        <b>{emptyText}</b>
        <small>Take a photo and it lands here, and on the map where it happened.</small>
      </button>
    );
  }

  return (
    <div className="mem-gallery">
      {months.map((month) => (
        <div key={month.label} className="mem-month">
          <h3>{month.label}<span>{month.items.length}</span></h3>
          <div className="mem-grid">
            {month.items.map((m) => (
              <button key={m.id} type="button" className={'mem-tile is-' + m.kind + (photos[m.id] ? '' : ' is-bare')} onClick={() => onOpen(m)}
                aria-label={`${KIND_LABEL[m.kind]}${m.place ? ` at ${m.place}` : ''}, ${new Date(m.at).toLocaleDateString()}`}>
                {photos[m.id] ? <img src={photos[m.id]} alt="" loading="lazy" /> : (
                  <span className="mem-tile-bare">
                    <Icon name={KIND_ICON[m.kind]} size={22} />
                    {m.km !== null && <b>{m.km} km</b>}
                  </span>
                )}
                <span className="mem-tile-kind" aria-hidden="true"><Icon name={KIND_ICON[m.kind]} size={11} /></span>
                <span className="mem-tile-foot">
                  <b>{m.caption || m.place || KIND_LABEL[m.kind]}</b>
                  <small>{new Date(m.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{m.place && m.caption ? ` · ${m.place}` : ''}</small>
                </span>
                {m.pending && <span className="mem-tile-sync" title="Waiting to sync" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One memory, full screen, with where and when, and a step to the next one. */
export function MemoryViewer({ memories, id, onChange, onClose, describe }: {
  memories: Memory[];
  id: string;
  onChange: (id: string) => void;
  onClose: () => void;
  describe?: (m: Memory) => string | null;
}) {
  const index = memories.findIndex((m) => m.id === id);
  const memory = memories[index] ?? null;
  const photo = useMemoryPhoto(memory);
  const { prefs } = usePrefs();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [picking, setPicking] = useState(false);
  const touch = useRef<number | null>(null);
  useOverlayBack(true, onClose);

  useEffect(() => { setEditing(false); setCaption(memory?.caption ?? ''); setPlace(memory?.place ?? ''); }, [memory?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (by: number) => {
    const next = memories[index + by];
    if (next) onChange(next.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => { if (!memory) onClose(); }, [memory, onClose]);
  if (!memory || typeof document === 'undefined') return null;

  const linked = describe?.(memory) ?? null;
  const remove = () => {
    const was = memory.id;
    const nextId = memories[index + 1]?.id ?? memories[index - 1]?.id ?? null;
    void removeMemory(was);
    toast('Memory deleted', () => void restoreMemory(was), { tone: 'danger' });
    if (nextId) onChange(nextId); else onClose();
  };

  return createPortal(
    <div className="mem-viewer" role="dialog" aria-modal="true" aria-label="Memory"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
      }}>
      <div className="mem-viewer-top">
        <button type="button" className="mem-icon is-dark" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
        <span className={'mem-kind-chip is-' + memory.kind}><Icon name={KIND_ICON[memory.kind]} size={13} />{KIND_LABEL[memory.kind]}</span>
        <span className="mem-viewer-count">{index + 1} of {memories.length}</span>
        <button type="button" className="mem-icon is-dark" aria-label={editing ? 'Stop editing' : 'Edit'} onClick={() => setEditing((v) => !v)}><Icon name={editing ? 'check' : 'edit'} size={18} /></button>
        <button type="button" className="mem-icon is-dark" aria-label="Delete this memory" onClick={remove}><Icon name="trash" size={18} /></button>
      </div>

      <div className="mem-viewer-stage">
        {memory.photo
          ? (photo ? <img src={photo} alt={memory.caption || memory.place || KIND_LABEL[memory.kind]} /> : <span className="mem-viewer-loading">Loading the photo…</span>)
          : <span className="mem-viewer-bare"><Icon name={KIND_ICON[memory.kind]} size={46} />{memory.km !== null && <b>{memory.km} km</b>}</span>}
        {index > 0 && <button type="button" className="mem-step is-prev" aria-label="Previous memory" onClick={() => step(-1)}><Icon name="chevronLeft" size={22} /></button>}
        {index < memories.length - 1 && <button type="button" className="mem-step is-next" aria-label="Next memory" onClick={() => step(1)}><Icon name="chevronRight" size={22} /></button>}
      </div>

      <div className="mem-viewer-info">
        {editing ? (
          <div className="mem-viewer-edit">
            <label className="mem-field is-wide"><span>Caption</span>
              <input value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} autoFocus /></label>
            <label className="mem-field is-wide"><span>Place</span>
              <span className="mem-where-row is-flat">
                <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where was this?" />
                <button type="button" onClick={() => setPicking(true)}>{memory.lat !== null ? 'Move pin' : 'Add pin'}</button>
              </span>
            </label>
            <button type="button" className="mem-save" onClick={() => { void editMemory(memory.id, { caption: caption.trim(), place: place.trim() }); setEditing(false); toast('Memory updated', undefined, { tone: 'success', icon: 'check' }); }}>Save changes</button>
          </div>
        ) : (
          <>
            {memory.caption && <p className="mem-viewer-caption">{memory.caption}</p>}
            <p className="mem-viewer-line"><Icon name="clock" size={14} />{whenText(memory.at, prefs.time24)}</p>
            {memory.place && <p className="mem-viewer-line"><Icon name="mapPin" size={14} />{memory.place}</p>}
            {linked && <p className="mem-viewer-line"><Icon name={KIND_ICON[memory.kind]} size={14} />{linked}</p>}
            {(memory.km !== null || memory.minutes !== null) && (
              <p className="mem-viewer-stats">
                {memory.km !== null && <span><b>{memory.km}</b> km</span>}
                {memory.minutes !== null && <span><b>{memory.minutes}</b> min</span>}
                {memory.km !== null && memory.minutes !== null && memory.km > 0 && <span><b>{paceText(memory.km, memory.minutes).replace(' per km', '')}</b> /km</span>}
              </p>
            )}
          </>
        )}
        {memory.lat !== null && memory.lng !== null && !editing && (
          <div className="mem-viewer-map">
            <MiniMap lat={memory.lat} lng={memory.lng} kind={memory.kind} />
            <a href={`https://www.google.com/maps/search/?api=1&query=${memory.lat},${memory.lng}`} target="_blank" rel="noopener noreferrer"><Icon name="mapPin" size={13} />Open in Maps</a>
          </div>
        )}
      </div>

      {picking && (
        <PlacePicker initial={memory.lat !== null && memory.lng !== null ? { lat: memory.lat, lng: memory.lng } : null}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            void editMemory(memory.id, { lat: p.lat, lng: p.lng, ...(p.name ? { place: p.name } : {}) });
            if (p.name) setPlace(p.name);
            setPicking(false);
            toast('Pin moved', undefined, { icon: 'mapPin' });
          }} />
      )}
    </div>,
    document.body,
  );
}
