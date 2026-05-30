import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { registerIpc } from './ipc.js';
import { applyRuntimeConfig, loadRuntimeConfig } from '../config/runtime-config.js';
import { AppService } from '../services/app-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// The reader does not use browser passwords/cookies; avoid Chromium keychain prompts on macOS.
app.commandLine.appendSwitch('use-mock-keychain');

async function createWindow(): Promise<void> {
  const homeDir = process.env.BOOK_AGENT_READER_HOME || path.join(app.getPath('userData'), 'library');
  const runtimeConfig = loadRuntimeConfig({ userDataDir: app.getPath('userData') });
  applyRuntimeConfig(runtimeConfig);
  const service = new AppService(homeDir, runtimeConfig);
  registerIpc(service);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    title: '图书智能伴读器',
    backgroundColor: '#0d0d0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
