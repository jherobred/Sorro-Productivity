'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { ToastHost } from './ToastHost';
import { AskHost } from './AskHost';
import { FireworksHost } from './FireworksHost';
import { MessengerDock } from './MessengerDock';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { usePresence, roomFor, type Peer } from '@/lib/presence';
import { useWorkspaces, useWorkspaceActions } from '@/lib/workspaces';
import { prefetchSection } from '@/lib/prefetch';
import { ask } from '@/lib/ask';
import { SECHUE, PAL } from '@/lib/pal';
import { supabase, currentUserId } from '@/lib/supabase';
import { onlineManager } from '@tanstack/react-query';
import { lg, ON_ACCENT } from '@/lib/glass';
import { CaptureSheet, type CaptureKind } from './CaptureSheet';
import { SearchPalette } from './SearchPalette';
import { ShortcutsModal } from './ShortcutsModal';
import { NotificationBell } from './NotificationBell';
import type { SettingsTab } from './SettingsModal';
/**
 * SettingsModal is 1,400 lines and it was imported at module scope here, so
 * it sat in the shared chunk every route pays for, to render a panel that is
 * only on screen when someone opens settings. `type SettingsTab` stays a
 * static type import - types erase, so it pulls nothing.
 */
const SettingsModal = dynamic(() => import('./SettingsModal').then((m) => m.SettingsModal), { ssr: false });
import { ContextMenu, type CtxItem } from './ContextMenu';
import { devFixturesOn } from '@/lib/devFixtures';
import { useBackGuard, useOverlayBack } from '@/lib/nav';
import { useAutoSync } from '@/lib/integrations';
import { watchAccounts } from '@/lib/accounts';
import { AccountSheet, Face } from './AccountSheet';
import { MessagesSheet, useUnreadCount } from './MessagesSheet';
import { useAlwaysFullscreen } from '@/lib/appUpdate';
import { useLiveSync } from '@/lib/realtime';
import { useMyIdentity } from '@/lib/people';
import { useTasks } from '@/lib/tasks';
import { toast } from '@/lib/toast';
import { useTabOnboarding } from '@/lib/useTabOnboarding';
import { SpotlightOverlay } from './SpotlightOverlay';
import { useRanked } from '@/lib/challenges';
import { BirdMascot } from './BasedlyLogo';
import { GROUP_HUE, GROUP_ORDER, HAS_SIDEBAR, SECTION_GROUP, type GroupName } from '@/lib/shellLayouts';
import { TodaySpine } from './shell/TodaySpine';
import { DayColumn } from './shell/DayColumn';
import { HubBoard } from './shell/HubBoard';
import { ContextPane } from './shell/ContextPane';
import { ShellDock } from './shell/ShellDock';
import { useSidePanelWidth } from '@/lib/sidePanel';


/** The ⌘K affordance for the layouts with no sidebar to hold one. */
function JumpPill({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="hov" title="Search or jump to (⌘K)" style={{
      flex: 'none', height: 28, padding: '0 10px', borderRadius: 999,
      border: '1px solid var(--line2)', background: 'var(--card2)',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)',
    }}>
      <Icon name="search" size={13} color="var(--tx3)" />
      Jump to<span className="num" style={{ color: 'var(--tx3)' }}>⌘K</span>
    </button>
  );
}

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
  { id: 'tasks', name: 'Tasks', ic: 'task' },
  { id: 'notebooks', name: 'Notebooks', ic: 'book', kids: [{ n: 'Shelf', c: PAL.pink }, { n: 'Notebooks', c: PAL.indigo }, { n: 'Canvas', c: PAL.cyan }, { n: 'Graph', c: PAL.violet }, { n: 'Journal', c: PAL.coral }, { n: 'Java', c: PAL.amber }] },
  { id: 'projects', name: 'Projects', ic: 'proj' },
  { id: 'habits', name: 'Habits', ic: 'habit' },
  { id: 'gym', name: 'Gym', ic: 'heart' },
  { id: 'fuel', name: 'Fuel', ic: 'food' },
  { id: 'money', name: 'Money', ic: 'money', lock: true },
  { id: 'profile', name: 'Profile', ic: 'focus' },
  { id: 'community', name: 'Community', ic: 'chat', kids: [{ n: 'Feed', c: PAL.pink }, { n: 'Messages', c: PAL.sky }, { n: 'Challenges', c: PAL.amber }] },
  { id: 'files', name: 'Files', ic: 'files' },
  { id: 'people', name: 'People', ic: 'people' },
];

const BUILT = new Set(['home', 'tasks', 'calendar', 'habits', 'money', 'notebooks', 'people', 'files', 'gym', 'fuel', 'projects', 'community', 'profile', 'more']);

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
  const { phone, viewMode, setViewMode } = useLayout();
  const { prefs, update } = usePrefs();
  const [guard, setGuard] = useState<'checking' | 'ok'>('checking');
  const [capture, setCapture] = useState<{ x: number; y: number } | null>(null);
  const openCapture = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCapture((c) => (c ? null : { x: r.left, y: r.bottom + 8 }));
  };
  const [sheet, setSheet] = useState<CaptureKind | null>(null);
  const [search, setSearch] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [openKids, setOpenKids] = useState<Record<string, boolean>>({ community: true });
  /** The sub-item the breadcrumb's last crumb names, or '' for the whole section. */
  const [focusLabel, setFocusLabel] = useState('');
  /**
   * L5 insets the column by an open panel instead of letting it be covered.
   * Read here, above the `guard` early return — below it the hook only runs on
   * the renders that get that far, which is a changing hook count.
   */
  const panelW = useSidePanelWidth();
  /** The combined you/accounts/space sheet, opened from your face. */
  const [account, setAccount] = useState(false);
  /** Messages, full screen, on a phone. The desktop has the dock instead. */
  const [msgs, setMsgs] = useState(false);
  const { data: workspaces = [] } = useWorkspaces();
  const WA = useWorkspaceActions();
  const me = useMyIdentity();
  const spaceName = prefs.workspace
    ? workspaces.find((w) => w.id === prefs.workspace)?.name ?? 'Personal'
    : 'Personal';
  const [sideMore, setSideMore] = useState(false);
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [menu, setMenu] = useState<{ x: number; y: number; kind: string; label: string; items: CtxItem[] } | null>(null);
  const { data: tasks = [] } = useTasks();
  const { data: ranked } = useRanked();
  const unread = useUnreadCount();

  const { activeTour, startTour, finishTour, closeTour, checkAutoTrigger, seen } = useTabOnboarding();

  const getActiveTabKey = useCallback(() => {
    const sec = pathname.split('/').filter(Boolean)[0] ?? 'home';
    if (sec === 'community' && typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'challenges') return 'community_challenges';
      if (tabParam === 'messages') return 'community_messages';
      return 'community_feed';
    }
    return sec;
  }, [pathname]);

  // Auto-trigger tab onboarding for first-time viewers of that tab
  useEffect(() => {
    const tabKey = getActiveTabKey();
    const cleanup = checkAutoTrigger(tabKey);
    return () => {
      if (cleanup) cleanup();
    };
  }, [getActiveTabKey, checkAutoTrigger]);

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
  // One socket for every table, owned by the session rather than by a screen.
  // This is what makes the phone and the desktop agree without a reload.
  useLiveSync();
  // Remember whoever signs in, so switching back needs no round trip.
  useEffect(watchAccounts, []);
  // Phone view: fullscreen by default on the first user interaction. Desktop: normal.
  useAlwaysFullscreen(phone);

  /**
   * Ctrl/Cmd+\ or clicking logo toggles between full ('open') and partial ('compact').
   */
  const layout = prefs.shellLayout ?? 'L3';
  /** Two of the five have no sidebar at all, and L1's is always the rail. */
  const hasSidebar = HAS_SIDEBAR[layout];

  const chosenSidebar: 'open' | 'compact' =
    prefs.sidebar === 'compact' ? 'compact' : 'open';

  // L1 is the rail by definition — its width is what pays for the context
  // pane, so letting the user open it back to 236px would leave no room for
  // the third column it exists to create.
  const sidebarMode: 'open' | 'compact' | 'hidden' =
    !hasSidebar ? 'hidden' : (layout === 'L1' ? 'compact' : chosenSidebar);

  const setSidebarMode = useCallback(
    (mode: 'open' | 'compact' | 'hidden') => void update({ sidebar: mode }),
    [update],
  );

  const cycleSidebarMode = useCallback(() => {
    if (!hasSidebar || layout === 'L1') return;
    setSidebarMode(sidebarMode === 'open' ? 'compact' : 'open');
  }, [hasSidebar, layout, sidebarMode, setSidebarMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        cycleSidebarMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleSidebarMode]);
  useOverlayBack(!!capture, () => setCapture(null));

  useEffect(() => {
    // Dev-only preview. `NODE_ENV` is inlined at build time, so this whole
    // branch is stripped from production bundles — it cannot be enabled by an
    // env var on the deployed site. Providers does the seeding; this just skips
    // the auth gate.
    if (devFixturesOn()) { setGuard('ok'); return; }

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        // Remember where they were trying to go. Without this, opening
        // somebody's profile link while signed out signs you in and drops you
        // on Home — the link works only for people who were already inside,
        // which is every case except the one it exists for.
        try { sessionStorage.setItem('basedly-after-auth', location.pathname + location.search); } catch { /* private mode */ }
        router.replace('/');
      } else setGuard('ok');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) router.replace('/'); });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  // Global keyboard shortcuts
  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const onKey = (e: KeyboardEvent) => {
      const isInput =
        /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '') ||
        (e.target as HTMLElement)?.isContentEditable;
      // An overlay already open swallows Ctrl+K and the single-letter
      // shortcuts below, so pressing "T" or "?" behind the Search palette
      // (or any other overlay) can no longer pop a second one on top of it.
      const overlayOpen = search || !!sheet || shortcutsOpen || account || settings || !!menu;

      // 1. Search / Command Palette: ⌘K or Ctrl-K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (overlayOpen) return;
        e.preventDefault();
        setSearch(true);
        return;
      }

      // 2. Toggle Theme: ⌘+Shift+L or Ctrl+Shift+L
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        void update({ theme: dark ? 'light' : 'dark' });
        toast(dark ? 'Switched to Light mode' : 'Switched to Dark mode');
        return;
      }

      // 3. Toggle Sidebar: ⌘+B or Ctrl+B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        cycleSidebarMode();
        return;
      }

      if (isInput || overlayOpen) return;

      // 4. Quick Search: /
      if (e.key === '/') {
        e.preventDefault();
        setSearch(true);
        return;
      }

      // 5. Help / Shortcuts Cheat Sheet: ?
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      // 1 to 5: Top Navigation Shortcuts
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5'].includes(e.key)) {
        if (overlayOpen) return;
        e.preventDefault();
        const routeMap: Record<string, string> = {
          '1': '/home/',
          '2': '/calendar/',
          '3': '/tasks/',
          '4': '/notebooks/',
          '5': '/projects/',
        };
        router.push(routeMap[e.key]);
        return;
      }

      // 6. Quick Creation: T for Task, N for Note, E for Expense
      if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSheet('task');
        return;
      }
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSheet('note');
        return;
      }
      if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSheet('money');
        return;
      }

      // 7. Fast Go navigation: 'G' followed by target letter within 1s
      const now = Date.now();
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        lastKey = 'g';
        lastKeyTime = now;
        return;
      }

      if (lastKey === 'g' && now - lastKeyTime < 1000 && !e.ctrlKey && !e.metaKey) {
        lastKey = '';
        const target = e.key.toLowerCase();
        const routes: Record<string, string> = {
          h: '/home/',
          c: '/calendar/',
          t: '/tasks/',
          n: '/notebooks/',
          b: '/habits/',
          f: '/community/',
          p: '/profile/',
          m: '/money/',
          o: '/gym/',
          u: '/fuel/',
          j: '/projects/',
        };
        if (routes[target]) {
          e.preventDefault();
          router.push(routes[target]);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // search/sheet/shortcutsOpen/account/settings/menu feed overlayOpen above —
    // without them here the handler would keep checking a stale (permanently
    // closed) snapshot of every overlay flag.
  }, [router, dark, update, cycleSidebarMode, search, sheet, shortcutsOpen, account, settings, menu]);

  // The sidebar badge reads the tasks already in cache. It used to fire a
  // count query against Supabase on every single navigation — a network round
  // trip per page change, for a number the app was holding all along.
  useEffect(() => {
    const read = () => {
      try {
        return new URLSearchParams(window.location.search).get('focus') ?? '';
      } catch { return ''; }
    };
    setFocusLabel(read());
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ section: string; focus: string }>).detail;
      if (d?.section === section) setFocusLabel(d.focus ?? '');
    };
    window.addEventListener('basedly:focus', on);
    return () => window.removeEventListener('basedly:focus', on);
  }, [section, pathname]);

  const taskCount = tasks.filter((t) => !t.done && !t.deleted_at).length;

  if (guard === 'checking') return <div style={{ height: '100dvh', background: 'var(--bg)' }} />;

  const go = (id: string) => { if (BUILT.has(id)) router.push(`/${id}/`); };
  /** Same navigation, plus `?focus=` so the page can open on that sub-item. */
  const goFiltered = (id: string, focus: string) => {
    if (BUILT.has(id)) {
      router.push(`/${id}/?focus=${encodeURIComponent(focus)}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('basedly:focus', { detail: { section: id, focus } }));
      }
    }
  };
  /**
   * SECTIONS interleaved with the four group headers, in GROUP_ORDER. Anything
   * an edit to SECTIONS adds without a group falls to the end under "More",
   * rather than silently disappearing from the sidebar.
   */
  const groupedSections: (Section | { head: GroupName })[] = (() => {
    const out: (Section | { head: GroupName })[] = [];
    const placed = new Set<string>();
    for (const g of GROUP_ORDER) {
      const rows = SECTIONS.filter((x) => SECTION_GROUP[x.id] === g);
      if (!rows.length) continue;
      out.push({ head: g });
      for (const r of rows) { out.push(r); placed.add(r.id); }
    }
    const rest = SECTIONS.filter((x) => !placed.has(x.id));
    if (rest.length) { out.push({ head: 'Social' }); out.push(...rest); }
    return out;
  })();

  const activeSection = SECTIONS.find((x) => x.id === section);

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

      {!phone && hasSidebar && (
        <div className="bd-rail" style={{
          ...lg({ tint: acc, strength: 1, dark }),
          width: sidebarMode === 'open' ? 236 : (sidebarMode === 'compact' ? 64 : 0),
          minWidth: sidebarMode === 'open' ? 236 : (sidebarMode === 'compact' ? 64 : 0),
          maxWidth: sidebarMode === 'open' ? 236 : (sidebarMode === 'compact' ? 64 : 0),
          opacity: sidebarMode === 'hidden' ? 0 : 1,
          pointerEvents: sidebarMode === 'hidden' ? 'none' : 'auto',
          flex: 'none', position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', padding: sidebarMode === 'hidden' ? 0 : '14px 0', overflow: 'hidden',
          border: 0, borderRadius: 0,
          borderRight: sidebarMode === 'hidden' ? 'none' : '1px solid var(--line)',
          boxShadow: sidebarMode === 'hidden' ? 'none' : (dark
            ? 'inset -1px 0 0 rgba(255,255,255,.07), inset 1px 0 0 rgba(255,255,255,.16)'
            : 'inset -1px 0 0 rgba(38,32,54,.05), inset 1px 0 0 rgba(255,255,255,.95)'),
        }}>
          {sidebarMode === 'open' ? (
            /* Open Mode Header - click shrinks to partial (compact icons) */
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px 16px 18px', minWidth: 236 }}>
              <button
                onClick={() => setSidebarMode('compact')}
                className="k-squish"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  outline: 'none',
                }}
                title="Click to shrink to compact navigation"
                aria-label="Click to shrink to compact navigation"
              >
                <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-.04em', color: 'var(--tx)', lineHeight: 1 }}>
                  basedly
                </span>
              </button>
            </div>
          ) : (
            /* Compact Icon-Only Mode Header - click expands back to full navigation */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0 14px', width: 64 }}>
              <button
                onClick={() => setSidebarMode('open')}
                className="k-squish"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  outline: 'none',
                  display: 'grid',
                  placeItems: 'center',
                }}
                title="Click to expand to full navigation"
                aria-label="Click to expand to full navigation"
              >
                <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-.04em', color: 'var(--tx)', lineHeight: 1 }}>
                  b
                </span>
              </button>
            </div>
          )}

          {/* Section list */}
          <div className="navsb" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: sidebarMode === 'open' ? '0 8px 0 17px' : '0 10px', width: sidebarMode === 'open' ? 236 : 64 }}>
            {(layout === 'L3' && sidebarMode === 'open' ? groupedSections : SECTIONS).map((sec) => {
              // A group header is a row in the same list rather than a wrapper,
              // so the twelve section rows below are rendered by exactly the
              // code every other layout uses.
              if ('head' in sec) {
                return (
                  <div key={`h:${sec.head}`} className="kicker hx"
                    style={{ '--h': GROUP_HUE[sec.head], padding: '13px 8px 5px' } as React.CSSProperties}>
                    {sec.head}
                  </div>
                );
              }
              const on = sec.id === section;
              const hue = SECHUE[sec.id] || acc;
              const hasKids = !!sec.kids;
              const open = hasKids && openKids[sec.id] !== false && openKids[sec.id] !== undefined;
              const badge = sec.id === 'tasks' && taskCount > 0 ? String(taskCount) : sec.badge ?? '';

              if (sidebarMode === 'compact') {
                return (
                  <div key={sec.id} className="compact-tab-wrap">
                    <button
                      onClick={() => go(sec.id)}
                      onPointerDown={() => prefetchSection(sec.id)}
                      aria-label={sec.name}
                      className={on ? 'k-squish' : 'hov k-squish'}
                      style={{
                        width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center',
                        background: on ? `color-mix(in srgb, ${hue} 20%, transparent)` : 'transparent',
                        border: on ? `1px solid color-mix(in srgb, ${hue} 35%, transparent)` : '1px solid transparent',
                        color: on ? hueTx(hue) : 'var(--tx2)', position: 'relative', margin: '0 auto',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon name={sec.ic} size={18} color={on ? hueTx(hue) : 'var(--tx2)'} />
                      {badge && (
                        <span style={{
                          position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%',
                          background: hue, border: '1.5px solid var(--bg)',
                        }} />
                      )}
                    </button>
                    <div className="compact-tooltip">
                      {sec.name}{badge ? ` (${badge})` : ''}
                    </div>
                  </div>
                );
              }

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
                    <button onClick={() => go(sec.id)} onPointerDown={() => prefetchSection(sec.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
                      padding: hasKids ? '7px 4px 7px 8px' : '7px 8px 7px 8px', borderRadius: 8, fontSize: 12.5, fontWeight: on ? 700 : 500,
                      background: 'transparent', color: on ? hueTx(hue) : 'var(--tx2)',
                      opacity: BUILT.has(sec.id) ? 1 : 0.45,
                    }}>
                      <Icon name={sec.ic} size={15} color={on ? hueTx(hue) : 'var(--tx2)'} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{sec.name}</span>
                      {badge && (
                        <span style={{
                          minWidth: 20,
                          height: 18,
                          padding: '0 6px',
                          borderRadius: 9,
                          background: on ? 'color-mix(in srgb, var(--tx) 12%, transparent)' : 'var(--card2)',
                          border: `1px solid ${on ? 'color-mix(in srgb, var(--tx) 20%, transparent)' : 'var(--line)'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: on ? hueTx(hue) : 'var(--tx2)',
                          fontVariantNumeric: 'tabular-nums',
                          flex: 'none',
                        }}>
                          {badge}
                        </span>
                      )}
                    </button>
                    {hasKids && (
                      <button
                        onClick={() => setOpenKids((k) => ({ ...k, [sec.id]: !open }))}
                        aria-label={`${open ? 'Hide' : 'Show'} items under ${sec.name}`}
                        aria-expanded={open}
                        title="Show or hide sub-items"
                        style={{
                          width: 22, height: 22, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginRight: 4, borderRadius: 6,
                        }}>
                        <Icon name="chev" size={13} color={on ? hueTx(hue) : 'var(--tx3)'}
                          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .28s cubic-bezier(0.16,1,0.3,1)' }} />
                      </button>
                    )}
                  </div>

                  {open && sec.kids && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 6px 15px',
                      paddingLeft: 9, borderLeft: '1px solid var(--line2)',
                    }}>
                      {sec.kids.map((k) => (
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

          {sidebarMode === 'open' ? (
            /* Open Mode Footer */
            <>
              <div style={{ padding: '8px 8px 4px', borderTop: '1px solid var(--line)', minWidth: 236 }}>
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
                    <button onClick={() => setViewMode(viewMode === 'phone' ? 'web' : 'phone')} className="hov"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                      <Icon name={viewMode === 'phone' ? 'monitor' : 'phone'} size={13} color="var(--tx3)" />{viewMode === 'phone' ? 'Switch to Web View' : 'Dedicated Phone View'}
                    </button>
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
                    <button onClick={() => setAccount(true)} className="hov"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)' }}>
                      <Icon name="people" size={13} color="var(--tx3)" />Accounts and sign out
                    </button>
                  </div>
                )}
              </div>

              <div style={{ padding: '8px 10px 4px', borderTop: '1px solid var(--line)', minWidth: 236 }}>
                <button onClick={() => setAccount(true)} className="hov"
                  aria-haspopup="dialog"
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
                  <Icon name="expand" size={13} color="var(--tx3)" />
                </button>
              </div>
            </>
          ) : (
            /* Compact Icon-Only Account Avatar */
            <div style={{ padding: '10px 0 6px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'center', width: 64 }}>
              <button
                onClick={() => setAccount(true)}
                title={me.name || 'Your account'}
                aria-label={me.name || 'Your account'}
                className="hov k-squish"
                style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <Face name={me.name} photo={me.photo} size={28} />
              </button>
            </div>
          )}
        </div>
      )}

      {!phone && hasSidebar && sidebarMode === 'hidden' && (
        <button
          onClick={() => setSidebarMode('open')}
          title="Click to reset sidebar to normal (3/3)"
          aria-label="Reset sidebar to normal"
          className="k-squish"
          style={{
            position: 'fixed', left: 10, top: 10, zIndex: 30,
            width: 32, height: 32, borderRadius: 9,
            background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--sh)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}
        >
          <span style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-.04em', color: 'var(--tx)', lineHeight: 1 }}>
            b
          </span>
        </button>
      )}

      {/* L1's second column: the width the rail gave up, filled by the section. */}
      {!phone && layout === 'L1' && (
        <ContextPane section={section} sectionName={activeSection?.name ?? 'Basedly'}
          hue={SECHUE[section] || acc} kids={activeSection?.kids} focus={focusLabel}
          go={go} goFiltered={goFiltered}
          onNew={() => setSheet(section === 'tasks' ? 'task' : section === 'money' ? 'money' : 'note')} />
      )}

      {/* L4's frame: today is always on the left, and sections render beside it. */}
      {!phone && layout === 'L4' && <DayColumn go={go} />}

      {/* Main viewport */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {!phone && (
          <div style={{
            height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 12,
            padding: sidebarMode === 'hidden' ? '0 20px 0 52px' : '0 20px',
            borderBottom: '1px solid var(--line)',
            transition: 'padding-left .28s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            {/* L2, L4 and L5 have no sidebar to carry the wordmark, so it sits
                here; L3 spends the same room on the Today spine instead. */}
            {!hasSidebar && layout !== 'L5' && (
              <button onClick={() => go('home')} className="k-squish" title="Home" style={{
                fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 19,
                letterSpacing: '-.04em', color: 'var(--tx)', flex: 'none',
              }}>basedly</button>
            )}

            {/* L1 replaces the page title with where you are, since the two
                context columns to the left already say it in full. */}
            {layout === 'L1' && (
              <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <button onClick={() => go(section)} className="metaline hov"
                  style={{ padding: '2px 4px', borderRadius: 5 }}>
                  {activeSection?.name ?? 'Basedly'}
                </button>
                <Icon name="chev" size={12} color="var(--tx3)" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }}>
                  {focusLabel || 'All'}
                </span>
              </nav>
            )}

            {layout === 'L3' && <TodaySpine go={go} />}

            {layout === 'L5' && (
              <>
                <span style={{
                  flex: 'none', fontFamily: 'var(--font-heading)', fontSize: 17,
                  fontWeight: 700, letterSpacing: '-.03em', color: 'var(--tx)',
                }}>{activeSection?.name ?? 'Basedly'}</span>
                {taskCount > 0 && (
                  <span className="metaline num" style={{ flex: 'none' }}>{taskCount} open</span>
                )}
              </>
            )}

            {/* L2 is a board and a palette: with no sidebar and no chip row,
                the field is the only way to anything not on a card, so it
                takes the middle of the bar rather than an icon in the corner. */}
            {layout === 'L2' && (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                <button onClick={() => setSearch(true)} className="hov" style={{
                  width: 420, maxWidth: '100%', height: 34, borderRadius: 10,
                  border: '1px solid var(--line2)', background: 'var(--card2)',
                  display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px',
                }}>
                  <Icon name="search" size={15} color="var(--tx3)" />
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 12.5, color: 'var(--tx3)' }}>
                    Jump to anything
                  </span>
                  <span className="num" style={{
                    height: 20, padding: '0 7px', borderRadius: 999, fontSize: 10, lineHeight: '20px',
                    border: '1px solid var(--line2)', color: 'var(--tx3)',
                  }}>⌘K</span>
                </button>
              </div>
            )}

            {layout === 'L4' && <JumpPill onClick={() => setSearch(true)} />}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {layout === 'L5' && <JumpPill onClick={() => setSearch(true)} />}
              <OfflinePill />
              <PresenceDock peers={peers} onOpen={() => go('people')} />

              {/* Tab Onboarding Guide Tour - only shown if user has NOT completed onboarding yet */}
              {!seen.has(getActiveTabKey()) && (
                <button
                  onClick={() => startTour(getActiveTabKey())}
                  className="hov k-squish"
                  title="Feature Tour & Guide (+15 RP)"
                  aria-label="Feature Tour & Guide"
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 8,
                    border: '1px solid color-mix(in srgb, var(--pal-amber) 35%, var(--line2))',
                    background: 'color-mix(in srgb, var(--pal-amber) 10%, var(--card2))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--pal-amber)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="spark" size={13} color="var(--pal-amber)" />
                  <span>Tour</span>
                </button>
              )}

              <NotificationBell />

              {/* Centralized profile & settings entry point on top right */}
              <button
                onClick={() => {
                  setSettingsTab('general');
                  setSettings(true);
                }}
                className="k-squish"
                title="Profile & Settings"
                aria-label="Profile & Settings"
                aria-haspopup="dialog"
                style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center' }}
              >
                <Face name={me.name} photo={me.photo} size={32} />
              </button>
            </div>
          </div>
        )}

        {phone && (
          <div style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid var(--line)' }}>
            <button
              onClick={() => router.push('/home/')}
              className="k-squish"
              style={{
                fontSize: 19,
                fontWeight: 900,
                letterSpacing: '-.04em',
                color: 'var(--tx)',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: 0,
                outline: 'none',
                cursor: 'pointer',
              }}
              title="Go to Home"
            >
              {SECTIONS.find((x) => x.id === section)?.name ?? 'basedly'}
            </button>
            <span style={{ marginLeft: 'auto' }} />

            {/* Mobile Tour Button - only shown if user has NOT completed onboarding yet */}
            {!seen.has(getActiveTabKey()) && (
              <button
                onClick={() => startTour(getActiveTabKey())}
                className="hov k-squish"
                title="Feature Tour (+15 RP)"
                aria-label="Feature Tour"
                style={{
                  height: 32,
                  padding: '0 8px',
                  borderRadius: 8,
                  border: '1px solid color-mix(in srgb, var(--pal-amber) 35%, var(--line2))',
                  background: 'color-mix(in srgb, var(--pal-amber) 10%, var(--card2))',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--pal-amber)',
                }}
              >
                <Icon name="spark" size={13} color="var(--pal-amber)" />
                <span>+15 RP</span>
              </button>
            )}

            {/* Messages with unread badge */}
            <button
              onClick={() => setMsgs(true)}
              className="hov k-squish"
              aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}
              style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--card2)', display: 'grid', placeItems: 'center', position: 'relative' }}
            >
              <Icon name="send" size={14} color={unread ? 'var(--accTx)' : 'var(--tx2)'} />
              {unread > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    minWidth: 14,
                    height: 14,
                    padding: '0 3px',
                    borderRadius: 7,
                    background: 'var(--pal-coral)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 800,
                    lineHeight: '14px',
                    textAlign: 'center',
                    border: '1px solid var(--bg)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            <NotificationBell compact />

            {/* Centralized profile & settings entry point on mobile */}
            <button
              onClick={() => {
                setSettingsTab('general');
                setSettings(true);
              }}
              className="k-squish"
              aria-label="Profile & Settings"
              aria-haspopup="dialog"
              style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center' }}
            >
              <Face name={me.name} photo={me.photo} size={32} />
            </button>
          </div>
        )}

        {/* On a phone L4 keeps the day, laid flat above the section instead of
            beside it — there is no room for a 320px column at 390px wide. */}
        {phone && layout === 'L4' && (
          <div style={{ flex: 'none', height: 244, overflow: 'hidden', display: 'flex' }}>
            <DayColumn width={390} go={go} />
          </div>
        )}

        {/* L1's whole claim is that sub-items are drawn, not hidden. The
            context pane cannot fit beside a phone, so the chips come with it. */}
        {phone && layout === 'L1' && !!activeSection?.kids?.length && (
          <div className="hbar" style={{
            flex: 'none', display: 'flex', gap: 6, padding: '9px 14px',
            borderBottom: '1px solid var(--line)', overflowX: 'auto',
          }}>
            <button onClick={() => go(section)} className="k-squish" style={{
              height: 26, padding: '0 10px', borderRadius: 8, flex: 'none',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              color: !focusLabel ? 'var(--tx)' : 'var(--tx2)',
              background: !focusLabel
                ? `color-mix(in srgb, ${SECHUE[section] || acc} 20%, transparent)` : 'var(--card)',
              border: `1px solid ${!focusLabel
                ? `color-mix(in srgb, ${SECHUE[section] || acc} 38%, transparent)` : 'var(--line)'}`,
            }}>All</button>
            {activeSection.kids.map((k) => (
              <button key={k.n} onClick={() => goFiltered(section, k.n)} className="k-squish" style={{
                height: 26, padding: '0 10px', borderRadius: 8, flex: 'none',
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                color: focusLabel === k.n ? 'var(--tx)' : 'var(--tx2)',
                background: focusLabel === k.n ? `color-mix(in srgb, ${k.c} 20%, transparent)` : 'var(--card)',
                border: `1px solid ${focusLabel === k.n ? `color-mix(in srgb, ${k.c} 38%, transparent)` : 'var(--line)'}`,
              }}>{k.n}</button>
            ))}
          </div>
        )}

        {/* Full width, matching the reference screenshots */}
        <main id="bd-main" key={pathname} className="pagein" tabIndex={-1}
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
            // L5's dock floats over the content rather than reserving a strip,
            // so the column has to clear it from the inside.
            paddingBottom: layout === 'L5' ? 'calc(72px + env(safe-area-inset-bottom))' : undefined,
            // …and an open panel pushes the column rather than covering it.
            paddingRight: layout === 'L5' && !phone && panelW ? panelW : undefined,
            transition: 'padding-right .3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
          {layout === 'L2' && section === 'home'
            ? <HubBoard go={go} phone={phone} />
            : children}
        </main>

        {/* L5 is one shell at both sizes: the dock replaces the tab bar. */}
        {layout === 'L5' ? (
          <ShellDock items={navFor(prefs.navPicks).filter((x) => x.id !== 'more').map((x) => ({
            id: x.id, name: x.name, ic: x.ic, hue: SECHUE[x.id] || acc,
          }))} active={section} go={go} onMore={() => go('more')} />
        ) : phone && (
          <BottomNav section={section} go={go} accent={acc} dark={dark} labels={prefs.alwaysShowLabels}
            items={navFor(prefs.navPicks)} />
        )}
      </div>

      {/* Capture fan */}
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

      {account && (
        <AccountSheet me={me} onClose={() => setAccount(false)} onSettings={() => { setSettingsTab('general'); setSettings(true); }} />
      )}
      {msgs && phone && <MessagesSheet onClose={() => setMsgs(false)} />}

      {sheet && <CaptureSheet kind={sheet} onClose={() => setSheet(null)} />}
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {settings && <SettingsModal initialTab={settingsTab} onClose={() => setSettings(false)} />}
      {activeTour && (
        <SpotlightOverlay
          config={activeTour}
          onClose={() => closeTour(activeTour.tabId)}
          onFinish={() => finishTour(activeTour.tabId)}
        />
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind={menu.kind} label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={acc} dark={dark} />
      )}

      <MessengerDock />
      <ToastHost />
      <AskHost />
      <FireworksHost />
    </div>
  );
}


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
      <button key={s.id} onClick={() => go(s.id)} onPointerDown={() => prefetchSection(s.id)}
        title={s.name} aria-label={s.name} aria-current={on ? 'page' : undefined}
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


