const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  source: 'claude',
  pollIntervalMin: 5,
  petSize: 140,
  // 소스별 { usage, at } 캐시. 소스를 오갈 때마다 다시 조회하면 usage API의
  // 호출 제한(5분에 4회)에 금세 걸리므로, 마지막 값과 조회 시각을 함께 둔다.
  usageCache: {},
  petPosition: null,
  activeMonster: null,
  monsters: {},
};

// 소스별 캐시로 대체된 옛 필드 — 남아 있으면 헷갈리므로 읽을 때 걷어낸다
const RETIRED_KEYS = ['lastUsage', 'lastUsageSource'];

function loadConfig(file) {
  try {
    const cfg = { ...structuredClone(DEFAULTS), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    for (const k of RETIRED_KEYS) delete cfg[k];
    if (!cfg.usageCache || typeof cfg.usageCache !== 'object') cfg.usageCache = {};
    return cfg;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

// 해당 소스의 마지막 조회값 (없으면 null). 오래된 값이어도 화면에는 띄워준다 —
// 비워두고 '—'를 보여주는 것보다 낫고, 곧 이어지는 조회가 갱신한다.
function cachedUsage(cfg, source) {
  const e = cfg && cfg.usageCache && cfg.usageCache[source || (cfg && cfg.source)];
  return e && e.usage && e.usage.weekly ? e.usage : null;
}

// maxAgeMs 안에 받아온 값이 있으면 true — 이때는 다시 조회하지 않는다
function isCacheFresh(cfg, source, maxAgeMs, now = Date.now()) {
  const e = cfg && cfg.usageCache && cfg.usageCache[source || (cfg && cfg.source)];
  return !!(e && e.usage && e.usage.weekly && typeof e.at === 'number' && now - e.at < maxAgeMs);
}

module.exports = { DEFAULTS, loadConfig, saveConfig, cachedUsage, isCacheFresh };
