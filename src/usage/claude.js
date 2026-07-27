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
    // 실측(2026-07): 5분 남짓한 창에 4회까지 통과하고 5회째부터 429가 나오며
    // retry-after로 300초를 준다. 응답에 anthropic-ratelimit-* 헤더는 없어서
    // 남은 횟수를 미리 알 수는 없고, 429를 받은 뒤 retry-after를 따르는 수밖에 없다.
    const err = new Error('usage API rate limited');
    err.rateLimited = true;
    err.retryAfterMs = (Number(res.headers.get('retry-after')) || 300) * 1000;
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
