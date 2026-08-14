'use client';

import { useEffect, useState } from 'react';

/**
 * Layout is driven by measured width, not media queries (README "Responsive
 * rules"). The breakpoints are behavioural, so the three modes are kept:
 * desktop, phone portrait, phone landscape.
 */
export type Layout = { phone: boolean; landscape: boolean; width: number; height: number };

export function useLayout(): Layout {
  const [l, setL] = useState<Layout>({ phone: false, landscape: false, width: 1440, height: 900 });

  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setL({ phone: w < 900, landscape: w < 900 && w > h, width: w, height: h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return l;
}
