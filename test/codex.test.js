const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { weeklyFromJsonl, usageFromJsonl, fetchCodexWeekly } = require('../src/usage/codex');

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

test('usageFromJsonl: 5시간/주간 %와 리셋 시각(ms) 반환', () => {
  const line = JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: {
    primary: { used_percent: 40, window_minutes: 300, resets_at: 1783768016 },
    secondary: { used_percent: 6, window_minutes: 10080, resets_at: 1784354816 },
  } } });
  assert.deepEqual(usageFromJsonl(line), {
    fiveHour: { pct: 40, resetsAt: 1783768016000 },
    weekly: { pct: 6, resetsAt: 1784354816000 },
  });
});

test('usageFromJsonl: resets_at 없으면 null, primary 없어도 weekly는 반환', () => {
  const line = JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: {
    secondary: { used_percent: 7.5, window_minutes: 10080 },
  } } });
  assert.deepEqual(usageFromJsonl(line), { fiveHour: null, weekly: { pct: 7.5, resetsAt: null } });
});

test('fetchCodexWeekly: 세션 디렉토리 없으면 null', async () => {
  assert.equal(await fetchCodexWeekly(path.join(os.tmpdir(), 'tokemon-no-such-dir-' + Date.now())), null);
});

test('fetchCodexWeekly: 최신 파일의 스냅샷을 읽음', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokemon-codex-'));
  const sub = path.join(dir, '2026', '07');
  fs.mkdirSync(sub, { recursive: true });
  const line = (pct) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { secondary: { used_percent: pct, window_minutes: 10080 } } } });
  fs.writeFileSync(path.join(sub, 'old.jsonl'), line(3));
  fs.writeFileSync(path.join(sub, 'new.jsonl'), line(9));
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(sub, 'old.jsonl'), past, past);
  assert.equal(await fetchCodexWeekly(dir), 9);
});

test('fetchCodexWeekly: rate_limits 없는 최신 파일은 건너뛰고 이전 파일 사용', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokemon-codex-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.jsonl'), JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { secondary: { used_percent: 4, window_minutes: 10080 } } } }));
  fs.writeFileSync(path.join(dir, 'b.jsonl'), '{"no":"limits"}');
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(dir, 'a.jsonl'), past, past);
  assert.equal(await fetchCodexWeekly(dir), 4);
});
