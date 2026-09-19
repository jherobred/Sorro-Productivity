'use client';

/**
 * The photos inside a task, in the task panel: the cover first when there is
 * one, then every photo added to the task, each opening full screen to zoom.
 */

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { useObjectCover } from '@/lib/objectCovers';
import { useSignedUrls } from '@/lib/uploads';
import { useTaskPhotoActions, useTaskPhotos } from '@/lib/taskPhotos';
import type { ZoomPhoto } from '@/components/PhotoZoom';

const PhotoZoom = dynamic(() => import('@/components/PhotoZoom').then((m) => m.PhotoZoom), { ssr: false });

export function TaskPhotos({ taskId }: { taskId: string }) {
  const { data: photos = [], isError } = useTaskPhotos(taskId);
  const actions = useTaskPhotoActions(taskId);
  const urls = useSignedUrls('bd-files', photos.map((p) => p.path));
  const cover = useObjectCover('task', taskId);
  const [zoom, setZoom] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const all: ZoomPhoto[] = [
    ...(cover.url ? [{ src: cover.url, alt: 'Cover photo', removable: false }] : []),
    ...photos.map((p, i) => ({ src: urls[i], alt: `Photo ${i + 1} of this task` })),
  ];
  const lead = cover.url ? 1 : 0;

  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(files.length === 1 ? 'Adding the photo…' : `Adding ${files.length} photos…`);
    try { await actions.add(files); }
    catch (e) { toast(e instanceof Error ? e.message : 'The photos could not be added.'); }
    finally { setBusy(''); }
  };
  const remove = async (index: number) => {
    const photo = photos[index - lead];
    if (!photo) return;
    if (!await confirmAsk('Delete this photo?', { message: 'It is taken out of the task for good.', confirmLabel: 'Delete', danger: true })) return;
    try {
      await actions.remove(photo);
      if (all.length <= 1) setZoom(null);
      toast('Photo deleted', undefined, { tone: 'danger', icon: 'trash' });
    } catch (e) { toast(e instanceof Error ? e.message : 'The photo could not be deleted.'); }
  };

  return (
    <section className="task-panel-section task-photos">
      <header>
        <h3>Photos{photos.length > 0 && <b>{photos.length}</b>}</h3>
        <button type="button" onClick={() => picker.current?.click()} disabled={!!busy}><Icon name="plus" size={12} />Add photos</button>
      </header>
      {(all.length > 0 || busy) ? (
        <div className="task-photo-strip">
          {cover.url && (
            <button type="button" className="task-photo is-cover" onClick={() => setZoom(0)} aria-label="Look at the cover photo">
              <img src={cover.url} alt="" draggable={false} /><em>Cover</em>
            </button>
          )}
          {photos.map((p, i) => (
            <button key={p.path} type="button" className="task-photo" onClick={() => setZoom(i + lead)} aria-label={`Look at photo ${i + 1}`}>
              {urls[i] ? <img src={urls[i]!} alt="" draggable={false} loading="lazy" /> : <span className="task-photo-wait" />}
            </button>
          ))}
          {busy && <span className="task-photo is-busy" role="status"><span className="task-photo-wait" />{busy}</span>}
        </div>
      ) : (
        <button type="button" className="task-photo-empty" onClick={() => picker.current?.click()}>
          <Icon name="camera" size={18} />{isError ? 'Photos could not be loaded. Add one to try again.' : 'Keep a receipt, a page or the whiteboard with this task.'}
        </button>
      )}
      <input ref={picker} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void add(files); }} />
      {zoom !== null && all.length > 0 && <PhotoZoom photos={all} start={zoom} onClose={() => setZoom(null)} onDelete={(i) => void remove(i)} />}
    </section>
  );
}

/** The cover on a task's row: a tap looks at it full screen instead of opening the task. */
export function TaskCoverThumb({ taskId, title }: { taskId: string; title: string }) {
  const cover = useObjectCover('task', taskId);
  const [open, setOpen] = useState(false);
  if (!cover.url) return null;
  return (
    <>
      <button type="button" className="task-cover-button" aria-label={`Look at the cover of ${title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <img className="task-cover" src={cover.url} alt="" loading="lazy" draggable={false} />
      </button>
      {open && <PhotoZoom photos={[{ src: cover.url, alt: `Cover of ${title}`, removable: false }]} onClose={() => setOpen(false)} />}
    </>
  );
}
