'use client';
import { themeIsDark } from '@/lib/theme';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { ToastHost } from './ToastHost';
import { AskHost } from './AskHost';
import { FireworksHost } from './FireworksHost';
import { FocusTopClock } from './FocusTopClock';
import {SyncHealth} from './SyncHealth';
import { usePrefs } from '@/lib/prefs';
import { useBackGuard, useOverlayBack } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { devFixturesOn } from '@/lib/devFixtures';
import { useLiveSync } from '@/lib/realtime';
import { useAutoSync } from '@/lib/integrations';
import { useCanvasAlerts } from '@/lib/canvasLms';
import { watchAccounts } from '@/lib/accounts';
import { DESTINATIONS, activePath, currentId } from '@/lib/destinations';
import { useAccounts } from '@/lib/accounts';
import { useLayout } from '@/lib/useLayout';
const Settings = dynamic(() => import('./SettingsModal').then(m => m.SettingsModal), { ssr: false });
const Search = dynamic(() => import('./SearchPalette').then(m => m.SearchPalette), { ssr: false });
const Accounts = dynamic(() => import('./AccountSheet').then(m => m.AccountSheet), { ssr: false });
export const MAX_NAV_SLOTS = 5;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const { phone } = useLayout();
  const accounts = useAccounts();
  const [me, setMe] = useState({ id: '', name: 'Your workspace', handle: null as string | null, photo: null as string | null });
  const [authError, setAuthError] = useState(false);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(false);
  const [settings, setSettings] = useState(false);
  const [settingsTab,setSettingsTab]=useState<'general'|'integrations'>('general');
  const [account, setAccount] = useState(false);
  const [more, setMore] = useState(false);
  const [online, setOnline] = useState(true);
  useBackGuard(); useLiveSync(); useAutoSync(); useCanvasAlerts();
  useEffect(watchAccounts, []);
  useOverlayBack(more, () => setMore(false));
  useEffect(() => {
    if (devFixturesOn()) { setReady(true); return; }
    let live = true;
    const timeout = setTimeout(() => { if (live) setAuthError(true); }, 12000);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      clearTimeout(timeout);
      if (error) { setAuthError(true); return; }
      if (data.session) { setReady(true); const u = data.session.user; setMe({ id: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || 'Your workspace', handle: null, photo: u.user_metadata?.avatar_url || null }); }
      else { try { sessionStorage.setItem('basedly-after-auth', location.pathname + location.search); } catch {} router.replace('/'); }
    }).catch(() => { if (live) setAuthError(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => { if (!session) router.replace('/'); });
    return () => { live = false; clearTimeout(timeout); data.subscription.unsubscribe(); };
  }, [router]);
  useEffect(() => { if (!activePath(pathname)) router.replace('/home/'); }, [pathname, router]);
  /**
   * The sheet closes on arrival, never before the tap.
   *
   * Closing it in the tap handler dropped the overlay's history entry while the
   * router was still fetching the next route, and the Back that removed that
   * entry cancelled the navigation — four of six tools went nowhere. The
   * overlay history closes it the moment the route push lands; this covers the
   * rest.
   */
  useEffect(() => { setMore(false); }, [pathname]);
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    network();
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(v => !v); } if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); update({ sidebar: prefs.sidebar === 'compact' ? 'open' : 'compact' }); } };
    window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('keydown', key); };
  }, [prefs.sidebar, update]);
  const current = DESTINATIONS.find(d => pathname.split('/')[1] === d.id);
  // A pick of a tab that has since moved (Projects into Tasks) can name the same place twice; it is shown once.
  const mobilePicks = prefs.navPicks.map(id => DESTINATIONS.find(d => d.id === currentId(id))).filter((d, i, all): d is typeof DESTINATIONS[number] => !!d && all.indexOf(d) === i).slice(0, 4);
  const mobileNav = mobilePicks.length ? mobilePicks : DESTINATIONS.slice(0, 4);
  const nav = (items: readonly typeof DESTINATIONS[number][]) => items.map(d => <Link key={d.id} href={'/' + d.id + '/'} title={d.name} aria-current={current?.id === d.id ? 'page' : undefined} className="studio-nav-link"><Icon name={d.icon} size={18} /><span>{d.name}</span></Link>);
  const storedMe = accounts.find(a => a.user_id === me.id);
  if (!ready) return <div className="studio-loading" role="status"><span className="basedly-wordmark">basedly</span>{authError ? <div><p>Couldn’t open your session. Check your connection and try again.</p><button className="studio-button" onClick={() => location.reload()}>Try again</button></div> : 'Opening your workspace…'}</div>;
  return <div className="studio-shell" data-compact={prefs.sidebar === 'compact'} data-phone={phone}>
    <a className="skip-link" href="#workspace">Skip to content</a>
    <aside className="studio-sidebar">
      <div className="studio-brand-row"><Link href="/home/" className="basedly-wordmark">basedly</Link><button title="Collapse navigation" aria-label="Toggle compact navigation" onClick={() => update({ sidebar: prefs.sidebar === 'compact' ? 'open' : 'compact' })}><Icon name="panelLeft" size={18} /></button></div>
      <button className="studio-search" onClick={() => setSearch(true)}><Icon name="search" size={18} /><span>Find anything</span><kbd>Ctrl K</kbd></button>
      <nav aria-label="Main navigation"><div className="studio-nav-group"><span>Plan</span>{nav(DESTINATIONS.filter(d => ['home', 'calendar', 'tasks', 'board'].includes(d.id)))}</div><div className="studio-nav-group"><span>Think</span>{nav(DESTINATIONS.filter(d => ['notebooks', 'focus', 'links'].includes(d.id)))}</div><div className="studio-nav-group"><span>Self</span>{nav(DESTINATIONS.filter(d => ['habits', 'fitness', 'fuel', 'plates', 'money', 'memories'].includes(d.id)))}</div></nav>
      <div className="studio-sidebar-bottom"><button className="studio-account" onClick={() => setAccount(true)}><span className="studio-avatar">{(storedMe?.name || me.name).charAt(0)}</span><span><strong>{storedMe?.name || me.name}</strong><small>Personal workspace</small></span><Icon name="chevR" size={15} /></button></div>
    </aside>
    <div className="studio-workspace">
      <header className="studio-topbar"><Link href="/home/" className="studio-mobile-brand basedly-wordmark">basedly</Link><span className="studio-location">Your workspace <span>/</span> {current?.name || 'Today'}</span><div className="studio-top-actions">{devFixturesOn() && <span className="demo-label">Preview data</span>}<SyncHealth onOpen={()=>{setSettingsTab('integrations');setSettings(true);}}/><FocusTopClock /><button aria-label="Search" onClick={() => setSearch(true)}><Icon name="search" size={19} /></button><button aria-label="Settings" title="Settings" onClick={() => {setSettingsTab('general');setSettings(true);}}><Icon name="cog" size={19} /></button><button aria-label={themeIsDark(prefs.theme) ? 'Use light theme' : 'Use dark theme'} className="theme-switch" onClick={() => update({ theme: themeIsDark(prefs.theme) ? 'light' : 'dark' })}><Icon name={themeIsDark(prefs.theme) ? 'sun' : 'moon'} size={18} /></button></div></header>
      <main id="workspace" className="studio-main" data-page={current?.id} style={{ zoom: prefs.fontScale }}>{activePath(pathname) ? children : null}</main>
    </div>
    <nav className="studio-bottom-nav" aria-label="Mobile navigation">{nav(mobileNav)}<button className="studio-nav-link" aria-expanded={more} onClick={() => setMore(true)}><Icon name="more" size={20} /><span>More</span></button></nav>
    {more && <div className="studio-sheet-backdrop" onClick={() => setMore(false)}><section className="studio-more" role="dialog" aria-modal="true" aria-label="More tools" onClick={e => e.stopPropagation()}><div className="section-heading"><h2>Your other tools</h2><button aria-label="Close more tools" onClick={() => setMore(false)}><Icon name="close" /></button></div>{DESTINATIONS.filter(d => !mobileNav.includes(d)).map(d => <Link key={d.id} href={'/' + d.id + '/'} className="more-tool" onClick={() => { if (current?.id === d.id) setMore(false); }}><Icon name={d.icon} size={24} />{d.name}</Link>)}<button className="more-tool" onClick={() => { setMore(false); setAccount(true); }}><Icon name="people" />Account</button></section></div>}
    {search && <Search onClose={() => setSearch(false)} />}{settings && <Settings initialTab={settingsTab} onClose={() => setSettings(false)} />}{account && <Accounts me={{ ...me, name: storedMe?.name || me.name, photo: storedMe?.photo || me.photo }} onClose={() => setAccount(false)} onSettings={() => { setAccount(false); setSettings(true); }} />}
    <ToastHost /><AskHost /><FireworksHost />
  </div>;
}

