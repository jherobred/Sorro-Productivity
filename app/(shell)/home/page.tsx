'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTasks } from '@/lib/tasks';
import { useEvents, weekStart, hoursOf, hhmm, useEventActions } from '@/lib/events';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { PAL } from '@/lib/pal';

/**
 * Ported from Basedly.dc.html — markup 469–638 (desktop), computed styles
 * 4732–4741 (`skies`) and 5067–5090 (hero, greeting, up-next).
 */

const SKIES: Record<Tod, string> = {
  morning: 'linear-gradient(120deg,#1B2A3E 0%,#243349 40%,#2E2A38 100%)',
  afternoon: 'linear-gradient(150deg,#1B2334 0%,#131828 55%,#0F1119 100%)',
  evening: 'linear-gradient(150deg,#241C30 0%,#171429 55%,#0D0E17 100%)',
};
const SKIES_LIGHT: Record<Tod, string> = {
  morning: 'linear-gradient(120deg,#FBF3EC 0%,#F3F2F2 60%,#EDECEA 100%)',
  afternoon: 'linear-gradient(150deg,#F6F5F3 0%,#F3F2F2 55%,#ECEBE9 100%)',
  evening: 'linear-gradient(150deg,#F2EEF4 0%,#F3F2F2 55%,#EAE8EC 100%)',
};

type Tod = 'morning' | 'afternoon' | 'evening';
const INDIGO = '#6C7CF5';
const CORAL_T = '#FF6B57';

const KICKER: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em',
  textTransform: 'uppercase', color: 'var(--tx3)',
};

export default function HomePage() {
  const { phone } = useLayout();
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';

  const [name, setName] = useState('');
  const [tod, setTod] = useState<Tod>(() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  });
  const [greetSeq, setGreetSeq] = useState(0);
  const [, tick] = useState(0);

  const ws = weekStart(new Date());
  const { data: tasks = [] } = useTasks();
  const { data: events = [] } = useEvents(ws);
  const A = useEventActions(ws);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await supabase.from('bd_profiles').select('name').eq('user_id', data.user.id).maybeSingle();
      setName((p?.name ?? '').split(' ')[0]);
    });
  }, []);

  const open = tasks.filter((t) => !t.done);
  const todayISO = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((t) => t.due_on && t.due_on < todayISO);
  const oldest = overdue
    .map((t) => Math.round((Date.now() - new Date(t.due_on! + 'T00:00:00').getTime()) / 86_400_000))
    .sort((a, b) => b - a)[0];

  const todays = events
    .filter((e) => new Date(e.starts_at).toDateString() === new Date().toDateString())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const upNext = events
    .filter((e) => new Date(e.starts_at).getTime() > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  const minsUntil = upNext ? Math.round((new Date(upNext.starts_at).getTime() - Date.now()) / 60_000) : 0;
  const untilPct = Math.max(4, Math.min(100, Math.round(((120 - minsUntil) / 120) * 100)));
  const untilLabel = !upNext ? '' : minsUntil >= 60
    ? `in ${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m`
    : `in ${Math.max(0, minsUntil)} min`;

  const greeting = `Good ${tod}${name ? `, ${name}` : ''}`;

  return (
    <div style={{ margin: phone ? -14 : -22 }}>
      {/* Hero — the day/night sky band with its drifting gradient and sun blob. */}
      <div style={{
        padding: phone ? '14px 14px 4px' : '20px 24px 6px', position: 'relative', overflow: 'hidden',
        background: 'var(--panel)', borderBottom: '2px solid var(--line2)',
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 16, border: '1px solid var(--line)',
            padding: phone ? '15px 16px 17px' : '17px 20px 19px', marginBottom: phone ? 14 : 16,
          }}>
            <div className="dnl" style={{ position: 'absolute', inset: 0, background: (dark ? SKIES : SKIES_LIGHT)[tod], backgroundSize: '240% 240%' }} />
            <div className="sunl" style={{
              position: 'absolute', top: -58, left: 0, width: 190, height: 190, borderRadius: '50%',
              background: `radial-gradient(circle, color-mix(in srgb, ${prefs.accent} 34%, transparent), transparent 68%)`,
              pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative' }}>
              <div style={phone
                ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, marginBottom: 6 }
                : { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                <div key={greetSeq} aria-label={greeting}
                  style={{ fontSize: phone ? 23 : 27, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>
                  {greeting.split('').map((c, i) => (
                    <span key={i} aria-hidden className="fade" style={{ animationDelay: `${i * 0.025}s`, whiteSpace: 'pre' }}>{c}</span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(120,140,180,.16)' }}>
                  {(['morning', 'afternoon', 'evening'] as Tod[]).map((t) => (
                    <button key={t} onClick={() => { setTod(t); setGreetSeq((n) => n + 1); }}
                      style={{
                        padding: '4px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize',
                        background: tod === t ? `color-mix(in srgb, ${prefs.accent} 20%, transparent)` : 'transparent',
                        color: tod === t ? 'var(--accTx)' : 'var(--tx3)',
                      }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)', marginTop: 6 }}>
                {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}{open.length} things left{overdue.length ? ` · ${overdue.length} overdue` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 13, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* Up next */}
            <div style={{
              flex: 'none', width: 353, borderRadius: 15, padding: '14px 16px',
              background: `color-mix(in srgb, ${INDIGO} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${INDIGO} 38%, transparent)`,
              minHeight: 170, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ ...KICKER, color: INDIGO, marginBottom: 10 }}>Up next</div>

              {upNext ? (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 5 }}>{upNext.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums', marginBottom: 11 }}>
                    {hhmm(hoursOf(upNext.starts_at))} – {hhmm(hoursOf(upNext.ends_at))}{upNext.location ? ` · ${upNext.location}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: `color-mix(in srgb,${INDIGO} 22%,transparent)`, overflow: 'hidden' }}>
                      <div style={{ width: `${untilPct}%`, height: '100%', borderRadius: 3, background: PAL.indigo, transition: 'width .4s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: INDIGO, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{untilLabel}</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 5 }}>Nothing else today</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx2)', marginBottom: 11 }}>Tomorrow is clear too</div>
                </>
              )}

              <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
                <button className="acc" style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--acc)', color: '#0C0F16', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  Open notes
                </button>
                <button onClick={() => upNext && A.snooze.mutate({ id: upNext.id })} className="hov"
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line2)', color: 'var(--tx2)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  Snooze
                </button>
              </div>
            </div>

            {/* The rest of today */}
            <div style={{
              flex: 1, minWidth: 260, borderRadius: 15, padding: '14px 16px',
              background: 'color-mix(in srgb, var(--panel) 62%, transparent)', border: '1px solid var(--line)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={KICKER}>The rest of today</div>
                <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>to 10 PM</div>
              </div>
              <div style={{ position: 'relative', height: 34, marginBottom: 9 }}>
                <div style={{ position: 'absolute', top: 15, left: 0, right: 0, height: 2, background: 'var(--line2)' }} />
                {todays.map((e) => {
                  const s = hoursOf(e.starts_at);
                  const len = hoursOf(e.ends_at) - s;
                  const left = ((s - 9) / 13) * 100;
                  if (left < -5 || left > 100) return null;
                  return (
                    <div key={e.id} style={{
                      position: 'absolute', top: 8, left: `${Math.max(0, left)}%`,
                      width: `${Math.max(4, (len / 13) * 100)}%`, height: 16, borderRadius: 5, background: e.color,
                    }} />
                  );
                })}
                <div style={{ position: 'absolute', top: 2, left: `${Math.max(0, Math.min(100, ((new Date().getHours() + new Date().getMinutes() / 60 - 9) / 13) * 100))}%`, width: 2, height: 30, background: 'var(--acc)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 500, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                <span>9 AM</span><span>12 PM</span><span>3 PM</span><span>6 PM</span><span>9 PM</span>
              </div>
            </div>

            {/* Overdue */}
            <div style={{
              flex: 'none', width: 353, borderRadius: 15, padding: '14px 16px',
              background: `color-mix(in srgb,${CORAL_T} 12%,transparent)`,
              border: `1px solid color-mix(in srgb,${CORAL_T} 34%,transparent)`,
            }}>
              <div style={{ ...KICKER, color: `color-mix(in srgb,${CORAL_T} 78%,var(--tx))`, marginBottom: 8 }}>Overdue</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{overdue.length}</div>
              <div style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: 'var(--tx2)' }}>
                {overdue.length ? `Oldest is ${oldest} day${oldest === 1 ? '' : 's'} old` : 'Nothing is late'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's schedule */}
      <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : 'repeat(3,1fr)', gap: 12, alignContent: 'start' }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--sh)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={KICKER}>Today</div>
              <div style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--tx3)' }}>
                {todays.length} event{todays.length === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {todays.length === 0 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Nothing scheduled.</div>}
              {todays.map((e) => {
                const started = new Date(e.starts_at).getTime() <= Date.now();
                const ended = new Date(e.ends_at).getTime() <= Date.now();
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 2, height: 26, background: e.color, borderRadius: 1 }} />
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)', width: 38, fontVariantNumeric: 'tabular-nums' }}>
                      {String(new Date(e.starts_at).getHours()).padStart(2, '0')}:{String(new Date(e.starts_at).getMinutes()).padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{e.title}</div>
                    {ended && <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tx3)' }}>done</div>}
                    {started && !ended && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>now</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
