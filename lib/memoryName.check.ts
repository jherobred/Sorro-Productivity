import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMemoryName, decodeMemoryName, encodeRoute, decodeRoute, simplifyRoute, routeKm, distanceKm, type MemoryInfo } from './memoryName.ts';

const base: MemoryInfo = {
  id: '6f1c2e8a-3b4d-4c5e-9f60-718293a4b5c6', kind: 'meal', at: Date.UTC(2026, 8, 15, 4, 30),
  lat: 14.60965, lng: 120.98945, place: 'Jollibee España', caption: 'Chickenjoy after lab 🍗', ref: 'meal:1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5',
  photo: true, km: null, minutes: null, route: null,
};

test('a memory survives the round trip through a storage name', () => {
  const name = encodeMemoryName(base);
  assert.match(name, /^[0-9a-f-]{36},meal,\d+,14\.60965,120\.98945,[A-Za-z0-9_-]+\.webp$/);
  assert.ok(name.length < 400);
  assert.deepEqual(decodeMemoryName(name), base);
});

test('no location, no photo, a run with a route', () => {
  const route: [number, number][] = Array.from({ length: 120 }, (_, i) => [14.6 + i * 0.0004, 120.99 + Math.sin(i / 6) * 0.0006]);
  const run: MemoryInfo = { ...base, kind: 'run', lat: null, lng: null, caption: '', ref: null, photo: false, km: 5.237, minutes: 31.4, route };
  const decoded = decodeMemoryName(encodeMemoryName(run))!;
  assert.equal(decoded.lat, null);
  assert.equal(decoded.photo, false);
  assert.equal(decoded.km, 5.24);
  assert.equal(decoded.minutes, 31);
  assert.ok(decoded.route!.length <= 24 && decoded.route!.length >= 2);
  assert.ok(Math.abs(routeKm(decoded.route!) - routeKm(route)) / routeKm(route) < 0.05);
  assert.ok(encodeMemoryName(run).length < 700);
});

test('long words are cut to fit, and anything unreadable is refused', () => {
  const long = encodeMemoryName({ ...base, caption: 'é'.repeat(500), place: 'p'.repeat(300) });
  assert.ok(long.length < 700);
  assert.equal(decodeMemoryName('not-a-memory.webp'), null);
  assert.equal(decodeMemoryName(`${base.id},meal,1,x,x,@@@.webp`), null);
});

test('routes encode like Google polylines', () => {
  assert.equal(encodeRoute([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(decodeRoute('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.equal(simplifyRoute([[0, 0], [0, 1]], 5).length, 2);
  assert.ok(Math.abs(distanceKm([14.5995, 120.9842], [14.6091, 120.9894]) - 1.2) < 0.1);
});
