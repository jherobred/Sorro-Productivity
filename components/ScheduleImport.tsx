'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation } from '@/lib/offline';
import { useOverlayBack } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import {
  DAYS, DAY_LABEL, KINDS, KIND_LABEL, KIND_COLOR, toRow, dedupe, occurrences,
  totalOccurrences, eventTitle, defaultRange, validYmd, ymd,
  type Day, type Kind, type Row, type ScanEntry,
} from '@/lib/schedule';

/**
 * Point it at a photo of your week; it fills in the term.
 *
 * It used to be a *class* importer, and it was told so in its prompt: ignore
 * anything that is not a scheduled class. Point it at a screenshot of a real
 * calendar and it returned the five subjects and dropped the wake-ups, the
 * commutes, the shifts and the study blocks around them — most of the week, and
 * the half that actually moves. It reads every block with a time on it now, and
 * each one comes back labelled, so a chip unticks a whole category rather than
 * twenty rows.
 *
 * The rule this screen is built around: **the model never writes to the
 * calendar.** It reads, and then a person confirms. Everything it was unsure
 * of is marked, every row carries the literal text it was read from, and
 * nothing is saved until the button that says how many events it will add is
 * pressed. An import that quietly gets one class wrong is worse than one that
 * asks — you would find out in week three, standing outside the wrong room.
 *
 * The reading itself happens in the `schedule-scan` edge function, because the
 * API key belongs on a server and because the second, checking pass is easier
 * to keep honest there.
 */

/** Written as one insert: a term of classes is one act, not ninety. */
const IMPORT = defineMutation('cal.importSchedule', async (v: { rows: Record<string, unknown>[] }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_events').insert(v.rows.map((r) => ({ ...r, user_id })));
  if (error) throw error;
});

type Stage = 'pick' | 'scanning' | 'review';

export function ScheduleImport({ onClose }: { onClose: () => void }) {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  const qc = useQueryClient();
  useOverlayBack(true, onClose);

  const [stage, setStage] = useState<Stage>('pick');
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState('');
  const [scanInfo, setScanInfo] = useState<{ model: string; verified: boolean } | null>(null);
  const [range, setRange] = useState(defaultRange());
  const [saving, setSaving] = useState(false);
  const drop = useRef<HTMLDivElement>(null);

  const write = useMutation<unknown, Error, { rows: Record<string, unknown>[] }>({
    mutationKey: IMPORT,
    onSettled: () => void qc.invalidateQueries({ queryKey: ['events'] }),
  });

  /* ------------------------------------------------------------- scanning */

  const scan = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('That is not an image'); return; }
    setStage('scanning');
    try {
      const { dataUrl, base64, mime } = await downscale(file);
      setPreview(dataUrl);

      const { data, error } = await supabase.functions.invoke('schedule-scan', {
        body: { image: base64, mime, today: ymd(new Date()) },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? 'Could not read that');

      const found = dedupe((data.entries as ScanEntry[]).map((e, i) => toRow(e, i)));
      setRows(found);
      setNotes(typeof data.notes === 'string' ? data.notes : '');
      setScanInfo({ model: String(data.model ?? ''), verified: !!data.verified });

      // A term printed on the timetable beats a guess, but only if it is a
      // real date — a model that answers "First Semester" must not become NaN.
      const from = validYmd(String(data.term_starts_on ?? ''));
      const to = validYmd(String(data.term_ends_on ?? ''));
      if (from && to && from < to) setRange({ from, to });

      setStage('review');
      if (found.length === 0) toast('Nothing on that image had a time on it');
    } catch (e) {
      setStage('pick');
      toast(e instanceof Error ? e.message : 'Could not read that');
    }
  };

  // Paste a screenshot straight in — how most people have a timetable to hand.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (f && stage === 'pick') void scan(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  /* --------------------------------------------------------------- saving */

  const patch = (id: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...p };
      // Re-judge on every edit, so fixing a time clears its complaint and ticks
      // the row back on without the user hunting for the checkbox.
      const problems: string[] = [];
      if (!next.title.trim()) problems.push('No title');
      if (!next.days.length) problems.push('No day');
      if (!next.start) problems.push('Start time unreadable');
      if (!next.end) problems.push('End time unreadable');
      if (next.start && next.end && next.end <= next.start) problems.push('Ends before it starts');
      // Fixing a row that was flagged ticks it back on; a good row you
      // deliberately unticked stays off; a row you break unticks itself.
      const include = p.include !== undefined
        ? p.include
        : problems.length ? false : r.problems.length ? true : r.include;
      return { ...next, problems, include };
    }));

  const count = totalOccurrences(rows, range.from, range.to);
  const bad = rows.filter((r) => r.include && r.problems.length).length;

  const save = async () => {
    const chosen = rows.filter((r) => r.include && r.problems.length === 0);
    if (!chosen.length) return;
    setSaving(true);
    // One id per import, stamped on every row, so a mistaken import can be
    // found and undone as a batch rather than event by event.
    const batch = crypto.randomUUID().slice(0, 8);
    const payload = chosen.flatMap((r) =>
      occurrences(r, range.from, range.to).map((o, i) => ({
        title: eventTitle(r),
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        all_day: false,
        location: r.location,
        color: r.color,
        source: 'schedule_scan',
        // The occurrence index is part of the id, not just the batch and the
        // row. `bd_events_ext` is unique on (user_id, source, external_id), so
        // stamping all fifteen Tuesdays of one class with the same id made the
        // fifteenth collide with the first and Postgres refused the *whole*
        // insert — one bad key, nought events.
        external_id: `sched:${batch}:${r.id}:${i}`,
      })));

    // Awaited, and the sheet stays open when it fails. It used to fire the
    // mutation, announce "84 events added" and close, so an insert the
    // database refused looked exactly like one it accepted.
    try {
      await write.mutateAsync({ rows: payload });
      toast(`${payload.length} event${payload.length === 1 ? '' : 's'} added`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? `Not added — ${e.message}` : 'Could not add those');
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------------------- render */

  const body = (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: phone ? 0 : 16,
      }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import a schedule"
        className="k-bloom"
        style={{
          width: 780, maxWidth: '100%', height: phone ? '100dvh' : undefined, maxHeight: phone ? '100dvh' : '88dvh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: phone ? 0 : 18, boxShadow: 'var(--shl)', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 17px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
          <Icon name="spark" size={16} color="var(--accTx)" />
          <h2 style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em', flex: 1 }}>
            {stage === 'review' ? 'Check what it read' : 'Import a schedule'}
          </h2>
          {scanInfo && (
            <span title={`Read by ${scanInfo.model}${scanInfo.verified ? ', then checked a second time against the image' : ''}`}
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)' }}>
              {scanInfo.verified ? 'read · checked' : 'read'}
            </span>
          )}
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: phone ? 14 : 17 }}>
          {stage === 'pick' && (
            <div ref={drop}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void scan(f); }}
              style={{
                display: 'grid', placeItems: 'center', gap: 14, padding: '38px 20px', textAlign: 'center',
                border: '1.5px dashed var(--line2)', borderRadius: 16,
              }}>
              <Icon name="cal" size={26} color="var(--tx3)" />
              <div style={{ fontSize: 13, fontWeight: 700 }}>Drop a picture of your week</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.7, maxWidth: 420 }}>
                A screenshot of Google Calendar, the student portal, a photo of the printed sheet, a
                picture of the whiteboard. It reads classes <em>and</em> everything around them —
                travel, wake-ups, shifts, study blocks. Paste works too. Nothing goes on your
                calendar until you have read it back.
              </div>
              <label className="k-squish" style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 11,
                background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
              }}>
                <Icon name="image" size={14} color="var(--ink)" />Choose an image
                <input type="file" accept="image/*" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); e.target.value = ''; }} />
              </label>
            </div>
          )}

          {stage === 'scanning' && (
            <div style={{ display: 'grid', placeItems: 'center', gap: 14, padding: '46px 20px', textAlign: 'center' }}>
              {preview && (
                <img loading="lazy" decoding="async" src={preview} alt="" style={{ maxWidth: 260, maxHeight: 180, borderRadius: 12, opacity: 0.5 }} />
              )}
              <div className="k-pulse" style={{ fontSize: 13, fontWeight: 700 }}>Reading it…</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                Then reading it a second time to check the first.
              </div>
            </div>
          )}

          {stage === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notes && (
                <div style={{
                  display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 11,
                  background: 'color-mix(in srgb, var(--acc) 9%, transparent)', border: '1px solid var(--line2)',
                }}>
                  <Icon name="eye" size={13} color="var(--tx3)" style={{ marginTop: 2 }} />
                  <span style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--tx2)' }}>{notes}</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--tx3)' }}>
                  From
                  <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                    style={DATE_INPUT} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--tx3)' }}>
                  until
                  <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                    style={DATE_INPUT} />
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tx3)' }}>
                  {rows.filter((r) => r.include).length} of {rows.length} blocks
                </span>
              </div>

              {/* One tick per category. Somebody who wanted only their subjects
                  turns off Travel and Personal here instead of hunting rows. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {KINDS.filter((k) => rows.some((r) => r.kind === k)).map((k) => {
                  const of = rows.filter((r) => r.kind === k);
                  const on = of.some((r) => r.include);
                  return (
                    <button key={k} aria-pressed={on}
                      onClick={() => setRows((rs) => rs.map((r) => (r.kind === k
                        ? { ...r, include: on ? false : r.problems.length === 0 }
                        : r)))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999,
                        fontSize: 11, fontWeight: 700,
                        border: `1px solid ${on ? KIND_COLOR[k] : 'var(--line2)'}`,
                        background: on ? `color-mix(in srgb, ${KIND_COLOR[k]} 18%, transparent)` : 'transparent',
                        color: on ? 'var(--tx)' : 'var(--tx3)',
                      }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: KIND_COLOR[k], flex: 'none' }} />
                      {KIND_LABEL[k]}
                      <span style={{ color: 'var(--tx3)', fontWeight: 600 }}>{of.length}</span>
                    </button>
                  );
                })}
              </div>

              {rows.map((r) => (
                <RowEditor key={r.id} row={r} accent={prefs.accent} phone={phone}
                  onPatch={(p) => patch(r.id, p)}
                  onRemove={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} />
              ))}

              {rows.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--tx3)', textAlign: 'center', padding: 30, lineHeight: 1.7 }}>
                  Nothing on that image had a time on it.<br />
                  <button onClick={() => setStage('pick')} className="k-underline"
                    style={{ fontSize: 12, fontWeight: 700, color: 'var(--accTx)' }}>Try another picture</button>
                </div>
              )}
            </div>
          )}
        </div>

        {stage === 'review' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 17px',
            borderTop: '1px solid var(--line)', flex: 'none', flexWrap: 'wrap',
          }}>
            <button onClick={() => { setStage('pick'); setRows([]); setScanInfo(null); }} className="hov k-squish"
              style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>
              Another picture
            </button>
            <span style={{ fontSize: 11, color: bad ? 'var(--pal-coral)' : 'var(--tx3)' }}>
              {bad ? `${bad} row${bad === 1 ? '' : 's'} still needs fixing` : `${count} event${count === 1 ? '' : 's'} will be added`}
            </span>
            <button onClick={() => void save()} disabled={count === 0 || saving} className="acc k-squish"
              style={{
                marginLeft: 'auto', minHeight: 38, padding: '0 18px', borderRadius: 10,
                background: 'var(--acc)', color: '#0A0912', fontSize: 12, fontWeight: 800,
                opacity: count === 0 || saving ? 0.45 : 1,
              }}>
              {saving ? 'Adding…' : `Add ${count} to the calendar`}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}

/* ------------------------------------------------------------------- row */

function RowEditor({
  row, accent, phone, onPatch, onRemove,
}: { row: Row; accent: string; phone: boolean; onPatch: (p: Partial<Row>) => void; onRemove: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const unsure = row.confidence < 0.6;

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 12, background: 'var(--card2)',
      border: `1px solid ${row.problems.length ? 'var(--pal-coral)' : unsure ? 'var(--pal-amber)' : 'var(--line)'}`,
      display: 'flex', flexDirection: 'column', gap: 8, opacity: row.include ? 1 : 0.55,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <button onClick={() => onPatch({ include: !row.include })} role="checkbox" aria-checked={row.include}
          aria-label={`Import ${row.title}`}
          style={{
            width: 18, height: 18, flex: 'none', borderRadius: 5, display: 'grid', placeItems: 'center',
            border: `1.5px solid ${row.include ? accent : 'var(--line2)'}`,
            background: row.include ? accent : 'transparent',
          }}>
          {row.include && <Icon name="check" size={11} color="#0C0F16" />}
        </button>

        <input value={row.title} onChange={(e) => onPatch({ title: e.target.value })} aria-label="Title"
          style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--tx)' }} />

        <input value={row.code} onChange={(e) => onPatch({ code: e.target.value })} placeholder="Code" aria-label="Course code"
          style={{ width: 84, flex: 'none', fontSize: 11, color: 'var(--tx3)' }} />

        <button onClick={onRemove} className="hov" aria-label="Drop this row"
          style={{ width: 26, height: 26, flex: 'none', borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="close" size={12} color="var(--tx3)" />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {DAYS.map((d) => {
          const on = row.days.includes(d);
          return (
            <button key={d} onClick={() => onPatch({ days: on ? row.days.filter((x) => x !== d) : [...row.days, d] as Day[] })}
              aria-pressed={on} aria-label={DAY_LABEL[d]}
              style={{
                width: 30, height: 26, borderRadius: 7, fontSize: 10.5, fontWeight: 700,
                border: `1px solid ${on ? accent : 'var(--line2)'}`,
                background: on ? `color-mix(in srgb, ${accent} 22%, transparent)` : 'transparent',
                color: on ? 'var(--tx)' : 'var(--tx3)',
              }}>
              {DAY_LABEL[d][0]}{d === 'thu' || d === 'sun' || d === 'sat' ? DAY_LABEL[d][1].toLowerCase() : ''}
            </button>
          );
        })}

        <input type="time" value={row.start} onChange={(e) => onPatch({ start: e.target.value })} aria-label="Starts"
          style={{ ...TIME_INPUT, marginLeft: phone ? 0 : 6 }} />
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>to</span>
        <input type="time" value={row.end} onChange={(e) => onPatch({ end: e.target.value })} aria-label="Ends"
          style={TIME_INPUT} />

        <input value={row.location} onChange={(e) => onPatch({ location: e.target.value })} placeholder="Room"
          aria-label="Room" style={{ width: 96, fontSize: 11, color: 'var(--tx2)' }} />

        {/* The kind carries the colour, so there is one control rather than
            two that have to be kept in agreement. */}
        <select value={row.kind} aria-label="What sort of block this is"
          onChange={(e) => {
            const k = e.target.value as Kind;
            onPatch({ kind: k, color: KIND_COLOR[k] });
          }}
          style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
            border: `1px solid ${row.color}`, background: `color-mix(in srgb, ${row.color} 16%, transparent)`,
            color: 'var(--tx)',
          }}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </div>

      {(row.problems.length > 0 || unsure || row.raw) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, flexWrap: 'wrap' }}>
          {row.problems.map((p) => (
            <span key={p} style={{ fontWeight: 700, color: 'var(--pal-coral)' }}>{p}</span>
          ))}
          {row.problems.length === 0 && unsure && (
            <span style={{ fontWeight: 700, color: 'var(--pal-amber)' }}>Not sure it read this right — worth a look</span>
          )}
          {row.raw && (
            <button onClick={() => setShowRaw((v) => !v)} className="k-underline"
              style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>
              {showRaw ? 'hide what it saw' : 'what it saw'}
            </button>
          )}
        </div>
      )}

      {showRaw && row.raw && (
        <div style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 10.5, lineHeight: 1.6, color: 'var(--tx3)',
          padding: '7px 9px', borderRadius: 8, background: 'var(--card)', whiteSpace: 'pre-wrap',
        }}>
          {row.raw}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- helpers */

const DATE_INPUT: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 8, border: '1px solid var(--line2)',
  fontSize: 11.5, fontWeight: 600, color: 'var(--tx)', background: 'var(--card2)',
};
const TIME_INPUT: React.CSSProperties = {
  width: 92, padding: '5px 7px', borderRadius: 7, border: '1px solid var(--line2)',
  fontSize: 11, fontWeight: 600, color: 'var(--tx)', background: 'var(--card)',
};

/**
 * Shrink to something the model can still read but the wire can carry. Small
 * text is the thing that gets lost, so the long edge only comes down to 2000px
 * — enough for a phone photo of an A4 sheet — and the JPEG is barely
 * compressed. A screenshot that is already small is sent untouched.
 */
async function downscale(file: File): Promise<{ dataUrl: string; base64: string; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const max = Math.max(bitmap.width, bitmap.height);
  const scale = max > 2000 ? 2000 / max : 1;

  const cv = document.createElement('canvas');
  cv.width = Math.round(bitmap.width * scale);
  cv.height = Math.round(bitmap.height * scale);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Could not read that image');
  ctx.drawImage(bitmap, 0, 0, cv.width, cv.height);
  bitmap.close();

  const dataUrl = cv.toDataURL('image/jpeg', 0.94);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'image/jpeg' };
}
