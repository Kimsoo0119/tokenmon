const { ipcRenderer } = require('electron');
const sprite = document.getElementById('sprite');
const empty = document.getElementById('empty');
const flash = document.getElementById('flash');
const ball = document.getElementById('ball');
const badge = document.getElementById('badge');
let state = null;
let currentGif = null;
let animating = false; // 볼 시퀀스 재생 중이면 새 연출 대신 말풍선만
let petHidden = false; // 시퀀스가 잠시 펫을 숨긴 상태
const sessions = new Map(); // 작업 중인 세션ID → {ts} (여러 터미널 세션 합산용)
const SESSION_TTL = 30 * 60 * 1000; // 이벤트 유실 대비: 오래된 세션 자동 제거
const after = (ms, fn) => setTimeout(fn, ms);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function syncVisibility() {
  const has = !!(state && state.stage);
  sprite.style.display = has && !petHidden ? 'block' : 'none';
  empty.style.display = has ? 'none' : 'block';
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

// 스프라이트 밖 투명 여백은 클릭을 아래로 통과시킴
let ignoringMouse = false;
document.addEventListener('mousemove', (e) => {
  if (down) return; // 드래그 중엔 항상 이벤트 수신
  const interactive = e.target === sprite || empty.contains(e.target);
  if (ignoringMouse === interactive) {
    ignoringMouse = !interactive;
    ipcRenderer.send('ignore-mouse', ignoringMouse);
  }
});

// 드래그(이동) vs 클릭(공격 + 툴팁) 구분: 4px 이상 움직이면 드래그
// 포인터 캡처를 걸어 창 밖에서 버튼을 놓아도 up 이벤트를 놓치지 않음
// (놓치면 down 상태가 남아 다음 호버 때 이전 오프셋으로 순간이동하는 버그가 생김)
let down = null;
let moved = false;
sprite.addEventListener('pointerdown', (e) => {
  sprite.setPointerCapture(e.pointerId);
  down = { sx: e.screenX, sy: e.screenY };
  moved = false;
  ipcRenderer.send('drag-start'); // 시작 좌표는 메인이 getPosition으로 잡음
});
sprite.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.screenX - down.sx;
  const dy = e.screenY - down.sy;
  if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
  if (moved) ipcRenderer.send('move-pet', { dx: Math.round(dx), dy: Math.round(dy) });
});
sprite.addEventListener('pointerup', (e) => {
  try { sprite.releasePointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ }
  if (down && moved) ipcRenderer.send('drag-end');
  else if (down) attack();
  down = null;
});
sprite.addEventListener('pointercancel', () => { down = null; });
window.addEventListener('blur', () => { down = null; });

// 알 상태에서 클릭하면 설정을 열어줌 (첫 실행 온보딩)
empty.addEventListener('click', () => ipcRenderer.send('open-settings'));

sprite.addEventListener('animationend', () =>
  sprite.classList.remove('attacking', 'notifying', 'summoned', 'dodge'));

// 외부 이벤트(Claude Code 훅 등): done/waiting은 몬스터볼 연출, start/notify는 말풍선
ipcRenderer.on('agent-event', (_, ev) => {
  if (ev.type === 'notify') return notifyBubble('🔔', ev.message);
  const key = ev.session || '';
  if (ev.type === 'start') sessions.set(key, { ts: Date.now() });
  else if (ev.type === 'done') sessions.delete(key);
  else if (ev.type === 'waiting' && sessions.has(key)) sessions.get(key).ts = Date.now();
  // waiting은 세션을 제거하지 않음: 권한 승인 후엔 start 없이 작업이 재개되기 때문
  render(ev);
});

// 작업 중인 세션 수 (오래된 항목은 정리)
function countWorking() {
  const cutoff = Date.now() - SESSION_TTL;
  for (const [k, s] of sessions) if (s.ts < cutoff) sessions.delete(k);
  return sessions.size;
}

function render(ev) {
  const working = countWorking();
  const from = ev.project ? `${ev.project} · ` : ''; // 어느 프로젝트에서 온 이벤트인지
  const canPlay = !animating && sprite.style.display !== 'none'; // 알 상태(펫 없음)면 말풍선만
  if (ev.type === 'start') {
    notifyBubble('⚙️', working > 1 ? `${from}시작 · ${working}개 작업 중` : from + '작업 시작!');
  } else if (ev.type === 'done') {
    const msg = ev.message || (working > 0 ? `${from}완료 · ${working}개 작업 중` : from + '작업 완료!');
    canPlay ? playCatch(msg) : notifyBubble('✅', msg);
  } else if (ev.type === 'waiting') {
    const msg = from + (ev.message || '답변을 기다리고 있어요!');
    // 풀 시퀀스는 작업 중 세션이 진짜 막혔을 때만. 턴 종료 후 idle 알림은 말풍선만 (연출 반복 방지)
    canPlay && sessions.has(ev.session || '') ? playMiss(msg) : notifyBubble('🙋', msg);
  }
  syncBadge(working);
}

function syncBadge(working) {
  badge.textContent = `×${working}`;
  badge.style.display = working > 0 ? 'block' : 'none';
}

// 이벤트 없이 죽은 세션 정리 (배지가 남지 않게)
setInterval(() => syncBadge(countWorking()), 60 * 1000);

// 작업 완료: 볼 던져서 명중 → 흔들 → 딸깍! → 터지며 펫 소환
function playCatch(msg) {
  animating = true;
  ball.style.display = 'block';
  ball.className = 'throwing';
  after(400, () => { // 명중: 펫이 볼로 빨려 들어감
    flash.classList.add('on');
    sprite.classList.add('captured');
    ball.className = '';
  });
  after(780, () => {
    petHidden = true;
    sprite.classList.remove('captured');
    syncVisibility();
    ball.className = 'wobbling';
  });
  after(1400, () => flash.classList.remove('on'));
  after(2000, () => { ball.className = 'caught'; }); // 딸깍!
  after(2600, () => { // 포획 성공 → 소환
    flash.classList.add('on');
    ball.className = 'burst';
  });
  after(2900, () => {
    ball.className = '';
    ball.style.display = 'none';
    petHidden = false;
    syncVisibility();
    sprite.classList.add('summoned');
    notifyBubble('✅', msg);
    animating = false;
  });
  after(3600, () => flash.classList.remove('on'));
}

// 답변 대기: 볼 던졌지만 놓침 → 펫이 피하고 스킬 시전
function playMiss(msg) {
  animating = true;
  ball.style.display = 'block';
  ball.className = 'throwing';
  after(400, () => { // 펫이 피하고 볼은 튕겨나감
    sprite.classList.add('dodge');
    ball.className = 'missOut';
  });
  after(900, () => { // 스킬 시전
    ball.className = '';
    ball.style.display = 'none';
    sprite.classList.add('attacking');
    flash.classList.add('on');
    notifyBubble('🙋', msg);
    animating = false;
  });
  after(1900, () => flash.classList.remove('on'));
}

// 점프 + 말풍선(별도 창). 메시지는 외부 입력이라 이스케이프 필수
function notifyBubble(icon, msg) {
  if (!animating) {
    sprite.classList.remove('notifying');
    void sprite.offsetWidth;
    sprite.classList.add('notifying');
  }
  ipcRenderer.send('bubble', { html: `<b class="notice">${esc(icon)}</b> ` + esc(msg), duration: 6000 });
}

function attack() {
  sprite.classList.remove('attacking');
  void sprite.offsetWidth; // 애니메이션 재시작 트릭
  sprite.classList.add('attacking');
  if (!state) return;
  // bubbleText는 내부 숫자/고정 문자열만 조합하므로 그대로 전달
  ipcRenderer.send('bubble', {
    html: state.error ? '⚠️ 조회 실패 · 마지막 값 표시 중' : bubbleText(),
    duration: 2500,
  });
}

function bubbleText() {
  const p = Math.round(state.percent);
  return state.nextThreshold == null
    ? `주간 <b>${p}%</b>`
    : `주간 <b>${p}%</b> · 진화까지 <b>${Math.max(0, Math.ceil(state.nextThreshold - state.percent))}%p</b>`;
}
