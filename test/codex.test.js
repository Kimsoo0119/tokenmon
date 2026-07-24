const { test } = require('node:test');
const assert = require('node:assert/strict');
const { weeklyFromJsonl } = require('../src/usage/codex');

const FIXTURE = [
  '{"timestamp":"t","type":"event_msg","payload":{"type":"agent_message"}}',
  '{"timestamp":"t","type":"event_msg","payload":{"type":"token_count","info":{},"rate_limits":{"limit_id":"codex","primary":{"used_percent":40.0,"window_minutes":300},"secondary":{"used_percent":6.0,"window_minutes":10080}}}}',
  '{"timestamp":"t","type":"event_msg","payload":{"type":"token_count","info":{},"rate_limits":{"limit_id":"codex","primary":{"used_percent":41.0,"window_minutes":300},"secondary":{"used_percent":7.5,"window_minutes":10080}}}}',
].join('\n');

test('가장 마지막 스냅샷의 주간 %를 반환', () => assert.equal(weeklyFromJsonl(FIXTURE), 7.5));
test('rate_limits 없으면 null', () => assert.equal(weeklyFromJsonl('{"a":1}\n{"b":2}'), null));
test('깨진 줄은 건너뛰고 이전 스냅샷 사용', () =>
  assert.equal(weeklyFromJsonl(FIXTURE + '\n{broken rate_limits'), 7.5));
test('빈 문자열 → null', () => assert.equal(weeklyFromJsonl(''), null));
