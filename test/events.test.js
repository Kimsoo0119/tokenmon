const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseEvent } = require('../src/events');

test('parseEvent: type 있는 이벤트', () =>
  assert.deepEqual(parseEvent('{"type":"start"}'), { type: 'start', message: '' }));
test('parseEvent: type + message', () =>
  assert.deepEqual(parseEvent('{"type":"waiting","message":"권한 필요"}'), { type: 'waiting', message: '권한 필요' }));
test('parseEvent: type 없으면 notify (하위 호환)', () =>
  assert.deepEqual(parseEvent('{"message":"hello"}'), { type: 'notify', message: 'hello' }));
test('parseEvent: 모르는 type은 notify', () =>
  assert.deepEqual(parseEvent('{"type":"weird","message":"m"}'), { type: 'notify', message: 'm' }));
test('parseEvent: JSON 아니면 줄 자체가 메시지', () =>
  assert.deepEqual(parseEvent('  plain text '), { type: 'notify', message: 'plain text' }));
test('parseEvent: message 길이 80자 제한', () =>
  assert.equal(parseEvent(`{"message":"${'a'.repeat(200)}"}`).message.length, 80));
