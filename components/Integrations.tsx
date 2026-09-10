'use client';

import { validateIntegration } from '@/lib/integrationValidation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from './Icon';
import { toast } from '@/lib/toast';
import { useIntegrations, useIntegrationActions, runSync, type Integration } from '@/lib/integrations';
import { ago } from '@/lib/notify';

/**
 * Connect Canvas LMS and Google Calendar. Both are set up by pasting a value the
 * user already has, which is deliberate: an OAuth dance would need a redirect
 * target this static export does not have, and Google's calendar token expires
 * an hour after sign-in whether we use it or not.
 */

type Spec = {
  kind: Integration['kind'];
  name: string;
  icon: IconName;
  hue: string;
  blurb: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean; hint?: string }[];
  help: string;
};

const SPECS: Spec[] = [
  {
    kind: 'canvas_lms',
    name: 'Canvas LMS',
    icon: 'book',
    hue: 'var(--pal-coral)',
    blurb: 'Pulls announcements into the bell and Home, and turns assignments into tasks with their real due dates.',
    fields: [
      { key: 'base_url', label: 'Canvas address', placeholder: 'https://canvas.yourschool.edu' },
      { key: 'token', label: 'Access token', placeholder: 'Paste your token', secret: true, hint: 'Canvas → Account → Settings → New Access Token.' },
    ],
    help: 'Stored in your private account settings. The sync runs on the server. Keep this token private and revoke it in Canvas whenever you disconnect.',
  },
  {
    kind: 'gcal_ics',
    name: 'Google Calendar',
    icon: 'cal',
    hue: 'var(--pal-sky)',
    blurb: 'Read-only mirror of a Google calendar. Events appear alongside your own and update on every sync.',
    fields: [
      { key: 'ics_url', label: 'Secret address in iCal format', placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics', hint: 'Google Calendar → Settings → your calendar → Integrate calendar.' },
    ],
    help: 'Read-only by design. Nothing you do in Basedly is written back to Google.',
  },
];

export function Integrations() {
  const { data: rows = [], isPending, isError, refetch } = useIntegrations();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isPending && <p role="status">Loading your connections…</p>}
      {isError && <p role="alert">Could not load connections. <button onClick={()=>void refetch()}>Try again</button></p>}
      <p style={{fontSize:14,lineHeight:1.65,color:'var(--tx2)'}}>Bring your schedule and assignments into Basedly. Each connection tells you what it imports and when it last worked.</p>
      {SPECS.map((s) => <Card key={s.kind} spec={s} row={rows.find((r) => r.kind === s.kind)} />)}
      <div className="studio-connection-info"><strong>Gmail sharing</strong><p>Use Gmail in the note or community Share menu to prepare an email. You review and send it in Gmail. Inbox access and automatic email sync are not connected.</p><a className="studio-text-button" href="https://mail.google.com/mail/" target="_blank" rel="noopener noreferrer">Open Gmail</a></div>
    </div>
  );
}

function Card({ spec, row }: { spec: Spec; row?: Integration }) {
  const qc = useQueryClient();
  const A = useIntegrationActions();
  const connected = !!row;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...(row?.config ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const complete = spec.fields.every((f) => (draft[f.key] ?? '').trim());

  /**
   * Connecting runs the first sync straight away.
   *
   * Saving the config and then waiting for the user to find "Sync now" is what
   * shipped, and it meant a correctly-connected account showed nothing at all:
   * last_sync_at stayed null and not one row was imported. Connecting *is* the
   * request for the data.
   */
  const save = () => {
    if(A.save.isPending || busy) return;
    const config = Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,v.trim()]));
    const invalid = validateIntegration(spec.kind, config);
    if(invalid) {setError(invalid);return;}
    setError('');
    A.save.mutate(
      { kind: spec.kind, config, enabled: true },
      {
        onError: (e) => setError(e.message || 'Could not save. Check your connection and try again.'),
        onSuccess: async () => {
          setOpen(false);
          toast(`${spec.name} saved. Checking the connection…`);
          await sync();
        },
      },
    );
  };

  const sync = async () => {
    if(busy)return;
    setBusy(true);
    const r = await runSync(spec.kind);
    setBusy(false);
    setError(r.ok ? '' : r.message);
    toast(r.ok ? `${spec.name}: ${r.message}` : `${spec.name} — ${r.message}`);
    // A sync writes tasks, events and notifications, so refresh all three.
    for (const k of ['tasks', 'events', 'notifications', 'integrations']) {
      void qc.invalidateQueries({ queryKey: [k] });
    }
  };

  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--line)', background: 'var(--card2)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px' }}>
        <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${spec.hue} 20%, transparent)` }}>
          <Icon name={spec.icon} size={16} color={spec.hue} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{spec.name}</span>
            <span style={{
              padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
              background: connected ? 'color-mix(in srgb, var(--pal-mint) 20%, transparent)' : 'var(--hov)',
              color: connected ? 'var(--pal-mint)' : 'var(--tx3)',
            }}>
              {connected ? row?.last_error ? 'Needs attention' : row?.last_sync_at ? 'Connected' : 'Not verified' : 'Not set up'}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.55, marginTop: 4 }}>{spec.blurb}</p>

          {connected && (
            <p style={{ fontSize: 12, color: row?.last_error ? 'var(--pal-coral)' : 'var(--tx3)', marginTop: 5 }}>
              {row?.last_error
                ? `Last sync failed — ${row.last_error}`
                : row?.last_sync_at ? `Synced ${ago(row.last_sync_at)}` : 'Never synced'}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, padding: '0 14px 13px', flexWrap: 'wrap' }}>
        <button onClick={() => { setDraft({ ...(row?.config ?? {}) }); setOpen((v) => !v); }} className="hov k-squish"
          style={BTN}>
          <Icon name={connected ? 'set' : 'plug'} size={13} color="var(--tx2)" />
          {connected ? 'Edit' : 'Connect'}
        </button>

        {connected && (
          <>
            <button onClick={sync} disabled={busy} className="hov k-squish" style={{ ...BTN, opacity: busy ? 0.55 : 1 }}>
              <Icon name="refresh" size={13} color="var(--tx2)" />{busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={() => A.remove.mutate({ kind: spec.kind }, { onSuccess: () => toast(`${spec.name} disconnected`) })}
              className="hov k-squish"
              style={{ ...BTN, color: 'var(--pal-coral)', marginLeft: 'auto' }}>
              Disconnect
            </button>
          </>
        )}
      </div>

      {error && <p role="alert" style={{padding:'0 16px 14px',color:'var(--tx)',fontSize:13,lineHeight:1.6}}>{error}</p>}
      {open && (
        <div className="k-bloom" style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--line)', background: 'var(--card)' }}>
          {spec.fields.map((f) => (
            <label key={f.key} style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 5 }}>{f.label}</span>
              <input
                type={f.secret ? 'password' : 'url'}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: '100%', minHeight: 42, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--line2)', background: 'var(--card2)', fontSize: 14,
                }} />
              {f.hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>{f.hint}</span>}
            </label>
          ))}

          <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6, margin: '2px 0 12px' }}>{spec.help}</p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(false)} className="hov k-squish" style={{ ...BTN, flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button onClick={save} disabled={!complete || busy || A.save.isPending} className="k-squish"
              style={{ ...BTN, flex: 1, justifyContent: 'center', background: 'var(--acc)', color: 'var(--ink)', border: 0, opacity: complete ? 1 : 0.45 }}>
              {A.save.isPending || busy ? 'Connecting…' : 'Save & test connection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10,
  border: '1px solid var(--line2)', fontSize: 13, fontWeight: 700, color: 'var(--tx2)', minHeight: 38,
};
