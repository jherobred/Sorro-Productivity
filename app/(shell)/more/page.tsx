'use client';

import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { lg } from '@/lib/glass';
import { SECHUE, PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';

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

export default function MorePage() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const dark = prefs.theme === 'dark';

  return (
    <div style={{ padding: '14px 14px 26px' }}>
      <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.03em' }}>More</div>
      <div style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '3px 0 15px' }}>
        Everything that isn’t on the tab bar
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {ITEMS.map((m, i) => {
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
        <Row label={dark ? 'Light mode' : 'Dark mode'} ic="moon" onClick={() => void 0} />
        <Row label="Customise nav" ic="grid" onClick={() => void 0} />
      </div>
    </div>
  );
}

function Row({ label, ic, onClick }: { label: string; ic: IconName; onClick: () => void }) {
  const { prefs, update } = usePrefs();
  return (
    <button onClick={() => {
      if (ic === 'moon') update({ theme: prefs.theme === 'dark' ? 'light' : 'dark' });
      else onClick();
    }} className="row"
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 12,
        background: 'var(--card)', border: '1px solid var(--line)', minHeight: 48, textAlign: 'left',
      }}>
      <Icon name={ic} size={15} color={PAL.indigo} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <Icon name="chev" size={13} color="var(--tx3)" />
    </button>
  );
}
