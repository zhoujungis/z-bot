import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@zbot/shared';
import type {
  AppSettings,
  AuthorizedRootInput,
  ChatEvent,
  ChatSendInput,
  MemoryInput,
  MemorySearchInput,
  ModelConfigInput,
  NavigationTarget,
  PermissionResponse,
  ProjectInput,
  ReminderInput,
  ScreenshotPayload,
  TodoInput,
  ZBotApi
} from '@zbot/shared';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: ZBotApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir),
    openPath: (path: string) => ipcRenderer.invoke(IPC.appOpenPath, path),
    chooseDirectory: () => ipcRenderer.invoke(IPC.appChooseDirectory),
    chooseFiles: () => ipcRenderer.invoke(IPC.appChooseFiles),
    navigate: (target: NavigationTarget) => ipcRenderer.invoke(IPC.appNavigate, target)
  },
  chat: {
    send: (input: ChatSendInput) => ipcRenderer.invoke(IPC.chatSend, input),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC.chatCancel, { requestId }),
    onEvent: (listener: (event: ChatEvent) => void) =>
      subscribe<ChatEvent>(IPC.chatEvent, listener)
  },
  conversations: {
    list: () => ipcRenderer.invoke(IPC.conversationsList),
    get: (id: string) => ipcRenderer.invoke(IPC.conversationsGet, { id }),
    remove: (id: string) => ipcRenderer.invoke(IPC.conversationsDelete, { id })
  },
  memory: {
    list: (input: MemorySearchInput) => ipcRenderer.invoke(IPC.memoryList, input),
    search: (input: MemorySearchInput) => ipcRenderer.invoke(IPC.memorySearch, input),
    upsert: (input: MemoryInput) => ipcRenderer.invoke(IPC.memoryUpsert, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.memoryDelete, { id }),
    clear: () => ipcRenderer.invoke(IPC.memoryClear)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (settings: AppSettings) => ipcRenderer.invoke(IPC.settingsUpdate, settings)
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC.providersList),
    upsert: (input: ModelConfigInput) => ipcRenderer.invoke(IPC.providersUpsert, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.providersDelete, { id }),
    test: (input: ModelConfigInput) => ipcRenderer.invoke(IPC.providersTest, input)
  },
  webSearch: {
    status: () => ipcRenderer.invoke(IPC.webSearchStatus),
    setKey: (value: string) => ipcRenderer.invoke(IPC.webSearchKey, { value })
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    upsert: (input: ProjectInput) => ipcRenderer.invoke(IPC.projectsUpsert, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.projectsDelete, { id })
  },
  roots: {
    list: () => ipcRenderer.invoke(IPC.rootsList),
    add: (input: AuthorizedRootInput) => ipcRenderer.invoke(IPC.rootsAdd, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.rootsRemove, { id })
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    get: (id: string) => ipcRenderer.invoke(IPC.tasksGet, { id }),
    cancel: (id: string) => ipcRenderer.invoke(IPC.tasksCancel, { id })
  },
  todos: {
    list: () => ipcRenderer.invoke(IPC.todosList),
    upsert: (input: TodoInput) => ipcRenderer.invoke(IPC.todosUpsert, input),
    toggle: (id: string) => ipcRenderer.invoke(IPC.todosToggle, { id }),
    remove: (id: string) => ipcRenderer.invoke(IPC.todosDelete, { id })
  },
  reminders: {
    list: () => ipcRenderer.invoke(IPC.remindersList),
    upsert: (input: ReminderInput) => ipcRenderer.invoke(IPC.remindersUpsert, input),
    toggle: (id: string) => ipcRenderer.invoke(IPC.remindersToggle, { id }),
    remove: (id: string) => ipcRenderer.invoke(IPC.remindersDelete, { id })
  },
  home: {
    summary: () => ipcRenderer.invoke(IPC.homeSummary)
  },
  permissions: {
    respond: (response: PermissionResponse) =>
      ipcRenderer.invoke(IPC.permissionsRespond, response)
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(IPC.clipboardReadText)
  },
  screenshot: {
    capture: () => ipcRenderer.invoke(IPC.screenshotCapture)
  },
  events: {
    onNavigate: (listener: (target: NavigationTarget) => void) =>
      subscribe<NavigationTarget>(IPC.eventNavigate, listener),
    onScreenshot: (listener: (payload: ScreenshotPayload) => void) =>
      subscribe<ScreenshotPayload>(IPC.eventScreenshot, listener),
    onTheme: (listener: (theme: 'light' | 'dark') => void) =>
      subscribe<'light' | 'dark'>(IPC.eventTheme, listener)
  }
};

contextBridge.exposeInMainWorld('zbot', api);
