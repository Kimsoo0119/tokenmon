const { ipcRenderer } = require('electron');
const sprite = document.getElementById('sprite');
const empty = document.getElementById('empty');
const bubble = document.getElementById('bubble');
const flash = document.getElementById('flash');
let state = null;
let currentGif = null;
let bubbleTimer;

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

function setGif() { sprite.src = 'file://' + currentGif; }

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

sprite.addEventListener('animationend', () => sprite.classList.remove('attacking'));

function attack() {
  sprite.classList.remove('attacking');
  void sprite.offsetWidth; // 애니메이션 재시작 트릭
  sprite.classList.add('attacking');
  if (!state) return;
  bubble.textContent = state.error
    ? '⚠️ 조회 실패 · 마지막 값 표시 중'
    : bubbleText();
  bubble.style.display = 'block';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.style.display = 'none'; }, 2500);
}

function bubbleText() {
  const p = Math.round(state.percent);
  return state.nextThreshold == null
    ? `주간 ${p}% · 최종 진화!`
    : `주간 ${p}% · 진화까지 ${Math.max(0, Math.ceil(state.nextThreshold - state.percent))}%p`;
}
