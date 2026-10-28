import { ZBotDatabase } from './database';
import { ConversationStore } from './stores/conversations';
import { EventStore, PermissionRuleStore, ToolCallStore } from './stores/events';
import { MemoryStore } from './stores/memories';
import { AuthorizedRootStore, ProjectStore, ReminderStore, TodoStore } from './stores/personal';
import { ModelConfigStore } from './stores/providers';
import { SecretsStore } from './stores/secrets';
import { SettingsStore } from './stores/settings';
import { TaskStore } from './stores/tasks';

export { ZBotDatabase, nowMs } from './database';
export type { DatabaseOptions } from './database';
export { migrations, LATEST_SCHEMA_VERSION } from './migrations';
export { SettingsStore } from './stores/settings';
export { ConversationStore } from './stores/conversations';
export type { AddMessageInput, CreateConversationInput, StoredAttachment } from './stores/conversations';
export { MemoryStore } from './stores/memories';
export { TaskStore } from './stores/tasks';
export type { CreateTaskInput } from './stores/tasks';
export { ProjectStore, AuthorizedRootStore, TodoStore, ReminderStore } from './stores/personal';
export { ModelConfigStore } from './stores/providers';
export type { StoredModelConfig } from './stores/providers';
export { EventStore, ToolCallStore, PermissionRuleStore } from './stores/events';
export { SecretsStore } from './stores/secrets';

export interface Stores {
  settings: SettingsStore;
  secrets: SecretsStore;
  conversations: ConversationStore;
  memories: MemoryStore;
  tasks: TaskStore;
  projects: ProjectStore;
  roots: AuthorizedRootStore;
  todos: TodoStore;
  reminders: ReminderStore;
  modelConfigs: ModelConfigStore;
  events: EventStore;
  toolCalls: ToolCallStore;
  permissions: PermissionRuleStore;
}

export function createStores(database: ZBotDatabase): Stores {
  return {
    settings: new SettingsStore(database),
    secrets: new SecretsStore(database),
    conversations: new ConversationStore(database),
    memories: new MemoryStore(database),
    tasks: new TaskStore(database),
    projects: new ProjectStore(database),
    roots: new AuthorizedRootStore(database),
    todos: new TodoStore(database),
    reminders: new ReminderStore(database),
    modelConfigs: new ModelConfigStore(database),
    events: new EventStore(database),
    toolCalls: new ToolCallStore(database),
    permissions: new PermissionRuleStore(database)
  };
}
