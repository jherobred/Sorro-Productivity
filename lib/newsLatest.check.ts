import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carriedLabel, dayBefore, latestPerKind } from './newsLatest.ts';

const row = (kind: string, edition: string, created_at = `${edition}T00:00:00Z`) => ({ kind, edition, created_at });

test('a section that has not come today shows its last edition; one that has, shows today’s', () => {
  const rows = [row('ai-digest', '2026-11-14'), row('ai-digest', '2026-11-15'), row('jobs', '2026-11-14'), row('jobs', '2026-11-12'), row('gaming', '2026-11-01')];
  const got = latestPerKind(rows, '2026-11-15').map(r => `${r.kind} ${r.edition}`).sort();
  assert.deepEqual(got, ['ai-digest 2026-11-15', 'jobs 2026-11-14']);
});
test('of two drops on the same day the later one wins, and tomorrow’s is never shown early', () => {
  const rows = [row('trending', '2026-11-15', '2026-11-15T01:00:00Z'), row('trending', '2026-11-15', '2026-11-15T03:00:00Z'), row('research', '2026-11-16')];
  assert.deepEqual(latestPerKind(rows, '2026-11-15'), [rows[1]]);
});
test('day arithmetic crosses months, and the label reads plainly', () => {
  assert.equal(dayBefore('2026-12-01', 1), '2026-11-30');
  assert.equal(carriedLabel('2026-11-14', '2026-11-15'), 'yesterday');
  assert.equal(carriedLabel('2026-11-11', '2026-11-15'), 'Wed, Nov 11');
});
