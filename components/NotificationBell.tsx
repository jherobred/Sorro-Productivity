'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { useOverlayBack } from '@/lib/nav';
import { useNotifications, useNotifActions, NOTIF_HUE, NOTIF_ICON, ago, type Notif } from '@/lib/notify';

/**
 * The bell in the top bar. Unread count pulses; the panel blooms open (kinetics
 * "Command Palette Bloom") with rows staggering in behind the wipe.
 */
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const { data: items = [] } = useNotifications();
  const A = useNotifActions();
  const unread = items.filter((n) => !n.read_at).length;

  useOverlayBack(open, () => setOpen(false));

  // Click-away and Escape. Both are the same dismissal, so they share a handler.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const openItem = (n: Notif) => {
    if (!n.read_at) A.read.mutate({ id: n.id });
    if (n.href) { setOpen(false); router.push(n.href); }
  };

  const size = compact ? 34 : 38;

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="hov k-squish"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          width: size, height: size, flex: 'none', borderRadius: size / 2,
          border: '1px solid var(--line2)', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--hov)' : 'transparent',
        }}>
        <Icon name="bell" size={compact ? 15 : 16} color={unread ? 'var(--accTx)' : 'var(--tx2)'} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute', top: 1, right: 1, minWidth: 15, height: 15, padding: '0 3px',
              borderRadius: 8, background: 'var(--pal-coral)', color: '#fff',
              fontSize: 9, fontWeight: 800, lineHeight: '15px', textAlign: 'center',
              fontVariantNumeric: 'tabular-nums', border: '2px solid var(--bg)',
            }}>
            {unread > 9 ? '9+' : unread}
            {/* The ring pulse sits behind the pip so the count stays readable. */}
            <span aria-hidden className="k-pulse" style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'var(--pal-coral)', zIndex: -1 }} />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="k-bloom"
          style={{
            position: 'absolute', top: size + 8, right: 0, zIndex: 90,
            width: 340, maxWidth: 'calc(100vw - 28px)', maxHeight: 460,
            display: 'flex', flexDirection: 'column',
            borderRadius: 14, background: 'var(--card2)',
            border: '1px solid var(--line2)', boxShadow: 'var(--shl)', overflow: 'hidden',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
              Notifications
            </span>
            {unread > 0 && (
              <button onClick={() => A.readAll.mutate()} className="hov k-underline"
                style={{ marginLeft: 'auto', padding: '3px 7px', borderRadius: 7, fontSize: 11, fontWeight: 700, color: 'var(--accTx)' }}>
                Mark all read
              </button>
            )}
          </div>

          <div className="navsb k-stagger" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 5 }}>
            {items.map((n, i) => (
              <div key={n.id} style={{ '--i': i } as React.CSSProperties}>
                <div
                  className="row"
                  style={{
                    display: 'flex', gap: 10, padding: '9px 9px', borderRadius: 10,
                    background: n.read_at ? 'transparent' : 'color-mix(in srgb, var(--acc) 8%, transparent)',
                  }}>
                  <span style={{
                    width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center',
                    background: `color-mix(in srgb, ${NOTIF_HUE[n.kind]} 22%, transparent)`,
                  }}>
                    <Icon name={NOTIF_ICON[n.kind] as IconName} size={13} color={NOTIF_HUE[n.kind]} />
                  </span>

                  <button onClick={() => openItem(n)} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span style={{ fontSize: 12.5, fontWeight: n.read_at ? 600 : 800, color: 'var(--tx)', overflowWrap: 'anywhere' }}>
                        {n.title}
                      </span>
                      <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 10, color: 'var(--tx3)' }}>{ago(n.created_at)}</span>
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 2, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{n.body}</div>
                    )}
                  </button>

                  <button onClick={() => A.clear.mutate({ id: n.id })} className="hov" aria-label={`Dismiss ${n.title}`}
                    style={{ width: 22, height: 22, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center', alignSelf: 'flex-start' }}>
                    <Icon name="close" size={11} color="var(--tx3)" />
                  </button>
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6 }}>
                Nothing yet.<br />Announcements and reminders land here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
