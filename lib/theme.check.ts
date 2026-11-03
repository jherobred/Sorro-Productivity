import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme } from './theme.ts';

test('explicit theme wins', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
test('system follows the OS', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});
test('unknown saved value falls back to system', () => {
  assert.equal(resolveTheme('sepia' as never, true), 'dark');
});
