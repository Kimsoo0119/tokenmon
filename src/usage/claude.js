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

async function fetchClaudeWeekly() {
  const { claudeAiOauth } = await keychainCredentials();
  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      Authorization: `Bearer ${claudeAiOauth.accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
    },
  });
  if (!res.ok) throw new Error(`usage API ${res.status}`);
  const u = (await res.json()).seven_day?.utilization;
  if (typeof u !== 'number') throw new Error('seven_day.utilization 없음');
  return u;
}

module.exports = { fetchClaudeWeekly };
