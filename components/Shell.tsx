'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { CircleBuddy, BuddyHelp } from './CircleBuddy';
import { ToastHost } from './ToastHost';
import { AskHost } from './AskHost';
import { FireworksHost } from './FireworksHost';
import { NotificationBell } from './NotificationBell';
import { useLayout } from '@/lib/useLayout';
import { usePrefs } from '@/lib/prefs';
import { useBackGuard } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { devFixturesOn } from '@/lib/devFixtures';
import { prefetchSection } from '@/lib/prefetch';
import { useLiveSync } from '@/lib/realtime';
import { useAutoSync } from '@/lib/integrations';
import { useWidgetBridge } from '@/lib/widget';
import { watchAccounts } from '@/lib/accounts';
import { useMyIdentity } from '@/lib/people';
import type { CaptureKind } from './CaptureSheet';
import type { SettingsTab } from './SettingsModal';
import { WorkspaceSkeleton } from './WorkspaceSkeleton';

const CaptureSheet = dynamic(() => import('./CaptureSheet').then(m => m.CaptureSheet), { ssr: false });
const SearchPalette = dynamic(() => import('./SearchPalette').then(m => m.SearchPalette), { ssr: false });
const SettingsModal = dynamic(() => import('./SettingsModal').then(m => m.SettingsModal), { ssr: false });
const AccountSheet = dynamic(() => import('./AccountSheet').then(m => m.AccountSheet), { ssr: false });
const MessagesSheet = dynamic(() => import('./MessagesSheet').then(m => m.MessagesSheet), { ssr: false });
const ShortcutsModal = dynamic(() => import('./ShortcutsModal').then(m => m.ShortcutsModal), { ssr: false });

const PRIMARY: { id: string; name: string; ic: IconName }[] = [
  { id: 'home', name: 'Today', ic: 'home' }, { id: 'calendar', name: 'Calendar', ic: 'cal' },
  { id: 'tasks', name: 'Tasks', ic: 'task' }, { id: 'notebooks', name: 'Notes', ic: 'book' },
];
const SECONDARY: { id: string; name: string; ic: IconName }[] = [
  { id: 'projects', name: 'Projects', ic: 'proj' }, { id: 'habits', name: 'Habits', ic: 'habit' },
  { id: 'community', name: 'Community', ic: 'chat' }, { id: 'files', name: 'Files', ic: 'files' },
];
export const MAX_NAV_SLOTS = 5;

function SessionServices({ onCapture }: { onCapture: (kind: CaptureKind) => void }) {
  useLiveSync(); useAutoSync(); useWidgetBridge(onCapture); useEffect(watchAccounts, []);
  return null;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const section = pathname.split('/').filter(Boolean)[0] || 'home';
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [guard, setGuard] = useState<'checking' | 'ok' | 'error'>('checking');
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [account, setAccount] = useState(false);
  const [messages, setMessages] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  useBackGuard();
  useEffect(() => {
    if (devFixturesOn()) { setGuard('ok'); return; }
    let alive = true;
    setGuard('checking');
    const timer = setTimeout(() => { if (alive) setGuard('error'); }, 10000);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      clearTimeout(timer);
      if (error) { setGuard('error'); return; }
      if (data.session) setGuard('ok');
      else {
        try { sessionStorage.setItem('basedly-after-auth', location.pathname + location.search + location.hash); } catch {}
        router.replace('/');
      }
    }).catch(() => { if (alive) { clearTimeout(timer); setGuard('error'); } });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') router.replace('/');
      else if (session && alive) { clearTimeout(timer); setGuard('ok'); }
    });
    return () => { alive = false; clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, [router, authAttempt]);
  const onCapture = useCallback((kind: CaptureKind) => setCapture(kind), []);
  useEffect(() => {
    const openSettings = (e: Event) => setSettings((e as CustomEvent<SettingsTab>).detail || 'general');
    window.addEventListener('basedly:settings', openSettings);
    let lastKey = ''; let lastTime = 0;
    const keyboard = (e: KeyboardEvent) => {
      const input = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(v => !v); return; }
      if (input || search || capture || settings || messages || account || help) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase()==='l') {e.preventDefault();void update({theme:prefs.theme==='dark'?'light':'dark'});return;}
      if (e.key === '/') {e.preventDefault();setSearch(true);return;}
      if(lastKey==='g' && Date.now()-lastTime<900){const dest:Record<string,string>={h:'home',c:'calendar',t:'tasks',n:'notebooks',b:'habits',f:'community',p:'profile'};lastKey='';if(dest[e.key.toLowerCase()]){e.preventDefault();router.push(`/${dest[e.key.toLowerCase()]}/`);return;}}
      lastKey=e.key.toLowerCase();lastTime=Date.now();
      if(e.key.toLowerCase()==='e'&&!e.ctrlKey&&!e.metaKey)setCapture('money');
      if (e.key === '?') setShortcuts(true);
      if (section !== 'calendar' && e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) setCapture('task');
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) router.push('/notebooks/?focus=notes');
    };
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('keydown', keyboard); window.removeEventListener('basedly:settings', openSettings); };
  }, [router, search, capture, settings, messages, account, help, section, update, prefs.theme]);
  const active = [...PRIMARY, ...SECONDARY].find(item => item.id === section);
  const title = active?.name || ({ more: 'Explore', gym: 'Gym', fuel: 'Fuel', money: 'Money', people: 'People', profile: 'Profile', body: 'Body' } as Record<string, string>)[section] || 'Basedly';
  const navItem = (item: { id: string; name: string; ic: IconName }) => (
    <Link key={item.id} href={`/${item.id}/`} prefetch={false} className={`studio-nav-item ${section === item.id ? 'is-active' : ''}`}
      aria-current={section === item.id ? 'page' : undefined} onPointerEnter={() => { router.prefetch(`/${item.id}/`); prefetchSection(item.id); }} onFocus={() => { router.prefetch(`/${item.id}/`); prefetchSection(item.id); }}>
      <Icon name={item.ic} size={20} /><span>{item.name}</span>{section === item.id && <span className="studio-nav-current" aria-hidden />}
    </Link>
  );
  return <div className={`studio-shell ${phone ? 'studio-phone' : ''}`}>
    <a className="studio-skip" href="#bd-main">Skip to content</a>
    {!phone && <aside className="studio-sidebar" aria-label="Workspace navigation">
      <Link href="/home/" className="studio-brand"><CircleBuddy size={32} /><span>basedly<span className="studio-brand-dot">.</span></span></Link>
      <button className="studio-search" onClick={() => setSearch(true)}><Icon name="search" size={18} /><span>Find anything</span><kbd>Ctrl K</kbd></button>
      <button className="studio-button primary studio-create" onClick={() => setCapture('task')}><Icon name="plus" size={18} />Create a task</button>
      <nav aria-label="Daily workspace" className="studio-primary-nav">{PRIMARY.map(navItem)}</nav>
      <div className="studio-nav-divider" />
      <nav aria-label="More in Basedly" className="studio-secondary-nav">{SECONDARY.map(navItem)}{navItem({ id: 'more', name: 'Explore everything', ic: 'grid' })}</nav>
      <div className="studio-sidebar-bottom">
        <button className="studio-buddy-card" onClick={() => setHelp(true)}><CircleBuddy size={40} /><span><strong>A little help?</strong><small>Let’s find your next step.</small></span></button>
        <button className="studio-nav-item" onClick={() => setSettings('integrations')}><Icon name="plug" size={18} /><span>Connections</span></button>
        <button className="studio-nav-item" onClick={() => setSettings('general')}><Icon name="cog" size={18} /><span>Settings</span></button>
        {guard === 'ok' && <AccountButton onClick={() => setAccount(true)} />}
      </div>
    </aside>}
    <div className="studio-workspace">
      <header className="studio-topbar">
        <div className="studio-location">{phone && <button className="studio-icon-button" aria-label="Ask buddy for help" onClick={() => setHelp(true)}><CircleBuddy size={25} /></button>}<span>{title}</span>{!phone && <span className="studio-location-detail">Your personal workspace</span>}</div>
        <div className="studio-top-actions">
          <button className="studio-icon-button" onClick={() => setSearch(true)} aria-label="Search everything" title="Search everything"><Icon name="search" size={19} /></button>
          <button className="studio-icon-button" onClick={() => setMessages(true)} aria-label="Messages" title="Messages"><Icon name="chat" size={19} /></button>
          {!phone && <button className="studio-icon-button" onClick={() => void update({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })} aria-label="Switch color theme" title="Switch color theme"><Icon name="moon" size={19} /></button>}
          {guard === 'ok' && <NotificationBell compact />}
          <button className="studio-help-button" onClick={() => setHelp(true)} aria-label="Ask buddy for help"><CircleBuddy size={28} /></button>
          {phone && <button className="studio-icon-button" onClick={() => setSettings('general')} aria-label="Settings"><Icon name="cog" size={19} /></button>}
        </div>
      </header>
      <main id="bd-main" tabIndex={-1} className="studio-main" data-section={section}>
        {guard === 'checking' ? <WorkspaceSkeleton kind={section} /> : guard === 'error' ? <div className="studio-session-error" role="alert"><CircleBuddy size={64} /><h1>Let’s reconnect.</h1><p>Your session is taking longer than expected. Check your connection and try again.</p><button className="studio-button primary" onClick={() => setAuthAttempt(v => v + 1)}>Try again</button><Link href="/">Back to sign in</Link></div> : children}
      </main>
      {phone && <nav className="studio-bottom-nav" aria-label="Main navigation">{[...PRIMARY, { id: 'more', name: 'Explore', ic: 'grid' as IconName }].map(navItem)}</nav>}
    </div>
    {guard === 'ok' && <SessionServices onCapture={onCapture} />}
    {capture && <CaptureSheet kind={capture} onClose={() => setCapture(null)} />}
    {search && <SearchPalette onClose={() => setSearch(false)} />}
    {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
    {account && <AccountPanel onClose={() => setAccount(false)} onSettings={() => { setAccount(false); setSettings('account'); }} />}
    {messages && <MessagesSheet onClose={() => setMessages(false)} />}
    {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}
    {help && <BuddyHelp section={section} onClose={() => setHelp(false)} />}
    <ToastHost /><AskHost /><FireworksHost />
  </div>;
}
function AccountButton({ onClick }: { onClick: () => void }) {
  const me = useMyIdentity();
  return <button className="studio-account" onClick={onClick}><span className="studio-avatar">{me.name?.slice(0, 1) || 'B'}</span><span><strong>{me.name || 'Your account'}</strong><small>Account & workspaces</small></span><Icon name="chev" size={16} /></button>;
}
function AccountPanel({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  const me = useMyIdentity();
  return <AccountSheet me={me} onClose={onClose} onSettings={onSettings} />;
}
