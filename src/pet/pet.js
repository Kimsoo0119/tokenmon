const { ipcRenderer } = require('electron');
const sprite = document.getElementById('sprite');
const empty = document.getElementById('empty');
const flash = document.getElementById('flash');
let state = null;
let currentGif = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

ipcRenderer.on('state', (_, s) => {
  state = s;
  if (s && s.petSize) {
    sprite.style.width = s.petSize + 'px';
    sprite.style.height = s.petSize + 'px';
  }
  const has = !!(s && s.stage);
  empty.style.display = has ? 'none' : 'block';
  sprite.style.display = has ? 'block' : 'none';
  if (!has) return;
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
  const interactive = e.target === sprite || e.target === empty;
  if (ignoringMouse === interactive) {
    ignoringMouse = !interactive;
    ipcRenderer.send('ignore-mouse', ignoringMouse);
  }
});

// 드래그(이동) vs 클릭(공격 + 툴팁) 구분: 4px 이상 움직이면 드래그
let down = null;
let moved = false;
sprite.addEventListener('mousedown', (e) => {
  down = { sx: e.screenX, sy: e.screenY, wx: window.screenX, wy: window.screenY };
  moved = false;
});
window.addEventListener('mousemove', (e) => {
  if (!down) return;
  const dx = e.screenX - down.sx;
  const dy = e.screenY - down.sy;
  if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
  if (moved) ipcRenderer.send('move-pet', { x: down.wx + dx, y: down.wy + dy });
});
window.addEventListener('mouseup', () => {
  if (down && moved) ipcRenderer.send('drag-end');
  else if (down) attack();
  down = null;
});

sprite.addEventListener('animationend', () => sprite.classList.remove('attacking', 'notifying'));

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
