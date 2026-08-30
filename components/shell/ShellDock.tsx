'use client';

import { Icon, type IconName } from '../Icon';

/**
 * The L5 navigation: a floating dock, identical on both breakpoints.
 *
 * It floats rather than reserving a strip, so the single centred column keeps
 * its full height at every size. Callers pad the bottom of the scroll area to
 * clear it — the dock cannot do that itself without knowing what is behind it.
 */

export type DockItem = { id: string; name: string; ic: IconName; hue: string; badge?: string };

export function ShellDock({
  items, active, go, onMore,
}: {
  items: DockItem[];
  active: string;
  go: (id: string) => void;
  onMore: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 22,
      display: 'flex', gap: 4, padding: 6, borderRadius: 999,
      background: 'color-mix(in srgb, var(--card2) 92%, transparent)',
      border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      maxWidth: 'calc(100% - 24px)', overflowX: 'auto',
    }}>
      {items.map((s) => {
        const on = s.id === active;
        return (
          <button key={s.id} onClick={() => go(s.id)} title={s.name} aria-label={s.name}
            aria-current={on ? 'page' : undefined}
            className={on ? 'k-squish' : 'hov k-squish'} style={{
              width: 38, height: 38, flex: 'none', borderRadius: 999,
              display: 'grid', placeItems: 'center', position: 'relative',
              background: on ? s.hue : 'transparent',
            }}>
            <Icon name={s.ic} size={18} color={on ? 'var(--ink)' : 'var(--tx2)'} />
            {s.badge && !on && (
              <span aria-hidden style={{
                position: 'absolute', top: 5, right: 5, width: 6, height: 6,
                borderRadius: '50%', background: s.hue,
              }} />
            )}
          </button>
        );
      })}
      <button onClick={onMore} title="More" aria-label="More" className="hov k-squish" style={{
        width: 38, height: 38, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center',
      }}>
        <Icon name="more" size={18} color="var(--tx2)" />
      </button>
    </div>
  );
}
