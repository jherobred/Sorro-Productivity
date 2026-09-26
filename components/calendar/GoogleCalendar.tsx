'use client';
import {syncMessage} from '@/lib/syncMessage';

/**
 * Google Calendar, from the Calendar tab itself.
 *
 * The connection is Google's own secret iCal address for a calendar, read on
 * the server by the `sync` function on a schedule: no Google sign-in to renew
 * every hour, and nothing written back to Google. Repeating events arrive as
 * every one of their dates, and an event deleted in Google leaves here too.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { toast } from '@/lib/toast';
import { useOverlayBack } from '@/lib/nav';
import { ago } from '@/lib/notify';
import { runSync, useIntegrationActions, useIntegrations } from '@/lib/integrations';

const SETTINGS_URL = 'https://calendar.google.com/calendar/r/settings';
const looksLikeIcs = (v: string) => /^https:\/\/calendar\.google\.com\/calendar\/ical\/.+\.ics(\?.*)?$/i.test(v.trim()) || /^https:\/\/.+\.ics(\?.*)?$/i.test(v.trim());

function useGoogleCalendar() {
  const { data: rows = [] } = useIntegrations();
  return rows.find((r) => r.kind === 'gcal_ics') ?? null;
}

export function GoogleCalendarButton({ onOpen }: { onOpen: () => void }) {
  const row = useGoogleCalendar();
  const state = !row ? 'off' : row.last_error ? 'error' : 'on';
  return (
    <button type="button" className={'cal-google is-' + state} onClick={onOpen} aria-label="Google Calendar connection"
      title={!row ? 'Connect Google Calendar' : row.last_error ? 'Google Calendar needs attention' : `Google Calendar, synced ${row.last_sync_at ? ago(row.last_sync_at) : 'soon'}`}>
      <span className="cal-google-mark" aria-hidden="true">G</span>
      <span className="cal-google-label">{!row ? 'Connect Google' : 'Google'}</span>
      <i aria-hidden="true" />
    </button>
  );
}

export function GoogleCalendarSheet({ onClose }: { onClose: () => void }) {
  useOverlayBack(true, onClose);
  const qc = useQueryClient();
  const row = useGoogleCalendar();
  const A = useIntegrationActions();
  const [editing, setEditing] = useState(!row);
  const [url, setUrl] = useState(row?.config.ics_url ?? '');
  const [busy, setBusy] = useState(false);
  const ok = looksLikeIcs(url);

  const sync = async () => {
    setBusy(true);
    const r = await runSync('gcal_ics');
    setBusy(false);
    toast(r.ok ? `Google Calendar: ${r.message}` : syncMessage(r.message), undefined, { icon: 'cal' });
    for (const k of ['events', 'integrations']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const connect = () => {
    A.save.mutate({ kind: 'gcal_ics', config: { ics_url: url.trim() }, enabled: true }, {
      onSuccess: () => { setEditing(false); void sync(); },
      onError: (e) => toast(`Could not save the address: ${e.message}`),
    });
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="gcal-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="gcal-sheet" role="dialog" aria-modal="true" aria-labelledby="gcal-title">
        <header className="gcal-head">
          <span className="cal-google-mark is-big" aria-hidden="true">G</span>
          <div>
            <h2 id="gcal-title">Google Calendar</h2>
            <p>{!row ? 'Not connected' : row.last_error ? syncMessage(row.last_error) : row.last_sync_at ? `Synced ${ago(row.last_sync_at)}` : 'Connected, not synced yet'}</p>
          </div>
          <button type="button" className="gcal-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        {row?.last_error&&<div className="sync-diagnostics"><p>Last successful sync: {row.last_sync_at?new Date(row.last_sync_at).toLocaleString():'Never'}</p><details><summary>Technical details</summary><pre>{row.last_error}</pre></details></div>}
        {editing ? (
          <>
            <ol className="gcal-steps">
              <li>Open <a href={SETTINGS_URL} target="_blank" rel="noopener noreferrer">Google Calendar settings</a> on a computer.</li>
              <li>Under <b>Settings for my calendars</b>, pick the calendar to bring in.</li>
              <li>In <b>Integrate calendar</b>, copy the <b>Secret address in iCal format</b>.</li>
              <li>Paste it here.</li>
            </ol>
            <label className="gcal-field">
              <span>Secret address in iCal format</span>
              <input type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-invalid={!!url && !ok} />
              {url && !ok && <small className="is-bad">That does not look like an iCal address. It ends in .ics.</small>}
            </label>
            <p className="gcal-note">Read-only: events come from Google into Basedly, nothing goes back. The address is kept with your account alone; anyone holding it could read the calendar, so do not share it.</p>
            <div className="gcal-actions">
              {row && <button type="button" className="gcal-ghost" onClick={() => { setEditing(false); setUrl(row.config.ics_url ?? ''); }}>Cancel</button>}
              <button type="button" className="studio-button primary" disabled={!ok || A.save.isPending} onClick={connect}><Icon name="plug" size={16} />{row ? 'Save and sync' : 'Connect'}</button>
            </div>
          </>
        ) : (
          <>
            <ul className="gcal-facts">
              <li><Icon name="repeat" size={15} />Repeating events come in as every one of their dates.</li>
              <li><Icon name="refresh" size={15} />It checks Google again on its own every little while, and when you come back to the app.</li>
              <li><Icon name="trash" size={15} />An event deleted in Google leaves here on the next sync.</li>
            </ul>
            <div className="gcal-actions">
              <button type="button" className="gcal-ghost is-danger" onClick={() => A.remove.mutate({ kind: 'gcal_ics' }, { onSuccess: () => { toast('Google Calendar disconnected'); onClose(); } })}>Disconnect</button>
              <button type="button" className="gcal-ghost" onClick={() => setEditing(true)}>Change address</button>
              <button type="button" className="studio-button primary" disabled={busy} onClick={() => void sync()}><Icon name="refresh" size={16} />{busy ? 'Syncing…' : 'Sync now'}</button>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
