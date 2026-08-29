'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { useLayout } from '@/lib/useLayout';
import { useSignedUrls } from '@/lib/uploads';
import { ago } from '@/lib/scratch';
import { PAL } from '@/lib/pal';
import { displayOf, type Person } from '@/lib/people';
import { useComments, type Item } from '@/lib/community';
import { FacebookReactionButton, type ReactionType } from '@/components/FacebookReactions';

/**
 * A post, opened.
 *
 * Two things wrong with what this replaces. The first was a bug you could see:
 * the viewer was `position: fixed` rendered *inside* `main`, and `main` carries
 * the font-scale `zoom` and a page-entry transform — either of which makes it
 * the containing block for anything fixed. So the "full screen" overlay was
 * positioned against `main` instead of the viewport: it covered part of the
 * page, sat at the wrong offset, and let the feed show through underneath.
 * It portals to `document.body` now, which is the rule the context menus and
 * popovers already follow (HANDOFF, fact 2).
 *
 * The second was the shape. A photo with its conversation underneath it means
 * scrolling away from the picture to read what people said about it. Instagram
 * puts the picture on the left and everything written down the right, so both
 * stay in view, and that is what this does — collapsing to a single column on
 * a phone, where there is only one column anyway.
 */

export function PostView({
  item, items, me, profiles, reactions, reacted, comments,
  onIndex, onReact, onComment, onShare, onClose,
}: {
  item: Item;
  /** The photos in the feed, so the arrows move between them. */
  items: Item[];
  me: string;
  profiles: Record<string, Person>;
  reactions: number;
  reacted: boolean;
  comments: number;
  onIndex: (id: string) => void;
  onReact: (on: boolean) => void;
  onComment: (body: string) => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const i = items.findIndex((x) => x.id === item.id && x.kind === item.kind);
  const go = (n: number) => { const next = items[n]; if (next) onIndex(next.id); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/input|textarea/i.test((e.target as HTMLElement)?.tagName ?? '')) return;
      // preventDefault so useBackGuard's Escape does not also pop the overlay stack.
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowRight') go(Math.min(i + 1, items.length - 1));
      if (e.key === 'ArrowLeft') go(Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, items, onClose]);

  const body = (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={item.title || 'Post'}
      style={{
        position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(4,4,8,.93)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: phone ? 0 : 20,
      }}>

      <button onClick={onClose} aria-label="Close" className="hov k-squish"
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 2, width: 38, height: 38, borderRadius: 19,
          display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.1)',
        }}>
        <Icon name="close" size={16} color="#fff" />
      </button>

      {items.length > 1 && !phone && (
        <>
          <Arrow side="left" disabled={i <= 0} onClick={() => go(i - 1)} />
          <Arrow side="right" disabled={i >= items.length - 1} onClick={() => go(i + 1)} />
        </>
      )}

      <div onClick={(e) => e.stopPropagation()} className="k-bloom"
        style={{
          display: 'flex', flexDirection: phone ? 'column' : 'row',
          width: phone ? '100%' : 'min(1180px, calc(100% - 120px))',
          height: phone ? '100dvh' : 'min(86dvh, 820px)',
          background: 'var(--card)', border: phone ? 'none' : '1px solid var(--line2)',
          borderRadius: phone ? 0 : 16, overflow: 'hidden',
        }}>

        {item.images.length > 0 && (
          <div style={{
            flex: phone ? '0 0 auto' : '1 1 auto', minWidth: 0,
            background: '#08080C', display: 'grid', placeItems: 'center',
            maxHeight: phone ? '46dvh' : undefined,
          }}>
            <Photos paths={item.images} alt={item.title || item.body || 'Post'} />
          </div>
        )}

        <aside style={{
          flex: phone ? '1 1 auto' : `0 0 ${item.images.length ? 400 : 620}px`,
          minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
          borderLeft: phone || !item.images.length ? 'none' : '1px solid var(--line)',
        }}>
          <Panel
            item={item} me={me} profiles={profiles}
            reactions={reactions} reacted={reacted} comments={comments}
            onReact={onReact} onComment={onComment} onShare={onShare} />
        </aside>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

/* ------------------------------------------------------------------ panel */

function Panel({
  item, me, profiles, reactions, reacted, comments, onReact, onComment, onShare,
}: {
  item: Item; me: string; profiles: Record<string, Person>;
  reactions: number; reacted: boolean; comments: number;
  onReact: (on: boolean) => void; onComment: (b: string) => void; onShare: () => void;
}) {
  const { data: list = [], isLoading } = useComments(item.kind, item.id, true);
  const [draft, setDraft] = useState('');
  const who = displayOf(profiles, item.author_id, me);
  const photo = item.kind === 'photo';

  const send = () => {
    const v = draft.trim();
    if (!v) return;
    onComment(v);
    setDraft('');
  };

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
        <Face id={item.author_id} profiles={profiles} me={me} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {who.label}
          </div>
          {who.sub && <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{who.sub}</div>}
        </div>
        {item.tag && (
          <span style={{
            flex: 'none', padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 800,
            color: who.hue, background: `color-mix(in srgb, ${who.hue} 16%, transparent)`,
          }}>
            {item.tag}
          </span>
        )}
      </header>

      <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* The caption sits at the top of the thread as the first thing said,
            which is where Instagram puts it and where people look for it. */}
        {(item.title || item.body) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Face id={item.author_id} profiles={profiles} me={me} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {item.title && (
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.35, marginBottom: 4, textWrap: 'pretty' }}>
                  {item.title}
                </div>
              )}
              {item.body && (
                <div style={{ fontSize: 12.5, lineHeight: 1.6, textWrap: 'pretty' }}>
                  <b style={{ fontWeight: 800 }}>{who.label}</b> {item.body}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 4 }}>{ago(item.created_at)}</div>
            </div>
          </div>
        )}

        {isLoading && <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Loading replies…</div>}
        {!isLoading && list.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>No replies yet.</div>
        )}

        {list.map((c) => {
          const cw = displayOf(profiles, c.author_id, me);
          return (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Face id={c.author_id} profiles={profiles} me={me} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, textWrap: 'pretty' }}>
                  <b style={{ fontWeight: 800 }}>{cw.label}</b> {c.body}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>{ago(c.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 'none', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 15px 6px' }}>
          <FacebookReactionButton
            itemId={item.id}
            kind={item.kind}
            mine={reacted}
            count={reactions}
            onReact={onReact}
            size="md"
          />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx2)' }}>
            <Icon name="chat" size={18} color="var(--tx2)" />{comments}
          </span>
          <button onClick={onShare} className="tap" aria-label="Share this post" style={{ display: 'flex' }}>
            <Icon name="send" size={18} color="var(--tx2)" />
          </button>
        </div>

        <div style={{ padding: '0 15px 9px', fontSize: 12, fontWeight: 800 }}>
          {reactions} {photo ? (reactions === 1 ? 'like' : 'likes') : (reactions === 1 ? 'upvote' : 'upvotes')}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Add a comment…" aria-label="Add a comment"
            style={{
              flex: 1, minHeight: 38, padding: '9px 12px', borderRadius: 11,
              border: '1px solid var(--line2)', background: 'var(--card2)', color: 'var(--tx)', fontSize: 12.5,
            }} />
          <button onClick={send} disabled={!draft.trim()} className="acc k-squish"
            style={{
              flex: 'none', padding: '0 15px', minHeight: 38, borderRadius: 11,
              background: 'var(--acc)', color: '#0A0912', fontSize: 12, fontWeight: 800,
              opacity: draft.trim() ? 1 : 0.45,
            }}>
            Post
          </button>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- pieces */

/**
 * The post's pictures at full size. One fills the pane; several become a
 * scroll-snap strip, the same gesture as the card in the feed so the picture
 * you swiped to is the picture you keep looking at.
 */
function Photos({ paths, alt }: { paths: string[]; alt: string }) {
  const urls = useSignedUrls('bd-feed', paths);
  const [at, setAt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollNext = () => {
    if (!containerRef.current) return;
    const nextAt = Math.min(paths.length - 1, at + 1);
    containerRef.current.scrollTo({ left: nextAt * containerRef.current.clientWidth, behavior: 'smooth' });
    setAt(nextAt);
  };

  const scrollPrev = () => {
    if (!containerRef.current) return;
    const prevAt = Math.max(0, at - 1);
    containerRef.current.scrollTo({ left: prevAt * containerRef.current.clientWidth, behavior: 'smooth' });
    setAt(prevAt);
  };

  const jumpTo = (i: number) => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({ left: i * containerRef.current.clientWidth, behavior: 'smooth' });
    setAt(i);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') scrollNext();
      else if (e.key === 'ArrowLeft') scrollPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, paths.length]);

  if (paths.length === 1) {
    const url = urls[0];
    if (!url) {
      return <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: 'var(--tx3)' }}>
        <Icon name="image" size={26} color="var(--tx3)" />
      </div>;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img loading="lazy" decoding="async" src={url} alt={alt} className="k-zoomfade"
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        className="hbar"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '100%',
          width: '100%', height: '100%', overflowX: 'auto',
          scrollSnapType: 'x mandatory', scrollBehavior: 'smooth',
        }}>
        {paths.map((path, i) => (
          <div key={path} style={{ scrollSnapAlign: 'center', display: 'grid', placeItems: 'center', minWidth: 0 }}>
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={urls[i] as string} alt={i === 0 ? alt : `${alt} (${i + 1} of ${paths.length})`}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            ) : (
              <Icon name="image" size={26} color="var(--tx3)" />
            )}
          </div>
        ))}
      </div>

      {/* Floating Prev & Next Navigation Buttons */}
      {at > 0 && (
        <button
          type="button"
          onClick={scrollPrev}
          aria-label="Previous photo"
          className="hov k-squish"
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#FFFFFF',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            zIndex: 20,
            backdropFilter: 'blur(6px)',
          }}
        >
          <Icon name="back" size={16} color="#FFFFFF" />
        </button>
      )}

      {at < paths.length - 1 && (
        <button
          type="button"
          onClick={scrollNext}
          aria-label="Next photo"
          className="hov k-squish"
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#FFFFFF',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            zIndex: 20,
            backdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ transform: 'rotate(180deg)', display: 'grid', placeItems: 'center' }}>
            <Icon name="back" size={16} color="#FFFFFF" />
          </div>
        </button>
      )}

      {/* Clickable Pagination Dots */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 14,
        display: 'flex', justifyContent: 'center', gap: 6, zIndex: 20,
      }}>
        {paths.map((path, i) => (
          <button
            key={path}
            type="button"
            onClick={() => jumpTo(i)}
            aria-label={`Go to photo ${i + 1}`}
            style={{
              padding: 0,
              border: 'none',
              cursor: 'pointer',
              width: i === at ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === at ? '#fff' : 'rgba(255,255,255,.5)',
              transition: 'all .2s ease',
            }}
          />
        ))}
      </div>

      <span style={{
        position: 'absolute', right: 12, top: 12, padding: '4px 10px', borderRadius: 8,
        background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 11, fontWeight: 800,
        fontVariantNumeric: 'tabular-nums', pointerEvents: 'none', zIndex: 20,
      }}>
        {at + 1}/{paths.length}
      </span>
    </div>
  );
}

function Face({ id, profiles, me, size }: { id: string; profiles: Record<string, Person>; me: string; size: number }) {
  const who = displayOf(profiles, id, me);
  if (who.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img loading="lazy" decoding="async" src={who.photo} alt="" style={{ width: size, height: size, flex: 'none', borderRadius: '50%', objectFit: 'cover', objectPosition: `${who.fit.x}% ${who.fit.y}%`, transform: `scale(${who.fit.zoom})` }} />;
  }
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: 'none', borderRadius: '50%', background: who.hue,
      display: 'grid', placeItems: 'center', fontSize: size * 0.34, fontWeight: 700, color: '#0C0F16',
    }}>
      {who.initials}
    </span>
  );
}

function Arrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled}
      aria-label={side === 'left' ? 'Previous' : 'Next'} className="hov k-squish"
      style={{
        position: 'absolute', [side]: 14, zIndex: 2, width: 40, height: 40, borderRadius: 20,
        display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.1)',
        transform: side === 'right' ? 'rotate(180deg)' : undefined,
        opacity: disabled ? 0.25 : 1,
      }}>
      <Icon name="back" size={17} color="#fff" />
    </button>
  );
}
