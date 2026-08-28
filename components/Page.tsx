'use client';

import { useLayout } from '@/lib/useLayout';

/**
 * The shell every section sits in.
 *
 * Two problems it exists to fix.
 *
 * **The repeated title.** Every page opened with its own name in 24px bold —
 * directly under a sidebar item saying the same word, or on a phone, directly
 * under a top bar saying the same word. The navigation already tells you where
 * you are; saying it twice spends the most valuable line on the screen
 * agreeing with itself. The name stays for screen readers, where there is no
 * "already visible", and the visible line carries what is actually true right
 * now — how many are open, what month you are in, what this costs.
 *
 * **The stretched row.** Content ran the full width of the window. On a wide
 * monitor a task called "Call home" became a checkbox, three words, and seven
 * hundred pixels of nothing before the buttons on the far right. Lists get a
 * reading measure; grids and boards, which genuinely use the room, get more.
 */

export type PageWidth = 'list' | 'wide' | 'full';

const MAX: Record<PageWidth, number | undefined> = {
  /** Rows and forms. Past roughly this, the eye loses the line. */
  list: 820,
  /** Card grids and dashboards, which fill the space with content. */
  wide: 1240,
  /** Boards and canvases that want every pixel. */
  full: undefined,
};

export function Page({
  name, meta, actions, width = 'wide', children, fill = false,
}: {
  /** The section's name. Announced, not drawn — the chrome already draws it. */
  name: string;
  /** The line worth reading: a count, a range, a total. */
  meta?: React.ReactNode;
  /** Controls that belong to the whole page, right-aligned. */
  actions?: React.ReactNode;
  width?: PageWidth;
  /** True when the page manages its own scrolling and should fill the height. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const { phone } = useLayout();
  const max = MAX[width];

  return (
    <div style={{
      padding: phone ? '14px 14px 24px' : '20px 24px 28px',
      ...(fill ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 } : null),
    }}>
      <div style={{
        maxWidth: max, marginInline: max ? 'auto' : undefined, width: '100%',
        ...(fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : null),
      }}>
        <h1 className="sronly">{name}</h1>

        {(meta || actions) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            marginBottom: phone ? 12 : 16, minHeight: 34, flex: 'none',
          }}>
            {meta && (
              <div style={{
                fontSize: phone ? 13 : 14, fontWeight: 700, letterSpacing: '-.01em',
                color: 'var(--tx2)', minWidth: 0,
              }}>
                {meta}
              </div>
            )}
            {actions && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {actions}
              </div>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
