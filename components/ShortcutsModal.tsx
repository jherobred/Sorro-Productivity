'use client';

import { useOverlayBack } from '@/lib/nav';
import { Icon } from './Icon';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export type ShortcutItem = {
  keys: string[];
  description: string;
  category: 'Navigation' | 'Quick Actions' | 'Calendar & Tasks' | 'General';
};

export const KEYBOARD_SHORTCUTS: ShortcutItem[] = [
  { keys: ['⌘ / Ctrl', 'K'], description: 'Open Search & Command Palette', category: 'General' },
  { keys: ['/'], description: 'Quick Search (when not in input)', category: 'General' },
  { keys: ['?'], description: 'Show Keyboard Shortcuts Cheat Sheet', category: 'General' },
  { keys: ['⌘ / Ctrl', '\\'], description: 'Toggle Sidebar Navigation', category: 'General' },
  { keys: ['⌘ / Ctrl', 'Shift', 'L'], description: 'Toggle Dark / Light Theme', category: 'General' },

  { keys: ['T'], description: 'Quick Create Task', category: 'Quick Actions' },
  { keys: ['N'], description: 'Quick Create Note', category: 'Quick Actions' },
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[580px] max-h-[85dvh] overflow-y-auto rounded-[22px] border-[var(--line2)] bg-[var(--card)] p-6 shadow-[var(--shl)] focus:outline-none">
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--acc)_18%,transparent)]">
            <Icon name="spark" size={16} color="var(--accTx)" />
          </div>
          <div>
            <DialogTitle className="text-base font-extrabold tracking-[-0.02em] text-[var(--tx)]">
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[var(--tx3)]">
              Speed up your flow across Basedly
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Categories */}
        <div className="flex flex-col gap-[18px]">
          {categories.map((cat) => {
            const items = KEYBOARD_SHORTCUTS.filter((s) => s.category === cat);
            if (!items.length) return null;

            return (
              <div key={cat}>
                <div className="mb-2 text-[10px] font-extrabold tracking-[.12em] uppercase text-[var(--tx3)]">
                  {cat}
                </div>

                <div className="flex flex-col gap-1.5 rounded-[14px] border border-[var(--line2)] bg-[var(--card2)] p-2">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[var(--hov)] transition-colors"
                    >
                      <span className="text-[12.5px] font-semibold text-[var(--tx)]">
                        {item.description}
                      </span>

                      <div className="flex items-center gap-1">
                        {item.keys.map((k, ki) => (
                          <kbd
                            key={ki}
                            className="rounded-md border border-[var(--line2)] bg-[var(--card)] px-1.5 py-0.5 text-[11px] font-extrabold text-[var(--accTx)] shadow-sm font-mono"
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
      </DialogContent>
    </Dialog>
  );
}
