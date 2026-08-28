'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { uploadTo } from '@/lib/uploads';
import { TAGS, MAX_IMAGES } from '@/lib/community';

/**
 * Writing a post.
 *
 * **There is no post type any more.** The composer used to open on a
 * discussion/photo switch, and picking one decided what you were allowed to
 * write: a photo could have a caption and no title, a discussion could have a
 * title and no picture. Which meant "here is my setup, what would you change?"
 * — a picture *and* a question, the most ordinary thing anybody posts — had
 * nowhere to go, and you had to pick the half you cared about less.
 *
 * So the switch is gone and every field is optional. Title, words, pictures,
 * tag: fill in the ones you have. The only rule is that a post has to be
 * *something*, so at least one of title, body and picture must be filled.
 *
 * The two tables underneath are unchanged and still chosen automatically:
 * anything with a picture is a `bd_posts` row (which now carries a title),
 * anything without is a `bd_threads` row. See lib/community.ts — the split is
 * storage, and storage is not the writer's problem.
 */

export type Draft = {
  title: string;
  body: string;
  tag: string;
  images: string[];
  accept_rp?: boolean;
  suggested_rp?: number;
};

export function Composer({ onClose, onPost }: {
  onClose: () => void;
  onPost: (v: Draft) => void;
}) {
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** '' is a real answer: not every post is one of six categories. */
  const [tag, setTag] = useState('');
  const [acceptRp, setAcceptRp] = useState<boolean>(true);
  const [suggestedRp, setSuggestedRp] = useState<number>(25);
  const [images, setImages] = useState<{ path: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  // Object URLs are revoked once, on unmount. Read through a ref with an empty
  // dependency list, because `[images]` would run the cleanup on every added
  // picture and revoke the URLs of the thumbnails still on screen.
  const live = useRef<{ path: string; url: string }[]>([]);
  live.current = images;
  useEffect(() => () => { for (const i of live.current) URL.revokeObjectURL(i.url); }, []);

  const attach = async (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith('image/'));
    if (!pics.length) { toast('That is not an image'); return; }

    const room = MAX_IMAGES - images.length;
    if (room <= 0) { toast(`${MAX_IMAGES} pictures is the limit`); return; }
    const taking = pics.slice(0, room);
    if (pics.length > room) toast(`Added ${room} — ${MAX_IMAGES} is the limit`);

    setBusy(true);
    try {
      // Sequential, not Promise.all: a phone uploading eight files at once on a
      // campus connection times half of them out, and a partial failure here
      // leaves a post referring to a picture that never landed.
      for (const f of taking) {
        const path = await uploadTo('bd-feed', f);
        setImages((p) => [...p, { path, url: URL.createObjectURL(f) }]);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally { setBusy(false); }
  };

  // Paste pictures straight in, the way you would into a chat.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const fs = Array.from(e.clipboardData?.files ?? []).filter((x) => x.type.startsWith('image/'));
      if (fs.length) void attach(fs);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const ready = !!(title.trim() || body.trim() || images.length);

  const send = () => {
    if (!ready) return;
    onPost({
      title: title.trim(),
      body: body.trim(),
      tag,
      images: images.map((i) => i.path),
      accept_rp: acceptRp,
      suggested_rp: suggestedRp,
    });
    onClose();
  };

  const hint = images.length
    ? title.trim() ? 'A picture and a question. Both go up.' : 'A picture can go up on its own.'
    : title.trim() ? 'A title is all it needs.'
      : body.trim() ? 'No title? The first line does the work.'
        : 'Write something, or add a picture.';

  const body_ = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New post"
        className="k-bloom"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void attach(Array.from(e.dataTransfer.files ?? [])); }}
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
          <input ref={first} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)" aria-label="Title"
            style={{ width: '100%', minHeight: 42, fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--tx)' }} />

          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={images.length ? 3 : 5}
            aria-label="Body"
            placeholder="Say more (optional)"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line2)',
              background: 'var(--card2)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--tx)', resize: 'vertical',
            }} />

          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
              {images.map((im, i) => (
                <div key={im.path} style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'var(--card2)',
                }}>
                  <img src={im.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* The first one is the cover: it is the picture the feed
                      card shows and the only one a notification can carry. */}
                  {i === 0 && images.length > 1 && (
                    <span style={{
                      position: 'absolute', left: 6, top: 6, padding: '2px 7px', borderRadius: 6,
                      background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
                    }}>COVER</span>
                  )}
                  <button onClick={() => setImages((p) => p.filter((x) => x.path !== im.path))}
                    className="hov" aria-label={`Remove picture ${i + 1}`}
                    style={{
                      position: 'absolute', right: 5, top: 5, width: 26, height: 26, borderRadius: 8,
                      display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.6)',
                    }}>
                    <Icon name="close" size={12} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {images.length < MAX_IMAGES && (
            <label style={{
              display: 'grid', placeItems: 'center', gap: 8,
              padding: images.length ? '14px 16px' : '30px 16px', textAlign: 'center',
              border: '1.5px dashed var(--line2)', borderRadius: 14, cursor: 'pointer', opacity: busy ? 0.5 : 1,
            }}>
              <Icon name="image" size={images.length ? 16 : 22} color="var(--tx3)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>
                {busy ? 'Uploading…' : images.length ? 'Add another' : 'Add pictures (optional)'}
              </span>
              {!images.length && (
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>or drop them here, or paste</span>
              )}
              <input type="file" accept="image/*" multiple hidden
                onChange={(e) => { void attach(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            </label>
          )}

          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>
              Tag — optional
            </div>
            {/* "No tag" is a chip rather than the absence of one, so leaving a
                post untagged is a thing you can *choose* instead of a thing you
                have to notice you have not done. It is also the default, which
                the old composer got backwards by preselecting "Update". */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['', ...TAGS] as const).map((t) => {
                const on = tag === t;
                return (
                  <button key={t || 'none'} onClick={() => setTag(t)} aria-pressed={on} className="k-chip"
                    style={{
                      padding: '5px 12px', borderRadius: 999, minHeight: 30, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                      background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                      color: on ? 'var(--accTx)' : t ? 'var(--tx2)' : 'var(--tx3)',
                    }}>
                    {t || 'No tag'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RP Currency Acceptance Card */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 14,
              background: acceptRp ? 'rgba(99, 102, 241, 0.12)' : 'var(--card2)',
              border: acceptRp ? '1.5px solid rgba(129, 140, 248, 0.4)' : '1px solid var(--line2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              transition: 'all .2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>💎</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)' }}>
                  Accept RP Currency / Tips
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                  Allow readers to reward you with RP for this post
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAcceptRp(!acceptRp)}
              aria-pressed={acceptRp}
              className="k-squish"
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 800,
                background: acceptRp ? '#6366F1' : 'var(--card)',
                border: acceptRp ? '1px solid #818CF8' : '1px solid var(--line)',
                color: acceptRp ? '#FFFFFF' : 'var(--tx2)',
                cursor: 'pointer',
              }}
            >
              {acceptRp ? 'Accepted ✓' : 'Disabled'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11, color: 'var(--tx3)', flex: 1, minWidth: 0 }}>{hint}</span>
          <button onClick={send} disabled={!ready || busy} className="acc k-squish"
            style={{
              minHeight: 38, padding: '0 20px', borderRadius: 11, flex: 'none',
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
