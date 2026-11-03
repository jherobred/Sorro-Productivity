'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { Fox } from './Fox';
import { ToastHost } from './ToastHost';
import { AskHost } from './AskHost';
import { SyncHealth } from './SyncHealth';
import { usePrefs } from '@/lib/prefs';
import { useBackGuard } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { devFixturesOn } from '@/lib/devFixtures';
import { useLiveSync } from '@/lib/realtime';
import { useAutoSync } from '@/lib/integrations';
import { watchAccounts, useAccounts } from '@/lib/accounts';
import { useNotes } from '@/lib/notes';
import { DESTINATIONS, activePath } from '@/lib/destinations';
import { useLayout } from '@/lib/useLayout';
import { themeIsDark } from '@/lib/theme';
import './shell.css';
const Settings = dynamic(() => import('./SettingsModal').then(m => m.SettingsModal), { ssr: false });
const Search = dynamic(() => import('./SearchPalette').then(m => m.SearchPalette), { ssr: false });
const Accounts = dynamic(() => import('./AccountSheet').then(m => m.AccountSheet), { ssr: false });
const Capture = dynamic(() => import('./CaptureSheet').then(m => m.CaptureSheet), { ssr: false });

type TauriWindow = { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void> };
const tauriWindow = (): TauriWindow | null => (globalThis as { __TAURI__?: { window: { getCurrentWindow(): TauriWindow } } }).__TAURI__?.window.getCurrentWindow() ?? null;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const { phone } = useLayout();
  const accounts = useAccounts();
  const { data: notes = [] } = useNotes();
  const [me, setMe] = useState({ id: '', name: 'You', photo: null as string | null });
  const [authError, setAuthError] = useState(false);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(false);
  const [settings, setSettings] = useState<false | 'general' | 'integrations'>(false);
  const [account, setAccount] = useState(false);
  const [capture, setCapture] = useState(false);
  const press = useRef<number | null>(null);
  const rail = prefs.sidebar !== 'open';
  const [win, setWin] = useState<TauriWindow | null>(null);
  useEffect(() => setWin(tauriWindow()), []);
  const dark = themeIsDark(prefs.theme);
  useEffect(() => {
    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    })().catch(() => {});
  }, [dark]);
  useBackGuard(); useLiveSync(); useAutoSync();
  useEffect(watchAccounts, []);
  useEffect(() => {
    if (devFixturesOn()) { setReady(true); return; }
    let live = true;
    const timeout = setTimeout(() => { if (live) setAuthError(true); }, 12000);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      clearTimeout(timeout);
      if (error) { setAuthError(true); return; }
      if (data.session) { setReady(true); const u = data.session.user; setMe({ id: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || 'You', photo: u.user_metadata?.avatar_url || null }); }
      else { try { sessionStorage.setItem('basedly-after-auth', location.pathname + location.search); } catch {} router.replace('/'); }
    }).catch(() => { if (live) setAuthError(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => { if (!session) router.replace('/'); });
    return () => { live = false; clearTimeout(timeout); data.subscription.unsubscribe(); };
  }, [router]);
  useEffect(() => { if (!activePath(pathname)) router.replace('/home/'); }, [pathname, router]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(v => !v); }
      if (e.key === '\\') { e.preventDefault(); update({ sidebar: rail ? 'open' : 'compact' }); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [rail, update]);

  const current = DESTINATIONS.find(d => pathname.split('/')[1] === d.id);
  const stored = accounts.find(a => a.user_id === me.id);
  const name = stored?.name || me.name;
  const pinned = (prefs.pinnedNotes || []).map(id => notes.find(n => n.id === id)).filter(n => !!n);
  const holdStart = () => { press.current = window.setTimeout(() => { press.current = null; setCapture(true); }, 500); };
  const holdEnd = (e: React.PointerEvent) => { if (press.current === null) e.preventDefault(); else { clearTimeout(press.current); press.current = null; } };

  if (!ready) return <div className="sx-loading" role="status"><Fox pose="head" size={28} /><span className="sx-word">sorro</span>{authError ? <div><p>Couldn’t open your session. Check your connection and try again.</p><button onClick={() => location.reload()}>Try again</button></div> : null}</div>;
  return <div className="sx" data-rail={rail} data-phone={phone}>
    <a className="skip-link" href="#workspace">Skip to content</a>
    {!phone && <aside className="sx-side" data-part="S.side">
      <div className="sx-brand"><Link href="/home/" aria-label="Sorro home"><Fox pose="head" size={20} /><span className="sx-word">sorro</span></Link><button className="sx-icon" aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title="Ctrl \" onClick={() => update({ sidebar: rail ? 'open' : 'compact' })}><Icon name="panelLeft" size={18} /></button></div>
      <nav className="sx-nav" aria-label="Main navigation">{DESTINATIONS.map(d => <Link key={d.id} href={'/' + d.id + '/'} title={d.name} aria-current={current?.id === d.id ? 'page' : undefined}><Icon name={d.icon} size={18} /><span>{d.name}</span></Link>)}</nav>
      {pinned.length > 0 && <><h3>Pinned</h3><nav className="sx-nav sx-pins" aria-label="Pinned notes">{pinned.map(n => <Link key={n.id} href={'/notebooks/?note=' + n.id} title={n.title || 'Untitled'}><Icon name="pin" size={16} /><span>{n.title || 'Untitled'}</span></Link>)}</nav></>}
      <button className="sx-me" onClick={() => setAccount(true)}><span className="sx-avatar">{name.charAt(0)}</span><span>{name}</span></button>
    </aside>}
    <div className="sx-work">
      <header className="sx-top" data-part="S.top" data-tauri-drag-region={win ? '' : undefined}>
        {phone && <Link href="/home/" aria-label="Sorro home"><Fox pose="head" size={20} /></Link>}
        <h1 data-tauri-drag-region={win ? '' : undefined}>{current?.name}</h1>
        <div id="strip-actions" className="sx-actions" />
        {devFixturesOn() && <span className="sx-demo">Preview data</span>}
        <SyncHealth onOpen={() => setSettings('integrations')} />
        <button className="sx-icon" aria-label="Search" title="Search (Ctrl K)" onClick={() => setSearch(true)}><Icon name="search" size={18} /></button>
        {phone && <button className="sx-avatar" aria-label="Account and settings" onClick={() => setAccount(true)}>{name.charAt(0)}</button>}
        {win && <div className="sx-caption"><button aria-label="Minimize" onClick={() => void win.minimize()}><Icon name="minus" size={16} /></button><button aria-label="Maximize" onClick={() => void win.toggleMaximize()}><Icon name="square" size={14} /></button><button className="x" aria-label="Close" onClick={() => void win.close()}><Icon name="close" size={16} /></button></div>}
      </header>
      <main id="workspace" className="studio-main" data-page={current?.id} data-part={current?.part} style={{ zoom: prefs.fontScale }}>{activePath(pathname) ? children : null}</main>
    </div>
    {phone && <nav className="sx-bar" data-part="S.bar" aria-label="Main navigation">{DESTINATIONS.map(d => <Link key={d.id} href={'/' + d.id + '/'} aria-label={d.name} aria-current={current?.id === d.id ? 'page' : undefined}
      {...(d.id === 'home' ? { onPointerDown: holdStart, onPointerUp: holdEnd, onPointerLeave: holdEnd, onClick: (e: React.MouseEvent) => { if (capture) e.preventDefault(); } } : {})}><Icon name={d.icon} size={21} /></Link>)}</nav>}
    {search && <Search onClose={() => setSearch(false)} />}
    {settings && <Settings initialTab={settings} onClose={() => setSettings(false)} />}
    {account && <Accounts me={{ id: me.id, name, handle: null, photo: stored?.photo || me.photo }} onClose={() => setAccount(false)} onSettings={() => { setAccount(false); setSettings('general'); }} />}
    {capture && <Capture kind="task" onClose={() => setCapture(false)} />}
    <ToastHost /><AskHost />
  </div>;
}
