import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyText } from './ocr.ts';

test('the reader’s text keeps its lines and loses its stray marks', () => {
  assert.equal(tidyText('  O(1)   constant time \n\n\n\n O(n) linear time\n|  ~ \n'), 'O(1) constant time\n\nO(n) linear time');
  assert.equal(tidyText('— . —\n\nKumusta, CS 191'), 'Kumusta, CS 191');
  assert.equal(tidyText('   \n  '), '');
});
