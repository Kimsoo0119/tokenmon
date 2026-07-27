const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadConfig, saveConfig, DEFAULTS, cachedUsage, isCacheFresh } = require('../src/config');

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

const claudeUsage = { weekly: { pct: 38, resetsAt: 1 }, fiveHour: { pct: 22, resetsAt: 2 } };
const codexUsage = { weekly: { pct: 8, resetsAt: 3 }, fiveHour: { pct: 2, resetsAt: 4 } };
const bothCached = (at = 1000) => ({
  source: 'claude',
  usageCache: { claude: { usage: claudeUsage, at }, codex: { usage: codexUsage, at } },
});

test('사용량 캐시: 소스별로 따로 꺼내온다', () => {
  const cfg = bothCached();
  assert.equal(cachedUsage(cfg), claudeUsage);
  assert.equal(cachedUsage(cfg, 'codex'), codexUsage);
});
test('사용량 캐시: 없는 소스는 null', () => {
  assert.equal(cachedUsage({ source: 'codex', usageCache: {} }), null);
  assert.equal(cachedUsage({ source: 'codex', usageCache: { codex: { usage: {}, at: 1 } } }), null);
});
test('캐시 신선도: 주기 안이면 다시 조회하지 않는다', () => {
  const cfg = bothCached(1000);
  assert.equal(isCacheFresh(cfg, 'claude', 5 * 60_000, 1000 + 4 * 60_000), true);
});
test('캐시 신선도: 주기가 지나면 다시 조회한다', () => {
  const cfg = bothCached(1000);
  assert.equal(isCacheFresh(cfg, 'claude', 5 * 60_000, 1000 + 5 * 60_000), false);
  assert.equal(isCacheFresh(cfg, 'claude', 5 * 60_000, 1000 + 9 * 60_000), false);
});
test('캐시 신선도: 받아둔 값이 없으면 false', () => {
  assert.equal(isCacheFresh({ source: 'codex', usageCache: {} }, 'codex', 5 * 60_000, 1000), false);
  const noTime = { source: 'claude', usageCache: { claude: { usage: claudeUsage } } };
  assert.equal(isCacheFresh(noTime, 'claude', 5 * 60_000, 1000), false);
});
test('예전 단일 캐시 필드는 읽을 때 걷어낸다', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ source: 'codex', lastUsage: claudeUsage, lastUsageSource: 'claude' }));
  const cfg = loadConfig(f);
  assert.equal('lastUsage' in cfg, false);
  assert.equal('lastUsageSource' in cfg, false);
  assert.deepEqual(cfg.usageCache, {});
});
