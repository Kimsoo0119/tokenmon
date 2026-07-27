const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseEvent } = require('../src/events');

test('parseEvent: type 있는 이벤트', () =>
  assert.deepEqual(parseEvent('{"type":"start"}'), { type: 'start', message: '', session: '', project: '' }));
test('parseEvent: session 포함', () =>
  assert.deepEqual(parseEvent('{"type":"start","session":"abc"}'), { type: 'start', message: '', session: 'abc', project: '' }));
test('parseEvent: project 포함', () =>
  assert.deepEqual(parseEvent('{"type":"done","project":"tokenmon"}'), { type: 'done', message: '', session: '', project: 'tokenmon' }));
test('parseEvent: type + message', () =>
  assert.deepEqual(parseEvent('{"type":"waiting","message":"권한 필요"}'), { type: 'waiting', message: '권한 필요', session: '', project: '' }));
test('parseEvent: type 없으면 notify (하위 호환)', () =>
  assert.deepEqual(parseEvent('{"message":"hello"}'), { type: 'notify', message: 'hello', session: '', project: '' }));
test('parseEvent: 모르는 type은 notify', () =>
  assert.deepEqual(parseEvent('{"type":"weird","message":"m"}'), { type: 'notify', message: 'm', session: '', project: '' }));
test('parseEvent: JSON 아니면 줄 자체가 메시지', () =>
  assert.deepEqual(parseEvent('  plain text '), { type: 'notify', message: 'plain text', session: '', project: '' }));
test('parseEvent: message 길이 80자 제한', () =>
  assert.equal(parseEvent(`{"message":"${'a'.repeat(200)}"}`).message.length, 80));
