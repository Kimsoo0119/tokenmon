const { ipcRenderer } = require('electron');

const $ = (id) => document.getElementById(id);

const fmtReset = (ms) => ms
  ? '리셋 ' + new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '';

function setBar(prefix, pct, resetsAt) {
  const has = typeof pct === 'number';
  $(`${prefix}-pct`).textContent = has ? `${Math.round(pct)}%` : '—';
  const bar = $(`${prefix}-bar`);
  bar.style.width = has ? `${Math.min(100, pct)}%` : '0%';
  bar.className = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : '';
  $(`${prefix}-reset`).textContent = has ? fmtReset(resetsAt) : '';
}

ipcRenderer.on('panel-data', (_, d) => {
  $('src').textContent = d.source === 'codex' ? 'Codex' : 'Claude';
  $('err').textContent = d.error ? '⚠️ 조회 실패' : '';
  setBar('fh', d.usage?.fiveHour?.pct, d.usage?.fiveHour?.resetsAt);
  setBar('wk', d.usage?.weekly?.pct, d.usage?.weekly?.resetsAt);

  if (d.monster && d.usage) {
    const m = d.monster;
    const pct = d.usage.weekly.pct;
    $('mon-name').innerHTML = `<b>${m.stageName}</b>`;
    $('mon-stage').textContent = `${m.stageIdx + 1}/${m.stageCount}단계`;
    if (m.nextThreshold != null) {
      $('mon-bar').style.width = `${Math.min(100, (pct / m.nextThreshold) * 100)}%`;
      $('mon-next').textContent = `진화까지 ${Math.max(0, Math.ceil(m.nextThreshold - pct))}%p`;
    } else {
      $('mon-bar').style.width = '100%';
      $('mon-next').textContent = '최종 진화';
    }
  } else {
    $('mon-name').textContent = '몬스터 없음';
    $('mon-stage').textContent = '';
    $('mon-bar').style.width = '0%';
    $('mon-next').textContent = '';
  }
});

$('refresh').onclick = () => ipcRenderer.send('panel-refresh');
$('settings').onclick = () => ipcRenderer.send('panel-settings');
$('quit').onclick = () => ipcRenderer.send('panel-quit');
