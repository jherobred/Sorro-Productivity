'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { ToastHost } from './ToastHost';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { SECHUE } from '@/lib/pal';
import { supabase } from '@/lib/supabase';
import { onlineManager } from '@tanstack/react-query';
import { lg, ON_ACCENT } from '@/lib/glass';

type Section = { id: string; name: string; ic: IconName };

// Desktop sidebar order — README "Screen inventory".
const SECTIONS: Section[] = [
  { id: 'home', name: 'Home', ic: 'home' },
  { id: 'calendar', name: 'Calendar', ic: 'cal' },
  { id: 'tasks', name: 'Tasks', ic: 'task' },
  { id: 'notebooks', name: 'Notebooks', ic: 'book' },
  { id: 'projects', name: 'Projects', ic: 'proj' },
  { id: 'habits', name: 'Habits', ic: 'habit' },
  { id: 'body', name: 'Body', ic: 'heart' },
  { id: 'money', name: 'Money', ic: 'money' },
  { id: 'community', name: 'Community', ic: 'chat' },
  { id: 'files', name: 'Files', ic: 'files' },
  { id: 'people', name: 'People', ic: 'people' },
  { id: 'profile', name: 'Profile', ic: 'focus' },
];

const BUILT = new Set([
  'home', 'tasks', 'calendar', 'habits', 'money', 'notebooks', 'people', 'files',
]); // routes that exist so far

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [guard, setGuard] = useState<'checking' | 'ok'>('checking');
  const [capture, setCapture] = useState(false);

  const section = pathname.split('/').filter(Boolean)[0] ?? 'home';
  const hue = SECHUE[section] ?? 'var(--acc)';

  // Static export means no middleware — the route guard lives here.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/');
      else setGuard('ok');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/');
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (guard === 'checking') {
    return (
      <div style={{ height: '100dvh', background: 'var(--bg)' }} />
    );
  }

  const go = (id: string) => {
    if (!BUILT.has(id)) return;
    router.push(`/${id}/`);
  };

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: phone ? 'column' : 'row',
        background: 'var(--bg)',
        color: 'var(--tx)',
        overflow: 'hidden',
      }}
    >
      {!phone && (
        <nav
          className="navsb"
          style={{
            width: 232,
            flex: 'none',
            background: 'var(--panel)',
            borderRight: '1px solid var(--line)',
            padding: '16px 11px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 7px 18px' }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--acc)' }} />
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em' }}>Basedly</span>
          </div>

          {SECTIONS.map((s) => {
            const active = s.id === section;
            const enabled = BUILT.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                className="row"
                title={enabled ? undefined : 'Not built yet'}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 11px',
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? (SECHUE[s.id] ?? 'var(--accTx)') : 'var(--tx2)',
                  background: active ? 'var(--hov)' : undefined,
                  opacity: enabled ? 1 : 0.38,
                  cursor: enabled ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 9,
                      bottom: 9,
                      width: 2,
                      borderRadius: 2,
                      background: SECHUE[s.id] ?? 'var(--acc)',
                    }}
                  />
                )}
                <Icon name={s.ic} size={16} color={active ? (SECHUE[s.id] ?? 'var(--accTx)') : 'var(--tx3)'} />
                {s.name}
              </button>
            );
          })}
        </nav>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TopBar hue={hue} prefs={prefs} update={update} />

        {/* Page transitions replace skeleton screens; key on the route so a
            repeat navigation restarts the animation. */}
        <main
          key={pathname}
          className="pagein"
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: phone ? 14 : 22 }}
        >
          {children}
        </main>

        {phone && (
          <BottomNav
            picks={prefs.navPicks}
            section={section}
            go={go}
            accent={prefs.accent}
            dark={prefs.theme === 'dark'}
            onCapture={() => setCapture((c) => !c)}
            captureOpen={capture}
          />
        )}
      </div>

      {/* Desktop capture button — draggable in the prototype; position persists
          in prefs.fabPos. Drag itself is still to come. */}
      {!phone && (
        <button
          onClick={() => setCapture((c) => !c)}
          title="Capture"
          aria-label="Capture"
          aria-expanded={capture}
          style={{
            position: 'fixed',
            right: prefs.fabPos?.x ?? 22,
            bottom: prefs.fabPos?.y ?? 22,
            width: 54,
            height: 54,
            borderRadius: 27,
            background: prefs.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 10px 28px color-mix(in srgb, ${prefs.accent} 40%, transparent)`,
            transform: capture ? 'rotate(45deg)' : 'rotate(0)',
            transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1), box-shadow .2s',
            zIndex: 30,
          }}
        >
          <Icon name="plus" size={22} color={ON_ACCENT} />
        </button>
      )}

      <ToastHost />
    </div>
  );
}

function TopBar({
  hue,
  prefs,
  update,
}: {
  hue: string;
  prefs: ReturnType<typeof usePrefs>['prefs'];
  update: ReturnType<typeof usePrefs>['update'];
}) {
  const [online, setOnline] = useState(true);
  useEffect(() => onlineManager.subscribe(() => setOnline(onlineManager.isOnline())), []);

  return (
    <header
      style={{
        flex: 'none',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--panel)',
      }}
    >
      <span style={{ width: 2, height: 18, borderRadius: 2, background: hue }} />

      {!online && (
        <span
          className="fade"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            color: 'var(--pal-amber)',
          }}
        >
          Offline — changes queued
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => update({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
          className="hov"
          aria-label="Toggle theme"
          style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34 }}
        >
          <Icon name="moon" size={16} color="var(--tx2)" />
        </button>
        <button
          onClick={() => update({ motion: !prefs.motion })}
          className="hov"
          aria-label={prefs.motion ? 'Reduce motion' : 'Enable motion'}
          style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34 }}
        >
          <Icon name="spark" size={16} color={prefs.motion ? 'var(--accTx)' : 'var(--tx3)'} />
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="hov"
          aria-label="Sign out"
          style={{ padding: 8, borderRadius: 9, minWidth: 34, minHeight: 34 }}
        >
          <Icon name="back" size={16} color="var(--tx2)" />
        </button>
      </div>
    </header>
  );
}

/**
 * Phone nav — a floating liquid-glass pill, not a flat bar. Slots split either
 * side of the capture FAB. Geometry is verbatim from the prototype: 27px pill
 * radius, 44px slots at 18px radius, accent fill + 3px dot on the active slot.
 */
function BottomNav({
  picks,
  section,
  go,
  accent,
  dark,
  onCapture,
  captureOpen,
}: {
  picks: string[];
  section: string;
  go: (id: string) => void;
  accent: string;
  dark: boolean;
  onCapture: () => void;
  captureOpen: boolean;
}) {
  const byId = new Map(SECTIONS.map((s) => [s.id, s]));
  const slots = picks.map((id) => byId.get(id) ?? { id, name: 'More', ic: 'more' as IconName });
  const half = Math.ceil(slots.length / 2);

  const slot = (s: Section) => {
    const on = s.id === section;
    const enabled = BUILT.has(s.id);
    return (
      <button
        key={s.id}
        onClick={() => go(s.id)}
        title={s.name}
        aria-label={s.name}
        style={{
          flex: 1,
          minWidth: 0,
          height: 44,
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: on ? accent : 'transparent',
          transition: 'background .24s',
          opacity: enabled ? 1 : 0.38,
        }}
      >
        <Icon name={s.ic} size={17} color={on ? ON_ACCENT : 'var(--tx2)'} />
        <span
          style={{
            width: 3,
            height: 3,
            borderRadius: '50%',
            marginTop: 3,
            background: on ? ON_ACCENT : 'transparent',
          }}
        />
      </button>
    );
  };

  return (
    <div style={{ flex: 'none', padding: '4px 10px 12px', position: 'relative', zIndex: 12 }}>
      <nav
        style={{
          ...lg({ tint: accent, strength: 1.15, radius: 27, dark }),
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          padding: '7px 10px',
        }}
      >
        {slots.slice(0, half).map(slot)}

        {/* Capture. Lifted out of the bar with a negative top margin and ringed
            in the page colour so it reads as sitting proud of the glass. */}
        <button
          onClick={onCapture}
          aria-label="Capture"
          aria-expanded={captureOpen}
          style={{
            flex: 'none',
            width: 54,
            height: 54,
            borderRadius: 27,
            background: accent,
            margin: '-12px 4px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `3px solid ${dark ? '#0C0F16' : '#F4F2F2'}`,
            boxShadow: `0 10px 26px color-mix(in srgb, ${accent} 52%, transparent)`,
            transform: captureOpen ? 'rotate(45deg)' : 'rotate(0)',
            transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <Icon name="plus" size={22} color={ON_ACCENT} />
        </button>

        {slots.slice(half).map(slot)}
      </nav>
    </div>
  );
}
