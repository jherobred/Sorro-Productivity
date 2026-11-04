import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSse } from './sse.ts';

test('an event split across reads waits for its blank line', () => {
  const a = splitSse('event: text\ndata: "Hel');
  assert.deepEqual(a.events, []);
  const b = splitSse(a.rest + 'lo"\n\nevent: done\n');
  assert.deepEqual(b.events, [{ event: 'text', data: '"Hello"' }]);
  assert.equal(b.rest, 'event: done\n');
});
test('CRLF line endings parse the same', () => {
  assert.deepEqual(splitSse('data: {"a":1}\r\n\r\n').events, [{ event: 'message', data: '{"a":1}' }]);
});
test('several data lines join with a newline', () => {
  assert.deepEqual(splitSse('data: a\ndata: b\n\n').events, [{ event: 'message', data: 'a\nb' }]);
});
