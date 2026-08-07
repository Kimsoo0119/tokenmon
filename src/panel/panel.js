// settings.js와 같은 전역을 공유하므로 IIFE로 격리 (const 재선언 충돌 방지)
(() => {
  const { ipcRenderer } = require('electron');

  const q = (id) => document.getElementById(id);

  // 링 둘레 (r=66 바깥=주간, r=53 안쪽=5시간)
  const C_WK = 2 * Math.PI * 66;
  const C_FH = 2 * Math.PI * 53;

  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };

  // 70%/90%를 넘으면 링 색으로 경고 (빈 문자열이면 CSS 기본색으로 되돌아감)
  const alertColor = (pct) => (pct >= 90 ? '#ff5f57' : pct >= 70 ? '#ffb340' : '');

  function setRing(id, pct, circumference) {
    const has = typeof pct === 'number';
    const el = q(id);
    el.setAttribute('stroke-dasharray',
      `${(has ? Math.min(100, pct) : 0) / 100 * circumference} ${circumference}`);
    el.style.stroke = has ? alertColor(pct) : '';
  }

  ipcRenderer.on('panel-data', (_, d) => {
    // 소스별 액센트: Claude 코럴 / Codex 틸
    document.documentElement.style.setProperty('--accent', d.source === 'codex' ? '#10a37f' : '#d97757');
    q('src').textContent = d.source === 'codex' ? 'Codex' : 'Claude';
    q('err').textContent = d.error ? '⚠️ 조회 실패' : '';

    const fh = d.usage?.fiveHour;
    const wk = d.usage?.weekly;
    setRing('ring-wk', wk?.pct, C_WK);
    setRing('ring-fh', fh?.pct, C_FH);

    const put = (prefix, u, fmt) => {
      const has = typeof u?.pct === 'number';
      q(`${prefix}-pct`).textContent = has ? `${Math.round(u.pct)}%` : '—';
      q(`${prefix}-reset`).textContent = has && u.resetsAt ? `${fmt(u.resetsAt)} 리셋` : '';
    };
    put('fh', fh, fmtTime);
    put('wk', wk, fmtDate);
    q('lg-wk').textContent = `주간 ${typeof wk?.pct === 'number' ? Math.round(wk.pct) + '%' : '—'}`;
    q('lg-fh').textContent = `5시간 ${typeof fh?.pct === 'number' ? Math.round(fh.pct) + '%' : '—'}`;

    const sprite = q('mon-sprite');
    const egg = q('mon-egg');
    if (d.monster) {
      const m = d.monster;
      sprite.src = 'file://' + m.gif;
      sprite.alt = m.stageName;
      sprite.hidden = false;
      egg.hidden = true;
      q('mon-name').textContent = m.stageName;
      const left = (m.nextThreshold != null && typeof wk?.pct === 'number')
        ? ` · 진화까지 ${Math.max(0, Math.ceil(m.nextThreshold - wk.pct))}%p`
        : m.nextThreshold == null ? ' · 최종 진화' : '';
      q('mon-stage').textContent = `${m.stageIdx + 1} / ${m.stageCount} 단계${left}`;
    } else {
      sprite.hidden = true;
      sprite.removeAttribute('src');
      egg.hidden = false;
      q('mon-name').textContent = '몬스터 없음';
      q('mon-stage').textContent = '설정에서 추가하세요';
    }
  });

  // 설정 섹션 접기/펼치기 (바깥 클릭 시 blur로 닫힘)
  const sec = q('settings-sec');
  q('settings').onclick = () => {
    sec.hidden = !sec.hidden;
    q('settings').textContent = sec.hidden ? '설정 ▾' : '설정 ▴';
  };

  // 창 높이는 카드 실제 높이에 자동 추종 (고정 높이는 투명 여백/유령 그림자를 만듦).
  // 화면 아래로 쓸 수 있는 높이를 넘기면 설정 섹션 안에서 스크롤한다.
  const card = q('card');
  let maxHeight = 900; // panel-limit이 오기 전 임시값

  function fitWindow() {
    if (sec.hidden) {
      sec.style.maxHeight = '';
    } else {
      // 설정 위쪽(사용량 카드·버튼)은 항상 보여야 하므로 그만큼 뺀 나머지를 준다.
      // 섹션 자신의 높이와 무관한 값이라 이 조정이 다시 크기 변화를 부르지 않는다.
      const top = sec.getBoundingClientRect().top + window.scrollY;
      sec.style.maxHeight = `${Math.max(180, maxHeight - top - 20)}px`;
    }
    const want = Math.ceil(card.offsetHeight) + 16;
    document.body.classList.toggle('scroll', want > maxHeight);
    ipcRenderer.send('panel-resize', Math.min(want, maxHeight));
  }
  // 같은 값이면 다시 맞추지 않는다 — 메인이 리사이즈마다 회신하므로 되돌이표를 끊는다
  ipcRenderer.on('panel-limit', (_, h) => {
    if (h === maxHeight) return;
    maxHeight = h;
    fitWindow();
  });
  new ResizeObserver(fitWindow).observe(card);

  // 파일 선택 대화상자가 떠 있는 동안만 blur 닫힘 방지
  q('custom-files').addEventListener('click', () => ipcRenderer.send('panel-pinned', true));
  window.addEventListener('focus', () => ipcRenderer.send('panel-pinned', false));

  // 알 클릭/트레이 메뉴에서 설정을 바로 펼친 상태로 열기
  ipcRenderer.on('expand-settings', () => { if (sec.hidden) q('settings').onclick(); });

  q('refresh').onclick = () => ipcRenderer.send('panel-refresh');
  q('dex').onclick = () => ipcRenderer.send('open-dex');
  q('quit').onclick = () => ipcRenderer.send('panel-quit');
})();
