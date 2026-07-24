const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 파일 끝에서부터 스캔: 마지막 rate_limits 스냅샷이 가장 최신
function weeklyFromJsonl(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('rate_limits')) continue;
    try {
      const p = JSON.parse(lines[i])?.payload?.rate_limits?.secondary?.used_percent;
      if (typeof p === 'number') return p;
    } catch { /* 깨진 줄 무시 */ }
  }
  return null;
}

async function fetchCodexWeekly(sessionsDir = path.join(os.homedir(), '.codex', 'sessions')) {
  let files;
  try {
    files = fs.readdirSync(sessionsDir, { recursive: true })
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(sessionsDir, f))
      .map((f) => ({ f, mtime: fs.statSync(f).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50); // ponytail: 최근 50개만 스캔, 부족하면 늘리면 됨
  } catch {
    return null; // Codex 미설치
  }
  for (const { f } of files) {
    const p = weeklyFromJsonl(fs.readFileSync(f, 'utf8'));
    if (p != null) return p;
  }
  return null;
}

module.exports = { weeklyFromJsonl, fetchCodexWeekly };
