import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { contrastRatio, readableInk, normalizeHex, hexToHsv, hsvToHex } from './calendarAppearance.ts';
import { calendarTask, snapCalendarHour, slotClickCreates } from './calendarPlanning.ts';
import { deleteGoogleOccurrence, googleCalendarId, googleOccurrence, GoogleAuthorizationError } from './googleCalendarApi.ts';

test('automatic ink meets 4.5:1 on saturated, pastel, neutral and arbitrary solid fills', () => {
  for (let n = 0; n <= 0xffffff; n += 7919) {
    const color = `#${n.toString(16).padStart(6, '0')}`;
    assert.ok(contrastRatio(color, readableInk(color)) >= 4.5, color);
  }
  for (const color of ['#d50000', '#e67c73', '#f4511e', '#f6bf26', '#33b679', '#0b8043', '#039be5', '#3f51b5', '#7986cb', '#8e24aa', '#616161']) {
    assert.ok(contrastRatio(color, readableInk(color)) >= 4.5, color);
  }
});
test('wheel and hex round-trip white, black, grays and arbitrary colors without drift', () => {
  for (const color of ['#000000', '#ffffff', '#777777', '#4285f4', '#ffeedd', '#e67c73']) assert.equal(hsvToHex(hexToHsv(color)), color);
  assert.equal(normalizeHex(' AbC '), '#aabbcc');
  assert.equal(normalizeHex('#4285F4'), '#4285f4');
  for (const bad of ['#12', '#abcdefg', 'red', '#12345678', '']) assert.equal(normalizeHex(bad), null);
});
test('desktop pointer release owns creation; its following click must not create again', () => {
  assert.equal(slotClickCreates(false, 1), false);
  assert.equal(slotClickCreates(false, 2), false);
  assert.equal(slotClickCreates(false, 0), true);
  assert.equal(slotClickCreates(true, 1), true);
});
test('tasks snap into the last valid slot without rolling into another day', () => {
  assert.equal(snapCalendarHour(23.99), 23);
  assert.equal(snapCalendarHour(-1), 0);
  assert.equal(snapCalendarHour(10.27), 10.5);
  assert.equal(snapCalendarHour(24, .5), 23.5);
});
test('Canvas study plans preserve real deadlines and survive later sync updates', () => {
  const original = { id: 'canvas', source: 'canvas_lms', due_on: '2026-10-04', due_at: '2026-10-04T13:00:00Z' };
  const plans = { canvas: { date: '2026-10-03', starts_at: '2026-10-03T01:00:00Z' } };
  const projected = calendarTask(original, plans);
  assert.equal(original.due_at, '2026-10-04T13:00:00Z');
  assert.equal(projected.due_at, plans.canvas.starts_at);
  assert.equal(projected.due_on, plans.canvas.date);
  assert.equal(projected.calendar_original_due_at, original.due_at);
  assert.equal(calendarTask({ ...original, due_at: '2026-10-05T13:00:00Z' }, plans).calendar_original_due_at, '2026-10-05T13:00:00Z');
  assert.equal(calendarTask(original, { canvas: { date: '2026-10-04', starts_at: null } }).due_at, null);
  assert.equal(calendarTask({ ...original, source: null }, plans).due_at, original.due_at);
});
test('Google calendar identity is read only from a genuine Google iCal URL', () => {
  assert.equal(googleCalendarId('https://calendar.google.com/calendar/ical/a%40group.calendar.google.com/private-abc/basic.ics'), 'a@group.calendar.google.com');
  assert.equal(googleCalendarId('https://evil.test/calendar/ical/a/private/basic.ics'), null);
  assert.deepEqual(googleOccurrence('event@google.com@20261004T130000Z'), { uid: 'event@google.com', originalStart: '2026-10-04T13:00:00Z' });
  assert.deepEqual(googleOccurrence('event@google.com'), { uid: 'event@google.com' });
});
test('Super Delete resolves the API ID, never sends the iCal UID as the deletion ID', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), init });
    return init?.method === 'DELETE' ? new Response(null, { status: 204 })
      : Response.json({ items: [{ id: 'google-api-id', iCalUID: 'event@google.com', etag: 'v1' }] });
  }) as typeof fetch;
  await deleteGoogleOccurrence({ token: 'test', calendarId: 'calendar@example.com', externalId: 'event@google.com', fetcher });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes('iCalUID=event%40google.com'));
  assert.ok(calls[1].url.includes('/google-api-id?sendUpdates=none'));
  assert.equal((calls[1].init?.headers as Record<string, string>)['If-Match'], 'v1');
});
test('recurring Super Delete deletes exactly the original occurrence, including a moved instance', async () => {
  const deletes: string[] = [];
  const fetcher = (async (url, init) => {
    const path = String(url);
    if (init?.method === 'DELETE') { deletes.push(path); return new Response(null, { status: 204 }); }
    if (path.includes('/instances?')) return Response.json({ items: [{ id: 'instance-id', originalStartTime: { dateTime: '2026-10-04T21:00:00+08:00' } }] });
    return Response.json({ items: [{ id: 'master-id', iCalUID: 'series@google.com', recurrence: ['RRULE:FREQ=DAILY'] }] });
  }) as typeof fetch;
  await deleteGoogleOccurrence({ token: 'test', calendarId: 'calendar', externalId: 'series@google.com@20261004T130000Z', fetcher });
  assert.equal(deletes.length, 1);
  assert.ok(deletes[0].includes('/instance-id?'));
});
test('unknown occurrence, recurring master, denied scope and ambiguous matches never delete', async () => {
  for (const mode of ['unknown', 'series', 'denied', 'ambiguous']) {
    let deletes = 0;
    const fetcher = (async (_url, init) => {
      if (init?.method === 'DELETE') deletes++;
      if (mode === 'denied') return Response.json({ error: { errors: [{ reason: 'insufficientPermissions' }] } }, { status: 403 });
      const event = { id: 'master', iCalUID: 'uid', ...(mode === 'series' ? { recurrence: ['RRULE:FREQ=DAILY'] } : {}) };
      return Response.json({ items: mode === 'unknown' ? [] : mode === 'ambiguous' ? [event, event] : [event] });
    }) as typeof fetch;
    await assert.rejects(deleteGoogleOccurrence({ token: 'test', calendarId: 'calendar', externalId: 'uid', fetcher }), mode === 'denied' ? GoogleAuthorizationError : Error);
    assert.equal(deletes, 0);
  }
});
