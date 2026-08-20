'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { ToastHost } from './ToastHost';
import { AskHost } from './AskHost';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { usePresence, roomFor, type Peer } from '@/lib/presence';
import { useWorkspaces, useWorkspaceActions } from '@/lib/workspaces';
import { ask } from '@/lib/ask';
import { SECHUE, PAL } from '@/lib/pal';
import { supabase, currentUserId } from '@/lib/supabase';
import { onlineManager } from '@tanstack/react-query';
import { lg, ON_ACCENT } from '@/lib/glass';
import { CaptureSheet, type CaptureKind } from './CaptureSheet';
import { SearchPalette } from './SearchPalette';
import { NotificationBell } from './NotificationBell';
import { SettingsSheet } from './SettingsSheet';
import { ContextMenu, type CtxItem } from './ContextMenu';
import { devFixturesOn } from '@/lib/devFixtures';
import { useBackGuard, useOverlayBack } from '@/lib/nav';
import { useAutoSync } from '@/lib/integrations';
import { useTasks } from '@/lib/tasks';
import { toast } from '@/lib/toast';

/**
 * Shell ported from Basedly.dc.html — markup 190–312, computed styles 4337–4372
 * (nav), 4846–4867 (glass sidebar, aura, avatars), 5294–5304 (side actions),
 * 6473 (⌘K), 6897 (page transition).
 */

type Kid = { n: string; c: string; m?: string };
type Section = { id: string; name: string; ic: IconName; badge?: string; kids?: Kid[]; lock?: boolean };

const SECTIONS: Section[] = [
  { id: 'home', name: 'Home', ic: 'home' },
  { id: 'calendar', name: 'Calendar', ic: 'cal', kids: [{ n: 'Classes', c: PAL.indigo }, { n: 'Personal', c: PAL.mint }, { n: 'Org — CSSS', c: PAL.violet }] },
  { id: 'tasks', name: 'Tasks', ic: 'task', kids: [{ n: 'School', c: PAL.indigo, m: '7' }, { n: 'Personal', c: PAL.amber, m: '3' }, { n: 'Errands', c: PAL.mint, m: '2' }] },
  { id: 'notebooks', name: 'Notebooks', ic: 'book', kids: [{ n: '3rd year', c: PAL.indigo }, { n: 'Capstone research', c: PAL.violet }, { n: 'Journal', c: PAL.coral }, { n: 'Canvases', c: PAL.cyan }] },
  { id: 'projects', name: 'Projects', ic: 'proj' },
  { id: 'habits', name: 'Habits', ic: 'habit' },
  { id: 'body', name: 'Body', ic: 'heart', kids: [{ n: 'Health', c: PAL.pink }, { n: 'Food', c: PAL.amber }, { n: 'Gym', c: PAL.mint }] },
  { id: 'money', name: 'Money', ic: 'money', lock: true },
  { id: 'profile', name: 'Profile', ic: 'focus' },
  { id: 'community', name: 'Community', ic: 'chat', kids: [{ n: 'Feed', c: PAL.pink }, { n: 'Messages', c: PAL.sky }, { n: 'Challenges', c: PAL.amber }] },
  { id: 'files', name: 'Files', ic: 'files' },
  { id: 'people', name: 'People', ic: 'people' },
];

const BUILT = new Set(['home', 'tasks', 'calendar', 'habits', 'money', 'notebooks', 'people', 'files', 'body', 'projects', 'community', 'profile', 'more']);

const MORE_SECTION: Section = { id: 'more', name: 'More', ic: 'more' };

/**
 * The phone tab bar, built from the user's picks (More → Customise nav) in the
 * order they chose. `more` always takes the last slot so anything left off the
 * bar is still reachable.
 */
export const MAX_NAV_SLOTS = 7;

function navFor(picks: string[]): Section[] {
  const chosen = picks.filter((id) => id !== 'more');
  const bar = chosen
    .map((id) => SECTIONS.find((s) => s.id === id))
    .filter((s): s is Section => !!s)
    .slice(0, MAX_NAV_SLOTS - 1);
  return [...(bar.length ? bar : SECTIONS.slice(0, 4)), MORE_SECTION];
}

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [guard, setGuard] = useState<'checking' | 'ok'>('checking');
  const [capture, setCapture] = useState<{ x: number; y: number } | null>(null);
  const openCapture = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCapture((c) => (c ? null : { x: r.left, y: r.bottom + 8 }));
  };
  const [sheet, setSheet] = useState<CaptureKind | null>(null);
  const [search, setSearch] = useState(false);
  const [openKids, setOpenKids] = useState<Record<string, boolean>>({ community: true });
  const [wsOpen, setWsOpen] = useState(false);
  const { data: workspaces = [] } = useWorkspaces();
  const WA = useWorkspaceActions();
  const me = useMe();
  const spaceName = prefs.workspace
    ? workspaces.find((w) => w.id === prefs.workspace)?.name ?? 'Personal'
    : 'Personal';
  const [sideMore, setSideMore] = useState(false);
  const [settings, setSettings] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: string; label: string; items: CtxItem[] } | null>(null);
  const { data: tasks = [] } = useTasks();

  const section = pathname.split('/').filter(Boolean)[0] ?? 'home';
  // Only collaborative surfaces get a presence room; everywhere else this is
  // null, so nothing joins a channel and no faces appear.
  const peers = usePresence(roomFor(section));
  const dark = prefs.theme === 'dark';
  const acc = prefs.accent;

  // Back — mouse side button, browser gesture, Android key — stays inside the app.
  useBackGuard();
  // Canvas LMS and Google Calendar pull themselves in; see useAutoSync.
  useAutoSync();

  /**
   * Ctrl/Cmd+\ collapses the sidebar, the shortcut Notion and VS Code use.
   *
   * The pref IS the state — there is no local mirror. Holding both a `railOpen`
   * useState and `prefs.sidebar` meant an effect syncing one to the other kept
   * overwriting a fresh toggle with the value still in flight, so every second
   * press did nothing.
   */
  const railOpen = prefs.sidebar !== 'collapsed';
  const toggleRail = useCallback(
    (next?: boolean) => void update({ sidebar: (next ?? !railOpen) ? 'open' : 'collapsed' }),
    [update, railOpen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleRail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleRail]);
  useOverlayBack(!!capture, () => setCapture(null));
  useOverlayBack(wsOpen, () => setWsOpen(false));

  useEffect(() => {
    // Dev-only preview. `NODE_ENV` is inlined at build time, so this whole
    // branch is stripped from production bundles — it cannot be enabled by an
    // env var on the deployed site. Providers does the seeding; this just skips
    // the auth gate.
    if (devFixturesOn()) { setGuard('ok'); return; }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/');
      else setGuard('ok');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) router.replace('/'); });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  // ⌘K / Ctrl-K opens the palette; the search field opens the same surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === '/' && !/input|textarea/i.test((e.target as HTMLElement)?.tagName ?? '')) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The sidebar badge reads the tasks already in cache. It used to fire a
  // count query against Supabase on every single navigation — a network round
  // trip per page change, for a number the app was holding all along.
  const taskCount = tasks.filter((t) => !t.done && !t.deleted_at).length;

  if (guard === 'checking') return <div style={{ height: '100dvh', background: 'var(--bg)' }} />;

  const go = (id: string) => { if (BUILT.has(id)) router.push(`/${id}/`); };
  /** Same navigation, plus `?focus=` so the page can open on that sub-item. */
  const goFiltered = (id: string, focus: string) => {
    if (BUILT.has(id)) router.push(`/${id}/?focus=${encodeURIComponent(focus)}`);
  };
  const hueTx = (hue: string) =>
    dark ? `color-mix(in srgb, ${hue} 84%, #FFFFFF)` : `color-mix(in srgb, ${hue} 62%, #1C1A26)`;

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: phone ? 'column' : 'row',
      background: 'var(--bg)', color: 'var(--tx)', overflow: 'hidden', position: 'relative',
      // Insets live here rather than on <body>: the frame is exactly the
      // viewport, and padding shrinks it from the inside instead of pushing it
      // past the bottom edge.
      paddingTop: 'env(safe-area-inset-top)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>
      {/* First tab stop: jump past the whole sidebar straight to the page. */}
      <a href="#bd-main" className="skip"
        onClick={(e) => { e.preventDefault(); document.getElementById('bd-main')?.focus(); }}>
        Skip to content
      </a>

      {/* Ambient accent aura behind the chrome (auraA). */}
      <div aria-hidden className="aur" style={{
        position: 'absolute', width: '62%', height: '58%', left: '-14%', top: '-18%',
        borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle, color-mix(in srgb, ${acc} ${dark ? 34 : 20}%, transparent) 0%, transparent 68%)`,
        filter: 'blur(46px)', opacity: dark ? 0.85 : 0.6, zIndex: 0,
      }} />

      {!phone && railOpen && (
        <div className="bd-rail" style={{
          ...lg({ tint: acc, strength: 1, dark }),
          // Collapsing to 0 rather than to an icon rail: the point of the ask
          // was writing space in Notebooks, and a 60px strip still eats it. The
          // hover edge and Ctrl+\\ bring it straight back.
          // Width lives in the inline style, not a class. The rail is only in
          // the tree at all when open (see the guard above), so there is no
          // collapsed state to express in CSS — and an inline value cannot be
          // out-cascaded by the design system the way the class rule was.
          width: 236, minWidth: 236,
          flex: 'none', position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', padding: '14px 0', overflow: 'hidden',
          border: 0, borderRadius: 0,
          borderRight: `1px solid ${dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.9)'}`,
          boxShadow: dark
            ? 'inset -1px 0 0 rgba(255,255,255,.07), inset 1px 0 0 rgba(255,255,255,.16)'
            : 'inset -1px 0 0 rgba(38,32,54,.05), inset 1px 0 0 rgba(255,255,255,.95)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 10px 14px 14px' }}>
            <div style={{ width: 22, height: 22, background: acc, borderRadius: 6, flex: 'none' }} />
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.02em', flex: 1 }}>Basedly</div>
            <button
              onClick={() => toggleRail(false)}
              className="hov k-squish" title="Collapse sidebar (Ctrl+\\)" aria-label="Collapse sidebar"
              style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
              <Icon name="collapse" size={15} color="var(--tx3)" />
            </button>
          </div>

          <div style={{ padding: '0 12px 12px' }}>
            <button onClick={() => setSearch(true)} className="hov" style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 34, padding: '0 11px',
              borderRadius: 9, background: 'var(--card)', border: '1px solid var(--line)',
            }}>
              <Icon name="search" size={14} color="var(--tx3)" />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--tx3)' }}>Search</span>
            </button>
          </div>

          <div style={{ position: 'relative', padding: '0 12px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <button onClick={() => setSheet('note')} className="acc k-squish" style={{
                display: 'flex', alignItems: 'center', gap: 7, flex: '1 1 auto', height: 34, padding: '0 13px',
                borderRadius: 9, background: acc, color: ON_ACCENT, fontSize: 12.5, fontWeight: 800,
              }}>
                <Icon name="bookPlus" size={15} color={ON_ACCENT} />Note
              </button>
              <button title="New task" aria-label="New task" onClick={() => setSheet('task')} className="hov k-squish" style={SIDE_ACTION}>
                <Icon name="taskPlus" size={15} color="var(--tx2)" />
              </button>
              <button title="AI helper" aria-label="AI helper" onClick={() => toast('The AI panel is switched off in this build')}
                className="hov k-squish" style={SIDE_ACTION}>
                <Icon name="spark" size={15} color="var(--tx2)" />
              </button>
              <button title="More actions" aria-label="More actions" aria-haspopup="menu" className="hov k-squish" style={SIDE_ACTION}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({
                    x: r.left, y: r.bottom + 6, kind: 'global', label: 'Quick actions',
                    items: [
                      { label: 'New expense', icon: 'money', run: () => setSheet('money') },
                      { label: 'Search everything', icon: 'search', run: () => setSearch(true) },
                      { label: prefs.motion ? 'Reduce motion' : 'Enable motion', icon: 'spark', run: () => void update({ motion: !prefs.motion }) },
                      { label: dark ? 'Light mode' : 'Dark mode', icon: 'moon', run: () => void update({ theme: dark ? 'light' : 'dark' }) },
                      { label: 'Settings', icon: 'cog', run: () => setSettings(true) },
                    ],
                  });
                }}>
                <Icon name="dots" size={15} color="var(--tx2)" />
              </button>
            </div>
          </div>

          <div className="navsb" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 0 17px' }}>
            {SECTIONS.map((sec) => {
              const on = sec.id === section;
              const hue = SECHUE[sec.id] || acc;
              const hasKids = !!sec.kids;
              const open = hasKids && openKids[sec.id] !== false && openKids[sec.id] !== undefined;
              const badge = sec.id === 'tasks' && taskCount > 0 ? String(taskCount) : sec.badge ?? '';
              return (
                <div key={sec.id}>
                  <div className="hov" style={{
                    display: 'flex', alignItems: 'center', borderRadius: 10, position: 'relative',
                    background: on ? `color-mix(in srgb, ${hue} 16%, transparent)` : 'transparent',
                    boxShadow: on ? `inset 0 0 0 1px color-mix(in srgb, ${hue} 30%, transparent)` : 'none',
                  }}>
                    <span style={{
                      position: 'absolute', left: -9, top: 7, bottom: 7, width: 3, borderRadius: 2,
                      background: hue, opacity: on ? 1 : 0, transform: on ? 'scaleY(1)' : 'scaleY(.3)',
                      transition: 'opacity .3s cubic-bezier(.22,1,.36,1), transform .3s cubic-bezier(.22,1,.36,1)',
                    }} />
                    <button onClick={() => go(sec.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
                      padding: '7px 4px 7px 8px', borderRadius: 8, fontSize: 12.5, fontWeight: on ? 700 : 500,
                      background: 'transparent', color: on ? hueTx(hue) : 'var(--tx2)',
                      opacity: BUILT.has(sec.id) ? 1 : 0.45,
                    }}>
                      <Icon name={sec.ic} size={15} color={on ? hueTx(hue) : 'var(--tx2)'} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{sec.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{badge}</span>
                    </button>
                    <button
                      onClick={() => setOpenKids((k) => ({ ...k, [sec.id]: !open }))}
                      // Twelve identical "Show or hide sub-items" in a row tells
                      // a screen-reader user nothing about which one they are on.
                      aria-label={`${open ? 'Hide' : 'Show'} items under ${sec.name}`}
                      aria-expanded={open}
                      title="Show or hide sub-items"
                      style={{
                        width: 22, height: 22, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginRight: 4, borderRadius: 6, opacity: hasKids ? 1 : 0, pointerEvents: hasKids ? 'auto' : 'none',
                      }}>
                      <Icon name="chev" size={13} color={on ? hueTx(hue) : 'var(--tx3)'}
                        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
                    </button>
                  </div>

                  {open && sec.kids && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 6px 15px',
                      paddingLeft: 9, borderLeft: '1px solid var(--line2)',
                    }}>
                      {sec.kids.map((k) => (
                        // The sub-item carries its own name as a filter so the
                        // page can open focused on it, rather than three rows
                        // that all land in the same place.
                        <button key={k.n} onClick={() => goFiltered(sec.id, k.n)} className="hov" style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 8px',
                          borderRadius: 6, fontSize: 11.5, fontWeight: 500, color: 'var(--tx2)',
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: 2, flex: 'none', background: k.c }} />
                          <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.n}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{k.m ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 8px 4px', borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setSideMore((v) => !v)} className="hov" style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px',
              borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--tx2)',
            }}>
              <Icon name="chev" size={13} color="var(--tx3)"
                style={{ transform: sideMore ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
              <span style={{ flex: 1, textAlign: 'left' }}>More</span>
            </button>
            {sideMore && (
              <div className="lens" style={{ display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 2px 15px', paddingLeft: 9, borderLeft: '1px solid var(--line2)' }}>
                <button onClick={() => update({ theme: dark ? 'light' : 'dark' })} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="moon" size={13} color="var(--tx3)" />{dark ? 'Light mode' : 'Dark mode'}
                </button>
                <button onClick={() => update({ motion: !prefs.motion })} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="spark" size={13} color="var(--tx3)" />{prefs.motion ? 'Reduce motion' : 'Enable motion'}
                </button>
                <button onClick={() => setSettings(true)} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="cog" size={13} color="var(--tx3)" />All settings
                </button>
                <button onClick={() => supabase.auth.signOut()} className="hov"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                  <Icon name="back" size={13} color="var(--tx3)" />Sign out
                </button>
              </div>
            )}
          </div>

          {/* Who you are, and which space you are in — the two things every
              other app puts in this corner, and the two things this corner used
              to only pretend to do. The switcher listed three invented
              workspaces and changing it changed a label and nothing else. */}
          <div style={{ padding: '8px 10px 4px', borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setWsOpen((v) => !v)} className="hov"
              aria-haspopup="menu" aria-expanded={wsOpen}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: 6, borderRadius: 9, minHeight: 42 }}>
              <Face name={me.name} photo={me.photo} size={26} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {me.name || 'Your account'}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {spaceName}
                </span>
              </span>
              <Icon name={wsOpen ? 'collapse' : 'expand'} size={13} color="var(--tx3)" />
            </button>

            {wsOpen && (
              <div className="rise" role="menu" aria-label="Account and workspaces"
                style={{ margin: '4px 0 8px', padding: 6, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)' }}>

                <div style={{ ...MENU_KICKER }}>Spaces</div>

                <button role="menuitemradio" aria-checked={prefs.workspace === null}
                  onClick={() => { void update({ workspace: null }); setWsOpen(false); }}
                  className="hov" style={MENU_ITEM}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: acc, flex: 'none' }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Personal</span>
                  {prefs.workspace === null && <Icon name="check" size={13} color="var(--accTx)" />}
                </button>

                {workspaces.map((w) => (
                  <button key={w.id} role="menuitemradio" aria-checked={prefs.workspace === w.id}
                    onClick={() => { void update({ workspace: w.id }); setWsOpen(false); toast(`Switched to ${w.name}`); }}
                    className="hov" style={MENU_ITEM}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: w.color, flex: 'none' }} />
                    <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{w.role}</span>
                    {prefs.workspace === w.id && <Icon name="check" size={13} color="var(--accTx)" />}
                  </button>
                ))}

                <button onClick={() => {
                  setWsOpen(false);
                  void ask('New workspace', { placeholder: 'Team or org name', confirmLabel: 'Create' })
                    .then((n) => { if (n) WA.add(n, PAL.violet); });
                }} className="hov" style={{ ...MENU_ITEM, color: 'var(--tx3)' }}>
                  <Icon name="plus" size={13} color="var(--tx3)" />
                  <span style={{ flex: 1, textAlign: 'left' }}>New workspace</span>
                </button>

                <div style={{ height: 1, background: 'var(--line)', margin: '6px 4px' }} />
                <div style={{ ...MENU_KICKER }}>Account</div>

                <button onClick={() => { setWsOpen(false); go('profile'); }} className="hov" style={MENU_ITEM}>
                  <Icon name="people" size={13} color="var(--tx3)" />
                  <span style={{ flex: 1, textAlign: 'left' }}>Your profile</span>
                </button>
                <button onClick={() => { setWsOpen(false); setSettings(true); }} className="hov" style={MENU_ITEM}>
                  <Icon name="cog" size={13} color="var(--tx3)" />
                  <span style={{ flex: 1, textAlign: 'left' }}>Settings</span>
                </button>
                <button onClick={() => { void supabase.auth.signOut(); toast('Signed out'); }}
                  className="hov" style={{ ...MENU_ITEM, color: 'var(--pal-coral)' }}>
                  <Icon name="back" size={13} color="var(--pal-coral)" />
                  <span style={{ flex: 1, textAlign: 'left' }}>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* With the sidebar closed, a hover strip down the left edge floats it
          back — Notion's behaviour, so the nav is never more than a flick away. */}
      {!phone && !railOpen && (
        <button
          onClick={() => toggleRail(true)}
          title="Show sidebar (Ctrl+\\)" aria-label="Show sidebar"
          className="railpeek"
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 3,
          }}>
          <span style={{
            width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center',
            background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--sh)',
          }}>
            <Icon name="expand" size={14} color="var(--tx2)" />
          </span>
        </button>
      )}

      {/* minHeight:0 is load-bearing. A flex item defaults to min-height:auto,
          which refuses to shrink below its content — so on the phone, where
          this column is the flex *item*, it grew to fit the page instead of the
          viewport. That pushed the nav bar past the bottom edge (where
          overflow:hidden clipped it) and left <main> exactly as tall as its own
          content, so there was nothing to scroll. minWidth:0 does the same job
          for the desktop's row direction; both are needed. */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {!phone && (
          <div style={{ height: 54, flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', borderBottom: '1px solid var(--line)' }}>
            <button onClick={() => setSearch(true)} className="hov" title="Quick actions" style={{
              flex: 'none', height: 30, padding: '0 11px', borderRadius: 9, border: '1px solid var(--line2)',
              fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: 'var(--tx2)', display: 'flex', alignItems: 'center',
            }}>⌘K</button>

            <div className="pill" style={{
              display: 'flex', alignItems: 'center', height: 38, width: 38, borderRadius: 19,
              border: '1px solid var(--line2)', background: 'transparent',
            }}>
              <button onClick={() => setSearch(true)} aria-label="Search"
                style={{ width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" size={16} color="var(--tx2)" />
              </button>
            </div>

            <button onClick={() => toast('The AI panel is switched off in this build')} className="hov k-squish" title="AI helper" aria-label="AI helper" style={{
              width: 38, height: 38, flex: 'none', borderRadius: 19, border: '1px solid var(--line2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="spark" size={15} color="var(--tx2)" />
            </button>

            {/* Capture lives here now. It used to be a draggable circle floating
                over the content, which covered whatever was underneath it and
                had to be moved out of the way to read the page. */}
            <button onClick={openCapture} className="k-squish" title="Capture"
              aria-label="Capture" aria-expanded={!!capture}
              style={{
                width: 38, height: 38, flex: 'none', borderRadius: 19, background: acc,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: capture ? 'rotate(45deg)' : 'rotate(0)',
                transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
              <Icon name="plus" size={16} color={ON_ACCENT} />
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <OfflinePill />
              <PresenceDock peers={peers} onOpen={() => go('people')} />

              <NotificationBell />

              <button onClick={() => setSettings(true)} className="hov k-squish" title="Settings" aria-label="Settings"
                style={{ width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cog" size={17} color="var(--tx2)" />
              </button>

              <button onClick={() => go('profile')} className="k-squish" title="Your profile" aria-label="Your profile"
                style={{ width: 28, height: 28, borderRadius: '50%', background: PAL.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ON_ACCENT }}>MR</button>
            </div>
          </div>
        )}

        {phone && (
          // No fake clock or signal bars: the phone already draws its own status
          // bar directly above this, and duplicating it wasted 44px of a small
          // screen to say the same thing twice.
          <div style={{ height: 42, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 0 16px' }}>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em' }}>
              {SECTIONS.find((x) => x.id === section)?.name ?? 'Basedly'}
            </span>
            <span style={{ marginLeft: 'auto' }} />
            <NotificationBell compact />
            {/* Capture moved up here when the FAB left the nav bar. */}
            <button onClick={openCapture} className="k-squish" aria-label="Capture" aria-expanded={!!capture}
              style={{
                width: 34, height: 34, flex: 'none', borderRadius: 17, background: acc,
                display: 'grid', placeItems: 'center',
                transform: capture ? 'rotate(45deg)' : 'rotate(0)',
                transition: 'transform .3s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
              <Icon name="plus" size={16} color={ON_ACCENT} />
            </button>
            <button onClick={() => setSettings(true)} className="hov k-squish" aria-label="Settings"
              style={{ width: 34, height: 34, flex: 'none', borderRadius: 17, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
              <Icon name="cog" size={16} color="var(--tx2)" />
            </button>
          </div>
        )}

        {/* Full width, matching the reference screenshots: the fixed 353px
            tiles hold their size and the flexible middle column takes the
            slack, which is how the design reads on a wide monitor. */}
        <main id="bd-main" key={pathname} className="pagein" tabIndex={-1}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
          {children}
        </main>

        {phone && (
          <BottomNav section={section} go={go} accent={acc} dark={dark} labels={prefs.alwaysShowLabels}
            items={navFor(prefs.navPicks)} />
        )}
      </div>

      {/* Capture fan — it drops from the header button on both layouts now,
          so it always appears next to the control that opened it. */}
      {capture && (
        <div style={phone
          ? { position: 'fixed', right: 12, top: 'calc(52px + env(safe-area-inset-top))', zIndex: 31, display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'flex-end' }
          : { position: 'fixed', left: capture.x, top: capture.y, zIndex: 31, display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'flex-start' }}>
          {([['task', 'Task', 'taskPlus'], ['note', 'Note', 'bookPlus'], ['money', 'Expense', 'money']] as [CaptureKind, string, IconName][])
            .map(([k, label, ic], i) => (
              <button key={k} className="fabi pop"
                style={{ animationDelay: `${i * 0.04}s`, display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px', borderRadius: 22, background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)', fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}
                onClick={() => { setSheet(k); setCapture(null); }}>
                <Icon name={ic} size={15} color="var(--accTx)" />{label}
              </button>
            ))}
        </div>
      )}

      {sheet && <CaptureSheet kind={sheet} onClose={() => setSheet(null)} />}
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind={menu.kind} label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={acc} dark={dark} />
      )}

      <ToastHost />
      <AskHost />
    </div>
  );
}

const SIDE_ACTION: React.CSSProperties = {
  width: 30, height: 34, flex: 'none', borderRadius: 9, border: '1px solid var(--line2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function OfflinePill() {
  const [online, setOnline] = useState(true);
  useEffect(() => onlineManager.subscribe(() => setOnline(onlineManager.isOnline())), []);
  if (online) return null;
  return (
    <span className="fade" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: PAL.amber }}>
      Offline — queued
    </span>
  );
}

function BottomNav({
  section, go, accent, dark, labels, items,
}: {
  section: string; go: (id: string) => void; accent: string; dark: boolean; labels: boolean;
  items: Section[];
}) {
  /* Seven icons have to fit a 360px phone. The slot compresses with the count
     but the *button* never goes under 44px tall and stays a full share of the
     width, so the tap target holds even when the glyph shrinks (WCAG 2.5.5).
     Labels are dropped past five, where they would truncate to noise. */
  const n = items.length;
  const iconSize = n >= 7 ? 15 : n === 6 ? 16 : 17;
  const showLabels = labels && n <= 5;

  const slot = (s: Section) => {
    const on = s.id === section;
    return (
      <button key={s.id} onClick={() => go(s.id)} title={s.name} aria-label={s.name} aria-current={on ? 'page' : undefined}
        className="k-squish"
        style={{
          flex: '1 1 0', minWidth: 0, height: showLabels ? 52 : 44,
          borderRadius: n >= 6 ? 14 : 18, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: showLabels ? 2 : 0,
          background: on ? accent : 'transparent', transition: 'background .24s, height .3s var(--k-expo)',
          opacity: BUILT.has(s.id) ? 1 : 0.45,
        }}>
        <Icon name={s.ic} size={iconSize} color={on ? ON_ACCENT : 'var(--tx2)'} />
        {showLabels ? (
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.02em', color: on ? ON_ACCENT : 'var(--tx2)', whiteSpace: 'nowrap' }}>
            {s.name}
          </span>
        ) : (
          <span style={{ width: 3, height: 3, borderRadius: '50%', marginTop: 3, background: on ? ON_ACCENT : 'transparent' }} />
        )}
      </button>
    );
  };

  return (
    // `flex: none` plus the bottom inset keeps the bar on screen whatever the
    // page above it is doing — it is a sibling of the scroller, never inside it.
    <div style={{
      flex: 'none', position: 'relative', zIndex: 12,
      padding: '4px 10px calc(12px + env(safe-area-inset-bottom))',
    }}>
      <nav aria-label="Sections" style={{
        ...lg({ tint: accent, strength: 1.15, radius: 27, dark }),
        position: 'relative', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: n >= 6 ? 0 : 2, padding: n >= 6 ? '6px 6px' : '7px 10px',
      }}>
        {/* The speed-dial FAB used to sit in the middle of this bar, splitting
            the sections either side of it and overhanging the glass. Capture
            lives in the header now, and the five slots share the width evenly. */}
        {items.map(slot)}
      </nav>
    </div>
  );
}

/**
 * The desktop capture button. Its tooltip has always said "drag me anywhere";
 * this is the part that makes that true. The position is stored in prefs, so it
 * stays where you put it across sessions and devices, and it is clamped back
 * inside the viewport on resize rather than stranding itself off-screen.
 */

/**
 * The people currently on the same screen as you.
 *
 * Renders nothing when you are alone, which is the point: an avatar cluster
 * that is always there is decoration, and one that appears is information.
 */
function PresenceDock({ peers, onOpen }: { peers: Peer[]; onOpen: () => void }) {
  if (peers.length === 0) return null;
  const shown = peers.slice(0, 3);
  const rest = peers.length - shown.length;

  return (
    <button onClick={onOpen} className="k-dock rise"
      title={`Here now: ${peers.map((p) => p.name).join(', ')}`}
      aria-label={`${peers.length} other ${peers.length === 1 ? 'person' : 'people'} here now`}
      style={{ display: 'flex' }}>
      {shown.map((p, i) => (
        <span key={p.user_id} style={{
          width: 24, height: 24, borderRadius: '50%', background: hueOfId(p.user_id), marginLeft: i ? -7 : 0,
          border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8.5, fontWeight: 700, color: ON_ACCENT,
        }}>
          {p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </span>
      ))}
      {rest > 0 && (
        <span style={{
          width: 24, height: 24, borderRadius: '50%', background: 'var(--card2)', marginLeft: -7,
          border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8.5, fontWeight: 700, color: 'var(--tx2)',
        }}>+{rest}</span>
      )}
    </button>
  );
}

/** Stable per-person colour, so nobody has to store one. */
function hueOfId(id: string): string {
  const v = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Object.values(PAL)[v % 10];
}

const MENU_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  padding: '7px 8px', borderRadius: 8, minHeight: 34,
  fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)',
};

const MENU_KICKER: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
  color: 'var(--tx3)', padding: '4px 8px 3px',
};

/** Your name and picture, read once. */
function useMe() {
  const [me, setMe] = useState<{ name: string; photo: string | null }>({ name: '', photo: null });
  useEffect(() => {
    void (async () => {
      const id = await currentUserId().catch(() => null);
      if (!id) return;
      const { data } = await supabase.from('bd_profiles')
        .select('name,photo_url').eq('user_id', id).maybeSingle();
      setMe({ name: data?.name ?? '', photo: data?.photo_url ?? null });
    })();
  }, []);
  return me;
}

/** A photo when there is one, initials when there is not. */
function Face({ name, photo, size }: { name: string; photo: string | null; size: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />;
  }
  const initials = (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--card2)', flex: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--tx2)',
    }}>{initials}</span>
  );
}
