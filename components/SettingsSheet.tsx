'use client';

import dynamic from 'next/dynamic';
import type { SettingsTab } from './SettingsModal';

const SettingsModal = dynamic(() => import('./SettingsModal').then((m) => m.SettingsModal), { ssr: false });

export function SettingsSheet({
  onClose,
  initialTab = 'general',
}: {
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  return <SettingsModal initialTab={initialTab} onClose={onClose} />;
}
