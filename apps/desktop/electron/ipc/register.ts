import { app, clipboard, dialog, ipcMain, nativeTheme, shell, BrowserWindow } from 'electron';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { ZodError, type ZodType } from 'zod';
import type { ChatSendInput } from '@zbot/shared';
import {
  authorizedRootInputSchema,
  chatCancelSchema,
  chatSendInputSchema,
  conversationIdSchema,
  idOnlySchema,
  IPC,
  memoryInputSchema,
  memorySearchInputSchema,
  modelConfigInputSchema,
  permissionResponseSchema,
  projectInputSchema,
  reminderInputSchema,
  settingsSchema,
  todoInputSchema
} from '@zbot/shared';
import type {
  AppInfo,
  ChatEvent,
  HomeSummary,
  NavigationTarget,
  PermissionResponse,
  WebSearchStatus
} from '@zbot/shared';
import { validateAuthorizedRootPath } from '@zbot/tools';
import type { PreparedAttachment } from '@zbot/bot-core';
import type { AppContext } from './context';
import { captureScreenInput } from '../services/screenshot';
import { cleanupOldLogs, redactErrorMessage } from '../services/logger';
import { resourcePath } from '../window-manager';

function parse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`输入无效：${error.issues.map((issue) => issue.message).join('; ')}`);
    }
    throw error;
  }
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith('..') && !isAbsolute(rel));
}

export function registerIpc(context: AppContext): void {
  const { stores, windows, bot, scheduler, logger } = context;
  const getSettings = () => stores.settings.get();

  const handle = (
    channel: string,
    handler: (input: unknown) => unknown | Promise<unknown>,
    schema?: ZodType
  ): void => {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      try {
        const input = schema ? parse(schema, raw) : raw;
        return await handler(input);
      } catch (error) {
        logger.warn(
          { channel, error: redactErrorMessage(error) },
          'ipc request failed'
        );
        throw new Error(redactErrorMessage(error));
      }
    });
  };

  handle(IPC.appInfo, (): AppInfo => ({
    name: 'Z Bot',
    version: app.getVersion(),
    platform: process.platform,
    dataDir: context.dataDir,
    databasePath: context.databasePath,
    safeStorageAvailable: context.secrets.isAvailable()
  }));

  handle(IPC.appOpenDataDir, async () => {
    const error = await shell.openPath(context.dataDir);
    if (error) throw new Error(error);
  });

  handle(
    IPC.appOpenPath,
    async (raw) => {
      const input = raw as { path: string };
      if (!isWithin(context.dataDir, input.path)) {
        throw new Error('只能打开 Z Bot 数据目录内的路径');
      }
      const error = await shell.openPath(input.path);
      if (error) throw new Error(error);
    },
    undefined
  );

  handle(IPC.appChooseDirectory, async () => {
    const owner = BrowserWindow.getFocusedWindow() ?? windows.getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: '选择目录',
      properties: ['openDirectory', 'createDirectory']
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle(IPC.appChooseFiles, async () => {
    const owner = BrowserWindow.getFocusedWindow() ?? windows.getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: '选择文件',
      properties: ['openFile', 'multiSelections']
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  handle(
    IPC.chatSend,
    async (raw) => {
      const input = raw as ChatSendInput;
      const prepared: PreparedAttachment[] = [];
      const settings = getSettings();
      for (const attachment of input.attachments) {
        const saved = await context.attachments.save(attachment);
        const ocrText =
          saved.image && settings.tools.ocrEnabled
            ? await context.ocr.recognize(saved.stored.filePath)
            : null;
        prepared.push({
          stored: saved.stored,
          image: saved.image,
          ocrText: ocrText ?? undefined
        });
      }

      const notifiedTasks = new Set<string>();
      const emit = (event: ChatEvent): void => {
        windows.broadcastChat(event);
        const settings = getSettings();
        if (
          event.type === 'chat.task' &&
          settings.notifications.enabled &&
          settings.notifications.taskUpdates &&
          !windows.isMainVisible() &&
          (event.task.status === 'completed' || event.task.status === 'failed') &&
          !notifiedTasks.has(event.task.id)
        ) {
          notifiedTasks.add(event.task.id);
          context.notifications.show(
            event.task.status === 'completed' ? 'Z Bot 任务完成' : 'Z Bot 任务失败',
            event.task.title,
            { page: 'tasks', taskId: event.task.id },
            resourcePath('icon.png')
          );
        }
      };

      return bot.startChat(input, prepared, emit);
    },
    chatSendInputSchema
  );

  handle(IPC.chatCancel, async (raw) => {
    const input = raw as { requestId: string };
    bot.cancel(input.requestId);
  }, chatCancelSchema);

  handle(IPC.conversationsList, async () => stores.conversations.list());

  handle(
    IPC.conversationsGet,
    async (raw) => {
      const input = raw as { id: string };
      const detail = stores.conversations.getDetail(input.id);
      if (!detail) throw new Error('会话不存在');
      return detail;
    },
    conversationIdSchema
  );

  handle(
    IPC.conversationsDelete,
    async (raw) => {
      const input = raw as { id: string };
      stores.conversations.delete(input.id);
    },
    conversationIdSchema
  );

  handle(
    IPC.memoryList,
    async (raw) => {
      const input = raw as ReturnType<typeof memorySearchInputSchema.parse>;
      context.memory.cleanExpired();
      return context.memory.search({ ...input, query: undefined });
    },
    memorySearchInputSchema
  );

  handle(
    IPC.memorySearch,
    async (raw) => {
      const input = raw as ReturnType<typeof memorySearchInputSchema.parse>;
      context.memory.cleanExpired();
      return context.memory.search(input);
    },
    memorySearchInputSchema
  );

  handle(
    IPC.memoryUpsert,
    async (raw) => context.memory.remember(raw as ReturnType<typeof memoryInputSchema.parse>).memory,
    memoryInputSchema
  );

  handle(
    IPC.memoryDelete,
    async (raw) => {
      const input = raw as { id: string };
      context.memory.forget(input.id);
    },
    idOnlySchema
  );

  handle(IPC.memoryClear, async () => {
    context.memory.clear();
  });

  handle(IPC.settingsGet, async () => getSettings());

  handle(
    IPC.settingsUpdate,
    async (raw) => {
      const input = raw as ReturnType<typeof settingsSchema.parse>;
      const updated = stores.settings.update(input);
      nativeTheme.themeSource = updated.appearance.theme;
      context.logger.level = updated.privacy.logLevel;
      cleanupOldLogs(join(context.dataDir, 'logs'), updated.privacy.retentionDays);
      app.setLoginItemSettings({ openAtLogin: updated.general.launchAtLogin });
      const resolvedTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      windows.sendTheme(resolvedTheme);
      scheduler.refresh();
      void context.proactive.check();
      return updated;
    },
    settingsSchema
  );

  handle(IPC.providersList, async () => context.providers.list());

  handle(
    IPC.providersUpsert,
    async (raw) => {
      const input = raw as ReturnType<typeof modelConfigInputSchema.parse>;
      if (input.kind === 'openai-compatible' && !input.baseUrl) {
        throw new Error('OpenAI-compatible 需要 Base URL');
      }
      return context.providers.upsert(input);
    },
    modelConfigInputSchema
  );

  handle(
    IPC.providersDelete,
    async (raw) => {
      const input = raw as { id: string };
      context.providers.remove(input.id);
    },
    idOnlySchema
  );

  handle(
    IPC.providersTest,
    async (raw) => context.providers.test(raw as ReturnType<typeof modelConfigInputSchema.parse>),
    modelConfigInputSchema
  );

  handle(IPC.webSearchStatus, async (): Promise<WebSearchStatus> =>
    context.providers.webSearchStatus(getSettings().tools.webSearchProvider)
  );

  handle(
    IPC.webSearchKey,
    async (raw) => {
      const input = raw as { value: string };
      context.providers.setWebSearchKey(input.value);
      return context.providers.webSearchStatus(getSettings().tools.webSearchProvider);
    },
    undefined
  );

  handle(IPC.projectsList, async () => stores.projects.list());

  handle(
    IPC.projectsUpsert,
    async (raw) => {
      const project = stores.projects.upsert(
        raw as ReturnType<typeof projectInputSchema.parse>
      );
      void context.proactive.check();
      return project;
    },
    projectInputSchema
  );

  handle(
    IPC.projectsDelete,
    async (raw) => {
      const input = raw as { id: string };
      stores.projects.delete(input.id);
    },
    idOnlySchema
  );

  handle(IPC.rootsList, async () => stores.roots.list());

  handle(
    IPC.rootsAdd,
    async (raw) => {
      const input = raw as ReturnType<typeof authorizedRootInputSchema.parse>;
      const canonical = await validateAuthorizedRootPath(input.path);
      const root = stores.roots.add({ ...input, path: canonical });
      context.logger.info({ rootId: root.id, allowWrite: root.allowWrite }, 'authorized root added');
      return root;
    },
    authorizedRootInputSchema
  );

  handle(
    IPC.rootsRemove,
    async (raw) => {
      const input = raw as { id: string };
      stores.roots.remove(input.id);
    },
    idOnlySchema
  );

  handle(IPC.tasksList, async () => stores.tasks.list());

  handle(
    IPC.tasksGet,
    async (raw) => {
      const input = raw as { id: string };
      const task = stores.tasks.get(input.id);
      if (!task) throw new Error('任务不存在');
      return task;
    },
    idOnlySchema
  );

  handle(
    IPC.tasksCancel,
    async (raw) => {
      const input = raw as { id: string };
      const cancelledActive = bot.cancelTask(input.id);
      if (!cancelledActive) {
        const task = stores.tasks.get(input.id);
        if (task && ['pending', 'running', 'waiting_permission', 'paused'].includes(task.status)) {
          stores.tasks.cancel(input.id);
        }
      }
    },
    idOnlySchema
  );

  handle(IPC.todosList, async () => stores.todos.list());

  handle(
    IPC.todosUpsert,
    async (raw) => stores.todos.upsert(raw as ReturnType<typeof todoInputSchema.parse>),
    todoInputSchema
  );

  handle(
    IPC.todosToggle,
    async (raw) => {
      const input = raw as { id: string };
      return stores.todos.toggle(input.id);
    },
    idOnlySchema
  );

  handle(
    IPC.todosDelete,
    async (raw) => {
      const input = raw as { id: string };
      stores.todos.delete(input.id);
    },
    idOnlySchema
  );

  handle(IPC.remindersList, async () => stores.reminders.list());

  handle(
    IPC.remindersUpsert,
    async (raw) => {
      const reminder = stores.reminders.upsert(
        raw as ReturnType<typeof reminderInputSchema.parse>
      );
      scheduler.refresh();
      return reminder;
    },
    reminderInputSchema
  );

  handle(
    IPC.remindersToggle,
    async (raw) => {
      const input = raw as { id: string };
      const reminder = stores.reminders.toggle(input.id);
      scheduler.refresh();
      return reminder;
    },
    idOnlySchema
  );

  handle(
    IPC.remindersDelete,
    async (raw) => {
      const input = raw as { id: string };
      stores.reminders.delete(input.id);
      scheduler.refresh();
    },
    idOnlySchema
  );

  handle(IPC.homeSummary, async (): Promise<HomeSummary> => {
    const allTasks = stores.tasks.list(30);
    const openTasks = allTasks.filter((task) =>
      ['pending', 'running', 'waiting_permission', 'paused'].includes(task.status)
    );
    const todos = stores.todos.list();
    const reminders = stores.reminders.list().filter((reminder) => reminder.enabled);
    const projects = stores.projects.list();
    return {
      tasks: openTasks,
      todos,
      reminders,
      projects,
      recentConversations: stores.conversations.list(6),
      events: stores.events.list(12),
      counts: {
        openTasks: openTasks.length,
        openTodos: todos.filter((todo) => !todo.completed).length,
        upcomingReminders: reminders.length,
        projects: projects.length
      }
    };
  });

  handle(
    IPC.permissionsRespond,
    async (raw) => {
      const input = raw as PermissionResponse;
      bot.respondPermission(input);
    },
    permissionResponseSchema
  );

  handle(IPC.clipboardReadText, async () => clipboard.readText());

  handle(IPC.screenshotCapture, async () => {
    const { input } = await captureScreenInput(context.attachments);
    return input;
  });

  handle(IPC.appNavigate, async (raw) => {
    if (!raw || typeof raw !== 'object' || typeof (raw as NavigationTarget).page !== 'string') {
      throw new Error('导航目标无效');
    }
    const validPages = new Set(['home', 'chat', 'tasks', 'memory', 'settings']);
    if (!validPages.has((raw as NavigationTarget).page)) {
      throw new Error('导航目标无效');
    }
    windows.navigate(raw as NavigationTarget);
  });
}
