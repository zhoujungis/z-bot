export type Id = string;
export type UnixMs = number;

export type ModelProviderKind =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'google'
  | 'ollama';

export type ModelPurpose = 'general' | 'fast' | 'vision' | 'reasoning' | 'embedding';

export interface ModelConfig {
  id: Id;
  name: string;
  kind: ModelProviderKind;
  purpose: ModelPurpose;
  model: string;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  temperature: number;
  maxTokens: number | null;
  isDefault: boolean;
  createdAt: UnixMs;
  updatedAt: UnixMs;
}

export interface ModelConfigInput {
  id?: Id;
  name: string;
  kind: ModelProviderKind;
  purpose: ModelPurpose;
  model: string;
  baseUrl?: string | null;
  apiKey?: string;
  clearApiKey?: boolean;
  temperature: number;
  maxTokens?: number | null;
  isDefault: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface Conversation {
  id: Id;
  title: string;
  projectId: Id | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
  archivedAt: UnixMs | null;
}

export type MessageRole = 'user' | 'assistant' | 'tool';

export interface Attachment {
  id: Id;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
  url: string;
}

export interface Message {
  id: Id;
  conversationId: Id;
  role: MessageRole;
  content: string;
  createdAt: UnixMs;
  attachments: Attachment[];
  toolCallId: string | null;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
}

export interface AttachmentInput {
  name: string;
  mimeType: string;
  dataBase64: string;
  kind: 'image' | 'file';
}

export interface ChatSendInput {
  conversationId?: Id;
  projectId?: Id | null;
  content: string;
  attachments: AttachmentInput[];
  quickAction?: 'ask' | 'remember' | 'todo' | 'reminder';
}

export interface ChatSendResult {
  requestId: Id;
  conversationId: Id;
  userMessage: Message;
  assistantMessageId: Id;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_permission'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskStep {
  id: Id;
  taskId: Id;
  index: number;
  title: string;
  detail: string | null;
  status: TaskStepStatus;
  toolName: string | null;
  startedAt: UnixMs | null;
  completedAt: UnixMs | null;
}

export interface TaskStats {
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  toolCalls: number;
  durationMs: number;
  retries: number;
}

export interface Task {
  id: Id;
  conversationId: Id | null;
  title: string;
  prompt: string;
  status: TaskStatus;
  steps: TaskStep[];
  stats: TaskStats;
  error: string | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
}

export type ToolCallStatus = 'running' | 'waiting_permission' | 'completed' | 'failed' | 'cancelled';

export interface ToolCallView {
  id: Id;
  taskId: Id | null;
  name: string;
  label: string;
  status: ToolCallStatus;
  summary: string;
  argsPreview: string | null;
  resultPreview: string | null;
  error: string | null;
  startedAt: UnixMs;
  finishedAt: UnixMs | null;
}

export type MemoryType = 'user' | 'project' | 'event' | 'task' | 'global';

export interface Memory {
  id: Id;
  type: MemoryType;
  content: string;
  projectId: Id | null;
  importance: number;
  confidence: number;
  tags: string[];
  source: string | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
  expiresAt: UnixMs | null;
  archivedAt: UnixMs | null;
}

export interface MemoryInput {
  id?: Id;
  type: MemoryType;
  content: string;
  projectId?: Id | null;
  importance: number;
  confidence: number;
  tags?: string[];
  source?: string | null;
  expiresAt?: UnixMs | null;
}

export interface MemorySearchInput {
  query?: string;
  types?: MemoryType[];
  projectId?: Id | null;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface Project {
  id: Id;
  name: string;
  path: string | null;
  description: string;
  watchEnabled: boolean;
  createdAt: UnixMs;
  updatedAt: UnixMs;
}

export interface ProjectInput {
  id?: Id;
  name: string;
  path?: string | null;
  description: string;
  watchEnabled: boolean;
}

export interface AuthorizedRoot {
  id: Id;
  path: string;
  label: string;
  allowWrite: boolean;
  createdAt: UnixMs;
}

export interface AuthorizedRootInput {
  path: string;
  label: string;
  allowWrite: boolean;
}

export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id: Id;
  title: string;
  notes: string | null;
  priority: TodoPriority;
  dueAt: UnixMs | null;
  completed: boolean;
  projectId: Id | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
}

export interface TodoInput {
  id?: Id;
  title: string;
  notes?: string | null;
  priority: TodoPriority;
  dueAt?: UnixMs | null;
  projectId?: Id | null;
}

export type RepeatKind = 'daily' | 'weekly';

export interface RepeatRule {
  kind: RepeatKind;
  interval: number;
  daysOfWeek: number[];
}

export interface Reminder {
  id: Id;
  title: string;
  content: string | null;
  triggerAt: UnixMs;
  repeat: RepeatRule | null;
  enabled: boolean;
  lastTriggeredAt: UnixMs | null;
  createdAt: UnixMs;
  updatedAt: UnixMs;
}

export interface ReminderInput {
  id?: Id;
  title: string;
  content?: string | null;
  triggerAt: UnixMs;
  repeat?: RepeatRule | null;
  enabled: boolean;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type PermissionLevel = 'read' | 'write' | 'execute' | 'network' | 'system' | 'secret';

export interface FileOperationPreview {
  action: 'create' | 'copy' | 'move' | 'write' | 'trash';
  from: string | null;
  to: string | null;
  detail?: string;
}

export interface PermissionRequest {
  id: Id;
  taskId: Id | null;
  toolName: string;
  title: string;
  description: string;
  risk: RiskLevel;
  scope: string;
  operations: FileOperationPreview[];
  createdAt: UnixMs;
}

export type PermissionDecision = 'allow_once' | 'allow_scope' | 'deny';

export interface PermissionResponse {
  requestId: Id;
  decision: PermissionDecision;
}

export interface EventView {
  id: Id;
  type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: UnixMs;
}

export interface HomeSummary {
  tasks: Task[];
  todos: Todo[];
  reminders: Reminder[];
  projects: Project[];
  recentConversations: Conversation[];
  events: EventView[];
  counts: {
    openTasks: number;
    openTodos: number;
    upcomingReminders: number;
    projects: number;
  };
}

export interface AppSettings {
  general: {
    launchAtLogin: boolean;
    minimizeToTray: boolean;
    startMinimized: boolean;
    language: 'zh-CN' | 'en-US';
  };
  notifications: {
    enabled: boolean;
    reminders: boolean;
    taskUpdates: boolean;
    projectInactivity: boolean;
    projectInactivityDays: number;
  };
  memory: {
    autoExtract: boolean;
    defaultExpiryDays: number | null;
  };
  appearance: {
    theme: 'system' | 'light' | 'dark';
    density: 'comfortable' | 'compact';
  };
  tools: {
    webSearchProvider: 'tavily' | 'brave';
    webSearchMaxResults: number;
    browserEnabled: boolean;
    ocrEnabled: boolean;
  };
  privacy: {
    logLevel: 'info' | 'debug';
    retentionDays: number;
  };
}

export interface WebSearchStatus {
  configured: boolean;
  provider: 'tavily' | 'brave';
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  dataDir: string;
  databasePath: string;
  safeStorageAvailable: boolean;
}

export type NavigationTarget =
  | { page: 'home' }
  | { page: 'chat'; conversationId?: Id }
  | { page: 'tasks'; taskId?: Id }
  | { page: 'memory'; memoryId?: Id }
  | { page: 'settings'; section?: string };

export interface AppErrorPayload {
  code: string;
  message: string;
  details?: string;
}

export type ChatEvent =
  | {
      type: 'chat.started';
      requestId: Id;
      conversationId: Id;
      assistantMessageId: Id;
    }
  | {
      type: 'chat.delta';
      requestId: Id;
      messageId: Id;
      delta: string;
    }
  | {
      type: 'chat.tool';
      requestId: Id;
      toolCall: ToolCallView;
    }
  | {
      type: 'chat.task';
      requestId: Id;
      task: Task;
    }
  | {
      type: 'chat.permission';
      requestId: Id;
      request: PermissionRequest;
    }
  | {
      type: 'chat.memory';
      requestId: Id;
      memory: Memory;
    }
  | {
      type: 'chat.done';
      requestId: Id;
      messageId: Id;
      usage: TokenUsage | null;
      task: Task | null;
    }
  | {
      type: 'chat.error';
      requestId: Id;
      error: AppErrorPayload;
    }
  | {
      type: 'chat.cancelled';
      requestId: Id;
    };

export interface ScreenshotPayload {
  attachment: AttachmentInput;
}
