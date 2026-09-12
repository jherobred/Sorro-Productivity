'use client';

import { useLayout } from '@/lib/useLayout';


/** Shared section title, measure and responsive spacing inside the app shell. */

export type PageWidth = 'list' | 'wide' | 'full';

const MAX: Record<PageWidth, number | undefined> = {
  list: 820,
  wide: 1240,
  full: undefined,
};

export function Page({name, meta, actions, width = 'wide', children, fill = false}: {
  name: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  width?: PageWidth;
  fill?: boolean;
  children: React.ReactNode;
}) {
  const {phone} = useLayout();
  const effective: PageWidth = width;
  const max = MAX[effective];

  return (
    <div style={{
      padding: '0 0 28px',
      ...(fill ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 } : null),
    }}>
      <div style={{
        maxWidth: max, marginInline: max ? 'auto' : undefined, width: '100%',
        ...(fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : null),
      }}>
        <h1 className="section-title">{name}</h1>

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
