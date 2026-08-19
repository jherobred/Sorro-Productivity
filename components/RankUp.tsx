'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { rankOf, type Rank } from '@/lib/rank';
import { useOverlayBack } from '@/lib/nav';

/**
 * The promotion card.
 *
 * A ladder that only ever shows a number is a spreadsheet. The moment the RP
 * total crosses a division boundary is the one moment the competitive mode has
 * to spend something on, so it interrupts: the old badge dissolves, the new one
 * arrives with a ring and a burst, and the card names both.
 *
 * It fires on the transition, not on the value, so it appears once per
 * promotion and never on a reload. The last rank seen is kept in localStorage
 * against the user's id, because that is what "since you last looked" means
 * across a page refresh.
 *
 * A demotion gets the same card in a quieter key. Hiding a drop would make the
 * number stop matching the badge, and that is worse than being told.
 */

const LS_KEY = 'bd.lastRank';

type Seen = { label: string; rp: number };

function read(uid: string): Seen | null {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, Seen>;
    return all[uid] ?? null;
  } catch { return null; }
}

function write(uid: string, seen: Seen) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, Seen>;
    all[uid] = seen;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* private mode, or a full quota — the card is not worth throwing over */ }
}

/**
 * Watches an RP total and returns the promotion to announce, if any.
 * `uid` scopes the memory so two accounts on one device do not inherit each
 * other's ladder.
 */
export function useRankUp(rp: number | undefined, uid: string) {
  const [move, setMove] = useState<{ from: Rank; to: Rank; up: boolean } | null>(null);
  // The first render after data arrives is a read, not a change.
  const primed = useRef(false);

  useEffect(() => {
    if (rp == null || !uid) return;
    const now = rankOf(rp);
    const seen = read(uid);

    if (!seen) { write(uid, { label: now.label, rp }); primed.current = true; return; }
    if (seen.label === now.label) { primed.current = true; return; }

    const before = rankOf(seen.rp);
    write(uid, { label: now.label, rp });
    // Only announce a move we watched happen, not one that happened while the
    // app was closed and is already reflected everywhere on screen.
    if (primed.current) setMove({ from: before, to: now, up: rp > seen.rp });
    primed.current = true;
  }, [rp, uid]);

  return { move, dismiss: () => setMove(null) };
}

export function RankUpCard({ from, to, up, onClose }: {
  from: Rank; to: Rank; up: boolean; onClose: () => void;
}) {
  useOverlayBack(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hue = to.tier.hue;
  const tierChanged = from.tier.name !== to.tier.name;

  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      aria-label={`${up ? 'Promoted' : 'Demoted'} to ${to.label}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 140, display: 'grid', placeItems: 'center',
        padding: 20, background: 'rgba(4,4,8,.72)', backdropFilter: 'blur(6px)',
      }}>
      <div onClick={(e) => e.stopPropagation()} className="rankup"
        style={{
          position: 'relative', width: 340, maxWidth: '100%', padding: '30px 26px 24px',
          borderRadius: 22, textAlign: 'center', overflow: 'hidden',
          background: 'var(--card)', border: `1px solid color-mix(in srgb, ${hue} 40%, transparent)`,
          boxShadow: `0 24px 60px -20px color-mix(in srgb, ${hue} 55%, transparent), var(--shl)`,
          ['--hue' as string]: hue,
        }}>
        {/* Light behind the badge, so the card reads as lit rather than tinted. */}
        <span aria-hidden className="rankup-aur" style={{
          position: 'absolute', left: '50%', top: -60, width: 260, height: 260, marginLeft: -130,
          borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, color-mix(in srgb, ${hue} 42%, transparent) 0%, transparent 68%)`,
        }} />

        <div style={{
          position: 'relative', fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em',
          textTransform: 'uppercase', color: up ? hue : 'var(--tx3)',
        }}>
          {up ? (tierChanged ? 'New tier' : 'Promoted') : 'Demoted'}
        </div>

        <div style={{ position: 'relative', margin: '18px auto 0', width: 108, height: 108 }}>
          {up && (
            <>
              <span aria-hidden className="rankup-ring" />
              <span aria-hidden className="rankup-ring rankup-ring2" />
            </>
          )}
          <span className="rankup-badge" style={{
            position: 'absolute', inset: 0, borderRadius: 30, display: 'grid', placeItems: 'center',
            background: `color-mix(in srgb, ${hue} 22%, var(--card2))`,
            border: `2px solid color-mix(in srgb, ${hue} 62%, transparent)`,
          }}>
            <Icon name="trophy" size={46} color={hue} />
          </span>
          {up && Array.from({ length: 10 }, (_, i) => (
            <span key={i} aria-hidden className="rankup-spark" style={{
              ['--a' as string]: `${i * 36}deg`,
              ['--d' as string]: `${90 + (i % 3) * 22}px`,
              animationDelay: `${0.22 + (i % 5) * 0.03}s`,
            }} />
          ))}
        </div>

        <div className="rankup-label" style={{
          marginTop: 18, fontSize: 25, fontWeight: 800, letterSpacing: '-.03em', color: hue,
        }}>
          {to.label}
        </div>

        <div style={{ marginTop: 7, fontSize: 12, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
          {from.label} → {to.label} · {to.rp} RP
        </div>
        {to.toNext !== null && (
          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--tx3)' }}>
            {to.toNext} RP to {up ? 'the next one' : 'get it back'}
          </div>
        )}

        <button onClick={onClose} autoFocus className="k-squish"
          style={{
            marginTop: 20, width: '100%', minHeight: 44, borderRadius: 13,
            background: hue, color: '#0C0F16', fontSize: 13, fontWeight: 800,
          }}>
          {up ? 'Nice' : 'Understood'}
        </button>
      </div>
    </div>
  );
}
