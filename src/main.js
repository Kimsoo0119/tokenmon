const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const { loadConfig, saveConfig } = require('./config');
const { stageIndex } = require('./evolution');
const { fetchClaudeWeekly } = require('./usage/claude');
const { fetchCodexWeekly } = require('./usage/codex');

let cfg, petWin, settingsWin, tray;
let lastPercent = null;
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
  };
}

function pushState() {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('state', currentState());
}

async function poll() {
  try {
    const p = cfg.source === 'codex' ? await fetchCodexWeekly() : await fetchClaudeWeekly();
    if (p != null) lastPercent = p;
    lastError = p == null;
  } catch {
    lastError = true; // 마지막 성공 값 유지
  }
  tray.setTitle(lastError ? ' ⚠️' : lastPercent == null ? ' …' : ` ${Math.round(lastPercent)}%`);
  pushState();
}

function createPetWindow() {
  petWin = new BrowserWindow({
    width: 200, height: 200,
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
    width: 560, height: 680, title: 'tokemon 설정',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  cfg = loadConfig(configFile());
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(' …');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '설정', click: openSettings },
    { label: '지금 새로고침', click: poll },
    { type: 'separator' },
    { label: '종료', role: 'quit' },
  ]));
  createPetWindow();
  poll();
  setInterval(poll, (cfg.pollIntervalMin || 5) * 60 * 1000);
});

ipcMain.on('get-config-path', (e) => { e.returnValue = configFile(); });
ipcMain.on('config-changed', () => { cfg = loadConfig(configFile()); pushState(); });
ipcMain.on('move-pet', (_, { x, y }) => petWin.setPosition(x, y));
ipcMain.on('drag-end', () => {
  const [x, y] = petWin.getPosition();
  cfg.petPosition = { x, y };
  saveConfig(configFile(), cfg);
});

app.on('window-all-closed', () => { /* 트레이 상주 앱: 종료하지 않음 */ });
