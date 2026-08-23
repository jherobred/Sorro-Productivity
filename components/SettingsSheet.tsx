'use client';

import { SettingsModal, type SettingsTab } from './SettingsModal';

export function SettingsSheet({
  onClose,
  initialTab = 'general',
}: {
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  return <SettingsModal initialTab={initialTab} onClose={onClose} />;
}
