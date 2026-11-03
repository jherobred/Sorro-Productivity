export type FoxPose = 'head' | 'sit' | 'alert' | 'glad' | 'sleep' | 'run';

/**
 * The Sorro fox as a mask, so it takes the theme's colour instead of carrying its own.
 * `run` steps through a seven-frame strip (public/brand/fox-run.png); `.nomo` holds it on one frame.
 */
export function Fox({ pose, size = 20, tone = 'ink' }: { pose: FoxPose; size?: number; tone?: 'ink' | 'muted' | 'accent' }) {
  if (pose === 'run') {
    return <span aria-hidden="true" className="fox-run" style={{ width: Math.round(size * 261 / 160), height: size, background: `var(--${tone})` }} />;
  }
  const url = `url(/brand/fox-${pose}.png)`;
  return <span aria-hidden="true" style={{
    display: 'inline-block', flex: 'none', width: size, height: size, background: `var(--${tone})`,
    WebkitMaskImage: url, maskImage: url, WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center',
  }} />;
}
