'use client';

import { Icon, type IconName } from './Icon';
import { usePrefs } from '@/lib/prefs';

/**
 * The app's tab strip, in one place.
 *
 * Every screen used to grow its own, and each one slid a single accent pill
 * behind the labels, positioned as `index * 100%` of an equal share of the
 * width. That is only ever aligned when every tab is exactly the same width —
 * true on a phone, false everywhere else, which is why the pill sat under
 * "Notebooks" while "Java" was the one lit up. Chasing it with a measured
 * `getBoundingClientRect` would work and would also mean a resize observer, a
 * layout read per render, and a pill that lags a font-scale change.
 *
 * The alignment problem disappears if there is nothing to align: the active tab
 * carries its own background. It cannot drift from its own label, it survives
 * any font size, any label length and any zoom, and the whole thing is one
 * `background-color` transition.
 */

export type TabDef<T extends string> = { id: T; label: string; icon?: IconName; count?: number };

export function TabRail<T extends string>({
  tabs, value, onChange, phone = false, label = 'Sections', grow,
}: {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  phone?: boolean;
  label?: string;
  /** Share the width equally. Defaults to true on a phone, false otherwise. */
  grow?: boolean;
}) {
  const { prefs } = usePrefs();
  const spread = grow ?? phone;

  return (
    <div className="hbar" role="tablist" aria-label={label} style={{
      display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--card)',
      overflowX: 'auto', flex: spread ? '1 1 auto' : '0 0 auto', maxWidth: '100%',
    }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className={on ? undefined : 'hov'} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              flex: spread ? '1 1 auto' : '0 0 auto', minWidth: 0, minHeight: 32,
              padding: phone ? '7px 10px' : '6px 14px', borderRadius: 9,
              fontSize: phone ? 11 : 12, fontWeight: 700, whiteSpace: 'nowrap',
              background: on ? prefs.accent : 'transparent',
              color: on ? '#0C0F16' : 'var(--tx2)',
              transition: 'background-color .2s, color .2s',
            }}>
            {/* Icons are a desktop nicety. On a 375px phone five of them is five
                guesses, so the label is what survives. */}
            {t.icon && !phone && <Icon name={t.icon} size={13} color={on ? '#0C0F16' : 'var(--tx3)'} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
            {t.count !== undefined && (
              <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
