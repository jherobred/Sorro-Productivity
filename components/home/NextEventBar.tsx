'use client';

import { useEffect, useState } from 'react';
import { AsciiBar } from '@/components/AsciiBar';
import { countdownText, eventCountdown } from '@/lib/todayCycle';

/**
 * The bar under Up next: how long until the next event starts, or until the
 * current one ends. It keeps its own one-second timer, so the rest of the
 * Today page does not re-render every second to move these digits.
 */
export function NextEventBar({ next, previousEnd, startLabel, endLabel }: {
  next: { starts_at: string; ends_at: string };
  /** When the event before it today ended, if there was one. */
  previousEnd: string | null;
  startLabel: string;
  endLabel: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const countdown = eventCountdown(next, previousEnd, now);
  const words = (countdown.ongoing ? 'Ends in ' : 'Starts in ') + countdownText(countdown.msLeft);
  return (
    <div className="next-event-bar">
      <AsciiBar value={countdown.share * 100} hue={countdown.ongoing ? '#bfd8ff' : '#f5df4d'}
        label={countdown.ongoing ? 'Time through this event' : 'Time until the next event'}
        text={words} rightText={countdown.ongoing ? 'until ' + endLabel : 'at ' + startLabel} />
    </div>
  );
}
