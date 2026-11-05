'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { usePrefs, type Prefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { supabase, currentUserId } from '@/lib/supabase';
import { luminance } from '@/lib/contrast';
import { PAL } from '@/lib/pal';
import { DESTINATIONS } from '@/lib/destinations';
import { Face } from './AccountSheet';
import { useAccounts, switchTo, addAccount, signOutAll } from '@/lib/accounts';
import { Integrations } from './Integrations';
import { SaveHealthDetails } from './SyncHealth';
import { StudyBackup } from './StudyBackup';
import { APP_VERSION } from '@/lib/appUpdate';
import { playClick, playTick, playCelebration, playFocusBell } from '@/lib/audio';
import { Fox } from './Fox';
import { downloadLocalModel, forgetLocalModel, useLocalModel } from '@/lib/localModel';
import { askAlertPermission } from '@/lib/deviceNotify';
import { DEFAULT_FOX_TIMES } from '@/lib/foxNudges';


/** Shared settings for desktop, phone, and tablet. */
export type SettingsTab =
  | 'general'
  | 'account'
  | 'appearance'
  | 'audio'
  | 'integrations'
  | 'app';


function OfflineAssistant() {
  const m = useLocalModel();
  return <Field label="Offline assistant" hint="A small model that answers on this device when you have no connection. About 350 MB, downloaded once. It can read your cached tasks but cannot change anything.">
    {m.status === 'ready' ? <button style={INPUT_STYLE} onClick={() => void forgetLocalModel()}>Remove the offline model</button>
      : m.status === 'downloading' ? <span role="status">Downloading, {Math.round(m.progress * 100)}%</span>
      : <button style={INPUT_STYLE} onClick={downloadLocalModel}>{m.status === 'error' ? `Try again (${m.message})` : 'Download the offline model'}</button>}
  </Field>;
}

/** The fox speaking first: on or off, notifications, and when the morning plan and wrap-up come. */
function FoxSettings({ fox, set }: { fox: Prefs['fox']; set: (f: NonNullable<Prefs['fox']>) => void }) {
  const f = fox ?? {};
  const on = f.proactive !== false;
  return <>
    <ToggleRow label="Fox speaks first" hint="A morning plan, overdue nudges, reactions when you finish things, and an evening wrap-up" on={on} onChange={v => set({ ...f, proactive: v })} />
    {on && <>
      <ToggleRow label="Fox notifications" hint="On the phone app they arrive with Sorro closed; on the web and PC only while it is open" on={!!f.notify}
        onChange={v => { if (!v) { set({ ...f, notify: false }); return; } void askAlertPermission().then(ok => set({ ...f, notify: ok })); }} />
      <Field label="Morning plan"><input type="time" aria-label="Morning plan time" style={INPUT_STYLE} value={f.morning || DEFAULT_FOX_TIMES.morning} onChange={e => set({ ...f, morning: e.target.value })} /></Field>
      <Field label="Evening wrap-up"><input type="time" aria-label="Evening wrap-up time" style={INPUT_STYLE} value={f.evening || DEFAULT_FOX_TIMES.evening} onChange={e => set({ ...f, evening: e.target.value })} /></Field>
    </>}
  </>;
}

export function SettingsModal({
  initialTab = 'general',
  onClose,
}: {
  initialTab?: SettingsTab;
  onClose: () => void;
}) {
  const { phone, viewMode, setViewMode } = useLayout();
  const { prefs, update } = usePrefs();
  const accentInk = luminance(prefs.accent) > 0.2 ? '#141414' : '#FFFFFF';
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [search, setSearch] = useState('');
  const [phoneSubPage, setPhoneSubPage] = useState<SettingsTab | null>(initialTab === 'general' ? null : initialTab);

  // Profile data states
  const [userId, setUserId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [handle, setHandle] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const accounts = useAccounts();

  useOverlayBack(true, onClose);
  useOverlayBack(!!phoneSubPage, () => setPhoneSubPage(null));

  // Load user profile
  useEffect(() => {
    (async () => {
      try {
        const uid = await currentUserId();
        if (!uid) return;
        setUserId(uid);
        const { data } = await supabase.from('sorro_profiles').select('name,handle,photo_url').eq('user_id', uid).maybeSingle();
        if (data) {
          setFullName(data.name || '');
          setHandle(data.handle || '');
          setPhotoUrl(data.photo_url || null);

        }
      } catch {}
    })();
  }, []);

  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    playTick();
    void update({ [k]: v } as Partial<Prefs>);
  };

  const navItems: { id: SettingsTab; label: string; icon: IconName; group: string }[] = [
    { id: 'general', label: 'General', icon: 'cog', group: 'Settings' },
    { id: 'account', label: 'Account', icon: 'people', group: 'Settings' },
    { id: 'appearance', label: 'Appearance', icon: 'moon', group: 'Settings' },
    { id: 'audio', label: 'Audio & Focus', icon: 'habit', group: 'Customize' },
    { id: 'integrations', label: 'Integrations', icon: 'files', group: 'Customize' },
    { id: 'app', label: 'App & Info', icon: 'mind', group: 'Customize' },
  ];

  const filteredNav = useMemo(() => {
    if (!search.trim()) return navItems;
    const q = search.toLowerCase();
    return navItems.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [search]);

  // RENDER DESKTOP DIALOG
  const renderDesktop = () => (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(5, 6, 12, 0.72)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="k-bloom"
        style={{
          width: 860,
          maxWidth: '96vw',
          height: 640,
          maxHeight: '86vh',
          display: 'flex',
          background: 'var(--card)',
          color: 'var(--tx)',
          border: '1px solid var(--line2)',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          overflow: 'hidden',
        }}
      >
        {/* Left Sidebar */}
        <div
          style={{
            width: 230,
            flex: 'none',
            background: 'color-mix(in srgb, var(--card) 94%, #000)',
            borderRight: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            padding: '14px 10px',
            color: 'var(--tx)',
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', marginBottom: 12, padding: '0 4px' }}>
            <span style={{ position: 'absolute', left: 14, top: 9, pointerEvents: 'none' }}>
              <Icon name="search" size={14} color="var(--tx3)" />
            </span>
            <input
              type="text"
              placeholder="Search settings"
              aria-label="Search settings"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                height: 32,
                padding: '0 10px 0 32px',
                borderRadius: 8,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                fontSize: 12,
                color: 'var(--tx)',
                outline: 'none',
              }}
            />
          </div>

          {/* Navigation List */}
          <div className="navsb" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {['Settings', 'Customize'].map((grp) => {
              const items = filteredNav.filter((i) => i.group === grp);
              if (items.length === 0) return null;
              return (
                <div key={grp} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--tx3)', padding: '6px 10px', textTransform: 'uppercase' }}>
                    {grp}
                  </div>
                  {items.map((it) => {
                    const active = tab === it.id;
                    return (
                      <button
                        key={it.id}
                        onClick={() => {
                          playClick();
                          setTab(it.id);
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          padding: '7px 10px',
                          borderRadius: 8,
                          fontSize: 12.5,
                          fontWeight: active ? 700 : 500,
                          background: active ? 'color-mix(in srgb, var(--acc) 18%, var(--card2))' : 'transparent',
                          color: active ? 'var(--accTx)' : 'var(--tx2)',
                          border: active ? '1px solid color-mix(in srgb, var(--acc) 35%, transparent)' : '1px solid transparent',
                          textAlign: 'left',
                          transition: 'all .15s ease',
                        }}
                      >
                        <Icon name={it.icon} size={15} color={active ? 'var(--accTx)' : 'var(--tx3)'} />
                        <span style={{ flex: 1 }}>{it.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Content Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, color: 'var(--tx)' }}>
          {/* Top Bar with Title and Close 'X' */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderBottom: '1px solid var(--line)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', textTransform: 'capitalize', color: 'var(--tx)' }}>
              {tab === 'general' ? 'General Settings' : tab}
            </h2>
            <button
              onClick={onClose}
              className="hov k-squish"
              aria-label="Close"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
              }}
            >
              <Icon name="close" size={13} color="var(--tx2)" />
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="navsb" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 30px' }}>
            {renderTabContent(tab)}
          </div>
        </div>
      </div>
    </div>
  );

  // RENDER PHONE VIEW
  const renderPhone = () => (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="k-bloom"
        style={{
          width: '100%',
          height: '92dvh',
          background: 'var(--card)',
          color: 'var(--tx)',
          borderTop: '1px solid var(--line2)',
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shl)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          {phoneSubPage ? (
            <button
              onClick={() => setPhoneSubPage(null)}
              className="hov k-squish"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--accTx)' }}
            >
              <Icon name="chev" size={14} color="var(--accTx)" /> Back
            </button>
          ) : (
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', flex: 1, color: 'var(--tx)' }}>Settings</div>
          )}

          <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>
            {phoneSubPage ? (phoneSubPage === 'general' ? 'General' : phoneSubPage) : ''}
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center', background: 'var(--card2)' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* Content Body */}
        <div className="navsb" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px calc(24px + env(safe-area-inset-bottom))' }}>
          {phoneSubPage ? (
            renderTabContent(phoneSubPage)
          ) : (
            <>
              {/* Account Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 14px',
                  borderRadius: 16,
                  background: 'var(--card2)',
                  border: '1px solid var(--line2)',
                  marginBottom: 16,
                }}
              >
                <Face name={fullName} photo={photoUrl} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fullName || 'Sorro User'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{handle || 'student'}
                  </div>
                </div>

              </div>

              <PhoneGroup>
                <PhoneRow icon="cog" label="General" sub="Launch, calendar, and feedback" onClick={() => setPhoneSubPage('general')} />
                <PhoneRow icon="people" label="Accounts" sub="Sign-in and devices" onClick={() => setPhoneSubPage('account')} />
              </PhoneGroup>

              {/* Group 2: Appearance & Style */}
              <PhoneGroup>
                <PhoneRow
                  icon="moon"
                  label="Color Mode"
                  sub={prefs.theme === 'system' ? 'System' : prefs.theme === 'dark' ? 'Dark' : 'Light'}
                  onClick={() => setPhoneSubPage('appearance')}
                />
                <PhoneRow
                  icon="spark"
                  label="Accent Color"
                  sub="Theme tint"
                  previewColor={prefs.accent}
                  onClick={() => setPhoneSubPage('appearance')}
                />
                <PhoneRow
                  icon="expand"
                  label="Navigation Panel"
                  sub={prefs.sidebar === 'compact' ? 'Compact Icons (64px)' : (prefs.sidebar === 'hidden' || prefs.sidebar === 'collapsed' ? 'Hidden (Chevron)' : 'Expanded (236px)')}
                  onClick={() => setPhoneSubPage('appearance')}
                />
              </PhoneGroup>

              {/* Group 3: Audio & Feedback */}
              <PhoneGroup>
                <PhoneToggleRow
                  icon="spark"
                  label="Motion & Animation"
                  on={prefs.motion}
                  onChange={(v) => setPref('motion', v)}
                />
                <PhoneToggleRow
                  icon="habit"
                  label="Soundscapes & Audio Cues"
                  on={prefs.soundEnabled ?? true}
                  onChange={(v) => setPref('soundEnabled', v)}
                />
              </PhoneGroup>

              {/* Group 4: Integrations & Updates */}
              <PhoneGroup>
                <PhoneRow
                  icon="files"
                  label="Capabilities & Sync"
                  sub="Google Calendar · Canvas"
                  onClick={() => setPhoneSubPage('integrations')}
                />
                <PhoneRow
                  icon="mind"
                  label="App & Version"
                  sub={`v${APP_VERSION}`}
                  onClick={() => setPhoneSubPage('app')}
                />
              </PhoneGroup>

              {/* Group 5: Sign Out */}
              <PhoneGroup>
                <button
                  onClick={async () => {
                    playClick();
                    await signOutAll();
                    window.location.href = '/';
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: PAL.coral,
                    fontSize: 13.5,
                    fontWeight: 700,
                    textAlign: 'left',
                  }}
                >
                  <Icon name="trash" size={16} color={PAL.coral} />
                  <span>Log out</span>
                </button>
              </PhoneGroup>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // SHARED TAB CONTENT PANELS
  function renderTabContent(currentTab: SettingsTab) {
    switch (currentTab) {
      case 'general':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Field label="Open Sorro on">
              <select aria-label="Open Sorro on" style={INPUT_STYLE} value={DESTINATIONS.some(d => d.id === prefs.landing) ? prefs.landing : 'home'} onChange={e => setPref('landing', e.target.value)}>
                {DESTINATIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="First day of the week">
              <select aria-label="First day of the week" style={INPUT_STYLE} value={prefs.weekStart} onChange={e => setPref('weekStart', e.target.value as Prefs['weekStart'])}>
                <option value="mon">Monday</option><option value="sun">Sunday</option>
              </select>
            </Field>
            <ToggleRow label="24-hour clock" hint="Show times as 14:30 instead of 2:30 PM" on={prefs.time24} onChange={v => setPref('time24', v)} />
            <ToggleRow label="Motion & animation" hint="Page transitions and small visual feedback" on={prefs.motion} onChange={v => setPref('motion', v)} />
            <ToggleRow label="Haptic feedback" hint="Gentle taps on supported phones and tablets" on={prefs.haptics} onChange={v => setPref('haptics', v)} />
            <ToggleRow label="Sound effects" hint="Soft confirmation sounds and focus bells" on={prefs.soundEnabled} onChange={v => setPref('soundEnabled', v)} />
            <ToggleRow label="Show part names" hint="Label each region with its code, like N.list or S.top" on={!!prefs.showParts} onChange={v => setPref('showParts', v)} />
            <FoxSettings fox={prefs.fox} set={v => setPref('fox', v)} />
            <OfflineAssistant />
          </div>
        );

      case 'account':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Accounts & Sessions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts.map((a) => {
                const isCurrent = a.user_id === userId;
                return (
                  <div
                    key={a.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: isCurrent ? 'color-mix(in srgb, var(--acc) 12%, var(--card2))' : 'var(--card2)',
                      border: isCurrent ? '1px solid color-mix(in srgb, var(--acc) 30%, transparent)' : '1px solid var(--line2)',
                    }}
                  >
                    <Face name={a.name} photo={a.photo} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name || 'Account'}</div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{a.email || 'Google Account'}</div>
                    </div>
                    {isCurrent ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>Active</span>
                    ) : (
                      <button
                        onClick={() => switchTo(a.user_id)}
                        className="hov k-squish"
                        style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--card)', fontSize: 11, fontWeight: 700 }}
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                onClick={addAccount}
                className="hov k-squish"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px',
                  borderRadius: 12,
                  border: '1px dashed var(--line2)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: 'var(--tx2)',
                }}
              >
                <Icon name="plus" size={14} color="var(--tx2)" /> Add another Google account
              </button>
            </div>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <button
                onClick={async () => {
                  playClick();
                  await signOutAll();
                  window.location.href = '/';
                }}
                className="hov k-squish"
                style={{
                  padding: '9px 14px',
                  borderRadius: 10,
                  background: 'color-mix(in srgb, var(--pal-coral) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--pal-coral) 40%, transparent)',
                  color: PAL.coral,
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                Sign out of all sessions
              </button>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Theme & Color</div>
            <Field label="Theme Mode">
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { v: 'system', n: 'System', ic: 'cog' },
                  { v: 'light', n: 'Light', ic: 'sun' },
                  { v: 'dark', n: 'Dark', ic: 'moon' },
                ].map((t) => (
                  <button
                    key={t.v}
                    aria-pressed={prefs.theme === t.v}
                    onClick={() => setPref('theme', t.v as Prefs['theme'])}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: prefs.theme === t.v ? 'var(--acc)' : 'var(--card2)',
                      color: prefs.theme === t.v ? accentInk : 'var(--tx)',
                      fontSize: 13,
                      fontWeight: 700,
                      border: '1px solid var(--line2)',
                    }}
                  >
                    <Icon name={t.ic as IconName} size={15} color={prefs.theme === t.v ? accentInk : 'var(--tx)'} />
                    {t.n}
                  </button>
                ))}
              </div>
            </Field>

            <div style={{ ...SECTION_TITLE, marginTop: 10 }}>View Mode & Layout</div>
            <Field label="Display View Mode" hint="Auto-detects your device, or forces Dedicated Phone View or Web View.">
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { v: 'auto', n: 'Auto-Detect', hint: 'Phone on mobile, Web on desktop' },
                  { v: 'phone', n: 'Phone View', hint: 'Mobile bottom dock & app layout' },
                  { v: 'web', n: 'Web View', hint: 'Desktop sidebar & command hub' },
                ].map((m) => {
                  const active = viewMode === m.v;
                  return (
                    <button
                      key={m.v}
                      aria-pressed={active}
                      onClick={() => setViewMode(m.v as 'auto' | 'phone' | 'web')}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        padding: '9px 10px',
                        borderRadius: 10,
                        background: active ? 'var(--acc)' : 'var(--card2)',
                        color: active ? accentInk : 'var(--tx)',
                        fontSize: 12,
                        fontWeight: 700,
                        border: '1px solid var(--line2)',
                        cursor: 'pointer',
                      }}
                    >
                      <span>{m.n}</span>
                      <span style={{
                        fontSize: 9.5,
                        fontWeight: 500,
                        opacity: active ? 0.85 : 0.6,
                      }}>
                        {m.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Density">
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { v: 'comfortable', n: 'Comfortable (Spacious)' },
                  { v: 'compact', n: 'Compact (8% more content)' },
                ].map((d) => (
                  <button
                    key={d.v}
                    aria-pressed={prefs.density === d.v}
                    onClick={() => setPref('density', d.v as Prefs['density'])}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 9,
                      background: prefs.density === d.v ? 'var(--acc)' : 'var(--card2)',
                      color: prefs.density === d.v ? accentInk : 'var(--tx)',
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid var(--line2)',
                    }}
                  >
                    {d.n}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Scale (${Math.round(prefs.fontScale * 100)}%)`}>
              <input
                type="range"
                aria-label="Text scale"
                min={0.875}
                max={1.375}
                step={0.125}
                value={prefs.fontScale}
                onChange={(e) => setPref('fontScale', Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--acc)' }}
              />
            </Field>

            <ToggleRow
              label="High Contrast"
              hint="Increase text and border contrast"
              on={prefs.contrast === 'high'}
              onChange={(v) => setPref('contrast', v ? 'high' : 'normal')}
            />
            <ToggleRow
              label="Reduce Transparency"
              hint="Use solid surfaces in place of frosted glass"
              on={prefs.reduceTransparency}
              onChange={(v) => setPref('reduceTransparency', v)}
            />
          </div>
        );

      case 'audio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Sound Design & Cues</div>
            <ToggleRow
              label="Sound effects"
              hint="Soft confirmation sounds and focus bells"
              on={prefs.soundEnabled ?? true}
              onChange={(v) => setPref('soundEnabled', v)}
            />

            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>Test Sound Effects</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={playTick}
                className="hov k-squish"
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700 }}
              >
                Task complete
              </button>
              <button
                onClick={playCelebration}
                className="hov k-squish"
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700 }}
              >
                Celebration
              </button>
              <button
                onClick={playFocusBell}
                className="hov k-squish"
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700 }}
              >
                Focus bell
              </button>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Saves, Sync & Recovery</div>
            <SaveHealthDetails />
            <Integrations />
            <StudyBackup />
          </div>
        );

      case 'app':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Application Information</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Fox pose="head" size={20} /><span className="sx-word">sorro</span></span>
              <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 600 }}>v{APP_VERSION}</span>
            </div>
            <div style={{ background: 'var(--card2)', padding: 14, borderRadius: 14, border: '1px solid var(--line2)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--tx3)' }}>Version</span>
                <span style={{ fontWeight: 700 }}>v{APP_VERSION}</span>
              </div>
              <p style={{ color: 'var(--tx2)', lineHeight: 1.6, margin: 0 }}>Notes, calendar and tasks with an assistant.</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  // PORTAL TO BODY
  if (typeof document === 'undefined') return null;
  return createPortal(phone ? renderPhone() : renderDesktop(), document.body);
}

/* ----------------------------------------------------------------- subcomponents */

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '-.01em',
  color: 'var(--tx)',
  marginBottom: 10,
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  borderRadius: 9,
  background: 'var(--card2)',
  border: '1px solid var(--line2)',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--tx)',
  outline: 'none',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5, color: 'var(--tx)' }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ToggleRow({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{hint}</div>
      </div>
      <button
        role="switch"
        aria-label={label}
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="tap"
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          padding: 2,
          background: on ? 'var(--acc)' : 'var(--line2)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          transition: 'background .2s ease',
          flex: 'none',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: '#FFFFFF',
            transform: on ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform .2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          }}
        />
      </button>
    </div>
  );
}

function PhoneGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--card2)',
        border: '1px solid var(--line2)',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 14,
        color: 'var(--tx)',
      }}
    >
      {children}
    </div>
  );
}

function PhoneRow({
  icon,
  label,
  sub,
  previewColor,
  onClick,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  previewColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="hov"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--line)',
        textAlign: 'left',
        color: 'var(--tx)',
      }}
    >
      <Icon name={icon} size={17} color="var(--tx2)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{sub}</div>}
      </div>
      {previewColor && (
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: previewColor, marginRight: 4 }} />
      )}
      <Icon name="chev" size={13} color="var(--tx3)" />
    </button>
  );
}

function PhoneToggleRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: IconName;
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <Icon name={icon} size={17} color="var(--tx2)" />
      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{label}</div>
      <button
        role="switch"
        aria-label={label}
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="tap"
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          padding: 2,
          background: on ? 'var(--acc)' : 'var(--line2)',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          transition: 'background .2s ease',
          flex: 'none',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: '#FFFFFF',
            transform: on ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform .2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          }}
        />
      </button>
    </div>
  );
}
