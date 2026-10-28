import {
  app,
  clipboard,
  nativeTheme,
  protocol,
  session,
  shell
} from 'electron';
import { join } from 'node:path';
import { LocalMemoryService } from '@zbot/memory';
import { BotRuntime } from '@zbot/bot-core';
import { createStores, ZBotDatabase } from '@zbot/database';
import { ToolRegistry } from '@zbot/tools';
import { registerIpc } from '../ipc/register';
import type { AppContext } from '../ipc/context';
import { AttachmentService } from '../services/attachments';
import { cleanupOldLogs, createLogger, redactErrorMessage } from '../services/logger';
import { NotificationService } from '../services/notifications';
import { WindowsOcrService } from '../services/ocr';
import { ProactiveService } from '../services/proactive';
import { ProviderService } from '../services/providers';
import { SchedulerService } from '../services/scheduler';
import { captureScreenInput } from '../services/screenshot';
import { SecretService } from '../services/secrets';
import { registerShortcuts, unregisterShortcuts } from '../services/shortcuts';
import { createTray } from '../services/tray';
import { WindowManager } from '../window-manager';

const APP_NAME = 'Z Bot';
app.setName(APP_NAME);
const userDataOverride = process.env.ZBOT_USER_DATA_DIR;
app.setPath('userData', userDataOverride || join(app.getPath('appData'), 'ZBot'));
if (process.platform === 'win32') {
  app.setAppUserModelId('com.zbot.desktop');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'zbot-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let context: AppContext | null = null;
let windows: WindowManager | null = null;
let scheduler: SchedulerService | null = null;
let tray: Electron.Tray | null = null;
let cleaningUp = false;

function setupMediaProtocol(attachments: AttachmentService): void {
  protocol.handle('zbot-media', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'attachment') {
        return new Response('Not found', { status: 404 });
      }
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const file = await attachments.read(id);
      if (!file) return new Response('Not found', { status: 404 });
      return new Response(new Uint8Array(file.data), {
        status: 200,
        headers: {
          'content-type': file.mimeType,
          'cache-control': 'private, max-age=3600',
          'content-security-policy': "default-src 'none'"
        }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function initialize(): Promise<void> {
  const dataDir = app.getPath('userData');
  const logger = createLogger(dataDir, 30);
  logger.info({ version: app.getVersion(), platform: process.platform }, 'starting Z Bot');

  const databasePath = join(dataDir, 'zbot.db');
  const database = new ZBotDatabase(databasePath, {
    backupDirectory: join(dataDir, 'backups')
  });
  const stores = createStores(database);
  const settings = stores.settings.get();
  logger.level = settings.privacy.logLevel;
  cleanupOldLogs(join(dataDir, 'logs'), settings.privacy.retentionDays);
  const interrupted = stores.tasks.markInterrupted();
  if (interrupted > 0) {
    logger.info({ count: interrupted }, 'paused interrupted tasks');
  }
  stores.memories.archiveExpired();

  const attachments = new AttachmentService(join(dataDir, 'attachments'));
  await attachments.initialize();
  const ocr = new WindowsOcrService(dataDir, logger);
  const secrets = new SecretService(stores.secrets);
  const providers = new ProviderService(stores.modelConfigs, secrets);
  const memory = new LocalMemoryService(stores.memories);

  windows = new WindowManager(() => stores.settings.get(), logger);
  const notifications = new NotificationService((target) => windows?.navigate(target));

  let schedulerRef: SchedulerService | null = null;
  const tools = new ToolRegistry({
    stores,
    memory,
    getRoots: () => stores.roots.list(),
    getSettings: () => stores.settings.get(),
    getWebSearchKey: () => providers.getWebSearchKey(),
    system: {
      readClipboardText: () => clipboard.readText(),
      captureScreen: async () => {
        const { attachment } = await captureScreenInput(attachments);
        return attachment;
      },
      saveAttachment: async (input) => {
        const saved = await attachments.save(input);
        return saved.attachment;
      },
      trashItem: async (path) => {
        await shell.trashItem(path);
      }
    },
    onReminderChanged: () => schedulerRef?.refresh()
  });

  const bot = new BotRuntime({
    stores,
    memory,
    tools,
    models: {
      primary: (purpose) => providers.primary(purpose),
      fallback: (purpose, primary) => providers.fallback(purpose, primary)
    }
  });

  scheduler = new SchedulerService(
    stores.reminders,
    stores.events,
    notifications,
    () => stores.settings.get(),
    logger
  );
  schedulerRef = scheduler;
  const proactive = new ProactiveService(
    stores.projects,
    stores.roots,
    stores.events,
    notifications,
    () => stores.settings.get(),
    logger
  );

  context = {
    dataDir,
    databasePath,
    database,
    stores,
    attachments,
    ocr,
    secrets,
    providers,
    memory,
    tools,
    bot,
    scheduler,
    proactive,
    notifications,
    windows,
    logger
  };

  setupMediaProtocol(attachments);
  registerIpc(context);

  nativeTheme.themeSource = settings.appearance.theme;
  app.setLoginItemSettings({ openAtLogin: settings.general.launchAtLogin });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  windows.createMainWindow();
  tray = createTray(
    {
      open: () => windows?.showMain(),
      quickAsk: () => windows?.showQuickAsk(),
      navigate: (target) => windows?.navigate(target),
      quit: () => app.quit()
    },
    logger
  );
  tray.setToolTip('Z Bot');

  registerShortcuts(
    {
      quickAsk: () => windows?.showQuickAsk(),
      screenshot: () => {
        void (async () => {
          try {
            const { input } = await captureScreenInput(attachments);
            windows?.sendScreenshot(input);
          } catch (error) {
            notifications.show('Z Bot 截图失败', redactErrorMessage(error));
            logger.warn({ error: redactErrorMessage(error) }, 'screenshot hotkey failed');
          }
        })();
      }
    },
    logger
  );

  scheduler.start();
  proactive.start();
  logger.info('Z Bot runtime ready');
}

async function cleanup(): Promise<void> {
  if (cleaningUp) return;
  cleaningUp = true;
  try {
    scheduler?.stop();
    context?.proactive.stop();
    unregisterShortcuts();
    await context?.tools.close();
    windows?.prepareQuit();
    context?.database.close();
    context?.logger.info('Z Bot stopped');
  } catch {
    // Cleanup is best-effort during shutdown.
  } finally {
    app.exit(0);
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    windows?.showMain();
  });

  app.whenReady().then(async () => {
    try {
      await initialize();
    } catch (error) {
      console.error('Z Bot failed to start', error);
      app.quit();
    }
  });

  app.on('activate', () => {
    windows?.showMain();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !cleaningUp) {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (cleaningUp) return;
    event.preventDefault();
    void cleanup();
  });

  app.on('will-quit', () => {
    unregisterShortcuts();
  });

  process.on('uncaughtException', (error) => {
    context?.logger.error({ error: redactErrorMessage(error) }, 'uncaught exception');
  });
  process.on('unhandledRejection', (error) => {
    context?.logger.error({ error: redactErrorMessage(error) }, 'unhandled rejection');
  });
}
