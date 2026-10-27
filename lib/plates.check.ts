import test from 'node:test';
import assert from 'node:assert/strict';
import { companionsOf, initials, isDrink, mentions, momentsOf, placesOf, platesFrom, type PlateMemory } from './plates.ts';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const mem = (id: string, when: number, place: string, caption = '', ref: string | null = null): PlateMemory =>
  ({ id, at: when, place, caption, ref, lat: null, lng: null, photo: true });

test('mentions and drinks', () => {
  assert.deepEqual(mentions('lunch with @pauline and @Tita_Wena, @Pauline again.'), ['Pauline', 'Tita Wena']);
  assert.equal(isDrink('Iced coffee'), true);
  assert.equal(isDrink('Fried chicken wings with rice'), false);
});

test('a memory takes its meal name, and a meal without a memory still becomes a plate', () => {
  const plates = platesFrom(
    [mem('a', at(8, 19), 'Kiel’s Home', 'Sarap @Jerox', 'meal:m1')],
    [{ id: 'm1', on_date: '2026-10-08', name: 'Sinigang', slot: 'Dinner', photo_path: null, place: null },
     { id: 'm2', on_date: '2026-10-07', name: 'Tapsilog', slot: 'Breakfast', photo_path: '/food/silog.svg', place: 'Canteen' }],
  );
  assert.deepEqual(plates.map((p) => [p.id, p.name, p.note, p.people.join()]), [['a', 'Sinigang', 'Sarap @Jerox', 'Jerox'], ['m2', 'Tapsilog', '', '']]);
  assert.equal(new Date(plates[1].at).getHours(), 8);
  assert.equal(plates[1].art, '/food/silog.svg');
});

test('moments join the same place on the same day within the gap', () => {
  const plates = platesFrom([
    mem('1', at(8, 19, 45), 'Home'), mem('2', at(8, 19, 0), 'home '), mem('3', at(8, 15, 0), 'Home'),
    mem('4', at(8, 14, 50), 'SM Marilao'), mem('5', at(7, 23, 59), 'SM Marilao'),
  ], []);
  const moments = momentsOf(plates);
  assert.deepEqual(moments.map((m) => m.plates.map((p) => p.id).join('')), ['12', '3', '4', '5']);
  assert.equal(moments[0].at, at(8, 19, 0));
  const places = placesOf(moments);
  assert.deepEqual(places.map((p) => [p.key, p.visits]), [['home', 2], ['sm marilao', 2]]);
});

test('companions count shared tables, and stamp letters', () => {
  const moments = momentsOf(platesFrom([mem('1', at(9, 12), 'A', 'with @pauline'), mem('2', at(9, 12, 20), 'A', '@Pauline @jerox yum'), mem('3', at(10, 12), 'B', '@pauline')], []));
  assert.deepEqual(companionsOf(moments).map((c) => [c.name, c.tables]), [['Pauline', 2], ['Jerox', 1]]);
  assert.equal(companionsOf(moments)[1].note, 'yum');
  assert.equal(initials('Pauline home'), 'PH');
  assert.equal(initials('Mcdo'), 'M');
  assert.equal(initials('Coffee Arabica - Drive'), 'CA');
  assert.equal(initials("Kiel's Home"), 'KH');
});
