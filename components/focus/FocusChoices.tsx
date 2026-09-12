'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { focusActions, type FocusMode } from '@/lib/focusSession';
import { FocusRing } from './FocusRing';

const BREAK_MINUTES = 15;
const FOCUS_MINUTES = 25;
const MORE = [5, 10, 15, 25];

/**
 * What to do when a run ends, asked with pictures instead of a sentence.
 *
 * Every button still says exactly what it does, in a tooltip on hover or
 * keyboard focus and in its accessible name, so nothing depends on reading
 * the icon correctly.
 */
export function FocusChoices({ finished, onChosen, size = 'large' }: {
  finished: FocusMode;
  onChosen?: () => void;
  size?: 'large' | 'small';
}) {
  const [adding, setAdding] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const icon = size === 'large' ? 30 : 24;
  const choose = (run: () => void) => { run(); setAdding(false); onChosen?.(); };

  // Only follow the person's own clicks with focus. The choices can appear on
  // their own when a run ends mid-sentence somewhere else, and must not take
  // the caret away from what is being typed.
  const shown = useRef(adding);
  useEffect(() => {
    if (shown.current === adding) return;
    shown.current = adding;
    group.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [adding]);

  if (adding) {
    return (
      <div ref={group} className={`focus-choices is-${size}`} role="group" aria-label="How much more time?">
        {MORE.map((minutes) => {
          const label = `Add ${minutes} more minutes`;
          return (
            <button key={minutes} className="focus-choice is-amount tip" data-tip={label} aria-label={label}
              onClick={() => choose(() => focusActions.extend(minutes))}>
              <FocusRing share={minutes / 60} size={size === 'large' ? 58 : 46} stroke={5} smooth={false}>
                <span aria-hidden>+{minutes}</span>
              </FocusRing>
            </button>
          );
        })}
        <button className="focus-choice is-back tip" data-tip="Back" aria-label="Back to the other choices" onClick={() => setAdding(false)}>
          <Icon name="back" size={icon - 6} />
        </button>
      </div>
    );
  }

  const next = finished === 'study'
    ? { label: `Take a ${BREAK_MINUTES}-minute break`, icon: 'cup' as const, badge: String(BREAK_MINUTES), run: () => focusActions.begin('break', BREAK_MINUTES), tone: 'is-break' }
    : { label: `Start another ${FOCUS_MINUTES}-minute focus session`, icon: 'target' as const, badge: String(FOCUS_MINUTES), run: () => focusActions.begin('study', FOCUS_MINUTES), tone: 'is-again' };

  return (
    <div ref={group} className={`focus-choices is-${size}`} role="group" aria-label={finished === 'study' ? 'Focus session finished. What next?' : 'Break finished. What next?'}>
      <button className={`focus-choice ${next.tone} tip`} data-tip={next.label} aria-label={next.label} onClick={() => choose(next.run)}>
        <Icon name={next.icon} size={icon} />
        <span className="focus-choice-badge" aria-hidden>{next.badge}</span>
      </button>
      <button className="focus-choice is-done tip" data-tip="I’m done for now" aria-label="I’m done for now" onClick={() => choose(focusActions.done)}>
        <Icon name="check" size={icon} />
      </button>
      <button className="focus-choice is-more tip" data-tip="Add more time" aria-label="Add more time" onClick={() => setAdding(true)}>
        <Icon name="clock" size={icon} />
        <span className="focus-choice-badge" aria-hidden>+</span>
      </button>
    </div>
  );
}
