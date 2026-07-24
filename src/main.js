const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { loadConfig, saveConfig } = require('./config');
const { stageIndex } = require('./evolution');
const { fetchClaudeUsage } = require('./usage/claude');
const { fetchCodexUsage } = require('./usage/codex');

let cfg, petWin, settingsWin, panelWin, tray;
let lastPercent = null;
let lastUsage = null; // { fiveHour: {pct, resetsAt}|null, weekly: {pct, resetsAt} }
let lastError = false;

const configFile = () => path.join(app.getPath('userData'), 'config.json');

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

async function poll() {
  try {
    const u = cfg.source === 'codex' ? await fetchCodexUsage() : await fetchClaudeUsage();
    if (u) { lastUsage = u; lastPercent = u.weekly.pct; }
    lastError = u == null;
  } catch {
    lastError = true; // 마지막 성공 값 유지
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
    transparent: true, alwaysOnTop: true, skipTaskbar: true, hasShadow: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  panelWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWin.loadFile(path.join(__dirname, 'panel', 'panel.html'));
  panelWin.on('blur', () => { if (!panelPinned) panelWin.hide(); });
}

function togglePanel() {
  if (panelWin.isVisible()) return panelWin.hide();
  const b = tray.getBounds();
  panelWin.setPosition(Math.round(b.x + b.width / 2 - PANEL_W / 2), Math.round(b.y + b.height + 4));
  pushPanel();
  panelWin.show();
}

// 말풍선이 안 짤리게 최소 너비 확보. 투명 영역 클릭은 ignore-mouse IPC로 통과시킴
const petWinW = () => Math.max((cfg.petSize || 140) + 60, 380);
const petWinH = () => (cfg.petSize || 140) + 90;

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

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 560, height: 680, title: 'tokenmon 설정',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
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
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(' …');
  const menu = Menu.buildFromTemplate([
    { label: '설정', click: openSettings },
    { label: '지금 새로고침', click: poll },
    { type: 'separator' },
    { label: '종료', role: 'quit' },
  ]);
  tray.on('click', togglePanel);
  tray.on('right-click', () => tray.popUpContextMenu(menu));
  createPanelWindow();
  createPetWindow();
  watchEvents();
  poll();
  setInterval(poll, (cfg.pollIntervalMin || 5) * 60 * 1000);
});

ipcMain.on('get-config-path', (e) => { e.returnValue = configFile(); });
ipcMain.on('panel-refresh', poll);
ipcMain.on('panel-quit', () => app.quit());
ipcMain.on('panel-pinned', (_, v) => { panelPinned = !!v; });
ipcMain.on('panel-resize', (_, h) => {
  const [x, y] = panelWin.getPosition();
  panelWin.setBounds({ x, y, width: PANEL_W, height: h });
});
ipcMain.on('config-changed', () => {
  cfg = loadConfig(configFile());
  if (petWin && !petWin.isDestroyed()) {
    const [x, y] = petWin.getPosition();
    petWin.setBounds({ x, y, width: petWinW(), height: petWinH() });
  }
  updateTray();
  pushState();
  pushPanel();
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
ipcMain.on('move-pet', (_, { x, y }) => petWin.setPosition(x, y));
ipcMain.on('drag-end', () => {
  const [x, y] = petWin.getPosition();
  cfg.petPosition = { x, y };
  saveConfig(configFile(), cfg);
});

app.on('window-all-closed', () => { /* 트레이 상주 앱: 종료하지 않음 */ });
