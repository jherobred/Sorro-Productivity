import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherCode } from './weather.ts';

test('known WMO codes read as words', () => {
  assert.equal(weatherCode(0), 'Clear');
  assert.equal(weatherCode(3), 'Overcast');
  assert.equal(weatherCode(63), 'Rain');
  assert.equal(weatherCode(95), 'Thunderstorm');
});
test('an unknown code still says something true', () => {
  assert.equal(weatherCode(1234), 'Weather');
});
