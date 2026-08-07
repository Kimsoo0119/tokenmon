const { ipcRenderer } = require('electron');
const sprite = document.getElementById('sprite');
const empty = document.getElementById('empty');
const flash = document.getElementById('flash');
const glow = document.getElementById('glow');
const { esc } = require('../esc');
let state = null;
let currentGif = null;

ipcRenderer.on('state', (_, s) => {
  state = s;
  if (s && s.petSize) {
    sprite.style.width = s.petSize + 'px';
    sprite.style.height = s.petSize + 'px';
  }
  const has = !!(s && s.stage);
  empty.style.display = has ? 'none' : 'block';
  sprite.style.display = has ? 'block' : 'none';
  // 진화 대기: 글로우는 별도 오버레이로 — 스프라이트의 애니메이션 슬롯(공격·점프)을
  // 차지하지 않고, opacity만 움직여 GPU 합성만으로 그린다
  glow.classList.toggle('on', !!(s && s.pendingEvolution));
  sprite.classList.toggle('pending', !!(s && s.pendingEvolution)); // 커서 모양용
  if (!has) {
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
  else if (down && sprite.classList.contains('evolving')) { /* 연출 중 클릭은 무시 — 공격 말풍선이 연출 문구를 덮지 않게 */ }
  else if (down && state && state.pendingEvolution) ipcRenderer.send('evolve-go'); // 대기 중 클릭 = 진화 진행
  else if (down) attack();
  down = null;
});
sprite.addEventListener('pointercancel', () => { down = null; });
window.addEventListener('blur', () => { down = null; });

// 알 상태에서 클릭하면 설정을 열어줌 (첫 실행 온보딩)
empty.addEventListener('click', () => ipcRenderer.send('open-settings'));

sprite.addEventListener('animationend', () => sprite.classList.remove('attacking', 'notifying'));

// ── 진화 연출 (오케스트레이션은 메인이, 시각 효과는 여기서) ──
// 타이밍은 pet.html의 evolveFlash 애니메이션(2.3초)과 맞물려 있다
const EVOLVE_FLASH_MS = 2300;      // = evolveFlash 길이
const EVOLVE_SWAP_MS = 900;        // evolveFlash 두 번째 절정(39%)에서 GIF 교체

// "모습이 변하기 시작했다!" 구간: 하얗게 점멸하는 펄스. 이 동안 B를 누르면 취소(이스터에그)
ipcRenderer.on('evolve-start', () => {
  glow.classList.remove('on');
  sprite.classList.remove('pending');
  sprite.classList.add('evolving');
});
ipcRenderer.on('evolve-cancel', () => sprite.classList.remove('evolving'));
// 커밋: 3연속 플래시 절정에서 다음 단계 GIF로 교체, 끝나면 기쁨의 점프
ipcRenderer.on('evolve-commit', (_, { gif }) => {
  sprite.classList.remove('evolving');
  currentGif = gif; // 뒤따라오는 state 푸시가 평범한 플래시를 또 일으키지 않도록 먼저 잡아둔다
  flash.classList.add('evolve');
  setTimeout(setGif, EVOLVE_SWAP_MS);
  setTimeout(() => {
    flash.classList.remove('evolve');
    sprite.classList.add('notifying');
  }, EVOLVE_FLASH_MS);
});

// 이스터에그: 연출 중 B — 펫 창은 방금 클릭돼 포커스를 갖고 있으므로 창 로컬 입력으로 충분하다
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'b' && sprite.classList.contains('evolving')) {
    ipcRenderer.send('evolve-cancel-request');
  }
});

// 외부 알림(Claude Code 훅 등): 점프 + 말풍선. 메시지는 외부 입력이라 이스케이프 필수
ipcRenderer.on('notify', (_, msg) => {
  sprite.classList.remove('notifying');
  void sprite.offsetWidth;
  sprite.classList.add('notifying');
  ipcRenderer.send('bubble', { html: '<b class="notice">🔔</b> ' + esc(msg), duration: 6000 });
});

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
