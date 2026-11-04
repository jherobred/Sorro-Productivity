'use client';
import Link from 'next/link';
import { Fox, type FoxPose } from './Fox';
import { useFoxMood, type FoxMood } from '@/lib/foxMood';

const POSE: Record<FoxMood, FoxPose> = { sit: 'sit', run: 'run', sleep: 'sleep', glad: 'glad', talk: 'alert' };

/**
 * The SORRO lockup: the fox, alive, beside the tracked wordmark from the Grok brand.
 * With `onFox` the fox is a button that opens its chat and the word links home, so no button sits inside a link.
 */
export function Wordmark({ size = 'md', word = true, onFox }: { size?: 'sm' | 'md' | 'lg'; word?: boolean; onFox?: () => void }) {
  const mood = useFoxMood();
  const px = size === 'sm' ? 18 : size === 'lg' ? 34 : 22;
  const fox = <Fox pose={POSE[mood]} size={px} />;
  const title = mood === 'sleep' ? 'Asleep. Do something to wake it.' : mood === 'talk' ? 'Sorro has a reply for you.' : undefined;
  const svg = word && <svg className="sx-mark-word" viewBox="0 0 132 20" role="img" aria-label="SORRO"><text x="0" y="16" fontFamily="var(--font-mark)" fontSize="19" fontWeight="500" letterSpacing="7.4">SORRO</text></svg>;
  return <span className={'sx-mark sx-mark-' + size} data-mood={mood}>
    {onFox
      ? <button type="button" className="sx-fox sx-fox-btn" data-part="S.fox" aria-label="Talk to Sorro" title={title ?? 'Talk to Sorro'} onClick={onFox}>{fox}</button>
      : <span className="sx-fox" data-part="S.fox" title={title}>{fox}</span>}
    {svg && (onFox ? <Link href="/home/" aria-label="Sorro home">{svg}</Link> : svg)}
  </span>;
}
