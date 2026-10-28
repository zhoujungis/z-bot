import { z } from 'zod';

export const idSchema = z.string().min(1).max(200);
export const unixMsSchema = z.number().int().nonnegative();

export const modelProviderKindSchema = z.enum([
  'openai',
  'openai-compatible',
  'anthropic',
  'google',
  'ollama'
]);

export const modelPurposeSchema = z.enum([
  'general',
  'fast',
  'vision',
  'reasoning',
  'embedding'
]);

export const modelConfigInputSchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(100),
    kind: modelProviderKindSchema,
    purpose: modelPurposeSchema,
    model: z.string().trim().min(1).max(200),
    baseUrl: z.string().trim().url().max(2000).nullable().optional(),
    apiKey: z.string().max(10000).optional(),
    clearApiKey: z.boolean().optional(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().min(1).max(1_000_000).nullable().optional(),
    isDefault: z.boolean()
  })
  .strict();

export const attachmentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(260),
    mimeType: z.string().trim().min(1).max(200),
    dataBase64: z.string().min(1).max(30_000_000),
    kind: z.enum(['image', 'file'])
  })
  .strict();

export const chatSendInputSchema = z
  .object({
    conversationId: idSchema.optional(),
    projectId: idSchema.nullable().optional(),
    content: z.string().trim().max(200_000),
    attachments: z.array(attachmentInputSchema).max(6).default([]),
    quickAction: z.enum(['ask', 'remember', 'todo', 'reminder']).optional()
  })
  .strict()
  .refine((value) => value.content.length > 0 || value.attachments.length > 0, {
    message: 'Message or attachment is required'
  });

export const memoryTypeSchema = z.enum(['user', 'project', 'event', 'task', 'global']);

export const memoryInputSchema = z
  .object({
    id: idSchema.optional(),
    type: memoryTypeSchema,
    content: z.string().trim().min(1).max(50_000),
    projectId: idSchema.nullable().optional(),
    importance: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    source: z.string().max(2000).nullable().optional(),
    expiresAt: unixMsSchema.nullable().optional()
  })
  .strict();

export const memorySearchInputSchema = z
  .object({
    query: z.string().trim().max(2000).optional(),
    types: z.array(memoryTypeSchema).max(5).optional(),
    projectId: idSchema.nullable().optional(),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).max(100_000).optional()
  })
  .strict();

export const projectInputSchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(100),
    path: z.string().trim().max(2000).nullable().optional(),
    description: z.string().max(20_000),
    watchEnabled: z.boolean()
  })
  .strict();

export const authorizedRootInputSchema = z
  .object({
    path: z.string().trim().min(1).max(2000),
    label: z.string().trim().min(1).max(100),
    allowWrite: z.boolean()
  })
  .strict();

export const todoPrioritySchema = z.enum(['low', 'medium', 'high']);

export const todoInputSchema = z
  .object({
    id: idSchema.optional(),
    title: z.string().trim().min(1).max(500),
    notes: z.string().max(20_000).nullable().optional(),
    priority: todoPrioritySchema,
    dueAt: unixMsSchema.nullable().optional(),
    projectId: idSchema.nullable().optional()
  })
  .strict();

export const repeatRuleSchema = z
  .object({
    kind: z.enum(['daily', 'weekly']),
    interval: z.number().int().min(1).max(52),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7)
  })
  .strict();

export const reminderInputSchema = z
  .object({
    id: idSchema.optional(),
    title: z.string().trim().min(1).max(500),
    content: z.string().max(20_000).nullable().optional(),
    triggerAt: unixMsSchema,
    repeat: repeatRuleSchema.nullable().optional(),
    enabled: z.boolean()
  })
  .strict();

export const permissionResponseSchema = z
  .object({
    requestId: idSchema,
    decision: z.enum(['allow_once', 'allow_scope', 'deny'])
  })
  .strict();

export const settingsSchema = z
  .object({
    general: z
      .object({
        launchAtLogin: z.boolean(),
        minimizeToTray: z.boolean(),
        startMinimized: z.boolean(),
        language: z.enum(['zh-CN', 'en-US'])
      })
      .strict(),
    notifications: z
      .object({
        enabled: z.boolean(),
        reminders: z.boolean(),
        taskUpdates: z.boolean(),
        projectInactivity: z.boolean(),
        projectInactivityDays: z.number().int().min(1).max(365)
      })
      .strict(),
    memory: z
      .object({
        autoExtract: z.boolean(),
        defaultExpiryDays: z.number().int().min(1).max(3650).nullable()
      })
      .strict(),
    appearance: z
      .object({
        theme: z.enum(['system', 'light', 'dark']),
        density: z.enum(['comfortable', 'compact'])
      })
      .strict(),
    tools: z
      .object({
        webSearchProvider: z.enum(['tavily', 'brave']),
        webSearchMaxResults: z.number().int().min(1).max(20),
        browserEnabled: z.boolean(),
        ocrEnabled: z.boolean()
      })
      .strict(),
    privacy: z
      .object({
        logLevel: z.enum(['info', 'debug']),
        retentionDays: z.number().int().min(1).max(3650)
      })
      .strict()
  })
  .strict();

export const chatCancelSchema = z.object({ requestId: idSchema }).strict();
export const idOnlySchema = z.object({ id: idSchema }).strict();
export const conversationIdSchema = z.object({ id: idSchema }).strict();
export const secretInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    value: z.string().min(1).max(100_000)
  })
  .strict();
