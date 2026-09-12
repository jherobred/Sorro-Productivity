'use client';

import { useObjectCover, type CoverKind } from '@/lib/objectCovers';

const COLORS = ['#ffcd38', '#3985ed', '#fa614e', '#73b88b', '#d4b6e6', '#f0cbb5'];
function hash(seed: string) {
  let value = 2166136261;
  for (const character of seed) { value ^= character.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

/** Flat, printed colour and halftone texture, derived from the user's posters. */
export function coverArt(seed: string, _color?: string): string {
  return COLORS[hash(seed || 'notebook') % COLORS.length];
}

export function NotebookCover({ seed, color, className, style, targetKind = 'notebook', imageUrl }: {
  seed: string; color?: string; className?: string; style?: React.CSSProperties;
  targetKind?: CoverKind; imageUrl?: string;
}) {
  const cover = useObjectCover(targetKind, seed);
  const source = cover.url || imageUrl;
  const variation = hash(seed) % 3;
  return <div aria-hidden className={className} data-object-cover={`${targetKind}:${seed}`} style={{ position: 'absolute', inset: 0, background: coverArt(seed, color), overflow: 'hidden', ...style }}>
    {!source && <>
      <div style={{ position: 'absolute', width: '80%', aspectRatio: '1', right: '-25%', top: '-55%', border: '28px solid #141414', borderRadius: variation === 1 ? '50%' : 18, transform: `rotate(${variation === 2 ? 25 : -17}deg)`, opacity: .9 }} />
      <div style={{ position: 'absolute', inset: '20% 5% -30% 52%', transform: 'rotate(20deg)', backgroundImage: 'radial-gradient(#141414 1px, transparent 1px)', backgroundSize: '5px 5px', opacity: .4 }} />
      <div style={{ position: 'absolute', height: 16, width: '40%', left: '7%', bottom: '22%', background: '#fff4', transform: 'rotate(-12deg)' }} />
    </>}
    {source && <img src={source} alt="" loading="lazy" draggable={false} style={{ position: 'absolute', inset: cover.url ? '8%' : 0, width: cover.url ? '84%' : '100%', height: cover.url ? '84%' : '100%', objectFit: cover.url ? 'contain' : 'cover', filter: cover.url ? 'drop-shadow(0 6px 3px #0002)' : undefined }} />}
  </div>;
}

export function ObjectCoverImage({ targetKind, targetId, className, style }: {
  targetKind: CoverKind; targetId: string; className?: string; style?: React.CSSProperties;
}) {
  const cover = useObjectCover(targetKind, targetId);
  if (!cover.url) return null;
  return <img data-object-cover={`${targetKind}:${targetId}`} className={className} src={cover.url} alt="" loading="lazy" draggable={false} style={{ width: 44, height: 44, objectFit: 'contain', flex: 'none', ...style }} />;
}
