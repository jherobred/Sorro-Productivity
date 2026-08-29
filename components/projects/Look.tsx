'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, ICONS, type IconName } from '../Icon';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { uploadTo, useSignedUrl } from '@/lib/uploads';
import { toast } from '@/lib/toast';
import { PixelFolderIcon, isPixelIcon, PIXEL_FOLDER_ICONS } from './PixelFolderIcons';

/**
 * What a project looks like: its icon, and the cover behind its board.
 *
 * Both are one string on `bd_projects` (migration 0010), and the string says
 * what it is by its own shape:
 *
 *   ''            the drawn folder / no cover
 *   'ic:proj'     one of the app's own icons
 *   'grad:dusk'   a preset cover
 *   '<uid>/…'     a file in bd-files — an uploaded picture
 *   '📐'          anything else is an emoji, taken as written
 *
 * A prefix rather than a `kind` column because there is nothing to query: the
 * only thing that ever reads this is the thing drawing it, and it has the
 * string in its hand. A second column would be a second thing to keep in
 * agreement for no gain.
 *
 * Emoji are deliberately not a fixed palette. Notion lets you type any emoji
 * and so does this — a Filipino student's folder for a Rizal course wants 🇵🇭
 * and no curated grid of forty is going to have it.
 */

// Both take `string | undefined` on purpose: a project row cached before
// migration 0010 has no `icon` at all, and a `.startsWith` on undefined is a
// blank screen for anyone whose persisted cache predates the deploy.
export const isPath = (v?: string) => !!v && !v.startsWith('ic:') && !v.startsWith('grad:') && v.includes('/');
export const iconName = (v?: string): IconName | null =>
  !!v && v.startsWith('ic:') && v.slice(3) in ICONS ? (v.slice(3) as IconName) : null;

/** Covers, as Notion has them: a gradient with a name, not a photo library. */
export const COVERS: { id: string; label: string; css: string }[] = [
  { id: 'grad:dusk', label: 'Dusk', css: 'linear-gradient(120deg,#7C6CFF,#38D6F2)' },
  { id: 'grad:ember', label: 'Ember', css: 'linear-gradient(120deg,#FF6B6B,#FFC24B)' },
  { id: 'grad:moss', label: 'Moss', css: 'linear-gradient(120deg,#34D9A0,#38BDF8)' },
  { id: 'grad:plum', label: 'Plum', css: 'linear-gradient(120deg,#B07CFF,#FF6FA8)' },
  { id: 'grad:slate', label: 'Slate', css: 'linear-gradient(120deg,#2A2739,#4A4560)' },
  { id: 'grad:sun', label: 'Sun', css: 'linear-gradient(120deg,#FFC24B,#FF6FA8)' },
];

/** The app's own icons, the ones that mean something to a folder. */
const PICKABLE: IconName[] = [
  'proj', 'book', 'task', 'code', 'gym', 'food', 'money', 'cal', 'star', 'heart',
  'spark', 'focus', 'mind', 'walk', 'cup', 'habit', 'files', 'photo', 'people', 'trophy',
  'flame', 'clock', 'grid', 'pen', 'search', 'archive', 'up', 'play', 'text', 'image',
];

/* ---------------------------------------------------------------- the icon */

/**
 * The folder glyph. Unchanged when there is no icon set — this is the same
 * drawn folder the grid has always had, with the chosen face laid on its flap.
 */
export function FolderIcon({
  color, count, size, icon = '',
}: { color: string; count: number; size: number; icon?: string }) {
  if (isPixelIcon(icon)) {
    return <PixelFolderIcon iconId={icon} size={size} />;
  }
  const h = Math.round(size * 0.78);
  const name = iconName(icon);
  const path = isPath(icon) ? icon : '';
  const url = useSignedUrl('bd-files', path || undefined);
  const emoji = icon && !name && !path ? icon : '';

  return (
    <span style={{ position: 'relative', width: size, height: h, display: 'block', flex: 'none' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, width: size * 0.42, height: h * 0.17, borderRadius: '4px 4px 0 0', background: `color-mix(in srgb, ${color} 70%, #000)` }} />
      <span style={{ position: 'absolute', left: 0, top: h * 0.13, right: 0, bottom: h * 0.2, borderRadius: 6, background: 'var(--card2)', border: '1px solid var(--line2)', padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ height: 2.5, width: '76%', borderRadius: 2, background: 'var(--line2)' }} />
        <span style={{ height: 2.5, width: '54%', borderRadius: 2, background: 'var(--line2)' }} />
      </span>
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.6,
        borderRadius: '3px 7px 7px 7px', display: 'grid', placeItems: 'center', overflow: 'hidden',
        background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 62%, #000))`,
      }}>
        {name && <Icon name={name} size={Math.round(size * 0.3)} color="#0C0F16" />}
        {emoji && <span style={{ fontSize: Math.round(size * 0.32), lineHeight: 1 }}>{emoji}</span>}
        {path && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {!name && !emoji && !path && count > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, color: '#0C0F16', opacity: 0.72, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        )}
      </span>
    </span>
  );
}

/* --------------------------------------------------------------- the cover */

/** The band behind a project's header. Nothing at all when none is set. */
export function Cover({ cover, color, children }: { cover?: string; color: string; children: React.ReactNode }) {
  const preset = COVERS.find((c) => c.id === cover);
  const path = isPath(cover) ? cover : '';
  const url = useSignedUrl('bd-files', path || undefined);
  // No cover: the header still needs the gap the covered version gets from its
  // own bottom padding, or the board jumps up against it.
  if (!preset && !url) return <div style={{ marginBottom: 18 }}>{children}</div>;

  return (
    <div style={{
      position: 'relative', borderRadius: 16, overflow: 'hidden', marginBottom: 16,
      background: preset ? preset.css : `color-mix(in srgb, ${color} 30%, var(--card))`,
    }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {/* The header sits on top, so the bottom has to stay dark enough to read
          white text on any picture somebody uploads. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.62))' }} />
      <div style={{ position: 'relative', padding: '58px 16px 14px' }}>{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- the sheet */

export function LookSheet({
  name, icon, cover, color, onClose, onSave,
}: {
  name: string; icon?: string; cover?: string; color: string;
  onClose: () => void;
  onSave: (patch: { icon?: string; cover?: string }) => void;
}) {
  const { phone } = useLayout();
  const [tab, setTab] = useState<'icon' | 'cover'>('icon');
  const [emoji, setEmoji] = useState(icon && !iconName(icon) && !isPath(icon) ? icon : '');
  const [busy, setBusy] = useState(false);
  useOverlayBack(true, onClose);

  const upload = async (f: File, as: 'icon' | 'cover') => {
    if (!f.type.startsWith('image/')) { toast('That is not an image'); return; }
    // A folder icon rendered at 60px does not need four megabytes, and the
    // grid loads every one of them at once.
    if (f.size > 4 * 1024 * 1024) { toast('Under 4 MB, please'); return; }
    setBusy(true);
    try {
      onSave({ [as]: await uploadTo('bd-files', f) });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not upload that');
    } finally { setBusy(false); }
  };

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`How ${name} looks`}
        className="k-bloom"
        style={{
          width: 460, maxWidth: '100%', maxHeight: '84dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px 10px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>How “{name}” looks</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '0 15px 10px' }}>
          {(['icon', 'cover'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
              style={{
                flex: 1, minHeight: 34, borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                border: `1px solid ${tab === t ? 'var(--acc)' : 'var(--line2)'}`,
                background: tab === t ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'transparent',
                color: tab === t ? 'var(--tx)' : 'var(--tx3)',
              }}>{t}</button>
          ))}
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 15px 15px' }}>
          {tab === 'icon' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                <input value={emoji} maxLength={4} placeholder="🎓"
                  onChange={(e) => setEmoji(e.target.value)}
                  aria-label="Type any emoji"
                  style={{
                    width: 58, minHeight: 40, textAlign: 'center', fontSize: 20, borderRadius: 11,
                    border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)',
                  }} />
                <button onClick={() => { onSave({ icon: emoji.trim() }); onClose(); }} disabled={!emoji.trim()}
                  className="k-squish"
                  style={{
                    minHeight: 40, padding: '0 14px', borderRadius: 11, background: 'var(--acc)',
                    color: 'var(--ink)', fontSize: 12, fontWeight: 800, opacity: emoji.trim() ? 1 : 0.4,
                  }}>Use emoji</button>
                <span style={{ fontSize: 11, color: 'var(--tx3)', flex: 1 }}>Any emoji your keyboard can type.</span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 8 }}>
                  8-Bit Shiny Icons
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(52px,1fr))', gap: 7 }}>
                  {PIXEL_FOLDER_ICONS.map((px) => (
                    <button key={px.id} onClick={() => { onSave({ icon: px.id }); onClose(); }} className="hov k-squish"
                      aria-label={px.name} title={px.name}
                      style={{
                        height: 52, borderRadius: 11, display: 'grid', placeItems: 'center',
                        background: 'var(--card2)',
                        border: `1.5px solid ${icon === px.id ? 'var(--acc)' : 'var(--line2)'}`,
                      }}>
                      <PixelFolderIcon iconId={px.id} size={36} />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 8 }}>
                  Standard Icons
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(46px,1fr))', gap: 6 }}>
                  {PICKABLE.map((n) => (
                    <button key={n} onClick={() => { onSave({ icon: `ic:${n}` }); onClose(); }} className="hov"
                      aria-label={n} title={n}
                      style={{
                        height: 44, borderRadius: 11, display: 'grid', placeItems: 'center',
                        border: `1px solid ${icon === `ic:${n}` ? 'var(--acc)' : 'var(--line2)'}`,
                      }}>
                      <Icon name={n} size={17} color="var(--tx2)" />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <label className="hov" style={PICK_BTN}>
                  <Icon name="upload" size={14} color="var(--tx2)" />Upload a picture
                  <input type="file" accept="image/*" hidden disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, 'icon'); }} />
                </label>
                <button onClick={() => { onSave({ icon: '' }); onClose(); }} className="hov" style={PICK_BTN}>
                  <Icon name="undo" size={14} color="var(--tx3)" />Plain folder
                </button>
              </div>
            </>
          )}

          {tab === 'cover' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(122px,1fr))', gap: 8, marginBottom: 12 }}>
                {COVERS.map((c) => (
                  <button key={c.id} onClick={() => { onSave({ cover: c.id }); onClose(); }}
                    aria-label={c.label} title={c.label}
                    style={{
                      height: 58, borderRadius: 11, background: c.css,
                      outline: cover === c.id ? '2px solid var(--acc)' : 'none', outlineOffset: 2,
                      display: 'grid', placeItems: 'end start', padding: 7,
                      fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,.9)',
                    }}>{c.label}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <label className="hov" style={PICK_BTN}>
                  <Icon name="upload" size={14} color="var(--tx2)" />Upload a picture
                  <input type="file" accept="image/*" hidden disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, 'cover'); }} />
                </label>
                <button onClick={() => { onSave({ cover: '' }); onClose(); }} className="hov" style={PICK_BTN}>
                  <Icon name="undo" size={14} color="var(--tx3)" />No cover
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

const PICK_BTN: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  minHeight: 40, borderRadius: 11, border: '1px dashed var(--line2)',
  fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', cursor: 'pointer',
};
