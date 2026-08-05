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
  // 도감 기록. 등록해서 알게 된 종(seen)과 실제로 그 단계까지 키워본
  // 종(caught)을 슬러그 → 시각으로 담는다. 몬스터를 지워도 남는다.
  dex: { seen: {}, caught: {} },
};

// 소스별 캐시로 대체된 옛 필드 — 남아 있으면 헷갈리므로 읽을 때 걷어낸다
const RETIRED_KEYS = ['lastUsage', 'lastUsageSource'];

// 직접 고른 GIF로 만든 몬스터. 도감에 실린 종이 아니므로 기록에서 빠진다.
const CUSTOM_PREFIX = 'custom-';

// 렌더러는 창을 열 때 읽어둔 설정을 통째로 덮어쓰기 때문에, 그 사이 메인이
// 갱신한 값이 사라진다. 메인만 쓰는 필드를 적어두고 저장 직전에 되돌린다.
const MAIN_OWNED_KEYS = ['petPosition', 'usageCache', 'dex'];

const SLUG = /^[a-z0-9-]+$/;

function isCustomId(id) {
  return String(id).startsWith(CUSTOM_PREFIX);
}

function normalizeDex(cfg) {
  const d = cfg.dex && typeof cfg.dex === 'object' ? cfg.dex : {};
  cfg.dex = {
    seen: d.seen && typeof d.seen === 'object' ? d.seen : {},
    caught: d.caught && typeof d.caught === 'object' ? d.caught : {},
  };
  return cfg;
}

// 몬스터 id는 슬러그를 '-'로 이어붙인 값이라 다시 쪼갤 수 없다 — mr-mime이나
// jangmo-o처럼 슬러그 자체에 하이픈이 있는 종이 있어서, mime-jr-mr-mime을
// 어디서 끊어야 할지 알 방법이 없다. 대신 스프라이트가 {슬러그}.gif로 저장되니
// 파일 이름에서 정확히 되살린다.
function migrateStageSlugs(cfg) {
  for (const [id, m] of Object.entries(cfg.monsters || {})) {
    if (isCustomId(id) || !m || !Array.isArray(m.stages)) continue;
    for (const s of m.stages) {
      if (!s || s.slug || !s.gif) continue;
      const base = path.basename(String(s.gif), '.gif');
      if (SLUG.test(base)) s.slug = base;
    }
  }
  return cfg;
}

function loadConfig(file) {
  try {
    const cfg = { ...structuredClone(DEFAULTS), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    for (const k of RETIRED_KEYS) delete cfg[k];
    if (!cfg.usageCache || typeof cfg.usageCache !== 'object') cfg.usageCache = {};
    return migrateStageSlugs(normalizeDex(cfg));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

// 렌더러에서 저장할 때 쓴다. 손에 든 설정이 낡았을 수 있으므로 메인이 주인인
// 필드만 파일에서 다시 읽어 얹는다.
function saveConfigPreserving(file, cfg, keys = MAIN_OWNED_KEYS) {
  const cur = loadConfig(file);
  const kept = {};
  for (const k of keys) kept[k] = cur[k];
  saveConfig(file, { ...cfg, ...kept });
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

module.exports = {
  DEFAULTS,
  MAIN_OWNED_KEYS,
  CUSTOM_PREFIX,
  isCustomId,
  loadConfig,
  saveConfig,
  saveConfigPreserving,
  cachedUsage,
  isCacheFresh,
};
