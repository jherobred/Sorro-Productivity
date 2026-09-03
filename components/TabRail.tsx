'use client';

import { useId } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from './Icon';
import { usePrefs } from '@/lib/prefs';

/**
 * The app's tab strip, in one place.
 *
 * Every screen used to grow its own, and each one slid a single accent pill
 * behind the labels, positioned as `index * 100%` of an equal share of the
 * width. That is only ever aligned when every tab is exactly the same width —
 * true on a phone, false everywhere else, which is why the pill sat under
 * "Notebooks" while "Java" was the one lit up.
 *
 * The alignment problem disappears if there is nothing to align: the active
 * tab carries its own background. Motion's `layoutId` then does the cinematic
 * part for free — when the selection moves, the pill is measured at both ends
 * and springs across, so it cannot drift from its own label no matter what
 * font size, label length or zoom is in play, and there is no resize observer
 * of ours anywhere near it.
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
  const rid = useId();
  const motionOn = prefs.motion !== false;
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
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              flex: spread ? '1 1 auto' : '0 0 auto', minWidth: 0, minHeight: 32,
              padding: phone ? '7px 10px' : '6px 14px', borderRadius: 9,
              fontSize: phone ? 11 : 12, fontWeight: 700, whiteSpace: 'nowrap',
              background: 'transparent',
              color: on ? 'var(--accInk)' : 'var(--tx2)',
            }}>
            {on && (
              <motion.span aria-hidden layoutId={`tabpill-${rid}`}
                style={{ position: 'absolute', inset: 0, borderRadius: 9, background: prefs.accent }}
                transition={motionOn ? { type: 'spring', stiffness: 520, damping: 42 } : { duration: 0 }} />
            )}
            <span style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, minWidth: 0, overflow: 'hidden',
            }}>
              {/* Icons are a desktop nicety. On a 375px phone five of them is five
                  guesses, so the label is what survives. */}
              {t.icon && !phone && <Icon name={t.icon} size={13} color={on ? 'var(--accInk)' : 'var(--tx3)'} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
              {t.count !== undefined && (
                <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.72 }}>{t.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
