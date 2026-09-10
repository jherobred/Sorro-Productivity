import test from 'node:test';
import assert from 'node:assert/strict';
import { readStrokes, strokePath } from './ink.ts';
import { validateIntegration } from './integrationValidation.ts';
import { parseCommunityLink, publicLink, gmailCompose } from './sharing.ts';

test('ink recovery rejects malformed coordinates and preserves valid strokes', () => {
  const valid = { id: 'stroke', color: '#123456', width: 3, points: [[0, 0], [-1.25, 4]] };
  assert.deepEqual(readStrokes([valid, { ...valid, points: [[NaN, 1]] }, { ...valid, width: -1 }, null]), [valid]);
  assert.deepEqual(readStrokes({}), []);
  assert.deepEqual(readStrokes(JSON.parse(JSON.stringify([valid]))), [valid]);
});

test('ink paths handle a tap and round long drawing coordinates', () => {
  assert.equal(strokePath([]), '');
  assert.equal(strokePath([[4, 8]]), 'M4 8l.01 .01');
  assert.equal(strokePath([[0.123456, -1.23456], [4, 9]]), 'M0.12 -1.23 L4 9');
});

test('Canvas validation rejects missing tokens, credentials and course URLs', () => {
  assert.equal(validateIntegration('canvas_lms', { base_url: 'https://school.instructure.com', token: 'token' }), null);
  for (const base_url of ['http://school.test', 'https://u:p@school.test', 'https://school.test/courses/1', 'school.test']) {
    assert.ok(validateIntegration('canvas_lms', { base_url, token: 'token' }));
  }
  assert.ok(validateIntegration('canvas_lms', { base_url: 'https://school.test', token: ' ' }));
});

test('Google Calendar accepts an ICS feed, not the calendar UI', () => {
  assert.equal(validateIntegration('gcal_ics', { ics_url: 'https://calendar.google.com/calendar/ical/example/private-secret/basic.ics' }), null);
  for (const ics_url of ['https://calendar.google.com/calendar/u/0/r', 'https://calendar.google.com.evil.test/feed.ics', 'javascript:alert(1)']) {
    assert.ok(validateIntegration('gcal_ics', { ics_url }));
  }
});

test('shared community links accept current and legacy separators', () => {
  assert.deepEqual(parseCommunityLink('#photo-123-abc'), { kind: 'photo', id: '123-abc' });
  assert.deepEqual(parseCommunityLink('#discussion:123-abc'), { kind: 'discussion', id: '123-abc' });
  assert.equal(parseCommunityLink('#unknown-123'), null);
  assert.equal(parseCommunityLink('#photo-../123'), null);
  assert.equal(new URL(publicLink('/community/#photo-123')).pathname, '/community/');
  assert.equal(new URL(publicLink('/community/#photo-123')).protocol, 'https:');
});

test('Gmail drafts preserve text without turning it into query parameters', () => {
  const url = new URL(gmailCompose('A & B?', 'First line\nhello + world & cc=someone'));
  assert.equal(url.searchParams.get('su'), 'A & B?');
  assert.equal(url.searchParams.get('body'), 'First line\nhello + world & cc=someone');
  assert.equal(url.searchParams.has('cc'), false);
});

