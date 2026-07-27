const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadConfig, saveConfig, DEFAULTS, cachedUsage } = require('../src/config');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tokemon-')), 'config.json');

test('없는 파일 → 기본값', () => {
  const cfg = loadConfig(path.join(os.tmpdir(), 'tokemon-none-' + Date.now() + '.json'));
  assert.equal(cfg.source, 'claude');
  assert.equal(cfg.pollIntervalMin, DEFAULTS.pollIntervalMin);
  assert.deepEqual(cfg.monsters, {});
});
test('저장 후 로드 왕복', () => {
  const f = tmp();
  saveConfig(f, { ...DEFAULTS, source: 'codex' });
  assert.equal(loadConfig(f).source, 'codex');
});
test('깨진 JSON → 기본값', () => {
  const f = tmp();
  fs.writeFileSync(f, '{corrupt');
  assert.equal(loadConfig(f).source, 'claude');
});
test('부분 저장된 설정에 기본값 병합', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ source: 'codex' }));
  assert.equal(loadConfig(f).pollIntervalMin, DEFAULTS.pollIntervalMin);
});
test('loadConfig 결과 변형이 DEFAULTS를 오염시키지 않음', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ source: 'codex' }));
  const cfg = loadConfig(f);
  cfg.monsters.x = { displayName: 'x' };
  assert.deepEqual(DEFAULTS.monsters, {});
});

const usage = { weekly: { pct: 38, resetsAt: 1 }, fiveHour: { pct: 22, resetsAt: 2 } };

test('사용량 캐시: 같은 소스면 그대로 쓴다', () => {
  const cfg = { source: 'claude', lastUsage: usage, lastUsageSource: 'claude' };
  assert.equal(cachedUsage(cfg), usage);
});
test('사용량 캐시: 소스가 바뀌었으면 버린다', () => {
  const cfg = { source: 'codex', lastUsage: usage, lastUsageSource: 'claude' };
  assert.equal(cachedUsage(cfg), null);
});
test('사용량 캐시: 소스 표시가 없는 예전 설정도 버린다', () => {
  const cfg = { source: 'claude', lastUsage: usage, lastUsageSource: null };
  assert.equal(cachedUsage(cfg), null);
});
test('사용량 캐시: 값이 없으면 null', () => {
  assert.equal(cachedUsage({ source: 'claude', lastUsage: null, lastUsageSource: 'claude' }), null);
  assert.equal(cachedUsage({ source: 'claude', lastUsage: {}, lastUsageSource: 'claude' }), null);
});
