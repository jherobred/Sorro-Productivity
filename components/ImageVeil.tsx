'use client';

import type { Framing } from '@/lib/shelfPrefs';

/**
 * A picture filling its box, with an optional blur over part of it.
 *
 * ProgBlur does this with backdrop-filter, which samples whatever is painted
 * behind the element. That is right for frosting arbitrary page content and
 * wrong here: the backdrop is re-sampled as the page scrolls, and the veil
 * visibly lags the card it belongs to before catching up. What we are
 * blurring is the card's own picture, which we already have — so this stacks
 * blurred copies of the image instead. Nothing outside the box is read, so
 * there is nothing to fall behind.
 *
 * Three copies at rising blur under tightening masks, rather than one, so the
 * fade compounds toward the edge and reads as progressive instead of as a
 * sheet of glass with a gradient on it.
 *
 * Rotation needs the layer's axes swapped at 90 and 270 or a wide picture
 * turned upright no longer covers a wide box. Container query units read the
 * other axis of the box, which plain percentages cannot.
 */

const STOPS = [
  { blur: 1, from: 0.42 },
  { blur: 0.45, from: 0.66 },
  { blur: 0.18, from: 0.84 },
];

const DIRECTION: Record<string, string> = {
  top: 'to bottom', bottom: 'to top', left: 'to right', right: 'to left',
};

export function ImageVeil({ url, frame }: { url: string; frame: Framing | undefined }) {
  const rot = ((frame?.rot ?? 0) % 360 + 360) % 360;
  const turned = rot === 90 || rot === 270;
  const blur = frame?.blur ?? 0;
  const edge = frame?.blurEdge ?? 'none';

  const layer: React.CSSProperties = {
    position: 'absolute', left: '50%', top: '50%',
    width: turned ? '100cqh' : '100cqw',
    height: turned ? '100cqw' : '100cqh',
    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
    objectFit: frame?.fit ?? 'cover',
    objectPosition: `${frame?.x ?? 50}% ${frame?.y ?? 50}%`,
  };

  return (
    <span aria-hidden style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      containerType: 'size', contain: 'paint',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={layer} />

      {blur > 0 && edge !== 'none' && (edge === 'full'
        ? <img src={url} alt="" style={{ ...layer, filter: `blur(${blur}px)` }} />
        : STOPS.map((s, i) => {
          const mask = `linear-gradient(${DIRECTION[edge] ?? 'to bottom'}, #000 0%, #000 ${Math.round(s.from * 100)}%, transparent 100%)`;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" style={{
              ...layer,
              filter: `blur(${Math.max(1, blur * s.blur)}px)`,
              WebkitMaskImage: mask, maskImage: mask,
            }} />
          );
        }))}
    </span>
  );
}
