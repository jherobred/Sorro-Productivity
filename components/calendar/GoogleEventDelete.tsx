'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { importedSeriesKey, type Ev } from '@/lib/events';
import { useIntegrations } from '@/lib/integrations';
import { connectGoogleAccount, forgetGoogleToken, googleTokens } from '@/lib/googleAccounts';
import { deleteGoogleOccurrence, gcalUrls, googleCalendarId, withGoogleCalendar, GoogleAuthorizationError } from '@/lib/googleCalendarApi';
import { useOverlayBack } from '@/lib/nav';
import { Icon } from '@/components/Icon';

export function GoogleEventDelete({ event, onHide, onDeleted, onClose }: {
  event: Ev; onHide: (series: boolean) => void; onDeleted: (series: boolean) => void; onClose: () => void;
}) {
  const repeats = !!importedSeriesKey(event);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const { data: rows = [] } = useIntegrations();
  const calendarIds = gcalUrls(rows.find(r => r.kind === 'gcal_ics')?.config).map(googleCalendarId).filter((id): id is string => !!id);
  const calendarId = calendarIds[0] ?? null;
  const [account, setAccount] = useState<string | undefined>();
  useOverlayBack(true, () => { if (!pending.current) onClose(); });
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  const remove = async (series = false) => {
    if (pending.current || !calendarId || !event.external_id) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const externalId = event.external_id;
      await withGoogleCalendar(calendarIds, googleTokens(),
        (token, id) => deleteGoogleOccurrence({ token, calendarId: id, externalId, series }), forgetGoogleToken);
      onDeleted(series);
    } catch (e) {
      setNeedsAuth(e instanceof GoogleAuthorizationError);
      if (e instanceof GoogleAuthorizationError) setAccount(e.account);
      setError(e instanceof Error ? e.message : 'Could not delete. Try again.');
    } finally { pending.current = false; setBusy(false); }
  };
  const connect = async () => {
    setBusy(true);
    try {
      const result = await connectGoogleAccount(account, `/calendar/?googleDelete=${encodeURIComponent(event.id)}`);
      if (result.error) setError(result.error);
    } catch { setError('Could not open Google sign-in. Try again.'); }
    finally { setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="cal-delete-dialog" aria-labelledby="google-delete-title"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="google-delete-title">Remove Google event</h2><button className="cal-icon-button" aria-label="Close deletion options" disabled={busy} onClick={onClose}><Icon name="close" size={18}/></button></header>
    <p className="cal-delete-event">{event.title}<small>{new Date(event.starts_at).toLocaleString()}</small></p>
    <button className="cal-delete-option" disabled={busy} onClick={() => onHide(false)}><Icon name="eye" size={20}/><span><b>Hide</b><small>Only remove it from Basedly. It stays hidden after sync. Google keeps the event.</small></span></button>
    <button className="cal-delete-option is-danger" disabled={busy || !calendarId || !event.external_id} onClick={() => void remove()}><Icon name="trash" size={20}/><span><b>{busy ? 'Working…' : 'Super Delete'}</b><small>Delete this occurrence from Google Calendar too. Basedly cannot undo this.</small></span></button>
    {repeats && <button className="cal-delete-option" disabled={busy} onClick={() => onHide(true)}><Icon name="eye" size={20}/><span><b>Hide every occurrence</b><small>Remove the whole series from Basedly, including future syncs. Google keeps it.</small></span></button>}
    {repeats && <button className="cal-delete-option is-danger" disabled={busy || !calendarId || !event.external_id} onClick={() => void remove(true)}><Icon name="trash" size={20}/><span><b>{busy ? 'Working…' : 'Super Delete series'}</b><small>Delete every occurrence from Google Calendar too. Basedly cannot undo this.</small></span></button>}
    {(!calendarId || !event.external_id) && <p className="cal-delete-message">Super Delete needs a Google Calendar iCal connection and a synced event ID. Sync your calendar, then reopen this event.</p>}
    {error && <p role="alert" className="cal-delete-message">{error}</p>}
    {needsAuth && <button className="studio-button primary" disabled={busy} onClick={() => void connect()}>Connect Google for Super Delete</button>}
  </dialog>, document.body);
}
