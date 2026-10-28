import type { MemoryService } from '@zbot/memory';
import type { BotRuntime } from '@zbot/bot-core';
import type { Stores, ZBotDatabase } from '@zbot/database';
import type { ToolRegistry } from '@zbot/tools';
import type { AttachmentService } from '../services/attachments';
import type { AppLogger } from '../services/logger';
import type { NotificationService } from '../services/notifications';
import type { WindowsOcrService } from '../services/ocr';
import type { ProactiveService } from '../services/proactive';
import type { ProviderService } from '../services/providers';
import type { SchedulerService } from '../services/scheduler';
import type { SecretService } from '../services/secrets';
import type { WindowManager } from '../window-manager';

export interface AppContext {
  dataDir: string;
  databasePath: string;
  database: ZBotDatabase;
  stores: Stores;
  attachments: AttachmentService;
  ocr: WindowsOcrService;
  secrets: SecretService;
  providers: ProviderService;
  memory: MemoryService;
  tools: ToolRegistry;
  bot: BotRuntime;
  scheduler: SchedulerService;
  proactive: ProactiveService;
  notifications: NotificationService;
  windows: WindowManager;
  logger: AppLogger;
}
