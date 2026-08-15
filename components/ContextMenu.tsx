'use client';

import { useEffect } from 'react';
import { Icon, type IconName } from './Icon';
import { lg } from '@/lib/glass';
import { PAL } from '@/lib/pal';

export type CtxItem = { label: string; icon: IconName; run: () => void; danger?: boolean };

/**
 * Context menu on the glass surface (ctxStyle, Basedly.dc.html:6478 — LG at
 * .95 strength, 228px wide, 15px radius) with the kind dot from ctxKindDot.
 */
const KIND_DOT: Record<string, string> = {
  task: PAL.indigo, project: PAL.violet, node: PAL.amber, scratch: PAL.cyan,
  event: PAL.mint, nav: 'var(--acc)', fab: 'var(--acc)', habit: PAL.coral, global: 'var(--acc)',
};

export function ContextMenu({
  x, y, kind, label, items, onClose, accent, dark,
}: {
  x: number; y: number; kind: string; label: string;
  items: CtxItem[]; onClose: () => void; accent: string; dark: boolean;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Defer so the opening gesture's own pointerup does not close it.
    const t = setTimeout(() => window.addEventListener('pointerdown', close, { once: true }), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 240);
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 600) - (items.length * 38 + 60));

  return (
    <div className="pop" role="menu" aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...lg({ tint: accent, strength: 0.95, radius: 15, dark }),
        position: 'fixed', left, top, width: 228, zIndex: 60, overflow: 'hidden', padding: 5,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px 8px' }}>
        <span style={{ width: 6, height: 6, borderRadius: 2, flex: 'none', background: KIND_DOT[kind] ?? 'var(--acc)' }} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      </div>

      {items.map((it) => (
        <button key={it.label} role="menuitem" onClick={() => { it.run(); onClose(); }} className="hov lensrow"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px',
            borderRadius: 9, fontSize: 12.5, fontWeight: 600, textAlign: 'left', minHeight: 36,
            color: it.danger ? PAL.coral : 'var(--tx)',
          }}>
          <Icon name={it.icon} size={14} color={it.danger ? PAL.coral : 'var(--tx3)'} />
          {it.label}
        </button>
      ))}
    </div>
  );
}
