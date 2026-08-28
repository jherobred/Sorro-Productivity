'use client';

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { usePrefs, type Prefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { useOverlayBack } from '@/lib/nav';
import { supabase, currentUserId } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { ON_ACCENT } from '@/lib/glass';
import { ANIMALS, animalOf, type Animal, type Mood, type Accessory } from '@/lib/mascot';
import { Mascot } from './challenges/Mascot';
import { Face } from './AccountSheet';
import { useAccounts, switchTo, addAccount, forget, signOutAll } from '@/lib/accounts';
import { useWorkspaces, useWorkspaceActions, type Workspace } from '@/lib/workspaces';
import { SpaceSheet } from './SpaceSheet';
import { Integrations } from './Integrations';
import { useAppUpdate, useFullscreen, APP_VERSION, UPDATE_URL } from '@/lib/appUpdate';
import { playClick, playTick, playCelebration, playFocusBell } from '@/lib/audio';
import { useProfiles } from '@/lib/people';
import { BasedlyLogo, BirdMascot } from './BasedlyLogo';


/**
 * Unified Settings & Profile Center.
 *
 * Centralizes profile details, mascot customization, avatar building,
 * theme preferences, audio controls, account management, and integrations.
 *
 * Desktop View: Claude Code dual-pane settings with sidebar navigation,
 *   search filter, structured profile fields, and visual previews.
 *
 * Phone View: Claude Code mobile settings with grouped inset lists,
 *   account header card, inline toggles, and seamless subpage drill-downs.
 */

export type SettingsTab =
  | 'general'
  | 'account'
  | 'appearance'
  | 'mascot'
  | 'avatar'
  | 'audio'
  | 'integrations'
  | 'app';

const ACCENTS = ['#7C6CFF', '#38D6F2', '#34D9A0', '#FFC24B', '#FF6B6B', '#FF6FA8', '#B07CFF', '#A3E635'];

const AV_ORDER = ['bg', 'skin', 'face', 'hair', 'eyes', 'glasses', 'hat'] as const;
type AvKey = (typeof AV_ORDER)[number];

const AV: Record<AvKey, { id: string; v: string }[]> = {
  bg: [
    { id: 'violet', v: '#7C6CFF,#38D6F2' },
    { id: 'sunset', v: '#FF6B6B,#FFC24B' },
    { id: 'mint', v: '#34D9A0,#38BDF8' },
    { id: 'rose', v: '#FF6FA8,#B07CFF' },
    { id: 'slate', v: '#3A3550,#211F2C' },
    { id: 'cyber', v: '#0F2027,#2C5364' },
    { id: 'neon', v: '#F72585,#7209B7' },
    { id: 'aurora', v: '#0575E6,#00F260' },
  ],
  skin: [
    { id: 'porcelain', v: '#F3D7C2' },
    { id: 'sand', v: '#E7BE9A' },
    { id: 'tan', v: '#C98F63' },
    { id: 'bronze', v: '#A56A3E' },
    { id: 'deep', v: '#6E4326' },
  ],
  face: [
    { id: 'oval', v: 'M50 22c16 0 25 12 25 28s-11 30-25 30-25-14-25-30 9-28 25-28z' },
    { id: 'round', v: 'M50 22c17 0 27 13 27 29S67 80 50 80 23 67 23 51s10-29 27-29z' },
    { id: 'square', v: 'M27 26h46v30c0 14-10 24-23 24S27 70 27 56z' },
  ],
  hair: [
    { id: 'short', v: 'M24 44c0-16 11-26 26-26s26 10 26 26c0-8-9-13-26-13s-26 5-26 13z' },
    { id: 'wave', v: 'M23 46c2-18 12-28 27-28s25 10 27 28c-4-10-12-14-27-14s-23 4-27 14z' },
    { id: 'bun', v: 'M24 44c0-16 11-26 26-26s26 10 26 26c0-8-9-13-26-13s-26 5-26 13zM50 8a7 7 0 1 1 0 14 7 7 0 0 1 0-14z' },
    { id: 'spikes', v: 'M22 42 L26 22 L34 30 L42 16 L50 28 L58 16 L66 30 L74 22 L78 42 C78 30 65 24 50 24 C35 24 22 30 22 42 Z' },
    { id: 'fade', v: 'M26 38 C26 22 36 18 50 18 C64 18 74 22 74 38 C74 30 65 25 50 25 C35 25 26 30 26 38 Z' },
    { id: 'curtain', v: 'M22 46 C24 22 36 20 50 26 C64 20 76 22 78 46 C76 34 68 28 50 32 C32 28 24 34 22 46 Z' },
    { id: 'bald', v: '' },
  ],
  eyes: [
    { id: 'classic', v: 'M40 50a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm26 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
    { id: 'spark', v: 'M37 48l1.5 3.5 3.5 1.5-3.5 1.5L37 58l-1.5-3.5L32 53l3.5-1.5zM63 48l1.5 3.5 3.5 1.5-3.5 1.5L63 58l-1.5-3.5L58 53l3.5-1.5z' },
    { id: 'keen', v: 'M34 50h6M60 50h6' },
  ],
  glasses: [
    { id: 'none', v: '' },
    { id: 'round', v: 'M30 46a8 8 0 1 0 16 0 8 8 0 1 0-16 0zm24 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0zM46 46h8' },
    { id: 'square', v: 'M30 42h16v12H30zM54 42h16v12H54zM46 47h8' },
    { id: 'aviator', v: 'M28 42h18v10q-4 6-9 6q-5 0-9-6z M54 42h18v10q-4 6-9 6q-5 0-9-6z M46 44h8 M44 48h12' },
  ],
  hat: [
    { id: 'none', v: '' },
    { id: 'cap', v: 'M26 30c0-10 11-16 24-16s24 6 24 16H26zM46 30h32' },
    { id: 'beanie', v: 'M28 32c0-12 10-18 22-18s22 6 22 18H28zM46 14a4 4 0 1 1 8 0 4 4 0 0 1-8 0z' },
    { id: 'headphones', v: 'M22 38 A28 28 0 0 1 78 38 M20 34 h6 v14 h-6 z M74 34 h6 v14 h-6 z' },
  ],
};

const ROLES = ['Student', 'Software Engineer', 'Researcher', 'Product Designer', 'Founder / Creator', 'Other'];

export function SettingsModal({
  initialTab = 'general',
  onClose,
}: {
  initialTab?: SettingsTab;
  onClose: () => void;
}) {
  const { phone } = useLayout();
  const { prefs, update } = usePrefs();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [search, setSearch] = useState('');
  const [phoneSubPage, setPhoneSubPage] = useState<SettingsTab | null>(null);

  // Profile data states
  const [userId, setUserId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState('Student');
  const [instructions, setInstructions] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<Animal>('fox');
  const [avatarPieces, setAvatarPieces] = useState<Record<string, string>>({
    bg: 'violet', skin: 'porcelain', face: 'oval', hair: 'short', eyes: 'classic', glasses: 'none', hat: 'none',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Accounts & Workspaces
  const accounts = useAccounts();
  const { data: workspaces = [] } = useWorkspaces();
  const WA = useWorkspaceActions();
  const [managingSpace, setManagingSpace] = useState<Workspace | null>(null);

  useOverlayBack(true, () => {
    if (phoneSubPage) setPhoneSubPage(null);
    else onClose();
  });

  // Load user profile
  useEffect(() => {
    (async () => {
      try {
        const uid = await currentUserId();
        if (!uid) return;
        setUserId(uid);
        const { data } = await supabase.from('bd_profiles').select('*').eq('user_id', uid).maybeSingle();
        if (data) {
          setFullName(data.name || '');
          setHandle(data.handle || '');
          setPhotoUrl(data.photo_url || null);
          if (data.animal && ANIMALS.includes(data.animal as Animal)) {
            setSelectedAnimal(data.animal as Animal);
          } else {
            setSelectedAnimal(animalOf(uid));
          }
          if (data.avatar_pieces && typeof data.avatar_pieces === 'object') {
            setAvatarPieces((prev) => ({ ...prev, ...data.avatar_pieces }));
          }
        }
      } catch {}
    })();
  }, []);

  const saveProfileField = async (field: string, value: unknown) => {
    if (!userId) return;
    try {
      setSavingProfile(true);
      // Postgrest resolves with `{ error }` rather than throwing, so without
      // this a row RLS refused still reported "Profile updated".
      const { error } = await supabase.from('bd_profiles').update({ [field]: value }).eq('user_id', userId);
      toast(error ? `Failed to save profile — ${error.message}` : 'Profile updated');
    } catch {
      toast('Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    playTick();
    void update({ [k]: v } as Partial<Prefs>);
  };

  const navItems: { id: SettingsTab; label: string; icon: IconName; group: string }[] = [
    { id: 'general', label: 'General', icon: 'cog', group: 'Settings' },
    { id: 'account', label: 'Account', icon: 'people', group: 'Settings' },
    { id: 'appearance', label: 'Appearance', icon: 'moon', group: 'Settings' },
    { id: 'mascot', label: 'Mascot & Pet', icon: 'spark', group: 'Settings' },
    { id: 'avatar', label: 'Avatar Builder', icon: 'focus', group: 'Customize' },
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
              placeholder="Search"
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
            {phoneSubPage ? (phoneSubPage === 'general' ? 'Profile' : phoneSubPage) : ''}
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
                    {fullName || 'Basedly User'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{handle || 'student'}
                  </div>
                </div>
                <div style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--acc)', color: '#0C0F16', fontSize: 10, fontWeight: 800 }}>
                  PRO
                </div>
              </div>

              {/* Group 1: Profile & Identity */}
              <PhoneGroup>
                <PhoneRow
                  icon="people"
                  label="Profile & Bio"
                  sub={fullName || 'Edit details'}
                  onClick={() => setPhoneSubPage('general')}
                />
                <PhoneRow
                  icon="spark"
                  label="Mascot & Pet"
                  sub={selectedAnimal}
                  onClick={() => setPhoneSubPage('mascot')}
                />
                <PhoneRow
                  icon="focus"
                  label="Vector Avatar"
                  sub="Customize facial features"
                  onClick={() => setPhoneSubPage('avatar')}
                />
                <PhoneRow
                  icon="files"
                  label="Workspaces"
                  sub={`${workspaces.length} active`}
                  onClick={() => setPhoneSubPage('account')}
                />
              </PhoneGroup>

              {/* Group 2: Appearance & Style */}
              <PhoneGroup>
                <PhoneRow
                  icon="moon"
                  label="Color Mode"
                  sub={prefs.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
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
                  icon="habit"
                  label="Mascot Display"
                  sub={prefs.mascotVariant === 'full' ? 'Full Body' : 'Classic Head'}
                  onClick={() => setPhoneSubPage('mascot')}
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
            {/* Profile Block */}
            <div>
              <div style={SECTION_TITLE}>Profile</div>

              {/* Avatar Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '14px 0 18px' }}>
                <Face name={fullName} photo={photoUrl} size={54} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setTab('avatar')}
                    className="hov k-squish"
                    style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}
                  >
                    Edit Vector Avatar
                  </button>
                  <button
                    onClick={() => setTab('mascot')}
                    className="hov k-squish"
                    style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}
                  >
                    Choose Mascot
                  </button>
                </div>
              </div>

              {/* Full Name Input */}
              <Field label="Full name">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => saveProfileField('name', fullName)}
                  placeholder="Your Name"
                  style={INPUT_STYLE}
                />
              </Field>

              {/* Handle Input */}
              <Field label="What should Basedly call you?">
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onBlur={() => saveProfileField('handle', handle)}
                  placeholder="handle or nickname"
                  style={INPUT_STYLE}
                />
              </Field>

              {/* Role Dropdown */}
              <Field label="What best describes your work?">
                <select
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    saveProfileField('role', e.target.value);
                  }}
                  style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Custom Bio / Instructions */}
              <Field label="Instructions for Basedly / Bio" hint="Goals or study preferences Basedly remembers across all views.">
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  onBlur={() => saveProfileField('bio', instructions)}
                  placeholder="e.g., Focus on CS courses, keep notifications minimal during exams..."
                  rows={3}
                  style={{ ...INPUT_STYLE, height: 'auto', resize: 'vertical' }}
                />
              </Field>
            </div>

            {/* Preferences Block */}
            <div style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <div style={SECTION_TITLE}>Quick Preferences</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Appearance</div>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--card2)', padding: 3, borderRadius: 8, border: '1px solid var(--line2)' }}>
                    <ThemeBtn
                      active={prefs.theme === 'light'}
                      icon="spark"
                      label="Light"
                      onClick={() => setPref('theme', 'light')}
                    />
                    <ThemeBtn
                      active={prefs.theme === 'dark'}
                      icon="moon"
                      label="Dark"
                      onClick={() => setPref('theme', 'dark')}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Accent Color</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {ACCENTS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setPref('accent', c)}
                        className={`k-swatch${prefs.accent === c ? ' on' : ''}`}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: c,
                          border: prefs.accent === c ? '2px solid #FFFFFF' : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <ToggleRow
                  label="Audio Soundscapes & Feedback"
                  hint="Procedural clicks, bells, and ambient lo-fi sounds"
                  on={prefs.soundEnabled ?? true}
                  onChange={(v) => setPref('soundEnabled', v)}
                />

                <ToggleRow
                  label="UI Motion & Springs"
                  hint="Card bounces and background kinetics"
                  on={prefs.motion}
                  onChange={(v) => setPref('motion', v)}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line2)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Feature Onboarding Tours</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)' }}>Re-enable interactive spotlight walkthroughs across all tabs</div>
                  </div>
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('basedly-seen-onboardings-v1');
                      }
                      toast('Feature tours reset! Visit any tab to play its interactive walkthrough.');
                      onClose();
                    }}
                    className="hov k-squish"
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line2)',
                      background: 'var(--card2)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'var(--tx)',
                      cursor: 'pointer',
                    }}
                  >
                    Reset & Replay Tours
                  </button>
                </div>
              </div>
            </div>
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

            <div style={{ ...SECTION_TITLE, marginTop: 14 }}>Workspaces & Spaces</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {workspaces.map((w) => (
                <div
                  key={w.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'var(--card2)',
                    border: '1px solid var(--line2)',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: w.color || 'var(--acc)' }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{w.name}</span>
                  {w.id === prefs.workspace && (
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accTx)' }}>CURRENT</span>
                  )}
                </div>
              ))}
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
                  { v: 'dark', n: 'Dark Mode', ic: 'moon' },
                  { v: 'light', n: 'Light Mode', ic: 'spark' },
                ].map((t) => (
                  <button
                    key={t.v}
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
                      color: prefs.theme === t.v ? '#0C0F16' : 'var(--tx)',
                      fontSize: 13,
                      fontWeight: 700,
                      border: '1px solid var(--line2)',
                    }}
                  >
                    <Icon name={t.ic as IconName} size={15} color={prefs.theme === t.v ? '#0C0F16' : 'var(--tx)'} />
                    {t.n}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Accent Palette">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPref('accent', c)}
                    className={`k-swatch${prefs.accent === c ? ' on' : ''}`}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: c,
                      boxShadow: prefs.accent === c ? `0 0 0 2px var(--card), 0 0 0 4px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
            </Field>

            <div style={{ ...SECTION_TITLE, marginTop: 10 }}>Layout & Accessibility</div>
            <Field label="Density">
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { v: 'comfortable', n: 'Comfortable (Spacious)' },
                  { v: 'compact', n: 'Compact (8% more content)' },
                ].map((d) => (
                  <button
                    key={d.v}
                    onClick={() => setPref('density', d.v as Prefs['density'])}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 9,
                      background: prefs.density === d.v ? 'var(--acc)' : 'var(--card2)',
                      color: prefs.density === d.v ? '#0C0F16' : 'var(--tx)',
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
              hint="Lifts text and border contrast for WCAG AAA accessibility"
              on={prefs.contrast === 'high'}
              onChange={(v) => setPref('contrast', v ? 'high' : 'normal')}
            />
            <ToggleRow
              label="Reduce Transparency"
              hint="Turns frosted glass into solid dark surfaces"
              on={prefs.reduceTransparency}
              onChange={(v) => setPref('reduceTransparency', v)}
            />
          </div>
        );

      case 'mascot':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Mascot Species (14 Options)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 10 }}>
              {ANIMALS.map((a) => {
                const active = selectedAnimal === a;
                return (
                  <button
                    key={a}
                    onClick={() => {
                      playClick();
                      setSelectedAnimal(a);
                      saveProfileField('animal', a);
                    }}
                    className="k-chip"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 8px',
                      borderRadius: 14,
                      background: active ? 'color-mix(in srgb, var(--acc) 18%, var(--card2))' : 'var(--card2)',
                      border: active ? '2px solid var(--acc)' : '1px solid var(--line2)',
                    }}
                  >
                    <Mascot id="preview" animal={a} size={38} mood="blazing" />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', color: active ? 'var(--accTx)' : 'var(--tx)' }}>
                      {a}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ ...SECTION_TITLE, marginTop: 12 }}>Display Style</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { v: 'head', n: 'Classic Head', hint: 'Compact 48px avatar' },
                { v: 'full', n: 'Full Body', hint: 'Expressive pose with gear' },
              ].map((m) => (
                <button
                  key={m.v}
                  onClick={() => setPref('mascotVariant', m.v as Prefs['mascotVariant'])}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    padding: '12px',
                    borderRadius: 12,
                    background: prefs.mascotVariant === m.v ? 'var(--acc)' : 'var(--card2)',
                    color: prefs.mascotVariant === m.v ? '#0C0F16' : 'var(--tx)',
                    border: '1px solid var(--line2)',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{m.n}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{m.hint}</span>
                </button>
              ))}
            </div>

            {/* Live Preview */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: 16,
                borderRadius: 16,
                background: 'var(--card2)',
                border: '1px solid var(--line2)',
                marginTop: 6,
              }}
            >
              <Mascot id="preview" animal={selectedAnimal} size={64} variant={prefs.mascotVariant} mood="celebrating" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'capitalize' }}>{selectedAnimal} Buddy</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>Ready for study sprint & quests</div>
              </div>
            </div>
          </div>
        );

      case 'avatar':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Vector Avatar Builder</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: `linear-gradient(135deg, ${AV.bg.find((b) => b.id === avatarPieces.bg)?.v || '#7C6CFF,#38D6F2'})`,
                  boxShadow: 'var(--sh)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <svg viewBox="0 0 100 100" width={90} height={90}>
                  {/* Face */}
                  <path d={AV.face.find((f) => f.id === avatarPieces.face)?.v || AV.face[0].v} fill={AV.skin.find((s) => s.id === avatarPieces.skin)?.v || AV.skin[0].v} />
                  {/* Hair */}
                  {avatarPieces.hair !== 'bald' && (
                    <path d={AV.hair.find((h) => h.id === avatarPieces.hair)?.v} fill="#242132" />
                  )}
                  {/* Eyes */}
                  <path d={AV.eyes.find((e) => e.id === avatarPieces.eyes)?.v} fill="#1C1A24" />
                  {/* Glasses */}
                  {avatarPieces.glasses !== 'none' && (
                    <path d={AV.glasses.find((g) => g.id === avatarPieces.glasses)?.v} stroke="#1C1A24" strokeWidth="2.5" fill="none" />
                  )}
                </svg>
              </div>
            </div>

            {AV_ORDER.map((layer) => (
              <div key={layer}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', marginBottom: 6 }}>{layer}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {AV[layer]?.map((opt) => {
                    const active = avatarPieces[layer] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          playClick();
                          const updated = { ...avatarPieces, [layer]: opt.id };
                          setAvatarPieces(updated);
                          saveProfileField('avatar_pieces', updated);
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          background: active ? 'var(--acc)' : 'var(--card2)',
                          color: active ? '#0C0F16' : 'var(--tx2)',
                          border: '1px solid var(--line2)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {opt.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );

      case 'audio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Sound Design & Cues</div>
            <ToggleRow
              label="Enable Procedural Web Audio"
              hint="Zero-download sound synthesis for checkmarks, level ups, and study bells"
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
                🎵 Tactile Pop
              </button>
              <button
                onClick={playCelebration}
                className="hov k-squish"
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700 }}
              >
                🎉 Quest Fanfare
              </button>
              <button
                onClick={playFocusBell}
                className="hov k-squish"
                style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--card2)', border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700 }}
              >
                🔔 Focus Bell
              </button>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Integrations & Sync</div>
            <Integrations />
          </div>
        );

      case 'app':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={SECTION_TITLE}>Application Information</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)' }}>
              <BasedlyLogo size={24} />
              <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 600 }}>v{APP_VERSION}</span>
            </div>
            <div style={{ background: 'var(--card2)', padding: 14, borderRadius: 14, border: '1px solid var(--line2)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--tx3)' }}>Version</span>
                <span style={{ fontWeight: 700 }}>v{APP_VERSION}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--tx3)' }}>Framework</span>
                <span style={{ fontWeight: 700 }}>Next.js Static + Capacitor</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tx3)' }}>Offline Storage</span>
                <span style={{ fontWeight: 700, color: PAL.mint }}>Synced</span>
              </div>
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

function ThemeBtn({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 6,
        background: active ? 'var(--acc)' : 'transparent',
        color: active ? '#0C0F16' : 'var(--tx2)',
        fontSize: 11.5,
        fontWeight: 700,
        border: 'none',
      }}
    >
      <Icon name={icon} size={13} color={active ? '#0C0F16' : 'var(--tx2)'} />
      {label}
    </button>
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
