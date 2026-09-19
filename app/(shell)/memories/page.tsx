'use client';

/**
 * Memories, all together: every photo kept from Fuel and Fitness and every
 * moment captured here, on one map of where they happened and one wall of
 * polaroids by month. Tapping a pin or a polaroid opens it full screen.
 */

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { MemoryGallery, MemoryViewer } from '@/components/memories/Memories';
import { KIND_ICON } from '@/components/memories/MemoryCapture';
import type { CaptureDraft } from '@/components/memories/MemoryCapture';
import { toast } from '@/lib/toast';
import { useMemories } from '@/lib/memories';
import type { MemoryKind } from '@/lib/memoryName';
import '@/components/memories/memories.css';

const MemoryMap = dynamic(() => import('@/components/memories/MemoryMap').then((m) => m.MemoryMap), { ssr: false, loading: () => <div className="mem-map is-loading" /> });
const MemoryCapture = dynamic(() => import('@/components/memories/MemoryCapture').then((m) => m.MemoryCapture), { ssr: false });

const KINDS: { id: MemoryKind; label: string }[] = [
  { id: 'moment', label: 'Moments' },
  { id: 'meal', label: 'Meals' },
  { id: 'workout', label: 'Workouts' },
  { id: 'run', label: 'Runs' },
];

export default function MemoriesPage() {
  const { list, ready } = useMemories();
  const [filter, setFilter] = useState<MemoryKind | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const shown = useMemo(() => (filter === 'all' ? list : list.filter((m) => m.kind === filter)), [list, filter]);
  const places = useMemo(() => new Set(shown.map((m) => m.place).filter(Boolean)).size, [shown]);
  const pinned = shown.filter((m) => m.lat !== null).length;
  const since = list.length ? new Date(Math.min(...list.map((m) => m.at))) : null;

  const commit = (d: CaptureDraft) => {
    toast(d.place ? `Kept, at ${d.place}` : 'Memory kept', undefined, { tone: 'success', icon: 'camera' });
    return null;
  };

  return (
    <div className="mem-page">
      <header className="mem-page-head">
        <div>
          <h1 className="section-title">Memories</h1>
          <p>
            {list.length
              ? `${shown.length} ${shown.length === 1 ? 'memory' : 'memories'}${places ? ` · ${places} ${places === 1 ? 'place' : 'places'}` : ''}${since ? ` · since ${since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : ''}`
              : 'Your meals, workouts, runs and moments, on a map of where they happened and a wall of polaroids.'}
          </p>
        </div>
        <button type="button" className="mem-capture" onClick={() => setCapturing(true)}><Icon name="camera" size={16} />Capture a moment</button>
      </header>

      {list.length > 0 && (
        <div className="mem-filters" role="radiogroup" aria-label="Show">
          <button type="button" role="radio" aria-checked={filter === 'all'} onClick={() => setFilter('all')}>All<b>{list.length}</b></button>
          {KINDS.map((k) => {
            const n = list.filter((m) => m.kind === k.id).length;
            return n ? (
              <button key={k.id} type="button" role="radio" aria-checked={filter === k.id} onClick={() => setFilter(k.id)}>
                <Icon name={KIND_ICON[k.id]} size={13} />{k.label}<b>{n}</b>
              </button>
            ) : null;
          })}
        </div>
      )}

      <section className="mem-page-map" aria-label="Where they happened">
        <h2><Icon name="mapPin" size={15} />Where{pinned < shown.length && <small>{shown.length - pinned} without a pin</small>}</h2>
        <MemoryMap memories={shown} onOpen={(m) => setOpenId(m.id)} />
      </section>

      <section className="mem-page-wall" aria-label="Polaroids">
        <h2><Icon name="photo" size={15} />Polaroids</h2>
        {ready || list.length
          ? <MemoryGallery memories={shown} onOpen={(m) => setOpenId(m.id)} onCapture={() => setCapturing(true)} emptyText="Nothing kept yet" polaroid />
          : <p className="mem-page-wait">Loading your memories…</p>}
      </section>

      {openId && <MemoryViewer memories={shown} id={openId} onChange={setOpenId} onClose={() => setOpenId(null)} />}
      {capturing && (
        <MemoryCapture mode="fitness" initialKind="moment" kinds={['moment']} title="Capture a moment"
          onClose={() => setCapturing(false)} onCommit={commit} />
      )}
    </div>
  );
}
