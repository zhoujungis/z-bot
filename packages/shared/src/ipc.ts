import type {
  AppInfo,
  AppSettings,
  AttachmentInput,
  AuthorizedRoot,
  AuthorizedRootInput,
  ChatEvent,
  ChatSendInput,
  ChatSendResult,
  ConnectionTestResult,
  Conversation,
  ConversationDetail,
  HomeSummary,
  Memory,
  MemoryInput,
  MemorySearchInput,
  ModelConfig,
  ModelConfigInput,
  NavigationTarget,
  PermissionResponse,
  Project,
  ProjectInput,
  Reminder,
  ReminderInput,
  ScreenshotPayload,
  Task,
  Todo,
  TodoInput,
  WebSearchStatus
} from './types';

export const IPC = {
  appInfo: 'app:info',
  appOpenDataDir: 'app:open-data-dir',
  appOpenPath: 'app:open-path',
  appChooseDirectory: 'app:choose-directory',
  appChooseFiles: 'app:choose-files',
  appNavigate: 'app:navigate',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  chatEvent: 'chat:event',
  conversationsList: 'conversations:list',
  conversationsGet: 'conversations:get',
  conversationsDelete: 'conversations:delete',
  memoryList: 'memory:list',
  memorySearch: 'memory:search',
  memoryUpsert: 'memory:upsert',
  memoryDelete: 'memory:delete',
  memoryClear: 'memory:clear',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  providersList: 'providers:list',
  providersUpsert: 'providers:upsert',
  providersDelete: 'providers:delete',
  providersTest: 'providers:test',
  webSearchStatus: 'web-search:status',
  webSearchKey: 'web-search:set-key',
  projectsList: 'projects:list',
  projectsUpsert: 'projects:upsert',
  projectsDelete: 'projects:delete',
  rootsList: 'roots:list',
  rootsAdd: 'roots:add',
  rootsRemove: 'roots:remove',
  tasksList: 'tasks:list',
  tasksGet: 'tasks:get',
  tasksCancel: 'tasks:cancel',
  todosList: 'todos:list',
  todosUpsert: 'todos:upsert',
  todosToggle: 'todos:toggle',
  todosDelete: 'todos:delete',
  remindersList: 'reminders:list',
  remindersUpsert: 'reminders:upsert',
  remindersToggle: 'reminders:toggle',
  remindersDelete: 'reminders:delete',
  homeSummary: 'home:summary',
  permissionsRespond: 'permissions:respond',
  clipboardReadText: 'clipboard:read-text',
  screenshotCapture: 'screenshot:capture',
  eventNavigate: 'event:navigate',
  eventScreenshot: 'event:screenshot',
  eventTheme: 'event:theme'
} as const;

export interface ZBotApi {
  app: {
    info(): Promise<AppInfo>;
    openDataDir(): Promise<void>;
    openPath(path: string): Promise<void>;
    chooseDirectory(): Promise<string | null>;
    chooseFiles(): Promise<string[]>;
    navigate(target: NavigationTarget): Promise<void>;
  };
  chat: {
    send(input: ChatSendInput): Promise<ChatSendResult>;
    cancel(requestId: string): Promise<void>;
    onEvent(listener: (event: ChatEvent) => void): () => void;
  };
  conversations: {
    list(): Promise<Conversation[]>;
    get(id: string): Promise<ConversationDetail>;
    remove(id: string): Promise<void>;
  };
  memory: {
    list(input: MemorySearchInput): Promise<Memory[]>;
    search(input: MemorySearchInput): Promise<Memory[]>;
    upsert(input: MemoryInput): Promise<Memory>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: AppSettings): Promise<AppSettings>;
  };
  providers: {
    list(): Promise<ModelConfig[]>;
    upsert(input: ModelConfigInput): Promise<ModelConfig>;
    remove(id: string): Promise<void>;
    test(input: ModelConfigInput): Promise<ConnectionTestResult>;
  };
  webSearch: {
    status(): Promise<WebSearchStatus>;
    setKey(value: string): Promise<WebSearchStatus>;
  };
  projects: {
    list(): Promise<Project[]>;
    upsert(input: ProjectInput): Promise<Project>;
    remove(id: string): Promise<void>;
  };
  roots: {
    list(): Promise<AuthorizedRoot[]>;
    add(input: AuthorizedRootInput): Promise<AuthorizedRoot>;
    remove(id: string): Promise<void>;
  };
  tasks: {
    list(): Promise<Task[]>;
    get(id: string): Promise<Task>;
    cancel(id: string): Promise<void>;
  };
  todos: {
    list(): Promise<Todo[]>;
    upsert(input: TodoInput): Promise<Todo>;
    toggle(id: string): Promise<Todo>;
    remove(id: string): Promise<void>;
  };
  reminders: {
    list(): Promise<Reminder[]>;
    upsert(input: ReminderInput): Promise<Reminder>;
    toggle(id: string): Promise<Reminder>;
    remove(id: string): Promise<void>;
  };
  home: {
    summary(): Promise<HomeSummary>;
  };
  permissions: {
    respond(response: PermissionResponse): Promise<void>;
  };
  clipboard: {
    readText(): Promise<string>;
  };
  screenshot: {
    capture(): Promise<AttachmentInput | null>;
  };
  events: {
    onNavigate(listener: (target: NavigationTarget) => void): () => void;
    onScreenshot(listener: (payload: ScreenshotPayload) => void): () => void;
    onTheme(listener: (theme: 'light' | 'dark') => void): () => void;
  };
}
