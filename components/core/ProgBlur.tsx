'use client';

/**
 * Progressive blur — the iOS-style frosted edge.
 *
 * N stacked layers each sample the backdrop with growing blur. Every layer is
 * masked so the strong ones only reach a short distance in from the edge while
 * the weakest fades out across the whole band; because the layers sit on top of
 * each other, their blur compounds toward the edge. That compounding is what
 * makes the frost read as progressive instead of a flat sheet of glass.
 *
 * The band is sized to the edge it decorates, so each layer only filters its
 * own strip rather than the whole surface behind it. Engines without
 * backdrop-filter get a plain tinted gradient (the .pb-scrim fallback in
 * globals.css), which is why the scrim is always in the tree.
 */

const LAYERS = 4;

export function ProgBlur({
  edge = 'bottom',
  size = 72,
  strength = 14,
  tint,
  style,
}: {
  /** Which side of the parent the frost thickens toward. */
  edge?: 'top' | 'bottom' | 'left' | 'right';
  /** How far in from the edge the veil reaches, px. */
  size?: number;
  /** Blur at the deepest layer, px. Layers compound, so this reads stronger. */
  strength?: number;
  /** Tint colour washed into the fallback scrim and under the frost, for
      keeping text legible over busy art. Defaults to the card colour. */
  tint?: string;
  style?: React.CSSProperties;
}) {
  const away = edge === 'bottom' ? 'top' : edge === 'top' ? 'bottom' : edge === 'right' ? 'left' : 'right';
  const band: React.CSSProperties = edge === 'bottom' ? { left: 0, right: 0, bottom: 0, height: size }
    : edge === 'top' ? { left: 0, right: 0, top: 0, height: size }
    : edge === 'left' ? { top: 0, bottom: 0, left: 0, width: size }
    : { top: 0, bottom: 0, right: 0, width: size };

  const layerStyle = (blur: number, mask: string): React.CSSProperties => ({
    position: 'absolute', inset: 0,
    ['--pb' as string]: `${blur.toFixed(1)}px`,
    maskImage: mask,
    WebkitMaskImage: mask,
  });

  return (
    <div aria-hidden style={{
      position: 'absolute', pointerEvents: 'none', overflow: 'hidden', ...band, ...style,
    }}>
      {/* Scrim: the no-backdrop-filter fallback, and a faint legibility wash
          under the frost even where blur works. Gradient runs tint-strong at
          the edge to transparent away from it. */}
      <div className="pb-scrim" style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(to ${away}, color-mix(in srgb, ${tint || 'var(--card)'} 88%, transparent) 0%, transparent 92%)`,
      }} />
      {Array.from({ length: LAYERS }, (_, i) => {
        // Layer k of N: blur grows with k, reach shrinks. d is how far (in % of
        // the band) layer k stays visible; each layer fades over one step so
        // neighbours blend without banding.
        const k = i + 1;
        const d = ((LAYERS - k + 1) / LAYERS) * 100;
        const solid = Math.max(0, d - 100 / LAYERS);
        const mask = `linear-gradient(to ${away}, #000 0%, #000 ${solid}%, transparent ${d}%)`;
        return <div key={k} className="pb-layer" style={layerStyle((strength * k) / LAYERS, mask)} />;
      })}
    </div>
  );
}
