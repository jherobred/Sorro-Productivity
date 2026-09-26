'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { AsciiBar } from '@/components/AsciiBar';
import { useOverlayBack } from '@/lib/nav';
import { useScreenAwake } from '@/lib/useScreenAwake';
import type { Ev } from '@/lib/events';

export function CountdownFocus({ event, clock, ongoing, time24, dayPercent, onClose }: {
  event?: Ev; clock: string; ongoing: boolean; time24: boolean; dayPercent: number; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keepOn, setKeepOn] = useState(false);
  const { status, retry } = useScreenAwake(keepOn && !!event);
  useOverlayBack(true, onClose);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !time24 });
  const statusText = status === 'on' ? 'Screen stays on while this view is open.'
    : status === 'starting' ? 'Keeping the screen on…'
    : status === 'paused' ? 'Screen lock paused. Return to this view or retry.'
    : status === 'unavailable' ? 'Keep-screen-on is unavailable in this browser or app version.'
    : status === 'error' ? 'The device declined the screen lock. Check battery saver, then retry.'
    : 'Your normal screen timeout is active.';
  return createPortal(<dialog ref={dialog} className="cal-countdown-focus" aria-labelledby="countdown-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2 id="countdown-title">Calendar countdown</h2><button className="studio-button" onClick={onClose}><Icon name="close" size={18}/>Close focus</button></header>
    <div className="countdown-stage">
      <p>{event ? ongoing ? 'Time left in this event' : 'Time until your next event' : 'Your calendar is clear'}</p>
      <strong role="timer" aria-live="off">{event ? clock : '—'}</strong>
      <h3>{event?.title || 'Nothing else scheduled this week.'}</h3>
      {event && <p>{new Date(event.starts_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}<br/>{time(event.starts_at)} – {time(event.ends_at)}{event.location && <><br/>{event.location}</>}</p>}
      <AsciiBar value={dayPercent} showValue={false} label="How much of today has passed"/>
      <small>{Math.round(dayPercent)}% of today elapsed</small>
    </div>
    <footer className="countdown-options"><label><input type="checkbox" checked={keepOn} disabled={!event} onChange={e => setKeepOn(e.target.checked)}/>Keep screen on</label><p role="status">{statusText}</p>{(status === 'error' || status === 'paused') && <button className="studio-button" onClick={retry}>Retry screen lock</button>}</footer>
  </dialog>, document.body);
}
