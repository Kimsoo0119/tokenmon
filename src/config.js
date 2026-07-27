const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  source: 'claude',
  pollIntervalMin: 1,
  petSize: 140,
  lastUsage: null, // 마지막 성공 조회값 캐시 (시작 직후 알만 보이는 것 방지)
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

module.exports = { DEFAULTS, loadConfig, saveConfig };
