'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { lg } from '@/lib/glass';
import { SECHUE, PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { useOverlayBack } from '@/lib/nav';
import { MAX_NAV_SLOTS } from '@/components/Shell';
import { Face } from '@/components/AccountSheet';
import { SettingsModal, type SettingsTab } from '@/components/SettingsModal';
import { useMyIdentity } from '@/lib/people';
import { toast } from '@/lib/toast';

/**
 * Ported from Basedly.dc.html markup 639–661 — a 2-up grid of photo tiles,
 * each a gradient plate under a grain wash, a hue tint and a glass strip.
 */

const ITEMS: { id: string; n: string; meta: string; ic: IconName }[] = [
  { id: 'projects', n: 'Projects', meta: 'Boards and milestones', ic: 'proj' },
  { id: 'habits', n: 'Habits', meta: 'Streaks and heatmaps', ic: 'habit' },
  { id: 'body', n: 'Body', meta: 'Health, food and gym', ic: 'heart' },
  { id: 'money', n: 'Money', meta: 'Budgets and spend', ic: 'money' },
  { id: 'community', n: 'Community', meta: 'Feed, threads, challenges', ic: 'chat' },
  { id: 'files', n: 'Files', meta: 'Basedly Drive', ic: 'files' },
  { id: 'people', n: 'People', meta: 'Contacts and notes', ic: 'people' },
  { id: 'profile', n: 'Profile', meta: 'Your avatar and identity', ic: 'focus' },
];

/** Everything but Profile, which now has the card at the top of this page. */
const TILES = ITEMS.filter((m) => m.id !== 'profile');

export default function MorePage() {
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const [navOpen, setNavOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const [settings, setSettings] = useState(false);
  const me = useMyIdentity();
  const dark = prefs.theme === 'dark';

  return (
    <div style={{ padding: '14px 14px 26px' }}>
      <div className="bd-title" style={{ fontSize: 26, fontWeight: 700 }}>More</div>
      <div style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '3px 0 15px' }}>
        Everything that isn’t on the tab bar
      </div>

      {/* You, first. Switching account used to live only in the desktop
          sidebar, which a phone does not have — so on this layout there was no
          way to switch, add or sign out at all. Same sheet as the face in the
          top right; two doors to one room, because this is the page people
          actually look in. */}
      <button onClick={() => setSettings(true)} className="row k-squish"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 13px',
          borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line)',
          minHeight: 62, textAlign: 'left', marginBottom: 14,
        }}>
        <Face name={me.name} photo={me.photo} size={40} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {me.name || 'Your account'}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 1 }}>
            {me.handle ? `@${me.handle} · profile, accounts, sign out` : 'Profile, accounts, sign out'}
          </span>
        </span>
        <Icon name="chev" size={14} color="var(--tx3)" />
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {TILES.map((m, i) => {
          const hue = SECHUE[m.id] ?? prefs.accent;
          return (
            <button key={m.id} onClick={() => router.push(`/${m.id}/`)} className="rise"
              style={{
                position: 'relative', height: 116, borderRadius: 16, overflow: 'hidden',
                border: '1px solid var(--line)', boxShadow: 'var(--sh)', textAlign: 'left',
                animationDelay: `${Math.min(i, 8) * 0.03}s`,
              }}>
              {/* plate */}
              <span style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(150deg, color-mix(in srgb, ${hue} 62%, #12111A) 0%, #12111A 78%)`,
              }} />
              {/* grain */}
              <span aria-hidden style={{
                position: 'absolute', inset: 0, opacity: 0.5, mixBlendMode: 'overlay',
                background: 'radial-gradient(circle at 20% 25%, rgba(255,255,255,.22), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.12), transparent 40%)',
              }} />
              {/* hue tint */}
              <span aria-hidden style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(to top, rgba(6,6,12,.72) 0%, transparent 62%), color-mix(in srgb, ${hue} 12%, transparent)`,
              }} />

              {/* glass strip */}
              <span style={{
                ...lg({ tint: hue, strength: 0.9, dark }),
                position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px',
              }}>
                <Icon name={m.ic} size={16} color="#fff" />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-.015em', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.n}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,.62)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.meta}
                  </span>
                </span>
                <Icon name="chev" size={13} color="rgba(255,255,255,.7)" />
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>Settings</div>
        <Row label={dark ? 'Light mode' : 'Dark mode'} ic="moon"
          onClick={() => void update({ theme: dark ? 'light' : 'dark' })} />
        <Row label="Always fullscreen" ic="expand" meta={prefs.alwaysFullscreen ? 'On' : 'Off'}
          onClick={() => {
            const next = !prefs.alwaysFullscreen;
            void update({ alwaysFullscreen: next });
            // This tap *is* a user gesture, which is the only moment a browser
            // will grant fullscreen — so turning it on takes effect now rather
            // than waiting for the next launch.
            if (next && document.documentElement.requestFullscreen && !document.fullscreenElement) {
              void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
            } else if (!next && document.fullscreenElement) {
              void document.exitFullscreen().catch(() => {});
            }
            toast(next ? 'Fullscreen on every launch' : 'Fullscreen off');
          }} />
        <Row label="Customise nav" ic="grid" meta={`${prefs.navPicks.filter((x) => x !== 'more').length} of ${MAX_PICKS}`}
          onClick={() => setNavOpen(true)} />
        <Row label="All settings" ic="cog" onClick={() => setSettings(true)} />
      </div>

      {navOpen && <NavPicker onClose={() => setNavOpen(false)} />}
      {settings && <SettingsModal initialTab="general" onClose={() => setSettings(false)} />}
    </div>
  );
}

function Row({ label, ic, meta, onClick }: { label: string; ic: IconName; meta?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="row k-squish"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--line)', minHeight: 48, textAlign: 'left',
      }}>
      <Icon name={ic} size={15} color={PAL.indigo} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      {meta && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{meta}</span>}
      <Icon name="chev" size={13} color="var(--tx3)" />
    </button>
  );
}

/** More always takes the last of the seven slots, so six are user-choosable. */
const MAX_PICKS = MAX_NAV_SLOTS - 1;

/** Every section that can hold a slot on the phone tab bar. */
const NAV_CHOICES: { id: string; n: string; meta: string; ic: IconName }[] = [
  { id: 'home', n: 'Home', meta: 'Your day at a glance', ic: 'home' },
  { id: 'calendar', n: 'Calendar', meta: 'Week, month and day', ic: 'cal' },
  { id: 'tasks', n: 'Tasks', meta: 'Everything due', ic: 'task' },
  { id: 'notebooks', n: 'Notebooks', meta: 'Notes, journal, canvas, Java', ic: 'book' },
  ...ITEMS,
];

/**
 * Pick which four sections sit on the tab bar. `More` always keeps the fifth
 * slot and cannot be removed — without it, anything left off the bar would be
 * unreachable on a phone.
 */
function NavPicker({ onClose }: { onClose: () => void }) {
  const { prefs, update } = usePrefs();
  useOverlayBack(true, onClose);

  const chosen = prefs.navPicks.filter((id) => id !== 'more');

  const toggle = (id: string) => {
    const next = chosen.includes(id)
      ? chosen.filter((x) => x !== id)
      : chosen.length >= MAX_PICKS ? chosen : [...chosen, id];
    if (next.length === 0) { toast('Keep at least one section on the bar'); return; }
    if (next === chosen) { toast(`${MAX_PICKS} slots is the limit — drop one first`); return; }
    void update({ navPicks: [...next, 'more'] });
  };

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Customise nav" className="sheet"
        style={{
          width: '100%', maxWidth: 460, maxHeight: '82dvh', overflowY: 'auto',
          background: 'var(--card)', borderRadius: '16px 16px 0 0', border: '1px solid var(--line2)',
          padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Customise nav</h2>
        <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6, margin: '5px 0 15px' }}>
          Choose up to {MAX_PICKS} sections for the tab bar — they compress as you add more,
          but every one stays a full-height tap target. More always keeps the last slot,
          so nothing you leave off becomes unreachable.
        </p>

        <div className="k-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {NAV_CHOICES.map((m, i) => {
            const on = chosen.includes(m.id);
            return (
              <button key={m.id} onClick={() => toggle(m.id)} role="checkbox" aria-checked={on} className="row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12,
                  minHeight: 52, textAlign: 'left', '--i': i,
                  border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
                  background: on ? 'color-mix(in srgb, var(--acc) 10%, transparent)' : 'transparent',
                  opacity: !on && chosen.length >= MAX_PICKS ? 0.45 : 1,
                } as React.CSSProperties}>
                <Icon name={m.ic} size={16} color={on ? 'var(--accTx)' : 'var(--tx3)'} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{m.n}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 1 }}>{m.meta}</span>
                </span>
                <span aria-hidden style={{
                  width: 18, height: 18, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center',
                  border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                  background: on ? 'var(--acc)' : 'transparent',
                }}>
                  {on && <Icon name="check" size={11} color="var(--ink)" />}
                </span>
              </button>
            );
          })}
        </div>

        <button onClick={onClose} className="k-squish"
          style={{ width: '100%', minHeight: 46, marginTop: 16, borderRadius: 12, background: 'var(--acc)', color: 'var(--ink)', fontSize: 13, fontWeight: 800 }}>
          Done
        </button>
      </div>
    </div>
  );
}
