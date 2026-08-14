'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * 4 steps, runs once: name → course/year → interests → done.
 * Seeds the first notebook and a semester timetable, so it must finish writing
 * before the app shell renders real data (BACKEND.md "Auth").
 */
const INTERESTS = [
  'Study', 'Fitness', 'Money', 'Reading', 'Coding', 'Art',
  'Music', 'Sleep', 'Cooking', 'Running', 'Journaling', 'Gaming',
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    // One RPC does the whole seed transactionally: profile, term, first
    // notebook + section, the three task lists and the two money accounts.
    const { error } = await supabase.rpc('bd_complete_onboarding', {
      p_name: name.trim() || 'Student',
      p_handle: '',
      p_course: course.trim(),
      p_year: year.trim(),
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_interests: picks,
    });

    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    router.replace('/home/');
  }

  const steps = [
    { title: 'What should we call you?', ok: name.trim().length > 0 },
    { title: 'What are you studying?', ok: course.trim().length > 0 },
    { title: 'What do you want to track?', ok: picks.length > 0 },
    { title: `You're set, ${name.trim() || 'friend'}.`, ok: true },
  ];

  return (
    <main
      style={{
        height: '100dvh',
        background: 'var(--bg)',
        color: 'var(--tx)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 26 }}>
          {steps.map((_, i) => (
            <span
              key={i}
              className="tt"
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: i <= step ? 'var(--acc)' : 'var(--line2)',
              }}
            />
          ))}
        </div>

        <h1
          key={step}
          className="pagein"
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-.025em',
            textWrap: 'pretty',
            marginBottom: 22,
          }}
        >
          {steps[step].title}
        </h1>

        {step === 0 && <Field value={name} onChange={setName} placeholder="Your name" />}

        {step === 1 && (
          <>
            <Field value={course} onChange={setCourse} placeholder="Course, e.g. BS Computer Science" />
            <div style={{ height: 10 }} />
            <Field value={year} onChange={setYear} placeholder="Year, e.g. 3rd year" />
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
                  className="tt"
                  style={{
                    minHeight: 44,
                    padding: '10px 12px',
                    borderRadius: 10,
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

        <button
          onClick={() => (step === 3 ? finish() : setStep((s) => s + 1))}
          disabled={!steps[step].ok || busy}
          className="acc"
          style={{
            marginTop: 26,
            width: '100%',
            minHeight: 44,
            padding: '13px 16px',
            borderRadius: 14,
            background: 'var(--acc)',
            color: 'var(--ink)',
            fontSize: 13.5,
            fontWeight: 700,
            opacity: steps[step].ok && !busy ? 1 : 0.45,
          }}
        >
          {step === 3 ? 'Open Basedly' : 'Continue'}
        </button>

        {err && (
          <p className="fade" style={{ marginTop: 12, fontSize: 11.5, color: 'var(--pal-coral)' }}>
            {err}
          </p>
        )}
      </div>
    </main>
  );
}

function Field({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus
      style={{
        width: '100%',
        minHeight: 44,
        padding: '12px 14px',
        borderRadius: 9,
        border: '1px solid var(--line2)',
        background: 'var(--card)',
        color: 'var(--tx)',
        fontSize: 13.5,
      }}
    />
  );
}
