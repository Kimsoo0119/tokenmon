const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { loadConfig, saveConfig, cachedUsage, isCacheFresh } = require('./config');
const { stageIndex } = require('./evolution');
const { buildIndex, koName } = require('./dex');
const { monsterIdFor, buildMonster } = require('./monsters');
const { downloadGif } = require('./pokeapi');
const { fetchClaudeUsage } = require('./usage/claude');
const { fetchCodexUsage } = require('./usage/codex');

const dexIndex = buildIndex(require('../assets/dex.json'));

let cfg, petWin, panelWin, bubbleWin, tray;
let bubbleTimer;
let lastPercent = null;
let lastUsage = null; // { fiveHour: {pct, resetsAt}|null, weekly: {pct, resetsAt} }
let lastError = false;

const configFile = () => path.join(app.getPath('userData'), 'config.json');
const cacheDir = () => path.join(app.getPath('userData'), 'cache');

function currentState() {
  const m = cfg.monsters[cfg.activeMonster];
  if (!m || lastPercent == null) return null;
  const idx = stageIndex(m.thresholds, lastPercent);
  return {
    percent: lastPercent,
    stage: m.stages[idx],
    stageIdx: idx,
    nextThreshold: m.thresholds[idx] ?? null,
    error: lastError,
    petSize: cfg.petSize || 140,
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
  updateTray();
  pushState();
  pushPanel();
}

function updateTray() {
  // 아이콘은 펫 창이 GIF 첫 프레임을 PNG로 떠서 tray-icon IPC로 보냄 (nativeImage는 GIF 미지원)
  tray.setTitle(lastError ? ' ⚠️' : lastPercent == null ? ' …' : ` Lv.${Math.round(lastPercent)}`);
}

function panelData() {
  const m = cfg.monsters[cfg.activeMonster];
  const idx = (m && lastPercent != null) ? stageIndex(m.thresholds, lastPercent) : 0;
  return {
    source: cfg.source,
    error: lastError,
    usage: lastUsage,
    monster: m ? {
      name: m.displayName,
      stageName: m.stages[idx].name,
      stageIdx: idx,
      stageCount: m.stages.length,
      nextThreshold: m.thresholds[idx] ?? null,
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
  bubbleTimer = setTimeout(() => { if (!bubbleWin.isDestroyed()) bubbleWin.hide(); }, duration);
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
// 패널과 도감이 각자 등록 코드를 들면 언젠가 서로 어긋나므로 메인에 하나만 둔다.
// 스프라이트를 모두 받은 뒤에야 설정을 건드려서, 도중에 실패해도 설정은 멀쩡하다.
ipcMain.handle('add-monster', async (_, chainPath) => {
  try {
    if (!Array.isArray(chainPath) || !chainPath.length) throw new Error('진화 경로가 비어 있어요');
    // 도감에 있는 슬러그만 통과시킨다 — 경로를 벗어나는 이름이 파일 이름이 되는 걸 막는다
    for (const slug of chainPath) {
      if (!dexIndex.bySlug[slug]) throw new Error(`도감에 없는 종이에요: ${slug}`);
    }
    const gifs = [];
    for (const slug of chainPath) gifs.push(await downloadGif(slug, cacheDir()));
    const id = monsterIdFor(chainPath);
    cfg.monsters[id] = buildMonster(chainPath, gifs, (s) => koName(dexIndex, s));
    if (!cfg.activeMonster) cfg.activeMonster = id;
    saveConfig(configFile(), cfg);
    pushState();
    pushPanel();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
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
  cfg = loadConfig(configFile());
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
ipcMain.on('open-settings', openPanelSettings);
ipcMain.on('drag-end', () => {
  const [x, y] = petWin.getPosition();
  cfg.petPosition = { x, y };
  saveConfig(configFile(), cfg);
});

app.on('window-all-closed', () => { /* 트레이 상주 앱: 종료하지 않음 */ });
