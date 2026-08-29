'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Mascot } from '@/components/challenges/Mascot';
import { Icon } from '@/components/Icon';
import { ANIMALS, type Animal } from '@/lib/mascot';
import { PAL } from '@/lib/pal';

/**
 * Four screens, no keyboard.
 *
 * The old version opened on an empty text field and asked for your name — on a
 * phone, that is a keyboard covering half the screen before the app has shown
 * you anything, and three more fields after it. Two of those questions had
 * answers already: **you signed in with Google**, so your name and your
 * picture were sitting in the session the whole time. Asking for them again is
 * the app admitting it did not look.
 *
 * What is left is only what nobody else can answer, and all of it is a tap:
 * which creature is you, what you study, what you want to track. Course and
 * year come from a list rather than a field, because "BSCS" / "BS CompSci" /
 * "bs computer science" typed by three people is three courses, and every one
 * of them is slower than pressing a chip.
 *
 * The creature comes first on purpose. It is the only question here that is
 * *fun*, it is the one whose answer shows up on every leaderboard afterwards,
 * and a first screen that asks you to choose a fox is a different app from one
 * that asks you to fill in a form.
 *
 * Everything on screens two and three is skippable and all of it is editable
 * in Profile. Nothing here is worth blocking somebody at the door for.
 */

const COURSES = [
  'BS Computer Science', 'BS Information Technology', 'BS Computer Engineering',
  'BS Civil Engineering', 'BS Mechanical Engineering', 'BS Electrical Engineering',
  'BS Architecture', 'BS Nursing', 'BS Medical Technology', 'BS Psychology',
  'BS Accountancy', 'BS Business Administration', 'BS Hospitality Management',
  'BS Education', 'BS Criminology', 'BS Biology', 'AB Communication', 'AB Political Science',
];

const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year'];

const INTERESTS = [
  'Study', 'Fitness', 'Money', 'Reading', 'Coding', 'Art',
  'Music', 'Sleep', 'Cooking', 'Running', 'Journaling', 'Gaming',
];

/** A different accent per creature, so the picker is a row of colours too. */
const HUES = [PAL.amber, PAL.coral, PAL.sky, PAL.mint, PAL.indigo, PAL.cyan, PAL.violet, PAL.pink];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  /** From the Google session. Never asked for, always editable in Profile. */
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Google hands these over at sign-in. `full_name` on most accounts, `name`
  // on a few; `picture` is what the OIDC claim is called and `avatar_url` is
  // what Supabase copies it to, so both are checked.
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const m = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const n = [m.full_name, m.name, data.user?.email?.split('@')[0]].find(
        (v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (n) setName(n.trim());
      const pic = [m.avatar_url, m.picture].find(
        (v): v is string => typeof v === 'string' && v.startsWith('http'));
      if (pic) setPhoto(pic);
    });
  }, []);

  const firstName = name.split(' ')[0] || 'friend';

  async function finish() {
    setBusy(true);
    // One RPC does the whole seed transactionally: profile, term, first
    // notebook + section, the three task lists and the two money accounts.
    const { error } = await supabase.rpc('bd_complete_onboarding', {
      p_name: name.trim() || 'Student',
      p_handle: '',
      p_course: course,
      p_year: year,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_interests: picks,
    });

    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }

    // The creature and the Google picture are a second write rather than more
    // arguments on the RPC: they are cosmetic, the seed above is not, and a
    // signature change would need every existing caller to move with it. A
    // failure here costs you a default animal, not an account.
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from('bd_profiles')
        .update({ animal, ...(photo ? { photo_url: photo } : {}) })
        .eq('user_id', u.user.id);
    }

    // Fill the account with the prototype's fixture content so every surface
    // has something in it on first open. No-ops if tasks already exist.
    await supabase.rpc('bd_seed_demo');

    router.replace('/home/');
  }

  const steps = [
    { title: name ? `Pick your creature, ${firstName}.` : 'Pick your creature.', sub: 'It is you on every leaderboard. You can change it later.', ok: !!animal },
    { title: 'What are you studying?', sub: 'Both optional — this only shapes your first timetable.', ok: true },
    { title: 'What do you want to track?', sub: 'Pick a few. They become your first habits.', ok: true },
    { title: `You're set, ${firstName}.`, sub: 'Everything here is editable in Profile.', ok: true },
  ];

  const hue = animal ? HUES[ANIMALS.indexOf(animal) % HUES.length] : PAL.amber;

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        color: 'var(--tx)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          {steps.map((_, i) => (
            <span
              key={i}
              className="tt"
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: i <= step ? 'var(--acc)' : 'var(--line2)',
                transition: 'background-color .3s',
              }}
            />
          ))}
        </div>

        <div key={step} className="pagein">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em', textWrap: 'pretty' }}>
            {steps[step].title}
          </h1>
          <p style={{ marginTop: 7, marginBottom: 20, fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            {steps[step].sub}
          </p>
        </div>

        {step === 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {ANIMALS.map((a, i) => {
              const on = animal === a;
              return (
                <button
                  key={a}
                  onClick={() => setAnimal(a)}
                  aria-pressed={on}
                  className="k-squish"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 4px 9px', borderRadius: 16, minHeight: 92,
                    border: `1.5px solid ${on ? HUES[i % HUES.length] : 'var(--line2)'}`,
                    background: on
                      ? `color-mix(in srgb, ${HUES[i % HUES.length]} 15%, transparent)`
                      : 'var(--card)',
                    transition: 'border-color .2s, background-color .2s',
                  }}
                >
                  <Mascot id={`pick-${a}`} animal={a} mood={on ? 'blazing' : 'keen'}
                    hue={HUES[i % HUES.length]} size={38} />
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
                    color: on ? 'var(--tx)' : 'var(--tx3)',
                  }}>
                    {a}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && (
          <>
            <Kicker>Course</Kicker>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              {COURSES.map((c) => (
                <Chip key={c} on={course === c} onClick={() => setCourse(course === c ? '' : c)}>{c}</Chip>
              ))}
            </div>

            <Kicker>Year</Kicker>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {YEARS.map((y) => (
                <Chip key={y} on={year === y} onClick={() => setYear(year === y ? '' : y)}>{y}</Chip>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
            {INTERESTS.map((it) => {
              const on = picks.includes(it);
              return (
                <button
                  key={it}
                  onClick={() => setPicks((p) => (on ? p.filter((x) => x !== it) : [...p, it]))}
                  aria-pressed={on}
                  className="tt k-squish"
                  style={{
                    minHeight: 44,
                    padding: '10px 12px',
                    borderRadius: 12,
                    fontSize: 12.5,
                    fontWeight: 600,
                    border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                    background: on ? 'var(--hov)' : 'transparent',
                    color: on ? 'var(--accTx)' : 'var(--tx2)',
                  }}
                >
                  {it}
                </button>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18,
            background: 'var(--card)', border: '1px solid var(--line)',
          }}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={photo} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
            ) : (
              <span style={{ flex: 'none' }}>
                {animal && <Mascot id="me" animal={animal} mood="blazing" hue={hue} size={52} />}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-.02em' }}>{name || 'Student'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>
                {[course, year].filter(Boolean).join(' · ') || 'Course not set'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
                {picks.length ? `Tracking ${picks.length}` : 'Nothing tracked yet'}
                {animal ? ` · ${animal}` : ''}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 22 }}>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="hov k-squish"
              aria-label="Back"
              style={{
                width: 48, minHeight: 46, borderRadius: 14, flex: 'none',
                border: '1px solid var(--line2)', display: 'grid', placeItems: 'center',
              }}
            >
              <Icon name="chev" size={15} color="var(--tx2)" />
            </button>
          )}
          <button
            onClick={() => (step === 3 ? finish() : setStep((s) => s + 1))}
            disabled={!steps[step].ok || busy}
            className="acc k-squish"
            style={{
              flex: 1, minHeight: 46, padding: '13px 16px', borderRadius: 14,
              background: 'var(--acc)', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700,
              opacity: steps[step].ok && !busy ? 1 : 0.45,
            }}
          >
            {step === 3 ? (busy ? 'Setting up…' : 'Open Basedly') : 'Continue'}
          </button>
        </div>

        {/* Skipping is a real answer on the two optional screens, and saying so
            out loud beats a Continue that people press without an answer and
            then wonder whether they broke something. */}
        {(step === 1 || step === 2) && (
          <button
            onClick={() => setStep((s) => s + 1)}
            style={{ display: 'block', margin: '12px auto 0', fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}
          >
            Skip this
          </button>
        )}

        {err && (
          <p className="fade" style={{ marginTop: 12, fontSize: 11.5, color: 'var(--pal-coral)' }}>
            {err}
          </p>
        )}
      </div>
    </main>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase',
      color: 'var(--tx3)', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="k-chip"
      style={{
        padding: '8px 13px', borderRadius: 999, minHeight: 36, fontSize: 11.5, fontWeight: 700,
        border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
        background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
        color: on ? 'var(--accTx)' : 'var(--tx2)',
      }}
    >
      {children}
    </button>
  );
}
