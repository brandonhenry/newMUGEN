const { app, BrowserWindow, globalShortcut, shell } = require('electron');

const DEFAULT_URL = 'https://playkore.com';
const START_URL = process.env.KORE_DESKTOP_URL || DEFAULT_URL;
const WINDOWED = process.argv.includes('--windowed') || process.env.KORE_DESKTOP_WINDOWED === '1';

let mainWindow = null;

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
    if (!WINDOWED) mainWindow.setFullScreen(true);
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
  globalShortcut.unregisterAll();
});
