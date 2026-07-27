const { execFile } = require('node:child_process');

function keychainCredentials() {
  return new Promise((resolve, reject) => {
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      (err, stdout) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
      });
  });
}

// { fiveHour: {pct, resetsAt(ms)}|null, weekly: {pct, resetsAt(ms)} }
async function fetchClaudeUsage() {
  const { claudeAiOauth } = await keychainCredentials();
  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      Authorization: `Bearer ${claudeAiOauth.accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
    },
  });
  if (res.status === 429) {
    // 이 엔드포인트는 계정에 따라 시간당 1회 수준으로 제한됨 — retry-after를 존중
    const err = new Error('usage API rate limited');
    err.rateLimited = true;
    err.retryAfterMs = (Number(res.headers.get('retry-after')) || 3600) * 1000;
    throw err;
  }
  if (!res.ok) throw new Error(`usage API ${res.status}`);
  const d = await res.json();
  const pick = (o) => (o && typeof o.utilization === 'number')
    ? { pct: o.utilization, resetsAt: o.resets_at ? Date.parse(o.resets_at) : null }
    : null;
  const weekly = pick(d.seven_day);
  if (!weekly) throw new Error('seven_day.utilization 없음');
  return { fiveHour: pick(d.five_hour), weekly };
}

async function fetchClaudeWeekly() {
  return (await fetchClaudeUsage()).weekly.pct;
}

module.exports = { fetchClaudeWeekly, fetchClaudeUsage };
