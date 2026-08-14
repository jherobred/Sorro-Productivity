'use client';

import { useToasts, dismiss } from '@/lib/toast';
import { Icon } from './Icon';

export function ToastHost() {
  const toasts = useToasts();
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(22px + env(safe-area-inset-bottom))',
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
              <Icon name="undo" size={13} color="var(--accTx)" />
              Undo
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
