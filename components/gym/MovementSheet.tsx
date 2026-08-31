'use client';

import { useEffect, useState } from 'react';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { Icon } from '@/components/Icon';
import { ExerciseArt } from '@/components/body/ExerciseArt';
import { shotOf, artOf, gearOf, workedOf } from '@/lib/lift';
import { formOf } from '@/lib/liftForm';

/**
 * What the movement actually is.
 *
 * Two photographs, the start and the finish, crossfaded on a slow beat — which
 * is what a demonstration GIF communicates, at a fraction of the weight and
 * with no network. Under them, the dataset's own step text: the 90-degree
 * forearm angle on a bench press, the "pouring water" cue on a lateral raise.
 * Written by people who coach the lift, not by me.
 *
 * A missing frame is handled rather than assumed away. Some entries upstream
 * have a broken second image, so the crossfade falls back to holding frame 0,
 * and a missing pair falls back to the drawn art — a broken-image icon in the
 * middle of a workout is worse than a diagram.
 */

const BEAT_MS = 1600;

export function MovementSheet({
  exercise, subtitle, onClose,
}: {
  exercise: string;
  /** The set line from the row that opened this, e.g. "Set 3 of 4 · 60 kg × 8". */
  subtitle?: string;
  onClose: () => void;
}) {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  useOverlayBack(true, onClose);

  const id = shotOf(exercise);
  const form = formOf(id);
  const [frame, setFrame] = useState(0);
  const [broken, setBroken] = useState<[boolean, boolean]>([false, false]);

  const canAnimate = !!id && !broken[0] && !broken[1] && prefs.motion;

  useEffect(() => {
    if (!canAnimate) { setFrame(0); return; }
    const t = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), BEAT_MS);
    return () => clearInterval(t);
  }, [canAnimate]);

  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(6,5,11,.74)',
        backdropFilter: 'blur(4px)', display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 20,
      }}
    >
      <div className={phone ? 'rise' : 'k-bloom'} style={{
        width: 500, maxWidth: '100%', maxHeight: phone ? '90dvh' : '86dvh', overflowY: 'auto',
        background: 'var(--panel)', border: '1px solid var(--line2)',
        borderRadius: phone ? '18px 18px 0 0' : 20,
        padding: phone ? '10px 15px calc(18px + env(safe-area-inset-bottom))' : '16px 20px 20px',
        display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: phone ? 'none' : '0 24px 64px rgba(0, 0, 0, 0.75)',
      }}>
        {phone ? (
          <div style={{ width: 34, height: 3.5, borderRadius: 2, background: 'var(--line2)', margin: '0 auto 2px' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -2 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
              Movement Details
            </span>
            <button
              onClick={onClose}
              className="hov k-squish"
              aria-label="Close"
              style={{
                width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
                background: 'var(--card2)', border: '1px solid var(--line2)', cursor: 'pointer',
              }}
            >
              <Icon name="close" size={13} color="var(--tx2)" />
            </button>
          </div>
        )}

        <div style={{
          position: 'relative', width: '100%', aspectRatio: '3/2', borderRadius: 12,
          overflow: 'hidden', background: 'var(--card2)',
        }}>
          {id && !broken[0] ? (
            [0, 1].map((n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={n}
                src={`/ex/${id}-${n}.jpg`}
                alt={n === 0 ? `${exercise}, starting position` : ''}
                aria-hidden={n === 1 || undefined}
                onError={() => setBroken((b) => (n === 0 ? [true, b[1]] : [b[0], true]))}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                  opacity: broken[1] ? (n === 0 ? 1 : 0) : frame === n ? 1 : 0,
                  transition: prefs.motion ? 'opacity .55s ease' : 'none',
                }}
              />
            ))
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              <ExerciseArt art={artOf(exercise)} />
            </div>
          )}
          <span style={{
            position: 'absolute', left: 8, bottom: 8, zIndex: 3, fontFamily: 'var(--font-mono)',
            fontSize: 8.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
            padding: '4px 7px', borderRadius: 5, background: 'rgba(11,10,19,.8)',
            border: '1px solid var(--line2)', color: 'var(--tx)',
          }}>
            {broken[1] ? 'Starting position' : frame === 0 ? 'Start' : 'Finish'}
          </span>
        </div>

        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.028em', lineHeight: 1.15 }}>
            {form?.name ?? exercise}
          </div>
          {subtitle && (
            <div className="num" style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>{subtitle}</div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(form?.primary ?? [workedOf(exercise)]).map((m) => <Fact key={m} primary>{m}</Fact>)}
          {(form?.secondary ?? []).map((m) => <Fact key={m}>{m}</Fact>)}
          <Fact>{gearOf(exercise)}</Fact>
          {form?.level && <Fact>{form.level}</Fact>}
          {form?.mechanic && <Fact>{form.mechanic}</Fact>}
        </div>

        {form ? (
          <ol style={{ counterReset: 'step', display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
            {form.steps.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, lineHeight: 1.5, color: 'var(--tx2)' }}>
                <span style={{
                  flex: 'none', width: 16, height: 16, borderRadius: '50%', background: 'var(--card2)',
                  color: 'var(--accTx)', fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700,
                  lineHeight: '16px', textAlign: 'center', marginTop: 1,
                }}>{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: 0, lineHeight: 1.5 }}>
            No form notes for this one — it was typed in rather than picked from the catalogue.
          </p>
        )}

        <p style={{
          fontSize: 9, lineHeight: 1.45, color: 'var(--tx3)', borderTop: '1px solid var(--line)',
          paddingTop: 8, margin: 0,
        }}>
          Photographs and form notes from free-exercise-db, released under the Unlicense.
        </p>
      </div>
    </div>
  );
}

function Fact({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.06em',
      textTransform: 'uppercase', padding: '4px 7px', borderRadius: 5,
      background: primary ? 'color-mix(in srgb, var(--accTx) 17%, transparent)' : 'var(--card2)',
      color: primary ? 'var(--accTx)' : 'var(--tx2)',
      border: `1px solid ${primary ? 'color-mix(in srgb, var(--accTx) 34%, transparent)' : 'var(--line)'}`,
    }}>{children}</span>
  );
}
