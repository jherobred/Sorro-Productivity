'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIntegrations } from '@/lib/integrations';
import { usePageHealth } from '@/lib/noteRecovery';
import { Icon } from './Icon';

function useWrites() {
  const qc = useQueryClient();
  const cache = qc.getMutationCache();
  useSyncExternalStore(f => cache.subscribe(f), () => cache.getAll().map(m => `${m.mutationId}:${m.state.status}:${m.state.isPaused}`).join('|'), () => '');
  // A successful retry supersedes an older error for the same record.
  const latest = new Map<string, ReturnType<typeof cache.getAll>[number]>();
  for (const m of cache.getAll()) {
    const v = m.state.variables as { id?: string } | undefined;
    latest.set(v?.id ? `record:${v.id}` : `${m.options.mutationKey?.join('.')}`, m);
  }
  return { pending: cache.getAll().filter(m => m.state.status === 'pending'), failed: [...latest.values()].filter(m => m.state.status === 'error') };
}
export function useConnectionHealth() {
  const [online, setOnline] = useState(true);
  useEffect(() => { const update = () => setOnline(navigator.onLine); update(); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  const writes = useWrites(); const pages = usePageHealth();
  const { data: integrations = [] } = useIntegrations();
  const stale = integrations.filter(r => r.enabled && (!!r.last_error || !r.last_sync_at)).length;
  const trouble = writes.failed.length + pages.failed;
  return { ...writes, online, stale, trouble, text: !online ? 'Offline · queued' : trouble ? 'Save needs attention' : writes.pending.length || pages.pending ? 'Saving…' : stale ? 'Sync needs attention' : 'Saved' };
}
export function SyncHealth({ onOpen }: { onOpen: () => void }) {
  const health = useConnectionHealth();
  return <button className={'sync-health' + (health.trouble || health.stale ? ' needs-attention' : '')} onClick={onOpen} aria-label={'Save and sync status: ' + health.text}><Icon name={health.trouble || health.stale ? 'refresh' : 'check'} size={14}/><span>{health.text}</span></button>;
}
export function SaveHealthDetails() {
  const health = useConnectionHealth(); const [retrying, setRetrying] = useState(false);
  return <section className="save-health-details"><h3>Workspace saves</h3><p role="status">{health.online ? health.pending.length ? `${health.pending.length} changes waiting to sync.` : 'Connected.' : 'Offline. Queued changes will sync when you reconnect.'}</p>
    {!!health.failed.length && <><p>{health.failed.length} changes could not sync. Your open pages keep a device copy. Retry a page from its save status.</p><button className="studio-button" disabled={!health.online || retrying} onClick={async () => { setRetrying(true); try { for(const m of health.failed) { const key=m.options.mutationKey?.join('.')||''; if(key==='nb2.saveNote'||key==='nb2.newNote')continue; try{await m.execute(m.state.variables);}catch{/* Keep each failed change available for another retry. */} } } finally { setRetrying(false); } }}>{retrying ? 'Retrying…' : 'Retry other failed changes'}</button></>}
    <p className="notebook-caption">Page history is kept on this device. A downloaded backup gives you a separate recovery copy.</p></section>;
}
