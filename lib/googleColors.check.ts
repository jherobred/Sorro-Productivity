import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorChanges, colorFor, colorMap, occurrenceKey, GOOGLE_EVENT_COLORS } from './googleColors.ts';

test('a single event is keyed by its UID; an occurrence by UID and its original start in UTC', () => {
  assert.equal(occurrenceKey({ iCalUID: 'a@google.com' }), 'a@google.com');
  assert.equal(occurrenceKey({ iCalUID: 'b@google.com', recurringEventId: 'b', originalStartTime: { dateTime: '2026-11-16T09:00:00+08:00' } }), 'b@google.com@20261116T010000Z');
  assert.equal(occurrenceKey({ iCalUID: 'c@google.com', recurringEventId: 'c', originalStartTime: { date: '2026-11-16' } }), 'c@google.com@20261116T000000Z');
  assert.equal(occurrenceKey({}), null);
});

test('colorIds become the colors Google shows; no colorId takes the calendar color when known', () => {
  const m = colorMap([
    { iCalUID: 'a', colorId: '11' },
    { iCalUID: 'b' },
    { iCalUID: 'x', colorId: '2', status: 'cancelled' },
  ], '#9fe1e7');
  assert.equal(m.get('a'), GOOGLE_EVENT_COLORS['11']);
  assert.equal(m.get('b'), '#9fe1e7');
  assert.equal(m.has('x'), false);
  assert.equal(colorMap([{ iCalUID: 'b' }]).size, 0);
});

test('an occurrence matches exactly, else its series', () => {
  const m = colorMap([
    { iCalUID: 's', colorId: '5', recurringEventId: 's', originalStartTime: { dateTime: '2026-11-16T01:00:00Z' } },
    { iCalUID: 's', colorId: '3', recurringEventId: 's', originalStartTime: { dateTime: '2026-11-17T01:00:00Z' } },
  ]);
  assert.equal(colorFor(m, 's@20261117T010000Z'), GOOGLE_EVENT_COLORS['3']);
  assert.equal(colorFor(m, 's@20270101T010000Z'), GOOGLE_EVENT_COLORS['5']);
  assert.equal(colorFor(m, 'other'), null);
});

test('only rows whose color differs are changed, grouped by color', () => {
  const m = colorMap([{ iCalUID: 'a', colorId: '11' }, { iCalUID: 'b', colorId: '11' }, { iCalUID: 'c', colorId: '2' }]);
  const out = colorChanges([
    { id: '1', external_id: 'a', color: '#38BDF8' },
    { id: '2', external_id: 'b', color: '#38BDF8' },
    { id: '3', external_id: 'c', color: '#33b679' },
    { id: '4', external_id: 'z', color: '#38BDF8' },
  ], m);
  assert.deepEqual([...out.entries()], [[GOOGLE_EVENT_COLORS['11'], ['1', '2']]]);
});
