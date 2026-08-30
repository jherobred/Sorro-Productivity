'use client';

import { Icon, type IconName } from '../Icon';

/**
 * L4's navigation.
 *
 * The day column takes the left 320px and nothing gives it back, so there is no
 * sidebar to put the sections in. They run along the top of the right pane
 * instead — the whole list, scrolling horizontally, rather than a truncated few
 * with the rest behind a More. A layout that hides half its sections to make
 * room for a calendar has not earned the calendar.
 */

export type ChipSection = { id: string; name: string; ic: IconName; hue: string; badge?: string };

export function SectionChips({
  sections, active, go, onMore,
}: {
  sections: ChipSection[];
  active: string;
  go: (id: string) => void;
  onMore?: () => void;
}) {
  return (
    <div className="hbar" role="tablist" aria-label="Sections" style={{
      flex: 'none', display: 'flex', alignItems: 'center', gap: 7,
      padding: '11px 20px', borderBottom: '1px solid var(--line)',
      overflowX: 'auto', overflowY: 'hidden',
    }}>
      {sections.map((s) => {
        const on = s.id === active;
        return (
          <button key={s.id} role="tab" aria-selected={on} onClick={() => go(s.id)}
            className={on ? 'k-squish' : 'hov k-squish'} style={{
              height: 28, padding: '0 11px', borderRadius: 9, flex: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              color: on ? 'var(--ink)' : 'var(--tx2)',
              background: on ? s.hue : 'var(--card)',
              border: `1px solid ${on ? 'transparent' : 'var(--line)'}`,
            }}>
            <Icon name={s.ic} size={13} color={on ? 'var(--ink)' : s.hue} />
            {s.name}
            {s.badge && (
              <span className="num" style={{ opacity: .75, fontSize: 10 }}>{s.badge}</span>
            )}
          </button>
        );
      })}
      {onMore && (
        <button onClick={onMore} className="hov k-squish" style={{
          height: 28, padding: '0 11px', borderRadius: 9, flex: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
          background: 'var(--card)', border: '1px solid var(--line)',
        }}>
          <Icon name="more" size={13} color="var(--tx3)" />More
        </button>
      )}
    </div>
  );
}
