import { z } from 'zod';
import type { MemoryType, RepeatRule } from '@zbot/shared';
import {
  permissionSpec,
  type BotTool
} from '../types';

const memoryType = z.enum(['user', 'project', 'event', 'task', 'global']);
const repeatSchema = z.object({
  kind: z.enum(['daily', 'weekly']),
  interval: z.number().int().min(1).max(52),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7)
});

export const rememberTool: BotTool = {
  name: 'remember',
  label: '记住信息',
  description:
    'Save a long-term memory about the user, a project, an event, or a task result. Use only for stable and useful information.',
  inputSchema: z.object({
    content: z.string().trim().min(1).max(20_000),
    type: memoryType.optional().default('user'),
    projectId: z.string().max(200).nullable().optional(),
    importance: z.number().min(0).max(1).optional().default(0.6),
    confidence: z.number().min(0).max(1).optional().default(0.9),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional()
  }),
  async getPermission(input, deps) {
    if (!deps.getSettings().memory.autoExtract) {
      throw new Error('自动记忆已关闭；用户仍可通过“记住……”明确保存信息。');
    }
    const args = this.inputSchema.parse(input) as { content: string };
    return permissionSpec({
      level: 'write',
      risk: 'low',
      requiresConfirmation: false,
      scope: 'memory',
      title: '保存记忆',
      description: args.content.slice(0, 160)
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      content: string;
      type: MemoryType;
      projectId?: string | null;
      importance: number;
      confidence: number;
      tags?: string[];
    };
    const expiryDays = deps.getSettings().memory.defaultExpiryDays;
    const { memory, created } = deps.memory.remember({
      content: args.content,
      type: args.type,
      projectId: args.projectId ?? null,
      importance: args.importance,
      confidence: args.confidence,
      tags: args.tags,
      source: 'assistant',
      expiresAt: expiryDays ? Date.now() + expiryDays * 24 * 60 * 60 * 1000 : null
    });
    return {
      ok: true,
      summary: created ? '已记住这条信息' : '已更新相近的记忆',
      content: JSON.stringify({ memoryId: memory.id, content: memory.content, created }),
      data: { memory, created }
    };
  }
};

export const searchMemoryTool: BotTool = {
  name: 'search_memory',
  label: '搜索记忆',
  description:
    'Search the user\'s long-term memory store for preferences, projects, events, or previous decisions.',
  inputSchema: z.object({
    query: z.string().trim().min(1).max(2000),
    type: memoryType.optional(),
    projectId: z.string().max(200).nullable().optional(),
    limit: z.number().int().min(1).max(30).optional().default(8)
  }),
  async getPermission(input) {
    const args = this.inputSchema.parse(input) as { query: string };
    return permissionSpec({
      level: 'read',
      risk: 'low',
      requiresConfirmation: false,
      scope: 'memory',
      title: '搜索记忆',
      description: args.query
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      query: string;
      type?: MemoryType;
      projectId?: string | null;
      limit: number;
    };
    const memories = deps.memory.search({
      query: args.query,
      types: args.type ? [args.type] : undefined,
      projectId: args.projectId,
      limit: args.limit
    });
    return {
      ok: true,
      summary: memories.length > 0 ? `找到 ${memories.length} 条相关记忆` : '没有找到相关记忆',
      content:
        memories.length > 0
          ? deps.memory.formatForPrompt(memories)
          : 'No matching memories.',
      data: { memories }
    };
  }
};

export const forgetMemoryTool: BotTool = {
  name: 'forget_memory',
  label: '删除记忆',
  description:
    'Permanently delete a memory by id, or delete the best matching memory for a query. This cannot be undone.',
  inputSchema: z.object({
    id: z.string().max(200).optional(),
    query: z.string().trim().min(1).max(2000).optional()
  }),
  async getPermission(input) {
    const args = this.inputSchema.parse(input) as { id?: string; query?: string };
    return permissionSpec({
      level: 'write',
      risk: 'low',
      requiresConfirmation: false,
      scope: 'memory',
      title: '删除记忆',
      description: args.id ? `ID: ${args.id}` : `匹配：${args.query ?? ''}`
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as { id?: string; query?: string };
    if (!args.id && !args.query) throw new Error('必须提供记忆 id 或 query');
    if (args.id) {
      deps.memory.forget(args.id);
      return {
        ok: true,
        summary: '已删除指定记忆',
        content: `Deleted memory ${args.id}`
      };
    }
    const deleted = deps.memory.forgetMatching(args.query!, 1);
    return {
      ok: deleted > 0,
      summary: deleted > 0 ? '已删除匹配的记忆' : '没有找到可删除的记忆',
      content: JSON.stringify({ deleted })
    };
  }
};

export const createTodoTool: BotTool = {
  name: 'create_todo',
  label: '创建待办',
  description: 'Create a local todo item. Use epoch milliseconds for an optional due date.',
  inputSchema: z.object({
    title: z.string().trim().min(1).max(500),
    notes: z.string().max(10_000).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    dueAt: z.number().int().nonnegative().nullable().optional(),
    projectId: z.string().max(200).nullable().optional()
  }),
  async getPermission(input) {
    const args = this.inputSchema.parse(input) as { title: string };
    return permissionSpec({
      level: 'write',
      risk: 'low',
      requiresConfirmation: false,
      scope: 'todos',
      title: '创建待办',
      description: args.title
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      title: string;
      notes?: string | null;
      priority: 'low' | 'medium' | 'high';
      dueAt?: number | null;
      projectId?: string | null;
    };
    const todo = deps.stores.todos.upsert(args);
    deps.stores.events.add('todo.created', `创建待办：${todo.title}`, { todoId: todo.id });
    return {
      ok: true,
      summary: `已创建待办：${todo.title}`,
      content: JSON.stringify({ todo }),
      data: { todo }
    };
  }
};

export const createReminderTool: BotTool = {
  name: 'create_reminder',
  label: '创建提醒',
  description:
    'Create a local reminder. triggerAt must be epoch milliseconds in the user\'s local timezone. Supports one-time, daily, or weekly reminders.',
  inputSchema: z.object({
    title: z.string().trim().min(1).max(500),
    content: z.string().max(10_000).nullable().optional(),
    triggerAt: z.number().int().nonnegative(),
    repeat: repeatSchema.nullable().optional(),
    enabled: z.boolean().optional().default(true)
  }),
  async getPermission(input) {
    const args = this.inputSchema.parse(input) as {
      title: string;
      triggerAt: number;
    };
    return permissionSpec({
      level: 'write',
      risk: 'low',
      requiresConfirmation: false,
      scope: 'reminders',
      title: '创建提醒',
      description: `${args.title} @ ${new Date(args.triggerAt).toLocaleString('zh-CN')}`
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      title: string;
      content?: string | null;
      triggerAt: number;
      repeat?: RepeatRule | null;
      enabled: boolean;
    };
    if (!Number.isFinite(args.triggerAt)) throw new Error('triggerAt 无效');
    const reminder = deps.stores.reminders.upsert({
      title: args.title,
      content: args.content ?? null,
      triggerAt: args.triggerAt,
      repeat: args.repeat ?? null,
      enabled: args.enabled
    });
    deps.stores.events.add('reminder.created', `创建提醒：${reminder.title}`, {
      reminderId: reminder.id,
      triggerAt: reminder.triggerAt
    });
    deps.onReminderChanged?.();
    return {
      ok: true,
      summary: `已创建提醒：${reminder.title}`,
      content: JSON.stringify({ reminder }),
      data: { reminder }
    };
  }
};
