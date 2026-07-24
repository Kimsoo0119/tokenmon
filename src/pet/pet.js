const { ipcRenderer } = require('electron');
const sprite = document.getElementById('sprite');
const empty = document.getElementById('empty');
const bubble = document.getElementById('bubble');
const flash = document.getElementById('flash');
const ball = document.getElementById('ball');
const ballWrap = document.getElementById('ballWrap');
const ballCount = document.getElementById('ballCount');
let state = null;
let currentGif = null;
let bubbleTimer;
let agentBusy = false; // 몬스터볼 표시 중
const sessions = new Map(); // 세션ID → {state: 'working'|'waiting', ts} (cmux 등 다중 세션 합산용)
const SESSION_TTL = 30 * 60 * 1000; // 이벤트 유실 대비: 오래된 세션 자동 제거

// 펫/알/볼 중 무엇을 보여줄지 한곳에서 결정
function syncVisibility() {
  const has = !!(state && state.stage);
  ballWrap.style.display = agentBusy ? 'block' : 'none';
  sprite.style.display = has && !agentBusy ? 'block' : 'none';
  empty.style.display = !has && !agentBusy ? 'block' : 'none';
}

ipcRenderer.on('state', (_, s) => {
  state = s;
  if (s && s.petSize) {
    sprite.style.width = s.petSize + 'px';
    sprite.style.height = s.petSize + 'px';
  }
  syncVisibility();
  if (!(s && s.stage)) {
    // 몬스터가 없어지면 트레이 아이콘도 제거 (마지막 스프라이트가 남는 것 방지)
    if (currentGif != null) { currentGif = null; ipcRenderer.send('tray-icon', null); }
    return;
  }
  if (s.stage.gif !== currentGif) {
    const first = currentGif == null;
    currentGif = s.stage.gif;
    if (first) setGif();
    else { // 진화(또는 회귀) 플래시
      flash.classList.add('on');
      setTimeout(setGif, 450);
      setTimeout(() => flash.classList.remove('on'), 1100);
    }
  }
});

function setGif() {
  sprite.src = 'file://' + currentGif;
  sendTrayIcon();
}

// GIF 첫 프레임을 PNG로 떠서 트레이 아이콘으로 전달 (nativeImage는 GIF 미지원)
function sendTrayIcon() {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas');
    const scale = 36 / im.naturalHeight; // 레티나 대비 2x
    c.width = Math.max(1, Math.round(im.naturalWidth * scale));
    c.height = 36;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, 0, 0, c.width, c.height);
    ipcRenderer.send('tray-icon', c.toDataURL('image/png'));
  };
  im.src = 'file://' + currentGif;
}

// 창이 말풍선 폭만큼 넓어서, 스프라이트/말풍선 밖 투명 영역은 클릭을 아래로 통과시킴
let ignoringMouse = false;
document.addEventListener('mousemove', (e) => {
  if (down) return; // 드래그 중엔 항상 이벤트 수신
  const interactive = e.target === sprite || e.target === bubble || e.target === empty || e.target === ball;
  if (ignoringMouse === interactive) {
    ignoringMouse = !interactive;
    ipcRenderer.send('ignore-mouse', ignoringMouse);
  }
});

// 드래그(이동) vs 클릭(공격 + 툴팁) 구분: 4px 이상 움직이면 드래그
let down = null;
let moved = false;
function onDown(e) {
  down = { sx: e.screenX, sy: e.screenY, wx: window.screenX, wy: window.screenY };
  moved = false;
}
sprite.addEventListener('mousedown', onDown);
ball.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', (e) => {
  if (!down) return;
  const dx = e.screenX - down.sx;
  const dy = e.screenY - down.sy;
  if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
  if (moved) ipcRenderer.send('move-pet', { x: down.wx + dx, y: down.wy + dy });
});
window.addEventListener('mouseup', () => {
  if (down && moved) ipcRenderer.send('drag-end');
  else if (down) agentBusy ? release() : attack(); // 볼 클릭 = 즉시 복귀 (Stop 유실 대비)
  down = null;
});

sprite.addEventListener('animationend', () => sprite.classList.remove('attacking', 'notifying'));

// 외부 이벤트(Claude Code 훅 등): start/done/waiting은 몬스터볼 연출, notify는 점프 + 말풍선
ipcRenderer.on('agent-event', (_, ev) => {
  if (ev.type === 'notify') return notifyBubble('🔔', ev.message);
  const key = ev.session || '';
  if (ev.type === 'start') sessions.set(key, { state: 'working', ts: Date.now() });
  else if (ev.type === 'waiting') sessions.set(key, { state: 'waiting', ts: Date.now() });
  else if (ev.type === 'done') sessions.delete(key);
  render(ev);
});

// 세션 상태를 하나의 표시 상태로 합산: waiting > working > idle
function counts() {
  const cutoff = Date.now() - SESSION_TTL;
  let waiting = 0, working = 0;
  for (const [k, s] of sessions) {
    if (s.ts < cutoff) { sessions.delete(k); continue; }
    s.state === 'waiting' ? waiting++ : working++;
  }
  return { waiting, working };
}

function render(ev) {
  const { waiting, working } = counts();
  const from = ev.project ? `${ev.project} · ` : ''; // 어느 프로젝트에서 온 이벤트인지
  if (waiting > 0) {
    const msg = from + (ev.message || '답변을 기다리고 있어요!');
    if (agentBusy) burstOut('🙋', msg); // 놓침! 볼에서 탈출
    else if (ev.type === 'waiting') notifyBubble('🙋', msg);
  } else if (working > 0) {
    if (!agentBusy) capture();
    else if (ev.type === 'done') notifyBubble('✅', `${from}완료 · ${working}개 작업 중`);
    else if (ev.type === 'start' && working > 1) notifyBubble('⚙️', `${from}시작 · ${working}개 작업 중`);
  } else {
    if (agentBusy) {
      if (ev.type === 'done') caughtThenBurst(ev.message || from + '작업 완료!'); // 마지막 세션 완료
      else release(); // TTL 만료 등
    } else if (ev.type === 'done') notifyBubble('✅', ev.message || from + '작업 완료!');
  }
  // 동시 작업 세션 수 배지 (agentBusy는 위 분기에서 갱신됨)
  ballCount.textContent = `×${working}`;
  ballCount.style.display = agentBusy && working > 1 ? 'block' : 'none';
}

// 이벤트 없이 죽은 세션 정리 (볼에 갇힌 채 방치 방지)
setInterval(() => { if (sessions.size) render({ type: 'prune' }); }, 60 * 1000);

// 점프 + 말풍선. 메시지는 외부 입력이라 textContent로만 출력
function notifyBubble(icon, msg) {
  sprite.classList.remove('notifying');
  void sprite.offsetWidth;
  sprite.classList.add('notifying');
  bubble.innerHTML = '<b class="notice"></b> ';
  bubble.querySelector('.notice').textContent = icon;
  bubble.appendChild(document.createTextNode(msg));
  bubble.style.display = 'block';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.style.display = 'none'; }, 6000);
}

// 작업 시작: 펫이 볼로 빨려 들어가고 볼이 흔들림
function capture() {
  if (agentBusy) return; // 이미 볼 상태면 흔들림 유지
  agentBusy = true;
  bubble.style.display = 'none';
  ball.classList.remove('caught', 'burst');
  ball.classList.add('wobbling');
  if (sprite.style.display !== 'none') {
    flash.classList.add('on');
    sprite.classList.add('captured');
    setTimeout(() => { sprite.classList.remove('captured'); syncVisibility(); }, 420);
    setTimeout(() => flash.classList.remove('on'), 1000);
  } else syncVisibility();
}

// 작업 완료: 딸깍! 잠긴 뒤 터지며 펫 복귀. 그 사이 새 세션이 시작되면 흔들림으로 복귀
function caughtThenBurst(msg) {
  ball.classList.remove('wobbling');
  ball.classList.add('caught');
  setTimeout(() => {
    const { waiting, working } = counts();
    if (working > 0 && waiting === 0) {
      ball.classList.remove('caught');
      ball.classList.add('wobbling');
    } else burstOut('✅', msg);
  }, 700);
}

// 볼이 터지며 펫 복귀 + 말풍선
function burstOut(icon, msg) {
  agentBusy = false;
  ball.classList.remove('wobbling', 'caught');
  ball.classList.add('burst');
  flash.classList.add('on');
  setTimeout(() => {
    ball.classList.remove('burst');
    syncVisibility();
    notifyBubble(icon, msg);
  }, 300);
  setTimeout(() => flash.classList.remove('on'), 1000);
}

// 조용히 복귀 (볼 클릭 · TTL 만료). 세션 추적도 초기화해 다시 잡히지 않게 함
function release() {
  sessions.clear();
  agentBusy = false;
  ball.classList.remove('wobbling', 'caught', 'burst');
  syncVisibility();
}

function attack() {
  sprite.classList.remove('attacking');
  void sprite.offsetWidth; // 애니메이션 재시작 트릭
  sprite.classList.add('attacking');
  if (!state) return;
  // bubbleText는 내부 숫자/고정 문자열만 조합하므로 innerHTML 안전
  bubble.innerHTML = state.error
    ? '⚠️ 조회 실패 · 마지막 값 표시 중'
    : bubbleText();
  bubble.style.display = 'block';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.style.display = 'none'; }, 2500);
}

function bubbleText() {
  const p = Math.round(state.percent);
  return state.nextThreshold == null
    ? `주간 <b>${p}%</b> · 최종 진화!`
    : `주간 <b>${p}%</b> · 진화까지 <b>${Math.max(0, Math.ceil(state.nextThreshold - state.percent))}%p</b>`;
}
