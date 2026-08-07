const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { loadConfig, saveConfig, cachedUsage, isCacheFresh } = require('./config');
const { stageIndex, resolveStage, validBlock, particle } = require('./evolution');
const { fetchClaudeUsage } = require('./usage/claude');
const { fetchCodexUsage } = require('./usage/codex');

let cfg, petWin, panelWin, bubbleWin, tray;
let bubbleTimer;
let lastPercent = null;
let lastUsage = null; // { fiveHour: {pct, resetsAt}|null, weekly: {pct, resetsAt} }
let lastError = false;

const configFile = () => path.join(app.getPath('userData'), 'config.json');

// 몬스터 이름은 사용자 입력이므로 말풍선 HTML에 넣기 전 이스케이프
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ── 진화 이벤트 ──────────────────────────────────────
// 표시 단계(shownIdx)는 계산값을 그대로 따르지 않는다. 연출이 켜져 있으면 단계 상승을
// 감지해도 바로 진화하지 않고 "대기"에 들어가 알림만 주고, 사용자가 펫(또는 알림)을
// 클릭해야 연출이 시작된다 — 이벤트를 놓치지 않고 사용자의 선택으로 진행되게.
let shownIdx = null;     // 지금 화면에 보여주는 단계 (연출 커밋 전에는 이전 단계)
let shownMonster = null; // 그 단계가 속한 몬스터 id
let pending = null;      // 사용자의 클릭을 기다리는 진화 { toIdx }
let cinematic = null;    // 클릭 후 진행 중인 연출 { m, fromIdx, toIdx, timer }
let congratsTimer;       // 커밋 후 축하 말풍선 예약 — 새 연출이 시작되면 취소한다
let notifiedKey = null;  // 마지막으로 알림을 보낸 대기 (monster:toIdx) — 주간 롤링 윈도로 %가 오르내려도 같은 진화를 두 번 알리지 않게
const CINEMATIC_WAIT_MS = 4500; // "모습이 변하기 시작했다!" 구간 — 이 안에 B를 누르면 멈춘다 (이스터에그, UI에는 비공개)

function currentBlock(m) {
  const b = cfg.evolutionBlock;
  if (!m || !b || b.monster !== cfg.activeMonster) return null;
  return validBlock(b, m.stages.length) ? b : null; // 손편집·단계 삭제로 안 맞으면 무시
}

function setBlock(b) {
  cfg.evolutionBlock = b;
  saveConfig(configFile(), cfg);
}

// 폴링/설정 변경 후 표시 단계를 갱신한다. animate가 참이고 단계가 올랐으면 진화 대기 진입.
function applyStage(animate) {
  const m = cfg.monsters[cfg.activeMonster];
  if (!m || lastPercent == null) {
    shownIdx = null; shownMonster = null;
    if (pending) { pending = null; hideBubble(); }
    return;
  }
  if (cinematic) return; // 연출 중 — 커밋 후 다음 폴링에서 다시 판단
  const r = resolveStage(stageIndex(m.thresholds, lastPercent), currentBlock(m));
  // 리셋으로 풀린 차단만 즉시 지운다. 재시도(evolveTo) 경로의 차단은 진화가 실제로
  // 일어날 때 지워야, 클릭 전에 앱이 꺼져도 차단이 살아남는다.
  if (r.clearBlock && r.evolveTo == null) setBlock(null);
  const target = r.evolveTo ?? r.idx;
  const fresh = shownMonster !== cfg.activeMonster || shownIdx == null;
  if (!fresh && animate && cfg.evolutionCinematic !== false && target > shownIdx) {
    if (!pending) {
      pending = { toIdx: target };
      showPendingBubble();
      // 주간 롤링 윈도로 %가 임계값 근처를 오르내리면 대기가 풀렸다 다시 걸릴 수 있다.
      // 같은 진화(monster:toIdx)는 한 번만 시스템 알림을 보낸다 — 글로우와 말풍선은 매번 뜬다.
      const key = `${cfg.activeMonster}:${target}`;
      if (notifiedKey !== key) {
        notifiedKey = key;
        const name = m.stages[shownIdx].name;
        notify(`어…? ${name}의 상태가…!`, '펫을 클릭하면 진화가 시작됩니다.', startPendingEvolution);
      }
    } else if (pending.toIdx !== target) {
      pending.toIdx = target; // 기다리는 동안 더 높은 임계값을 넘으면 목표만 올린다
      showPendingBubble();
    }
    return; // shownIdx는 사용자가 진행할 때까지 그대로
  }
  if (pending) { pending = null; hideBubble(); } // 리셋·설정 변경 등으로 대기가 무산되면 말풍선도 내린다
  if (r.evolveTo != null) setBlock(null); // 연출 없이 바로 반영하는 경로 — 차단이 여기서 소비된다
  shownMonster = cfg.activeMonster;
  shownIdx = target;
}

// 대기 말풍선은 사용자가 진행(클릭)할 때까지 계속 떠 있는다
function showPendingBubble() {
  const m = cfg.monsters[cfg.activeMonster];
  if (!pending || !m || shownIdx == null) return;
  showBubble(`어…? <b class="name">${esc(m.stages[clampStage(m, shownIdx)].name)}</b>의 상태가…!`, Infinity);
}

let liveNotification = null; // 참조를 붙잡아두지 않으면 클릭 전에 GC될 수 있다 (Electron 유명한 함정)

function notify(title, body, onClick) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    if (onClick) n.on('click', onClick);
    n.on('close', () => { if (liveNotification === n) liveNotification = null; });
    liveNotification = n;
    n.show();
  } catch { /* 알림 권한이 없어도 앱은 계속 */ }
}

// 대기 중인 진화를 사용자가 진행시켰다 (펫 클릭 또는 알림 클릭)
function startPendingEvolution() {
  if (!pending || cinematic) return pushState(); // 대기가 이미 무산됐으면 렌더러 상태만 재동기화
  const m = cfg.monsters[cfg.activeMonster];
  if (!m || shownIdx == null) return;
  const toIdx = Math.min(pending.toIdx, m.stages.length - 1);
  pending = null;
  notifiedKey = null;
  if (toIdx <= shownIdx) { hideBubble(); updateTray(); return pushState(); }
  clearTimeout(congratsTimer); // 직전 커밋의 축하 예약이 새 연출을 덮지 않게
  cinematic = { m, fromIdx: shownIdx, toIdx, timer: setTimeout(commitEvolution, CINEMATIC_WAIT_MS) };
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('evolve-start');
  showBubble(`<b class="name">${esc(m.stages[shownIdx].name)}</b>의 모습이 변하기 시작했다!`, CINEMATIC_WAIT_MS);
  pushState(); // 대기 글로우 해제
}

// 연출 상태 정리. 커밋·취소·중단 세 갈래가 공유한다
function endCinematic() {
  clearTimeout(cinematic.timer);
  cinematic = null;
}

// 축하 문구는 말풍선(HTML)과 시스템 알림(평문)이 같은 문장을 쓴다
function congratsParts(from, to) {
  const text = `${from.name}${particle(from.name, '은는')} ${to.name}${particle(to.name, '으로')} 진화했습니다!`;
  const html = `축하합니다! <b class="name">${esc(from.name)}</b>${particle(from.name, '은는')} <b class="name">${esc(to.name)}</b>${particle(to.name, '으로')} 진화했습니다!`;
  return { text, html };
}

function commitEvolution() {
  const { m, fromIdx, toIdx } = cinematic;
  endCinematic();
  if (cfg.evolutionBlock) setBlock(null); // 재시도 진화가 커밋됐으니 이전 차단은 소비됐다
  const from = m.stages[fromIdx];
  const to = m.stages[toIdx];
  shownMonster = cfg.activeMonster;
  shownIdx = toIdx;
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('evolve-commit', { gif: to.gif });
  // 플래시가 잦아들 무렵에 맞춰 축하 메시지
  const { text, html } = congratsParts(from, to);
  clearTimeout(congratsTimer);
  congratsTimer = setTimeout(() => { if (!cinematic) showBubble(html, 5000); }, 1500);
  notify('축하합니다!', text);
  updateTray(); pushState(); pushPanel();
}

function cancelEvolution() {
  if (!cinematic) return;
  const { m, fromIdx, toIdx } = cinematic;
  endCinematic();
  pending = null;
  setBlock({ monster: cfg.activeMonster, idx: fromIdx, blockedTo: toIdx });
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('evolve-cancel');
  showBubble(`…어라? <b class="name">${esc(m.stages[fromIdx].name)}</b>의 진화가 멈췄다!`, 4000);
  updateTray(); pushState(); pushPanel();
}

// 진화의 전제(소스·몬스터·단계 구성)가 바뀌면 연출을 조용히 접는다 (차단 저장 없음)
function abortCinematic() {
  if (!cinematic) return;
  endCinematic();
  clearTimeout(congratsTimer);
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('evolve-cancel');
}

const clampStage = (m, idx) => Math.min(idx, m.stages.length - 1); // shownIdx는 단계 삭제로 범위를 벗어날 수 있다

// 차단 중에는 이미 넘은 임계값 대신 재시도 임계값(다음 단계)을 보여준다 — "진화까지 0%p" 방지
function nextThresholdFor(m, idx) {
  const b = currentBlock(m);
  return (b ? m.thresholds[b.blockedTo] : m.thresholds[idx]) ?? null;
}

function currentState() {
  const m = cfg.monsters[cfg.activeMonster];
  if (!m || shownIdx == null) return null;
  const idx = clampStage(m, shownIdx);
  return {
    percent: lastPercent,
    stage: m.stages[idx],
    stageIdx: idx,
    nextThreshold: nextThresholdFor(m, idx),
    error: lastError,
    petSize: cfg.petSize || 140,
    pendingEvolution: !!pending, // 펫 창이 글로우를 켜고, 클릭을 진화 진행으로 해석한다
  };
}

function pushState() {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('state', currentState());
}

let claudeBackoffUntil = 0; // usage API가 429를 주면 retry-after까지 조회 중단

// 성공 조회값을 config에 캐시 — 재시작 직후 백오프여도 펫이 바로 보이게
function persistUsage(u) {
  // 소스별로 나눠 담아야 소스를 오가도 서로의 값을 덮어쓰지 않는다
  cfg.usageCache[cfg.source] = { usage: u, at: Date.now() };
  saveConfig(configFile(), cfg);
}

const pollIntervalMs = () => (cfg.pollIntervalMin || 5) * 60 * 1000;

async function poll() {
  try {
    if (cfg.source === 'codex') {
      const u = await fetchCodexUsage();
      if (u) { lastUsage = u; lastPercent = u.weekly.pct; persistUsage(u); }
      lastError = u == null;
    } else if (Date.now() >= claudeBackoffUntil) {
      const u = await fetchClaudeUsage();
      lastUsage = u;
      lastPercent = u.weekly.pct;
      lastError = false;
      persistUsage(u);
    }
    // 백오프 중이면 호출 없이 마지막 값 유지
  } catch (e) {
    if (e && e.rateLimited) {
      claudeBackoffUntil = Date.now() + (e.retryAfterMs || 3_600_000) + 30_000;
      lastError = lastPercent == null; // 표시할 값이 하나도 없을 때만 경고
    } else {
      lastError = true; // 마지막 성공 값 유지
    }
  }
  applyStage(true); // 사용량 변화로 단계가 올랐으면 여기서 진화 연출이 시작된다
  updateTray();
  pushState();
  pushPanel();
}

function updateTray() {
  // 아이콘은 펫 창이 GIF 첫 프레임을 PNG로 떠서 tray-icon IPC로 보냄 (nativeImage는 GIF 미지원)
  const base = lastError ? ' ⚠️' : lastPercent == null ? ' …' : ` Lv.${Math.round(lastPercent)}`;
  // 대기가 며칠 갈 수 있으므로 ✨ 뒤에도 사용량·오류 표시를 남긴다
  tray.setTitle(cinematic || pending ? ` ✨${base.trim() === '…' ? '' : base}` : base);
}

function panelData() {
  const m = cfg.monsters[cfg.activeMonster];
  const idx = m ? clampStage(m, shownIdx ?? 0) : 0;
  return {
    source: cfg.source,
    error: lastError,
    usage: lastUsage,
    monster: m ? {
      name: m.displayName,
      stageName: m.stages[idx].name,
      stageIdx: idx,
      stageCount: m.stages.length,
      nextThreshold: nextThresholdFor(m, idx),
      gif: m.stages[idx].gif, // 패널 링 한가운데에 현재 단계 스프라이트를 띄움
    } : null,
  };
}

function pushPanel() {
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('panel-data', panelData());
}

const PANEL_W = 340;
let panelPinned = false; // 설정 섹션 펼친 동안 blur로 닫히지 않게

function createPanelWindow() {
  panelWin = new BrowserWindow({
    width: PANEL_W, height: 320, show: false, frame: false, resizable: false,
    transparent: true, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, // 투명 창 + 리사이즈에서 OS 그림자가 유령 사각형을 남김 — CSS 그림자만 사용
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  panelWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWin.loadFile(path.join(__dirname, 'panel', 'panel.html'));
  panelWin.on('blur', () => { if (!panelPinned) panelWin.hide(); });
}

// 트레이 아래에 뜨므로 화면 아래쪽으로 쓸 수 있는 만큼이 창 높이의 한계다.
// 이 값을 넘기면 렌더러가 카드 안쪽을 스크롤한다.
function panelMaxHeight() {
  const [x, y] = panelWin.getPosition();
  const wa = screen.getDisplayNearestPoint({ x: x + PANEL_W / 2, y }).workArea;
  return Math.max(280, wa.y + wa.height - y - 8);
}

function togglePanel() {
  if (panelWin.isVisible()) return panelWin.hide();
  const b = tray.getBounds();
  panelWin.setPosition(Math.round(b.x + b.width / 2 - PANEL_W / 2), Math.round(b.y + b.height + 4));
  panelWin.webContents.send('panel-limit', panelMaxHeight());
  pushPanel();
  panelWin.show();
}

// 말풍선은 별도 창이라 펫 창은 스프라이트 크기만큼만 차지 (화면 최상단까지 이동 가능)
const petWinW = () => (cfg.petSize || 140) + 16;
const petWinH = () => (cfg.petSize || 140) + 16;

const BUBBLE_W = 380;
const BUBBLE_H = 76;

function createBubbleWindow() {
  bubbleWin = new BrowserWindow({
    width: BUBBLE_W, height: BUBBLE_H, show: false, frame: false,
    transparent: true, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    focusable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.setIgnoreMouseEvents(true);
  bubbleWin.loadFile(path.join(__dirname, 'pet', 'bubble.html'));
  // 첫 폴링이 창 로드보다 빨라 대기 말풍선을 놓쳤을 수 있으니 로드 후 한 번 다시 그린다
  bubbleWin.webContents.on('did-finish-load', showPendingBubble);
}

// 펫 위치 기준으로 위/아래 방향을 정해 말풍선 표시.
// 화면 가장자리에선 창을 안쪽으로 클램프하고 꼬리만 펫을 향하게 이동
function showBubble(html, duration = 2500) {
  if (!bubbleWin || bubbleWin.isDestroyed() || !petWin || petWin.isDestroyed()) return;
  const p = petWin.getBounds();
  const petCenterX = p.x + p.width / 2;
  const wa = screen.getDisplayNearestPoint({ x: petCenterX, y: p.y }).workArea;
  let bx = Math.round(petCenterX - BUBBLE_W / 2);
  bx = Math.min(Math.max(bx, wa.x + 4), wa.x + wa.width - BUBBLE_W - 4);
  const below = p.y - BUBBLE_H < wa.y; // 위에 공간 없으면 아래로
  bubbleWin.setBounds({
    x: bx,
    y: below ? p.y + p.height - 8 : p.y - BUBBLE_H + 8,
    width: BUBBLE_W, height: BUBBLE_H,
  });
  bubbleWin.webContents.send('bubble-content', { html, below, tailX: Math.round(petCenterX - bx) });
  bubbleWin.showInactive();
  clearTimeout(bubbleTimer);
  if (duration === Infinity) return; // 대기 말풍선 — 지울 때까지 유지
  bubbleTimer = setTimeout(() => {
    if (pending) return showPendingBubble(); // 임시 말풍선이 걷히면 대기 말풍선으로 복귀
    if (!bubbleWin.isDestroyed()) bubbleWin.hide();
  }, duration);
}

function hideBubble() {
  clearTimeout(bubbleTimer);
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide();
}

function createPetWindow() {
  petWin = new BrowserWindow({
    width: petWinW(), height: petWinH(),
    transparent: true, frame: false, resizable: false,
    alwaysOnTop: true, hasShadow: false, skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (cfg.petPosition) petWin.setPosition(cfg.petPosition.x, cfg.petPosition.y);
  petWin.loadFile(path.join(__dirname, 'pet', 'pet.html'));
  petWin.webContents.on('did-finish-load', pushState);
}

// 설정은 패널의 인라인 섹션으로 통일 — 패널을 트레이 밑에 펼친 상태로 연다
function openPanelSettings() {
  if (!panelWin || panelWin.isDestroyed()) return;
  const b = tray.getBounds();
  panelWin.setPosition(Math.round(b.x + b.width / 2 - PANEL_W / 2), Math.round(b.y + b.height + 4));
  pushPanel();
  panelWin.show();
  panelWin.webContents.send('expand-settings');
}

// 외부 알림: events.jsonl에 한 줄 추가되면 펫이 알림 (Claude Code Notification 훅 등)
function watchEvents() {
  const file = path.join(app.getPath('userData'), 'events.jsonl');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  let offset = fs.statSync(file).size;
  fs.watch(path.dirname(file), (_, name) => {
    if (name !== 'events.jsonl') return;
    let size;
    try { size = fs.statSync(file).size; } catch { return; }
    if (size < offset) { offset = size; return; } // truncate 대응
    if (size === offset) return;
    const buf = Buffer.alloc(size - offset);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    offset = size;
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line).message; } catch { msg = line.trim(); }
      if (msg && petWin && !petWin.isDestroyed()) petWin.webContents.send('notify', String(msg).slice(0, 80));
    }
  });
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  cfg = loadConfig(configFile());
  // 캐시가 지금 소스의 값일 때만 복원 (다른 소스 값이면 첫 폴링 때까지 비워둔다)
  const cached = cachedUsage(cfg);
  if (cached) {
    lastUsage = cached;
    lastPercent = cached.weekly.pct; // 첫 폴링 전/백오프 중에도 마지막 값으로 표시
  }
  applyStage(false); // 시작 직후에는 연출 없이 현재 단계를 바로 보여준다
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(' …');
  const menu = Menu.buildFromTemplate([
    { label: '설정', click: openPanelSettings },
    { label: '지금 새로고침', click: poll },
    { type: 'separator' },
    { label: '종료', role: 'quit' },
  ]);
  tray.on('click', togglePanel);
  tray.on('right-click', () => tray.popUpContextMenu(menu));
  createPanelWindow();
  createPetWindow();
  createBubbleWindow();
  watchEvents();
  poll();
  setInterval(poll, pollIntervalMs());
});

ipcMain.on('get-config-path', (e) => { e.returnValue = configFile(); });
ipcMain.on('panel-refresh', poll);
ipcMain.on('panel-quit', () => app.quit());
ipcMain.on('panel-pinned', (_, v) => { panelPinned = !!v; });
ipcMain.on('panel-resize', (e, h) => {
  const [x, y] = panelWin.getPosition();
  const max = panelMaxHeight();
  panelWin.setBounds({ x, y, width: PANEL_W, height: Math.min(h, max) });
  // 창을 열 때 보낸 한계를 렌더러가 로드 전이라 놓쳤을 수 있어 함께 회신한다.
  // 값이 그대로면 렌더러가 무시하므로 되돌이표가 생기지 않는다.
  e.sender.send('panel-limit', max);
});
ipcMain.on('config-changed', () => {
  const prevSource = cfg.source;
  const prevMonster = cfg.activeMonster;
  const prevMonsterDef = JSON.stringify(cfg.monsters[cfg.activeMonster] ?? null);
  cfg = loadConfig(configFile());
  // 진화의 전제(소스·몬스터·단계 구성)가 실제로 바뀐 경우에만 연출을 접는다.
  // 펫 크기 같은 무관한 설정 변경이 연출을 끊고 알림을 중복 발사하지 않도록.
  if (cfg.source !== prevSource || cfg.activeMonster !== prevMonster
    || JSON.stringify(cfg.monsters[cfg.activeMonster] ?? null) !== prevMonsterDef) {
    abortCinematic();
  }
  if (petWin && !petWin.isDestroyed()) {
    const [x, y] = petWin.getPosition();
    petWin.setBounds({ x, y, width: petWinW(), height: petWinH() });
  }
  // 소스를 바꾸면 이전 소스의 수치를 그대로 두지 않고 새 소스의 캐시로 갈아끼운다.
  // 캐시가 없으면 비워두고, 폴링 주기가 지난 값이면 뒤이어 다시 조회한다.
  const sourceChanged = cfg.source !== prevSource;
  if (sourceChanged) {
    const cached = cachedUsage(cfg);
    lastUsage = cached;
    lastPercent = cached ? cached.weekly.pct : null;
    lastError = false;
  }
  // 소스·몬스터가 그대로면(임계값 편집 등) 단계 상승에 연출을 태운다 — 연출 미리보기도 겸함.
  // 소스나 몬스터가 바뀌었을 때는 "진화"가 아니므로 즉시 반영.
  applyStage(!sourceChanged && cfg.activeMonster === prevMonster);
  updateTray();
  pushState();
  pushPanel();
  // 오갈 때마다 조회하면 호출 제한에 걸리므로, 최근에 받아둔 값이 있으면 건너뛴다
  if (sourceChanged && !isCacheFresh(cfg, cfg.source, pollIntervalMs())) poll();
});
ipcMain.on('tray-icon', (_, dataUrl) => {
  if (!tray) return;
  try {
    tray.setImage(dataUrl ? nativeImage.createFromDataURL(dataUrl).resize({ height: 18 }) : nativeImage.createEmpty());
  } catch { tray.setImage(nativeImage.createEmpty()); }
});
ipcMain.on('ignore-mouse', (_, v) => {
  if (petWin && !petWin.isDestroyed()) petWin.setIgnoreMouseEvents(v, { forward: true });
});
// 드래그 시작 좌표는 메인이 직접 조회 (렌더러의 window.screenX는 이동 직후 스테일할 수 있음)
let dragStart = null;
ipcMain.on('drag-start', () => { dragStart = petWin.getPosition(); });
ipcMain.on('move-pet', (_, { dx, dy }) => {
  if (!dragStart) return;
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide(); // 드래그 중엔 말풍선 숨김
  petWin.setPosition(dragStart[0] + dx, dragStart[1] + dy);
});
ipcMain.on('bubble', (_, { html, duration }) => showBubble(html, duration));
ipcMain.on('evolve-go', startPendingEvolution);
// 이스터에그: 연출 중 펫 창(클릭 직후라 포커스를 가짐)에서 B를 누르면 진화를 멈춘다.
// 전역 단축키가 아니라 창 로컬 입력이므로 다른 앱의 타이핑을 건드리지 않는다.
ipcMain.on('evolve-cancel-request', cancelEvolution);
ipcMain.on('open-settings', openPanelSettings);
ipcMain.on('drag-end', () => {
  const [x, y] = petWin.getPosition();
  cfg.petPosition = { x, y };
  saveConfig(configFile(), cfg);
  showPendingBubble(); // 대기 중이면 옮긴 자리로 말풍선이 따라온다
});

app.on('window-all-closed', () => { /* 트레이 상주 앱: 종료하지 않음 */ });
