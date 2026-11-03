'use client';

import { themeIsDark } from '@/lib/theme';
import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { MediaFrame } from '../MediaFrame';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { useSignedUrl } from '@/lib/uploads';
import { usePrefs } from '@/lib/prefs';
import { useLongPress } from '@/lib/useLongPress';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { usePhotos, usePins, usePhotoActions, usePinActions, type Photo } from '@/lib/journalPhotos';

/**
 * The day's photos: whiteboards, problem sets, lecture slides.
 *
 * Every verb the picture needs is here — add, replace, rename, pin, archive,
 * delete, undo — and each one reaches them by two routes, because the phone
 * build has no right mouse button: the row of buttons on an open photo, and
 * the menu that right-click or a half-second hold opens on any tile.
 *
 * Photos are shown whole, never cropped (see MediaFrame). A cover-crop on a
 * photo of a whiteboard eats the top line of the derivation.
 */

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)',
};

export function JournalPhotos({
  entryId, entryDate, onNeedEntry,
}: { entryId: string | null; entryDate: string; onNeedEntry: () => void }) {
  const { data: all = [] } = usePhotos(entryId);
  const A = usePhotoActions(entryId);
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);

  const live = all.filter((p) => !p.archived_at && !p.deleted_at);
  const hidden = all.filter((p) => p.archived_at || p.deleted_at);

  const addFiles = async (files: FileList) => {
    if (!entryId) { onNeedEntry(); toast('Write something first, then add photos'); return; }
    setBusy(true);
    let n = 0;
    // Sequential: the uploads share one bucket and one connection, and a
    // parallel burst on a phone's radio is slower than doing them in turn.
    for (const f of Array.from(files)) if (await A.upload(entryId, f, live.length + n)) n += 1;
    setBusy(false);
    if (n) toast(n === 1 ? 'Photo added' : `${n} photos added`);
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={KICKER}>Photos{live.length ? ` · ${live.length}` : ''}</div>

        {hidden.length > 0 && (
          <button onClick={() => setDrawer((v) => !v)} className="hov" aria-pressed={drawer}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px',
              borderRadius: 9, border: `1px solid ${drawer ? 'var(--acc)' : 'var(--line2)'}`,
              fontSize: 10.5, fontWeight: 700, color: drawer ? 'var(--accTx)' : 'var(--tx3)',
            }}>
            <Icon name="archive" size={12} color={drawer ? 'var(--accTx)' : 'var(--tx3)'} />
            {hidden.length}
          </button>
        )}

        <label className="hov" title="Add a photo"
          style={{
            marginLeft: hidden.length ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 11px', borderRadius: 9, border: '1px solid var(--line2)', fontSize: 11,
            fontWeight: 700, color: 'var(--tx2)', cursor: 'pointer', opacity: busy ? 0.5 : 1,
          }}>
          <Icon name="photo" size={13} color="var(--tx2)" />{busy ? 'Uploading…' : 'Add'}
          <input ref={addInput} type="file" accept="image/*" multiple hidden
            onChange={(e) => { const f = e.target.files; if (f?.length) void addFiles(f); e.target.value = ''; }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
        {live.map((p) => (
          <PhotoTile key={p.id} photo={p} open={open === p.id}
            onOpen={() => setOpen(open === p.id ? null : p.id)} A={A} />
        ))}
        {live.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No photos for {entryDate}.</div>
        )}
      </div>

      {drawer && hidden.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={KICKER}>Put away</div>
          {hidden.map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
              borderRadius: 10, border: '1px solid var(--line)',
            }}>
              <Icon name={p.deleted_at ? 'trash' : 'archive'} size={13} color="var(--tx3)" />
              <span style={{
                flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--tx2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.name}
              </span>
              <button onClick={() => A.restore(p)} className="hov" style={CHIP}>Restore</button>
              <button
                onClick={() => void confirmAsk('Delete this photo for good?', {
                  message: `“${p.name}” and its pins go with it.`, confirmLabel: 'Delete forever', danger: true,
                }).then((yes) => { if (yes) { A.purge.mutate({ id: p.id, storage_path: p.storage_path }); toast('Deleted for good'); } })}
                className="hov" style={{ ...CHIP, color: 'var(--pal-coral)' }}>
                Forever
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- tile */

function PhotoTile({
  photo, open, onOpen, A,
}: { photo: Photo; open: boolean; onOpen: () => void; A: ReturnType<typeof usePhotoActions> }) {
  const url = useSignedUrl('sorro-journal', photo.storage_path);
  const { prefs } = usePrefs();
  const { data: pins = [] } = usePins(photo.id, open);
  const P = usePinActions(photo.id);
  const press = useLongPress();
  const swapInput = useRef<HTMLInputElement>(null);

  /** Click-to-pin: percentages, so a pin survives any resize. */
  const pin = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!open) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = +(((e.clientX - r.left) / r.width) * 100).toFixed(2);
    const y = +(((e.clientY - r.top) / r.height) * 100).toFixed(2);
    const text = await ask('Note for this spot', { placeholder: 'What is here?', confirmLabel: 'Pin' });
    if (!text) return;
    P.addPin.mutate({ id: crypto.randomUUID(), photo_id: photo.id, x, y, text });
  };

  const editPin = async (id: string, current: string) => {
    const text = await ask('Edit this pin', { initial: current, placeholder: 'Leave empty to remove' });
    if (text === null) return;
    if (text.trim()) P.editPin.mutate({ id, text });
    else { P.delPin.mutate({ id, photo_id: photo.id }); toast('Pin removed'); }
  };

  const rename = () =>
    void ask('Rename photo', { initial: photo.name, placeholder: 'Photo name' })
      .then((n) => { if (n && n !== photo.name) A.rename(photo, n); });

  const menu = (): CtxGroup[] => [
    { items: [
      { label: open ? 'Collapse' : 'Open', icon: open ? 'collapse' : 'expand', run: onOpen },
      { label: 'Open in a new tab', icon: 'link', disabled: !url, hint: url ? undefined : 'Still loading',
        run: () => url && window.open(url, '_blank', 'noopener') },
    ] },
    { label: 'Photo', items: [
      { label: 'Replace…', icon: 'refresh', run: () => swapInput.current?.click() },
      { label: 'Rename', icon: 'edit', run: rename },
      { label: 'Copy name', icon: 'copy', run: () => { void navigator.clipboard?.writeText(photo.name); toast('Copied'); } },
    ] },
    { label: 'Pins', items: [
      { label: 'Add a pin', icon: 'pin', disabled: !open,
        hint: open ? 'Then double-click the spot' : 'Open the photo first',
        run: () => toast('Double-click the spot you want to pin') },
      { label: `Clear ${pins.length} pin${pins.length === 1 ? '' : 's'}`, icon: 'close',
        disabled: pins.length === 0, hint: pins.length ? undefined : 'Nothing pinned yet',
        run: () => { P.clearPins.mutate({ photo_id: photo.id }); toast('Pins cleared'); } },
    ] },
    { items: [
      { label: 'Archive', icon: 'archive', run: () => A.setArchived(photo, true) },
      { label: 'Delete photo', icon: 'trash', danger: true, run: () => A.remove(photo) },
    ] },
  ];

  return (
    <div
      onClick={onOpen}
      onDoubleClick={pin}
      onPointerDown={(e) => press.start(e, 'scratch', photo.id, photo.name)}
      onContextMenu={(e) => { e.stopPropagation(); press.onContextMenu(e, 'scratch', photo.id, photo.name); }}
      title={open ? 'Double-click to pin · right-click or hold for more' : photo.name}
      style={{
        position: 'relative', gridColumn: open ? '1 / -1' : 'auto',
        border: `1px solid ${open ? 'var(--acc)' : 'var(--line)'}`,
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'border-color .24s',
      }}>

      <input ref={swapInput} type="file" accept="image/*" hidden
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void A.swap(photo, f); e.target.value = ''; }} />

      {press.ctx && (
        <ContextMenu x={press.ctx.x} y={press.ctx.y} kind="scratch" label={photo.name} items={menu()}
          onClose={press.close} accent={prefs.accent} dark={themeIsDark(prefs.theme)} />
      )}

      <MediaFrame src={url ?? null} alt={photo.name} ratio={open ? 16 / 10 : 1} maxHeight={open ? 520 : 240} rounded={11}>
        {open && pins.map((a, i) => (
          <button key={a.id} title={a.text} className="pop"
            onClick={(e) => { e.stopPropagation(); void editPin(a.id, a.text); }}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: `${a.x}%`, top: `${a.y}%`, transform: 'translate(-50%,-50%)',
              width: 18, height: 18, borderRadius: '50%', background: 'var(--acc)', color: '#0C0F16',
              display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800,
              boxShadow: '0 2px 8px rgba(0,0,0,.5)', zIndex: 2, cursor: 'pointer',
            }}>
            {i + 1}
          </button>
        ))}
      </MediaFrame>

      {/* The verbs, spelled out, on the photo you are looking at. Touch has no
          right button and a menu you have to know about is a menu nobody uses. */}
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '8px 10px', borderTop: '1px solid var(--line)',
        }}>
          <span style={{
            flex: '1 1 90px', minWidth: 0, fontSize: 11, fontWeight: 600, color: 'var(--tx2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {photo.name}
          </span>
          <button onClick={() => swapInput.current?.click()} className="hov" style={CHIP} title="Swap in a different picture, keep the pins">
            <Icon name="refresh" size={12} color="var(--tx3)" />Replace
          </button>
          <button onClick={rename} className="hov" style={CHIP}>
            <Icon name="edit" size={12} color="var(--tx3)" />Rename
          </button>
          <button onClick={() => A.setArchived(photo, true)} className="hov" style={CHIP}>
            <Icon name="archive" size={12} color="var(--tx3)" />Archive
          </button>
          <button onClick={() => A.remove(photo)} className="hov" style={{ ...CHIP, color: 'var(--pal-coral)' }}>
            <Icon name="trash" size={12} color="var(--pal-coral)" />Delete
          </button>
        </div>
      )}
    </div>
  );
}

const CHIP: React.CSSProperties = {
  flex: 'none', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', minHeight: 28,
  borderRadius: 8, border: '1px solid var(--line2)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)',
};
