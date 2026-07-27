const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  source: 'claude',
  pollIntervalMin: 5,
  petSize: 140,
  lastUsage: null, // 마지막 성공 조회값 캐시 (시작 직후 알만 보이는 것 방지)
  lastUsageSource: null, // 위 캐시가 어느 소스의 값인지 — 소스가 바뀌면 캐시를 쓰면 안 됨
  petPosition: null,
  activeMonster: null,
  monsters: {},
};

function loadConfig(file) {
  try {
    return { ...structuredClone(DEFAULTS), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

// 저장해둔 사용량 캐시는 같은 소스의 값일 때만 쓸 수 있다. Claude와 Codex는
// 수치가 서로 그럴듯해 보여서, 소스가 바뀐 뒤에도 남은 값을 그대로 쓰면
// 잘못된 것을 알아채기 어렵다.
function cachedUsage(cfg) {
  const u = cfg && cfg.lastUsage;
  return u && u.weekly && cfg.lastUsageSource === cfg.source ? u : null;
}

module.exports = { DEFAULTS, loadConfig, saveConfig, cachedUsage };
