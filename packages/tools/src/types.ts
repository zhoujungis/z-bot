import type { z } from 'zod';
import type {
  AppSettings,
  Attachment,
  AttachmentInput,
  AuthorizedRoot,
  FileOperationPreview,
  PermissionLevel,
  RiskLevel
} from '@zbot/shared';
import type { Stores } from '@zbot/database';
import type { LlmToolDefinition } from '@zbot/model';
import type { MemoryService } from '@zbot/memory';

export interface ToolSystemPorts {
  readClipboardText(): string | Promise<string>;
  captureScreen(): Promise<Attachment>;
  saveAttachment(input: AttachmentInput): Promise<Attachment>;
  trashItem(path: string): Promise<void>;
}

export interface ToolDependencies {
  stores: Stores;
  memory: MemoryService;
  getRoots(): AuthorizedRoot[];
  getSettings(): AppSettings;
  getWebSearchKey(): string | null;
  system: ToolSystemPorts;
  onReminderChanged?: () => void;
}

export interface ToolExecutionContext {
  taskId?: string | null;
  messageId?: string | null;
  abortSignal?: AbortSignal;
}

export interface ToolVerification {
  ok: boolean;
  detail: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  content: string;
  data?: unknown;
  untrusted?: boolean;
  attachment?: Attachment;
  verification?: ToolVerification[];
}

export interface ToolPermissionSpec {
  level: PermissionLevel;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  scope: string;
  title: string;
  description: string;
  operations: FileOperationPreview[];
}

export interface BotTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  getPermission(input: unknown, deps: ToolDependencies): Promise<ToolPermissionSpec>;
  execute(
    input: unknown,
    deps: ToolDependencies,
    context: ToolExecutionContext
  ): Promise<ToolResult>;
}

export interface ToolExecution {
  tool: BotTool;
  result: ToolResult;
}

export type ToolDefinition = LlmToolDefinition;

export function permissionSpec(
  input: Omit<ToolPermissionSpec, 'operations'> & {
    operations?: FileOperationPreview[];
  }
): ToolPermissionSpec {
  return { ...input, operations: input.operations ?? [] };
}

export function jsonSchemaFor(tool: BotTool): Record<string, unknown> {
  return tool.inputSchema.toJSONSchema({
    target: 'draft-7',
    io: 'input'
  }) as Record<string, unknown>;
}
