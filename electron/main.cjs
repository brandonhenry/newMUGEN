const { app, BrowserWindow, globalShortcut, shell } = require('electron');

const DEFAULT_URL = 'https://playkore.com';
const START_URL = process.env.KORE_DESKTOP_URL || DEFAULT_URL;
const WINDOWED = process.argv.includes('--windowed') || process.env.KORE_DESKTOP_WINDOWED === '1';
const DECK_INPUT_DEBUG = process.argv.includes('--deck-input-debug') || process.env.KORE_DECK_INPUT_DEBUG === '1';

let mainWindow = null;
let inputDebugTimer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    fullscreen: !WINDOWED,
    autoHideMenuBar: true,
    backgroundColor: '#020615',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    if (!WINDOWED) mainWindow.setFullScreen(true);
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (!mainWindow) return;
    mainWindow.focus();
    if (DECK_INPUT_DEBUG) startDeckInputDebug();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const next = new URL(url);
    const allowed = new URL(START_URL);
    if (next.origin === allowed.origin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  void mainWindow.loadURL(START_URL);
}

function startDeckInputDebug() {
  if (!mainWindow || inputDebugTimer) return;
  inputDebugTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void mainWindow.webContents.executeJavaScript(`
      (() => {
        const pads = Array.from(navigator.getGamepads?.() || []).filter(Boolean);
        const active = (pad, deadzone = 0.35) =>
          pad.buttons.some((button) => button.pressed) || pad.axes.some((axis) => Math.abs(axis) > deadzone);
        const score = (pad) => {
          const id = String(pad.id || '').toLowerCase();
          let next = 0;
          if (active(pad)) next += 1000;
          if (pad.mapping === 'standard') next += 160;
          if (/(xinput|xbox|steam virtual|steam input|wireless controller|dualsense|dualshock|gamepad)/i.test(id)) next += 60;
          if (pad.buttons.length >= 16 && pad.axes.length >= 2) next += 30;
          if (pad.buttons.length < 8 || pad.axes.length < 2) next -= 80;
          if (/(mouse|keyboard|desktop|trackpad|touchpad|lizard)/i.test(id)) next -= 120;
          return next;
        };
        const preferred = [...pads].sort((a, b) => score(b) - score(a) || a.index - b.index);
        return {
          count: pads.length,
          primaryIndex: preferred[0]?.index ?? null,
          pads: pads.map((pad) => ({
            index: pad.index,
            id: pad.id,
            mapping: pad.mapping,
            connected: pad.connected,
            active: active(pad),
            score: score(pad),
            buttonCount: pad.buttons.length,
            axisCount: pad.axes.length,
            buttons: pad.buttons.map((button, index) => button.pressed ? index : null).filter((index) => index !== null),
            axes: pad.axes.map((axis) => Number(axis.toFixed(3)))
          }))
        };
      })()
    `).then((state) => {
      console.log('[kore deck input]', JSON.stringify(state));
    }).catch((error) => {
      console.warn('[kore deck input] failed to read gamepads', error);
    });
  }, 2000);
}

function toggleFullscreen() {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('F11', toggleFullscreen);
  globalShortcut.register('Alt+Enter', toggleFullscreen);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (inputDebugTimer) clearInterval(inputDebugTimer);
  globalShortcut.unregisterAll();
});
