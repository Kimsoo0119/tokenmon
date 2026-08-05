const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  loadConfig, saveConfig, saveConfigPreserving, DEFAULTS, isCustomId, cachedUsage, isCacheFresh,
} = require('../src/config');

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

test('isCustomId: 직접 만든 몬스터만 참', () => {
  assert.equal(isCustomId('custom-내펫'), true);
  assert.equal(isCustomId('pichu-pikachu-raichu'), false);
});

test('도감 기록이 없던 설정에도 빈 기록이 생긴다', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ source: 'codex' }));
  assert.deepEqual(loadConfig(f).dex, { seen: {}, caught: {} });
});
test('도감 기록이 반쪽이면 나머지를 채운다', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ dex: { seen: { pichu: 1 } } }));
  const dex = loadConfig(f).dex;
  assert.deepEqual(dex.seen, { pichu: 1 });
  assert.deepEqual(dex.caught, {});
});

// id를 '-'로 쪼개는 방식으로는 되살릴 수 없는 종들이라 회귀를 막아둔다
const withGifs = (id, ...gifs) => ({
  monsters: { [id]: { displayName: 'x', stages: gifs.map((g) => ({ name: 'x', gif: g })) } },
});

test('스프라이트 경로에서 슬러그를 되살린다', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify(withGifs('mime-jr-mr-mime', '/c/mime-jr.gif', '/c/mr-mime.gif')));
  const stages = loadConfig(f).monsters['mime-jr-mr-mime'].stages;
  assert.deepEqual(stages.map((s) => s.slug), ['mime-jr', 'mr-mime']);
});
test('직접 만든 몬스터에는 슬러그를 붙이지 않는다', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify(withGifs('custom-mypet', '/c/custom-mypet-0.gif')));
  assert.equal(loadConfig(f).monsters['custom-mypet'].stages[0].slug, undefined);
});
test('이미 슬러그가 있으면 건드리지 않는다', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({
    monsters: { pichu: { stages: [{ name: 'x', gif: '/c/pikachu.gif', slug: 'pichu' }] } },
  }));
  assert.equal(loadConfig(f).monsters.pichu.stages[0].slug, 'pichu');
});

test('설정을 저장해도 메인이 가진 값은 살아남는다', () => {
  const f = tmp();
  saveConfig(f, {
    ...DEFAULTS,
    petPosition: { x: 10, y: 20 },
    usageCache: { claude: { usage: claudeUsage, at: 1000 } },
    dex: { seen: { pichu: 1 }, caught: { pichu: 2 } },
  });
  // 렌더러가 창을 열 때 읽어둔 낡은 설정 — 도감도 캐시도 위치도 비어 있다
  saveConfigPreserving(f, { ...DEFAULTS, source: 'codex' });
  const after = loadConfig(f);
  assert.equal(after.source, 'codex');
  assert.deepEqual(after.petPosition, { x: 10, y: 20 });
  assert.deepEqual(after.dex, { seen: { pichu: 1 }, caught: { pichu: 2 } });
  assert.equal(after.usageCache.claude.at, 1000);
});
