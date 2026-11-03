'use client';
import { Fox, type FoxPose } from './Fox';
import { useFoxMood, type FoxMood } from '@/lib/foxMood';

const POSE: Record<FoxMood, FoxPose> = { sit: 'sit', run: 'run', sleep: 'sleep', glad: 'glad' };

/** The SORRO lockup: the fox, alive, beside the tracked wordmark from the Grok brand. */
export function Wordmark({ size = 'md', word = true }: { size?: 'sm' | 'md' | 'lg'; word?: boolean }) {
  const mood = useFoxMood();
  const px = size === 'sm' ? 18 : size === 'lg' ? 34 : 22;
  return <span className={'sx-mark sx-mark-' + size} data-mood={mood}>
    <span className="sx-fox" data-part="S.fox" title={mood === 'sleep' ? 'Asleep. Do something to wake it.' : undefined}><Fox pose={POSE[mood]} size={px} /></span>
    {word && <svg className="sx-mark-word" viewBox="0 0 132 20" role="img" aria-label="SORRO"><text x="0" y="16" fontFamily="var(--font-mark)" fontSize="19" fontWeight="500" letterSpacing="7.4">SORRO</text></svg>}
  </span>;
}
