import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import type {
  AppSettings,
  AttachmentInput,
  ChatEvent,
  NavigationTarget
} from '@zbot/shared';
import { IPC } from '@zbot/shared';
import type { AppLogger } from './services/logger';

export function resourcePath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', name)
    : join(__dirname, '../../resources', name);
}

function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: true
  };
}

function applyExternalNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (!devUrl && url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
  });
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private quickWindow: BrowserWindow | null = null;
  private quitting = false;

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly logger: AppLogger
  ) {}

  createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return this.mainWindow;
    const window = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 960,
      minHeight: 680,
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#171513' : '#f5f1e9',
      title: 'Z Bot',
      autoHideMenuBar: true,
      icon: resourcePath('icon.png'),
      webPreferences: secureWebPreferences()
    });
    applyExternalNavigation(window);

    window.once('ready-to-show', () => {
      if (!this.getSettings().general.startMinimized) window.show();
    });

    window.on('close', (event) => {
      if (this.quitting) return;
      const settings = this.getSettings();
      if (settings.general.minimizeToTray) {
        event.preventDefault();
        window.hide();
      }
    });

    window.on('closed', () => {
      this.mainWindow = null;
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'));
    }
    this.mainWindow = window;
    return window;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  showMain(): BrowserWindow {
    const window = this.createMainWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return window;
  }

  hideQuickAsk(): void {
    this.quickWindow?.hide();
  }

  showQuickAsk(): BrowserWindow {
    if (this.quickWindow && !this.quickWindow.isDestroyed()) {
      this.quickWindow.center();
      this.quickWindow.show();
      this.quickWindow.focus();
      return this.quickWindow;
    }
    const window = new BrowserWindow({
      width: 660,
      height: 390,
      minWidth: 520,
      minHeight: 320,
      maxHeight: 560,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1c19' : '#fbf7ef',
      webPreferences: secureWebPreferences()
    });
    applyExternalNavigation(window);
    window.once('ready-to-show', () => {
      window.center();
      window.show();
      window.focus();
    });
    window.on('blur', () => {
      if (!window.webContents.isDevToolsOpened()) window.hide();
    });
    window.on('closed', () => {
      this.quickWindow = null;
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/quick`);
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/quick' });
    }
    this.quickWindow = window;
    return window;
  }

  navigate(target: NavigationTarget): void {
    const window = this.showMain();
    const send = (): void => window.webContents.send(IPC.eventNavigate, target);
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }

  sendScreenshot(attachment: AttachmentInput): void {
    const window = this.showMain();
    const send = (): void => window.webContents.send(IPC.eventScreenshot, { attachment });
    if (window.webContents.isLoading()) {
      window.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }

  broadcastChat(event: ChatEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC.chatEvent, event);
    }
    if (this.quickWindow && !this.quickWindow.isDestroyed()) {
      this.quickWindow.webContents.send(IPC.chatEvent, event);
    }
  }

  sendTheme(theme: 'light' | 'dark'): void {
    for (const window of [this.mainWindow, this.quickWindow]) {
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC.eventTheme, theme);
      }
    }
  }

  isMainVisible(): boolean {
    return Boolean(this.mainWindow?.isVisible());
  }

  prepareQuit(): void {
    this.quitting = true;
    this.quickWindow?.destroy();
    this.mainWindow?.destroy();
  }

  closeQuickAskFromRenderer(): void {
    this.quickWindow?.hide();
  }

  logNavigationError(error: unknown): void {
    this.logger.warn({ error: String(error) }, 'window navigation failed');
  }
}
