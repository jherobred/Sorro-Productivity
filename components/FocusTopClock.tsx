'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { remainingShare } from '@/lib/focusClock';
import { useFocus, focusActions, clockText, type FocusMode } from '@/lib/focusSession';
import { FocusRing } from './focus/FocusRing';
import { FocusChoices } from './focus/FocusChoices';

/**
 * The running focus timer, in the top bar beside Search.
 *
 * It only exists while a session does: running, paused part-way, or finished
 * and waiting for a choice. Tapping it opens the controls. When a run ends
 * anywhere but the Focus page, the choices open on their own, because the
 * person is somewhere else in the app and the bell alone does not say what
 * happens next.
 */
export function FocusTopClock() {
  const focus = useFocus();
  const pathname = usePathname();
  const onFocusPage = pathname.startsWith('/focus');
  const pill = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 64, right: 12 });
  const finished = focus.session.finished;
  const seen = useRef<FocusMode | null>(null);
  useOverlayBack(open, () => setOpen(false));

  useEffect(() => {
    if (finished && !seen.current && !onFocusPage) setOpen(true);
    if (!finished && seen.current) setOpen(false);
    seen.current = finished;
  }, [finished, onFocusPage]);

  useEffect(() => { if (!focus.active) setOpen(false); }, [focus.active]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = pill.current?.getBoundingClientRect();
      const width = panel.current?.offsetWidth ?? 272;
      if (rect) setPlace({ top: rect.bottom + 8, right: Math.max(8, Math.min(innerWidth - rect.right, innerWidth - width - 8)) });
    };
    measure();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !pill.current?.contains(target)) setOpen(false);
    };
    addEventListener('resize', measure);
    document.addEventListener('pointerdown', outside);
    return () => { removeEventListener('resize', measure); document.removeEventListener('pointerdown', outside); };
  }, [open]);

  if (!focus.active) return null;

  const { session } = focus;
  const tone = finished ? 'done' : session.mode;
  const minutes = Math.round(session.clock.duration / 60);
  const share = finished ? 1 : remainingShare(session.clock, focus.now);
  const name = session.mode === 'study' ? 'Focus' : 'Break';
  const status = finished
    ? `${finished === 'study' ? 'Focus session' : 'Break'} finished`
    : `${name} timer, ${clockText(focus.left)} left${focus.running ? '' : ', paused'}`;

  return (
    <>
      <button ref={pill} type="button" className={`focus-top-clock is-${tone}${focus.running ? ' is-running' : ''}`}
        aria-label={`${status}. Open timer`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <FocusRing share={share} size={20} stroke={3} tone={tone} smooth={focus.running} />
        {finished ? <Icon name="bell" size={15} /> : <span className="focus-top-time">{clockText(focus.left)}</span>}
        {!focus.running && !finished && <Icon name="pause" size={11} />}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div ref={panel} className="focus-top-panel" role="dialog" aria-label={finished ? status : 'Focus timer'} style={{ top: place.top, right: place.right }}>
          {finished ? (
            <>
              <FocusRing share={1} size={92} stroke={7} tone="done" smooth={false}>
                <Icon name={finished === 'study' ? 'check' : 'cup'} size={30} />
              </FocusRing>
              <FocusChoices finished={finished} size="small" onChosen={() => setOpen(false)} />
            </>
          ) : (
            <>
              <FocusRing share={share} size={132} stroke={8} tone={session.mode} smooth={focus.running}>
                <strong className="focus-top-big">{clockText(focus.left)}</strong>
                <small className="focus-top-mode">{name}</small>
              </FocusRing>
              <div className="focus-top-row" role="group" aria-label="Timer controls">
                <button type="button" className="focus-icon-button is-primary tip" data-tip={focus.running ? 'Pause' : 'Resume'}
                  aria-label={focus.running ? 'Pause timer' : 'Resume timer'} onClick={focusActions.toggle}>
                  <Icon name={focus.running ? 'pause' : 'play'} size={18} />
                </button>
                <button type="button" className="focus-icon-button tip" data-tip={`Restart from ${minutes}:00`}
                  aria-label={`Restart the timer from ${minutes} minutes`} onClick={() => focusActions.begin(session.mode, minutes)}>
                  <Icon name="refresh" size={17} />
                </button>
                <button type="button" className="focus-icon-button tip" data-tip="End this session"
                  aria-label="End this session" onClick={() => { focusActions.done(); setOpen(false); }}>
                  <Icon name="close" size={17} />
                </button>
                <Link href="/focus/" className="focus-icon-button tip" data-tip="Open Focus" aria-label="Open the Focus page" onClick={() => setOpen(false)}>
                  <Icon name="arrowR" size={17} />
                </Link>
              </div>
              <div className="focus-top-length" role="group" aria-label={`Timer length, ${minutes} minutes`}>
                <button type="button" className="focus-icon-button tip" data-tip="5 minutes shorter" aria-label="Make it 5 minutes shorter"
                  disabled={minutes <= 5} onClick={() => focusActions.retime(Math.max(5, minutes - 5))}>
                  <Icon name="minus" size={16} />
                </button>
                <span aria-hidden>{minutes} min</span>
                <button type="button" className="focus-icon-button tip" data-tip="5 minutes longer" aria-label="Make it 5 minutes longer"
                  onClick={() => focusActions.retime(minutes + 5)}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <div className="focus-top-presets" role="group" aria-label="Common lengths">
                {(session.mode === 'study' ? [15, 25, 50] : [5, 10, 15]).map((length) => (
                  <button type="button" key={length} className="tip" data-tip={`Make it ${length} minutes`} aria-label={`Make it ${length} minutes`}
                    aria-pressed={minutes === length} onClick={() => focusActions.retime(length)}>{length}</button>
                ))}
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
