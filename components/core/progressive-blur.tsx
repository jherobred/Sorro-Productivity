'use client';

import { motion, type HTMLMotionProps } from 'motion/react';

/**
 * Layered blur with gradient masks — motion-primitives' ProgressiveBlur.
 *
 * One `backdrop-filter` blur is flat: everything behind it is equally soft, so
 * the edge where the blur stops reads as a seam. This stacks `blurLayers`
 * copies instead, each blurred harder than the last and each masked to a
 * sliding window of the box, so the softness ramps along `direction` and the
 * seam disappears. That ramp is what gives depth over an image or a colour
 * field — text sits on the blurred end and stays readable without a scrim
 * flattening the art underneath.
 *
 * The blurs read whatever is painted behind them, so this must be a positioned
 * child of the thing being blurred, and `pointerEvents: 'none'` if that thing
 * is clickable.
 */

export const GRADIENT_ANGLES = { top: 0, right: 90, bottom: 180, left: 270 } as const;

export type ProgressiveBlurProps = {
  direction?: keyof typeof GRADIENT_ANGLES;
  /** Number of stacked blurs. More layers, smoother ramp, more compositing. */
  blurLayers?: number;
  /** Blur radius step in px, multiplied by the layer index. */
  blurIntensity?: number;
  /** Positions and sizes the ramp box; the layers fill it. */
  style?: React.CSSProperties;
} & Omit<HTMLMotionProps<'div'>, 'style'>;

export function ProgressiveBlur({
  direction = 'bottom',
  blurLayers = 8,
  blurIntensity = 0.25,
  style,
  ...props
}: ProgressiveBlurProps) {
  // Two layers is the floor at which a ramp exists at all.
  const layers = Math.max(blurLayers, 2);
  const step = 1 / layers;
  const angle = GRADIENT_ANGLES[direction];

  return (
    <div style={{ position: 'relative', ...style }}>
      {Array.from({ length: layers }).map((_, i) => {
        // Four stops: transparent, opaque, opaque, transparent. The opaque pair
        // is this layer's window; the window slides one step per layer, so
        // neighbours overlap and no hard edge survives.
        const gradient = `linear-gradient(${angle}deg, ${[i, i + 1, i + 2, i + 3]
          .map((s, si) => `rgba(255,255,255,${si === 1 || si === 2 ? 1 : 0}) ${s * step * 100}%`)
          .join(', ')})`;

        return (
          <motion.div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              maskImage: gradient,
              WebkitMaskImage: gradient,
              backdropFilter: `blur(${i * blurIntensity}px)`,
              WebkitBackdropFilter: `blur(${i * blurIntensity}px)`,
            }}
            {...props}
          />
        );
      })}
    </div>
  );
}
