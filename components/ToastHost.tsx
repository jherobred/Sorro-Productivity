'use client';

import { useToasts, dismiss } from '@/lib/toast';
import { useLayout } from '@/lib/useLayout';
import { Icon } from './Icon';

/**
 * Toasts sit above the bottom navigation, not on it.
 *
 * They used to be pinned 22px off the bottom on every layout. On a desktop
 * that is empty space; on a phone it is exactly where BottomNav lives — a
 * 44px bar inside 16px of padding — so every "Deleted · Undo" landed on top of
 * the section icons and covered the Undo button with a tab. NAV_H is that bar
 * plus its padding, and the safe-area inset is added once, here, rather than
 * being paid twice.
 */
const NAV_H = 66;

export function ToastHost() {
  const { phone } = useLayout();
  const toasts = useToasts();
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: `calc(${phone ? NAV_H + 10 : 22}px + env(safe-area-inset-bottom))`,
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="sheet"
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            overflow: 'hidden',
            minWidth: 240,
            maxWidth: 'min(92vw, 420px)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '11px 14px',
            borderRadius: 14,
            background: 'var(--card2)',
            border: '1px solid var(--line2)',
            boxShadow: 'var(--shl)',
            color: 'var(--tx)',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {(t.icon || t.tone) && (
            <span aria-hidden className="toast-mark" data-tone={t.tone ?? 'info'}>
              <Icon name={t.icon ?? (t.tone === 'success' ? 'check' : t.tone === 'danger' ? 'trash' : 'bell')} size={13} />
            </span>
          )}
          <span style={{ flex: 1, textWrap: 'pretty' }}>{t.text}</span>

          {t.undo && (
            <button
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: 'var(--accTx)',
                fontSize: 11.5,
                fontWeight: 700,
                minHeight: 24,
              }}
            >
              {!t.action && <Icon name="undo" size={13} color="var(--accTx)" />}
              {t.action ?? 'Undo'}
            </button>
          )}

          {/* Timer bar drains over exactly the toast lifetime. */}
          <div
            className="drain"
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: 2,
              width: '100%',
              background: 'var(--acc)',
              transformOrigin: 'left',
            }}
          />
        </div>
      ))}
    </div>
  );
}
