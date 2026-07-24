// settings.js와 같은 전역을 공유하므로 IIFE로 격리 (const 재선언 충돌 방지)
(() => {
  const { ipcRenderer } = require('electron');

  const q = (id) => document.getElementById(id);

  const fmtReset = (ms) => ms
    ? '리셋 ' + new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  function setBar(prefix, pct, resetsAt) {
    const has = typeof pct === 'number';
    q(`${prefix}-pct`).textContent = has ? `${Math.round(pct)}%` : '—';
    const bar = q(`${prefix}-bar`);
    bar.style.width = has ? `${Math.min(100, pct)}%` : '0%';
    bar.className = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : '';
    q(`${prefix}-reset`).textContent = has ? fmtReset(resetsAt) : '';
  }

  ipcRenderer.on('panel-data', (_, d) => {
    // 소스별 액센트: Claude 코럴 / Codex 틸
    document.documentElement.style.setProperty('--accent', d.source === 'codex' ? '#10a37f' : '#d97757');
    q('src').textContent = d.source === 'codex' ? 'Codex' : 'Claude';
    q('err').textContent = d.error ? '⚠️ 조회 실패' : '';
    setBar('fh', d.usage?.fiveHour?.pct, d.usage?.fiveHour?.resetsAt);
    setBar('wk', d.usage?.weekly?.pct, d.usage?.weekly?.resetsAt);

    if (d.monster && d.usage) {
      const m = d.monster;
      const pct = d.usage.weekly.pct;
      q('mon-name').innerHTML = `<b>${m.stageName}</b>`;
      q('mon-stage').textContent = `${m.stageIdx + 1}/${m.stageCount}단계`;
      if (m.nextThreshold != null) {
        q('mon-bar').style.width = `${Math.min(100, (pct / m.nextThreshold) * 100)}%`;
        q('mon-next').textContent = `진화까지 ${Math.max(0, Math.ceil(m.nextThreshold - pct))}%p`;
      } else {
        q('mon-bar').style.width = '100%';
        q('mon-next').textContent = '최종 진화';
      }
    } else {
      q('mon-name').textContent = '몬스터 없음';
      q('mon-stage').textContent = '';
      q('mon-bar').style.width = '0%';
      q('mon-next').textContent = '';
    }
  });

  // 설정 섹션 접기/펼치기 (바깥 클릭 시 blur로 닫힘)
  const sec = q('settings-sec');
  q('settings').onclick = () => {
    sec.hidden = !sec.hidden;
    q('settings').textContent = sec.hidden ? '설정 ▾' : '설정 ▴';
  };

  // 창 높이는 카드 실제 높이에 자동 추종 (고정 높이는 투명 여백/유령 그림자를 만듦)
  const card = q('card');
  new ResizeObserver(() => {
    ipcRenderer.send('panel-resize', Math.min(Math.ceil(card.offsetHeight) + 16, 900));
  }).observe(card);

  // 파일 선택 대화상자가 떠 있는 동안만 blur 닫힘 방지
  q('custom-files').addEventListener('click', () => ipcRenderer.send('panel-pinned', true));
  window.addEventListener('focus', () => ipcRenderer.send('panel-pinned', false));

  // 알 클릭/트레이 메뉴에서 설정을 바로 펼친 상태로 열기
  ipcRenderer.on('expand-settings', () => { if (sec.hidden) q('settings').onclick(); });

  q('refresh').onclick = () => ipcRenderer.send('panel-refresh');
  q('quit').onclick = () => ipcRenderer.send('panel-quit');
})();
