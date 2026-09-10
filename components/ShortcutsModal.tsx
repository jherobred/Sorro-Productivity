'use client';

import { useOverlayBack } from '@/lib/nav';
import { Icon } from './Icon';

export type ShortcutItem = {
  keys: string[];
  description: string;
  category: 'Navigation' | 'Quick Actions' | 'Calendar & Tasks' | 'General';
};

export const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  { keys: ['⌘ / Ctrl', 'K'], description: 'Open Search & Command Palette', category: 'General' },
  { keys: ['/'], description: 'Quick Search (when not in input)', category: 'General' },
  { keys: ['?'], description: 'Show Keyboard Shortcuts Cheat Sheet', category: 'General' },
  { keys: ['⌘ / Ctrl', 'Shift', 'L'], description: 'Toggle Dark / Light Theme', category: 'General' },

  { keys: ['T'], description: 'Quick Create Task', category: 'Quick Actions' },
  { keys: ['N'], description: 'Open Notes', category: 'Quick Actions' },
  { keys: ['E'], description: 'Quick Log Expense', category: 'Quick Actions' },

  { keys: ['Backspace / Del'], description: 'Delete Selected Calendar Event with Undo', category: 'Calendar & Tasks' },
  { keys: ['T'], description: 'Jump to Today in Calendar', category: 'Calendar & Tasks' },
  { keys: ['←', '→'], description: 'Navigate Previous / Next Period in Calendar', category: 'Calendar & Tasks' },

  { keys: ['G', 'H'], description: 'Go to Home', category: 'Navigation' },
  { keys: ['G', 'C'], description: 'Go to Calendar', category: 'Navigation' },
  { keys: ['G', 'T'], description: 'Go to Tasks', category: 'Navigation' },
  { keys: ['G', 'N'], description: 'Go to Notebooks', category: 'Navigation' },
  { keys: ['G', 'B'], description: 'Go to Habits & Discipline', category: 'Navigation' },
  { keys: ['G', 'F'], description: 'Go to Community Feed', category: 'Navigation' },
  { keys: ['G', 'P'], description: 'Go to Profile', category: 'Navigation' },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useOverlayBack(true, onClose);

  const categories = ['General', 'Quick Actions', 'Calendar & Tasks', 'Navigation'] as const;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="k-bloom navsb"
        style={{
          width: 580,
          maxWidth: '100%',
          maxHeight: '85dvh',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 22,
          padding: '22px 24px',
          boxShadow: 'var(--shl)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--acc) 18%, transparent)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="spark" size={16} color="var(--accTx)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-.02em', color: 'var(--tx)' }}>
                Keyboard Shortcuts
              </h2>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                Speed up your flow across Basedly
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="hov k-squish"
            aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}
          >
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {/* Categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {categories.map((cat) => {
            const items = KEYBOARD_SHORTCUTS.filter((s) => s.category === cat);
            if (!items.length) return null;

            return (
              <div key={cat}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: 'var(--tx3)',
                    marginBottom: 8,
                  }}
                >
                  {cat}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    background: 'var(--card2)',
                    borderRadius: 14,
                    padding: 8,
                    border: '1px solid var(--line2)',
                  }}
                >
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>
                        {item.description}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {item.keys.map((k, ki) => (
                          <kbd
                            key={ki}
                            style={{
                              padding: '3px 7px',
                              borderRadius: 6,
                              background: 'var(--card)',
                              border: '1px solid var(--line2)',
                              fontSize: 11,
                              fontWeight: 800,
                              color: 'var(--accTx)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                              fontFamily: 'inherit',
                            }}
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
