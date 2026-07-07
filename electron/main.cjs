const { app, BrowserWindow, globalShortcut, shell } = require('electron');

const DEFAULT_URL = 'https://playkore.com';
const START_URL = process.env.KORE_DESKTOP_URL || DEFAULT_URL;
const WINDOWED = process.argv.includes('--windowed') || process.env.KORE_DESKTOP_WINDOWED === '1';
const DECK_INPUT_DEBUG = process.argv.includes('--deck-input-debug') || process.env.KORE_DECK_INPUT_DEBUG === '1';
const STEAM_DECK = process.argv.includes('--steamdeck') || process.env.KORE_STEAM_DECK === '1';
const FORCE_EXIT_DELAY_MS = 1500;

let mainWindow = null;
let inputDebugTimer = null;
let forceExitTimer = null;
let isForceExiting = false;

function clearRuntimeTimers() {
  if (inputDebugTimer) {
    clearInterval(inputDebugTimer);
    inputDebugTimer = null;
  }
  if (forceExitTimer) {
    clearTimeout(forceExitTimer);
    forceExitTimer = null;
  }
}

function forceExit(reason, code = 0) {
  if (isForceExiting) return;
  isForceExiting = true;
  console.log(`[kore desktop] exiting: ${reason}`);
  clearRuntimeTimers();
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Electron may already be tearing down shortcuts during fatal close paths.
  }
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  } catch {
    // If the renderer is gone or unresponsive, app.exit below is the real guardrail.
  }
  app.exit(code);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    console.log('[kore desktop] second launch detected; relaunching fresh instance');
    app.relaunch({ args: process.argv.slice(1) });
    forceExit('second-instance-relaunch');
  });
}

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

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    forceExit(`renderer-gone:${details.reason}`, details.reason === 'crashed' ? 1 : 0);
  });

  mainWindow.webContents.on('unresponsive', () => {
    if (forceExitTimer) return;
    console.warn('[kore desktop] renderer unresponsive; waiting briefly before exit');
    forceExitTimer = setTimeout(() => forceExit('renderer-unresponsive', 1), FORCE_EXIT_DELAY_MS);
  });

  mainWindow.webContents.on('responsive', () => {
    if (!forceExitTimer) return;
    clearTimeout(forceExitTimer);
    forceExitTimer = null;
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

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (process.platform !== 'darwin' || STEAM_DECK) forceExit('main-window-closed');
  });
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
  if (process.platform !== 'darwin' || STEAM_DECK) forceExit('window-all-closed');
});

app.on('will-quit', () => {
  clearRuntimeTimers();
  globalShortcut.unregisterAll();
});

for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
  process.on(signal, () => forceExit(`signal:${signal}`));
}
