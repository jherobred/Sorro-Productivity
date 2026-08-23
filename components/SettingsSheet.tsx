'use client';

import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import { usePrefs, type Prefs } from '@/lib/prefs';
import { useOverlayBack } from '@/lib/nav';
import { ON_ACCENT } from '@/lib/glass';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { Integrations } from './Integrations';
import { useAppUpdate, useFullscreen, APP_VERSION, UPDATE_URL } from '@/lib/appUpdate';

/**
 * Every user-facing preference in one sheet. Grouped the way people look for
 * settings rather than the way they are stored (Jakob's law — Appearance,
 * Accessibility, Behaviour, Notifications, Connections is the order iOS,
 * Android and macOS all use), and each control states its current value so the
 * sheet is readable without toggling anything (visibility of system status).
 */

const TABS = ['Appearance', 'Access', 'Behaviour', 'Alerts', 'Connections', 'App'] as const;
type Tab = (typeof TABS)[number];

const ACCENTS = ['#7C6CFF', '#38D6F2', '#34D9A0', '#FFC24B', '#FF6B6B', '#FF6FA8', '#B07CFF', '#A3E635'];

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { prefs, update } = usePrefs();
  const [tab, setTab] = useState<Tab>('Appearance');
  useOverlayBack(true, onClose);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => void update({ [k]: v } as Partial<Prefs>);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Settings"
        className="k-bloom"
        style={{
          width: 620, maxWidth: '100%', maxHeight: '86dvh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)', borderRadius: 18,
          boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="set" size={17} color="var(--accTx)" />
          <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>Settings</h2>
          <button onClick={onClose} className="hov k-squish" aria-label="Close settings"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div role="tablist" aria-label="Settings sections" className="hbar"
          style={{ display: 'flex', gap: 3, padding: '10px 12px 0', overflowX: 'auto', flex: 'none' }}>
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="k-chip"
              style={{
                flex: 'none', padding: '7px 13px', borderRadius: 10, fontSize: 12, fontWeight: 700, minHeight: 34,
                background: tab === t ? 'var(--acc)' : 'transparent',
                color: tab === t ? 'var(--ink)' : 'var(--tx2)',
              }}>
              {t}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={tab} className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 20px' }}>
          {tab === 'Appearance' && (
            <>
              <Group label="Theme">
                <Segment
                  value={prefs.theme}
                  options={[{ v: 'dark', n: 'Dark' }, { v: 'light', n: 'Light' }]}
                  onChange={(v) => set('theme', v as Prefs['theme'])}
                />
              </Group>

              <Group label="Accent" hint="Tints the chrome, the glass and every selected state.">
                <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                  {ACCENTS.map((c) => (
                    <button key={c} onClick={() => set('accent', c)} aria-label={`Accent ${c}`}
                      aria-pressed={prefs.accent === c}
                      className={`k-swatch${prefs.accent === c ? ' on' : ''}`}
                      style={{
                        width: 30, height: 30, borderRadius: 9, background: c,
                        boxShadow: prefs.accent === c ? `0 0 0 2px var(--card), 0 0 0 4px ${c}` : 'none',
                      }} />
                  ))}
                </div>
              </Group>

              <Group label="Density" hint="Compact fits about 8% more on screen.">
                <Segment
                  value={prefs.density}
                  options={[{ v: 'comfortable', n: 'Comfortable' }, { v: 'compact', n: 'Compact' }]}
                  onChange={(v) => set('density', v as Prefs['density'])}
                />
              </Group>

              <Toggle label="Motion" hint="Backgrounds drift, cards spring, the sky band cycles."
                on={prefs.motion} onChange={(v) => set('motion', v)} />
              <Toggle label="Reduce transparency" hint="Turns the frosted glass into solid panels."
                on={prefs.reduceTransparency} onChange={(v) => set('reduceTransparency', v)} />
            </>
          )}

          {tab === 'Access' && (
            <>
              <Group label={`Content size — ${Math.round(prefs.fontScale * 100)}%`}
                hint="Scales the whole layout, like the browser's own zoom.">
                <input type="range" min={0.875} max={1.375} step={0.125} value={prefs.fontScale}
                  onChange={(e) => set('fontScale', Number(e.target.value))}
                  aria-label="Content size"
                  style={{ width: '100%', accentColor: 'var(--acc)', minHeight: 34 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                  <span>Smaller</span><span>Default</span><span>Larger</span>
                </div>
              </Group>

              <Group label="Contrast" hint="High lifts dim text and hairlines to meet WCAG AAA.">
                <Segment
                  value={prefs.contrast}
                  options={[{ v: 'normal', n: 'Normal' }, { v: 'high', n: 'High' }]}
                  onChange={(v) => set('contrast', v as Prefs['contrast'])}
                />
              </Group>

              <Toggle label="Underline links" hint="So colour is never the only way to spot one."
                on={prefs.underlineLinks} onChange={(v) => set('underlineLinks', v)} />
              <Toggle label="Always show nav labels" hint="Text under the phone tab bar icons."
                on={prefs.alwaysShowLabels} onChange={(v) => set('alwaysShowLabels', v)} />
              <Toggle label="Haptics" hint="A short buzz on long-press and completion."
                on={prefs.haptics} onChange={(v) => set('haptics', v)} />

              <p style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.65, marginTop: 12 }}>
                Every interactive target in Basedly is at least 44×44, focus is always visible, and
                Tab reaches everything the mouse can. Press <kbd style={KBD}>/</kbd> or{' '}
                <kbd style={KBD}>⌘K</kbd> to jump anywhere from the keyboard.
              </p>
            </>
          )}

          {tab === 'Behaviour' && (
            <>
              <Group label="Week starts on">
                <Segment value={prefs.weekStart}
                  options={[{ v: 'mon', n: 'Monday' }, { v: 'sun', n: 'Sunday' }]}
                  onChange={(v) => set('weekStart', v as Prefs['weekStart'])} />
              </Group>

              <Group label="Time format">
                <Segment value={prefs.time24 ? '24' : '12'}
                  options={[{ v: '12', n: '1:30 PM' }, { v: '24', n: '13:30' }]}
                  onChange={(v) => set('time24', v === '24')} />
              </Group>

              <Group label="Open on launch">
                <Segment value={prefs.landing}
                  options={[{ v: 'home', n: 'Home' }, { v: 'calendar', n: 'Calendar' }, { v: 'tasks', n: 'Tasks' }]}
                  onChange={(v) => set('landing', v)} />
              </Group>

              <Toggle label="Confirm before deleting" hint="Off means delete is instant, with undo in the toast."
                on={prefs.confirmDelete} onChange={(v) => set('confirmDelete', v)} />

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button onClick={() => { void supabase.auth.signOut(); toast('Signed out'); }} className="hov k-squish"
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderRadius: 11, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--pal-coral)', minHeight: 44 }}>
                  <Icon name="back" size={14} color="var(--pal-coral)" />Sign out
                </button>
              </div>
            </>
          )}

          {tab === 'Alerts' && (
            <>
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.65, marginBottom: 14 }}>
                Which events reach the bell. Turning one off stops new alerts; it does not delete
                anything already in the list.
              </p>
              {([
                ['tasks', 'Tasks', 'Something fell overdue, or a shared task changed.', 'task'],
                ['events', 'Calendar', 'A reminder fired, or a synced event moved.', 'cal'],
                ['canvas', 'Canvas LMS', 'New announcements and assignments from your courses.', 'book'],
                ['social', 'Community', 'Replies, likes and mentions.', 'chat'],
                ['challenges', 'Challenges', 'Someone passed you, or a challenge settled.', 'trophy'],
              ] as [keyof Prefs['notify'], string, string, IconName][]).map(([k, n, hint, ic]) => (
                <Toggle key={k} icon={ic} label={n} hint={hint} on={prefs.notify?.[k] ?? true}
                  onChange={(v) => set('notify', { ...prefs.notify, [k]: v })} />
              ))}
            </>
          )}

          {tab === 'Connections' && <Integrations />}

          {tab === 'App' && <AppTab />}
        </div>
      </div>
    </div>
  );
}

const KBD: React.CSSProperties = {
  padding: '1px 5px', borderRadius: 5, border: '1px solid var(--line2)',
  background: 'var(--card2)', fontSize: 10.5, fontFamily: 'inherit', fontWeight: 700,
};

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)', marginBottom: 7 }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Segment({ value, options, onChange }: {
  value: string; options: { v: string; n: string }[]; onChange: (v: string) => void;
}) {
  const i = Math.max(0, options.findIndex((o) => o.v === value));
  return (
    <div className="k-pillrail" style={{ position: 'relative', display: 'flex', padding: 3, borderRadius: 11, background: 'var(--card2)', border: '1px solid var(--line)' }}>
      <span aria-hidden className="k-pill"
        style={{ '--kn': options.length, '--ki': i, borderRadius: 9, background: 'var(--acc)' } as React.CSSProperties} />
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          style={{
            position: 'relative', zIndex: 1, flex: 1, minHeight: 36, borderRadius: 9,
            fontSize: 12, fontWeight: 700, transition: 'color .24s',
            color: value === o.v ? 'var(--ink)' : 'var(--tx2)',
          }}>
          {o.n}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, on, onChange, icon }: {
  label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; icon?: IconName;
}) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} className="row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 12px', borderRadius: 12, textAlign: 'left', minHeight: 52, marginBottom: 6 }}>
      {icon && <Icon name={icon} size={15} color={on ? 'var(--accTx)' : 'var(--tx3)'} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 2, lineHeight: 1.5 }}>{hint}</span>}
      </span>
      <span aria-hidden style={{
        width: 42, height: 24, flex: 'none', borderRadius: 12, padding: 3,
        background: on ? 'var(--acc)' : 'var(--card2)',
        border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
        transition: 'background .3s var(--k-expo), border-color .3s',
      }}>
        <span style={{
          display: 'block', width: 16, height: 16, borderRadius: 8, background: on ? ON_ACCENT : 'var(--tx3)',
          transform: on ? 'translateX(18px)' : 'none',
          transition: 'transform .4s var(--k-spring), background .3s',
        }} />
      </span>
    </button>
  );
}

/**
 * Settings → App: the two things the Android build cannot do for itself.
 *
 * Fullscreen has to be a button rather than a stored preference, because the
 * Fullscreen API only answers to a user gesture — a toggle that remembered
 * "on" would come back to a screen that was plainly not fullscreen.
 *
 * Updates: the APK is not in a store, so nothing checks on the user's behalf,
 * and the alternative is uninstall-and-reinstall every time. The manifest at
 * NEXT_PUBLIC_UPDATE_URL is one small JSON file a release can publish.
 */
function AppTab() {
  const fs = useFullscreen();
  const { prefs, update } = usePrefs();
  const { state, check } = useAppUpdate();

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
    borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--card2)',
    fontSize: 12.5, fontWeight: 700, minHeight: 48, width: '100%',
  };

  return (
    <>
      <Group label="Display" hint="Hides the browser's address bar and the system bars. Escape, or the system gesture, comes back.">
        <button onClick={() => void fs.toggle()} disabled={!fs.supported} className="hov k-squish"
          style={{ ...row, opacity: fs.supported ? 1 : 0.5, borderColor: fs.on ? 'var(--acc)' : 'var(--line2)' }}>
          <Icon name={fs.on ? 'collapse' : 'expand'} size={15} color={fs.on ? 'var(--accTx)' : 'var(--tx2)'} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            {fs.supported ? (fs.on ? 'Leave fullscreen' : 'Go fullscreen') : 'Fullscreen is unavailable here'}
          </span>
          {fs.on && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accTx)' }}>ON</span>}
        </button>

        {/* The switch the button could not be. A browser will not grant
            fullscreen on page load — only inside a user gesture — so this does
            not ask on load: it arms the very first tap of the session and asks
            then. In practice that is you opening the first tab, which is why it
            feels like the app simply launches fullscreen. */}
        <div style={{ marginTop: 8 }}>
          <Toggle
            icon="expand"
            label="Always start fullscreen"
            hint="Asks again on the first tap of every launch. The APK is already edge to edge and ignores this."
            on={prefs.alwaysFullscreen}
            onChange={(v) => void update({ alwaysFullscreen: v })} />
        </div>
      </Group>

      <Group label="Version">
        <div style={{ ...row, fontWeight: 600, color: 'var(--tx2)' }}>
          <Icon name="files" size={15} color="var(--tx3)" />
          <span style={{ flex: 1 }}>Basedly {APP_VERSION}</span>
        </div>
      </Group>

      <Group label="Updates"
        hint={UPDATE_URL
          ? 'Downloads the new APK and installs over the top. Your data lives in Supabase, so nothing is lost.'
          : undefined}>
        {state.kind === 'unconfigured' ? (
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.65 }}>
            No update server is set for this build. Point <code style={KBD}>NEXT_PUBLIC_UPDATE_URL</code> at a
            JSON file — <code style={KBD}>{'{ "version", "url", "notes" }'}</code> — and this becomes a one-tap
            update. A GitHub release asset works.
          </p>
        ) : (
          <>
            <button onClick={() => void check()} disabled={state.kind === 'checking'} className="hov k-squish"
              style={{ ...row, opacity: state.kind === 'checking' ? 0.6 : 1 }}>
              <Icon name="refresh" size={15} color="var(--tx2)" />
              <span style={{ flex: 1, textAlign: 'left' }}>
                {state.kind === 'checking' ? 'Checking…' : 'Check for updates'}
              </span>
            </button>

            {state.kind === 'current' && (
              <p style={{ marginTop: 9, fontSize: 11.5, color: 'var(--tx3)' }}>
                You are on the latest build.
              </p>
            )}
            {state.kind === 'failed' && (
              <p style={{ marginTop: 9, fontSize: 11.5, color: 'var(--pal-coral)' }}>{state.message}</p>
            )}
            {state.kind === 'available' && (
              <div className="k-bloom" style={{ marginTop: 10, padding: '13px 14px', borderRadius: 12, border: '1px solid var(--acc)', background: 'color-mix(in srgb, var(--acc) 8%, transparent)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Version {state.release.version} is out</div>
                {state.release.notes && (
                  <p style={{ marginTop: 5, fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.6 }}>{state.release.notes}</p>
                )}
                <a href={state.release.url} download className="k-squish"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 11,
                    minHeight: 44, borderRadius: 11, background: 'var(--acc)', color: 'var(--ink)',
                    fontSize: 12.5, fontWeight: 800, textDecoration: 'none',
                  }}>
                  <Icon name="download" size={15} color="var(--ink)" />Download and install
                </a>
              </div>
            )}
          </>
        )}
      </Group>
    </>
  );
}
