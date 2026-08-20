'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { uploadTo } from '@/lib/uploads';
import { TAGS, type Kind } from '@/lib/community';

/**
 * Writing a post, given room to do it in.
 *
 * The old composer was a single-line input with a paperclip: one line for a
 * caption, no title, no way to see the picture you had attached, and no idea
 * what a tag was for. It also used the *filename* as the caption when you
 * posted a photo without one, so the feed filled up with "IMG_20260812.jpg".
 * A picture is allowed to speak for itself; an empty caption is empty.
 *
 * Two kinds, chosen explicitly rather than inferred, because Reddit's post-type
 * picker is the thing everybody has already learnt: a **photo** with an
 * optional caption, or a **discussion** with a title and a body. Both land in
 * the same stream.
 */

export function Composer({
  onClose, onPhoto, onDiscussion,
}: {
  onClose: () => void;
  onPhoto: (v: { caption: string; tag: string; image_path: string }) => void;
  onDiscussion: (v: { title: string; body: string; tag: string }) => void;
}) {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const [kind, setKind] = useState<Kind>('discussion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<string>(TAGS[0]);
  const [image, setImage] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, [kind]);

  const attach = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('That is not an image'); return; }
    setBusy(true);
    try {
      const path = await uploadTo('bd-feed', file);
      setImage({ path, url: URL.createObjectURL(file) });
      setKind('photo');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally { setBusy(false); }
  };

  // Paste an image straight in, the way you would into a chat.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (f) void attach(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = kind === 'photo' ? !!image : !!title.trim();

  const send = () => {
    if (!ready) return;
    if (kind === 'photo' && image) {
      // No caption is no caption. It is never the file's name.
      onPhoto({ caption: body.trim(), tag, image_path: image.path });
    } else {
      onDiscussion({ title: title.trim(), body: body.trim(), tag });
    }
    onClose();
  };

  const body_ = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New post"
        className="k-bloom"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void attach(f); }}
        style={{
          width: 560, maxWidth: '100%', maxHeight: phone ? '92dvh' : '86dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? '18px 18px 0 0' : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>New post</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div role="tablist" aria-label="Kind of post" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 11, background: 'var(--card2)', alignSelf: 'flex-start' }}>
            {(['discussion', 'photo'] as Kind[]).map((k) => {
              const on = kind === k;
              return (
                <button key={k} role="tab" aria-selected={on} onClick={() => setKind(k)}
                  className={on ? undefined : 'hov'} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, minHeight: 32,
                    fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize',
                    background: on ? prefs.accent : 'transparent', color: on ? '#0C0F16' : 'var(--tx2)',
                    transition: 'background-color .2s, color .2s',
                  }}>
                  <Icon name={k === 'photo' ? 'image' : 'chat'} size={13} color={on ? '#0C0F16' : 'var(--tx3)'} />
                  {k}
                </button>
              );
            })}
          </div>

          {kind === 'discussion' && (
            <input ref={first} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="What is your question?" aria-label="Title"
              style={{ width: '100%', minHeight: 42, fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)' }} />
          )}

          {kind === 'photo' && (
            image ? (
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: 'var(--card2)' }}>
                <img src={image.url} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
                <button onClick={() => setImage(null)} className="hov" aria-label="Remove the picture"
                  style={{
                    position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 9,
                    display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.55)',
                  }}>
                  <Icon name="close" size={13} color="#fff" />
                </button>
              </div>
            ) : (
              <label style={{
                display: 'grid', placeItems: 'center', gap: 8, padding: '30px 16px', textAlign: 'center',
                border: '1.5px dashed var(--line2)', borderRadius: 14, cursor: 'pointer', opacity: busy ? 0.5 : 1,
              }}>
                <Icon name="image" size={22} color="var(--tx3)" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
                  {busy ? 'Uploading…' : 'Choose a picture'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>or drop one here, or paste it</span>
                <input type="file" accept="image/*" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ''; }} />
              </label>
            )
          )}

          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={kind === 'photo' ? 3 : 5}
            aria-label={kind === 'photo' ? 'Caption' : 'Detail'}
            placeholder={kind === 'photo' ? 'Say something about it (optional)' : 'Add detail (optional)'}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line2)',
              background: 'var(--card2)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical',
            }} />

          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>
              Tag
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TAGS.map((t) => {
                const on = tag === t;
                return (
                  <button key={t} onClick={() => setTag(t)} aria-pressed={on} className="k-chip"
                    style={{
                      padding: '5px 12px', borderRadius: 999, minHeight: 30, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                      background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                      color: on ? 'var(--accTx)' : 'var(--tx2)',
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          {kind === 'discussion' && (
            <label className="hov" title="Attach a picture instead"
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon name="image" size={15} color="var(--tx2)" />
              <input type="file" accept="image/*" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ''; }} />
            </label>
          )}
          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
            {kind === 'photo' ? 'A picture can go up without a caption.' : 'A title is all it needs.'}
          </span>
          <button onClick={send} disabled={!ready || busy} className="acc k-squish"
            style={{
              marginLeft: 'auto', minHeight: 38, padding: '0 20px', borderRadius: 11,
              background: 'var(--acc)', color: '#0A0912', fontSize: 12.5, fontWeight: 800,
              opacity: ready && !busy ? 1 : 0.45,
            }}>
            Post
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body_, document.body);
}
