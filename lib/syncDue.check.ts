/**
 * Self-check for lib/syncDue.ts — the rule that decides whether Canvas and
 * Google Calendar get another Edge Function invocation.
 *
 *   node --test lib/syncDue.check.ts
 */

import assert from 'node:assert/strict';
import { dueKinds, AUTO_SYNC_MS, type DueRow } from './syncDue.ts';

const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const on = (kind: string, last_sync_at: string | null): DueRow => ({ kind, enabled: true, last_sync_at });

/* the stored floor -------------------------------------------------------- */
{
  assert.deepEqual(dueKinds([on('canvas_lms', null)], {}, NOW), ['canvas_lms'],
    'never synced is due');

  assert.deepEqual(dueKinds([on('canvas_lms', ago(AUTO_SYNC_MS + 1))], {}, NOW), ['canvas_lms'],
    'past the interval is due');

  assert.deepEqual(dueKinds([on('canvas_lms', ago(60_000))], {}, NOW), [],
    'synced a minute ago is not due');

  assert.deepEqual(dueKinds([{ kind: 'gcal_ics', enabled: false, last_sync_at: null }], {}, NOW), [],
    'a switched-off connection is never due');
}

/* the local floor — the one a failing sync needs --------------------------- */
{
  // The Edge Function leaves last_sync_at alone when it throws, so this row
  // looks "never synced" for ever. Without the attempt floor, every focus
  // event fires another invocation into the same failure.
  const failing = [on('canvas_lms', null)];

  assert.deepEqual(dueKinds(failing, {}, NOW), ['canvas_lms'], 'first attempt goes');
  assert.deepEqual(dueKinds(failing, { canvas_lms: NOW }, NOW + 3_000), [],
    'a switch back three seconds later does not retry');
  assert.deepEqual(dueKinds(failing, { canvas_lms: NOW }, NOW + AUTO_SYNC_MS), ['canvas_lms'],
    'but half an hour later it tries again');
}

/* a corrupt stamp must not freeze syncing --------------------------------- */
{
  assert.deepEqual(dueKinds([on('gcal_ics', 'not a date')], {}, NOW), ['gcal_ics'],
    'an unparseable last_sync_at is due, not never-due');
}

/* both connections, independently ----------------------------------------- */
{
  const rows = [on('canvas_lms', null), on('gcal_ics', ago(60_000))];
  assert.deepEqual(dueKinds(rows, {}, NOW), ['canvas_lms'],
    'one being due does not drag the other along');
}

console.log('syncDue.check.ts ok');
