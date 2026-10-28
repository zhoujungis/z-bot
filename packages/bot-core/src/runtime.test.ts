import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStores, ZBotDatabase, type Stores } from '@zbot/database';
import { LocalMemoryService } from '@zbot/memory';
import { ToolRegistry } from '@zbot/tools';
import { DEFAULT_SETTINGS, type ChatEvent } from '@zbot/shared';
import type {
  LlmMessage,
  LlmToolCall,
  ModelProvider,
  ModelResponse,
  ModelStreamEvent,
  StreamOptions
} from '@zbot/model';
import { BotRuntime } from './runtime';

function usage(prompt = 5, completion = 2): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  return { promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion };
}

class ScriptedProvider implements ModelProvider {
  calls = 0;
  readonly config = {
    id: 'fake',
    name: 'Fake model',
    kind: 'openai-compatible' as const,
    purpose: 'general' as const,
    model: 'fake',
    baseUrl: null,
    apiKey: null,
    temperature: 0,
    maxTokens: null
  };

  constructor(private readonly scripts: ModelStreamEvent[][]) {}

  async *stream(_messages: LlmMessage[], _options?: StreamOptions): AsyncIterable<ModelStreamEvent> {
    const script = this.scripts[this.calls] ?? [
      { type: 'text-delta', delta: 'done' },
      { type: 'finish', finishReason: 'stop', usage: usage() }
    ];
    this.calls += 1;
    for (const event of script) yield event;
  }

  async chat(): Promise<ModelResponse> {
    return { text: '', toolCalls: [], usage: usage(), finishReason: 'stop', aborted: false };
  }
}

function toolCall(id: string, name: string, input: unknown): LlmToolCall {
  return { id, name, input };
}

describe('BotRuntime', () => {
  let dir: string;
  let database: ZBotDatabase;
  let stores: Stores;
  let memory: LocalMemoryService;
  let tools: ToolRegistry;

  function createBot(provider: ModelProvider): BotRuntime {
    return new BotRuntime({
      stores,
      memory,
      tools,
      models: {
        primary: () => provider,
        fallback: () => null
      },
      timeoutMs: 5000
    });
  }

  function waitFor(
    instance: BotRuntime,
    content: string
  ): Promise<{ events: ChatEvent[] }> {
    return new Promise((resolve, reject) => {
      const events: ChatEvent[] = [];
      const timeout = setTimeout(() => reject(new Error('chat timed out')), 5000);
      const emit = (event: ChatEvent): void => {
        events.push(event);
        if (event.type === 'chat.permission') {
          void instance.permissions.respond({ requestId: event.request.id, decision: 'allow_once' });
        }
        if (event.type === 'chat.done') {
          clearTimeout(timeout);
          resolve({ events });
        }
        if (event.type === 'chat.error') {
          clearTimeout(timeout);
          reject(new Error(event.error.message));
        }
        if (event.type === 'chat.cancelled') {
          clearTimeout(timeout);
          reject(new Error('chat cancelled'));
        }
      };
      void instance.startChat({ content, attachments: [] }, [], emit).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zbot-runtime-'));
    database = new ZBotDatabase(join(dir, 'test.db'));
    stores = createStores(database);
    memory = new LocalMemoryService(stores.memories);
    tools = new ToolRegistry({
      stores,
      memory,
      getRoots: () => stores.roots.list(),
      getSettings: () => DEFAULT_SETTINGS,
      getWebSearchKey: () => null,
      system: {
        readClipboardText: () => '',
        captureScreen: async () => {
          throw new Error('unused');
        },
        saveAttachment: async () => {
          throw new Error('unused');
        },
        trashItem: async () => undefined
      }
    });
  });

  afterEach(async () => {
    await tools.close();
    database.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves explicit memory without calling the model', async () => {
    const provider = new ScriptedProvider([]);
    const instance = createBot(provider);
    const { events } = await waitFor(instance, '记住：我喜欢简洁直接的界面');
    const memoryEvent = events.find((event) => event.type === 'chat.memory');
    expect(memoryEvent?.type).toBe('chat.memory');
    expect(memory.search({ query: '简洁' })[0]?.content).toContain('简洁直接');
    expect(provider.calls).toBe(0);
  });

  it('streams a direct model reply and persists it', async () => {
    const provider = new ScriptedProvider([
      [
        { type: 'text-delta', delta: '你好，' },
        { type: 'text-delta', delta: '我是 Z Bot。' },
        { type: 'finish', finishReason: 'stop', usage: usage() }
      ]
    ]);
    const instance = createBot(provider);
    const { events } = await waitFor(instance, '你好');
    const done = events.find((event) => event.type === 'chat.done');
    expect(done?.type).toBe('chat.done');
    expect(provider.calls).toBe(1);
    const conversation = stores.conversations.list()[0]!;
    const detail = stores.conversations.getDetail(conversation.id)!;
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1]?.content).toBe('你好，我是 Z Bot。');
  });

  it('executes an Agent tool call and verifies the resulting todo', async () => {
    const provider = new ScriptedProvider([
      [
        {
          type: 'tool-call',
          toolCall: toolCall('call-todo', 'create_todo', {
            title: '发布 Z Bot',
            priority: 'high'
          })
        },
        { type: 'finish', finishReason: 'tool_calls', usage: usage() }
      ],
      [
        { type: 'text-delta', delta: '待办已经创建。' },
        { type: 'finish', finishReason: 'stop', usage: usage() }
      ]
    ]);
    const instance = createBot(provider);
    const { events } = await waitFor(instance, '帮我创建一个待办：发布 Z Bot');
    const done = events.find((event) => event.type === 'chat.done');
    expect(done?.type).toBe('chat.done');
    if (done?.type === 'chat.done') {
      expect(done.task?.status).toBe('completed');
      expect(done.task?.stats.toolCalls).toBe(1);
    }
    expect(stores.todos.list()[0]?.title).toBe('发布 Z Bot');
    const completedTool = events.find(
      (event) => event.type === 'chat.tool' && event.toolCall.status === 'completed'
    );
    expect(completedTool?.type).toBe('chat.tool');
  });

  it('does not write files when the user denies permission', async () => {
    const root = join(dir, 'root');
    const target = join(root, 'blocked.txt');
    mkdirSync(root);
    stores.roots.add({ path: root, label: 'Test', allowWrite: true });
    chmodSync(root, 0o700);

    const provider = new ScriptedProvider([
      [
        {
          type: 'tool-call',
          toolCall: toolCall('call-write', 'write_file', {
            path: target,
            content: 'should not be written',
            overwrite: false
          })
        },
        { type: 'finish', finishReason: 'tool_calls', usage: usage() }
      ],
      [
        { type: 'text-delta', delta: '操作已拒绝。' },
        { type: 'finish', finishReason: 'stop', usage: usage() }
      ]
    ]);
    const instance = createBot(provider);

    const events = await new Promise<ChatEvent[]>((resolve, reject) => {
      const collected: ChatEvent[] = [];
      const timeout = setTimeout(() => reject(new Error('chat timed out')), 5000);
      const emit = (event: ChatEvent): void => {
        collected.push(event);
        if (event.type === 'chat.permission') {
          void instance.permissions.respond({ requestId: event.request.id, decision: 'deny' });
        }
        if (event.type === 'chat.done') {
          clearTimeout(timeout);
          resolve(collected);
        }
        if (event.type === 'chat.error') {
          clearTimeout(timeout);
          reject(new Error(event.error.message));
        }
      };
      void instance
        .startChat(
          { content: `整理文件并写入 ${target}`, attachments: [] },
          [],
          emit
        )
        .catch(reject);
    });

    const permission = events.find((event) => event.type === 'chat.permission');
    expect(permission?.type).toBe('chat.permission');
    expect(existsSync(target)).toBe(false);
    const failedTool = events.find(
      (event) => event.type === 'chat.tool' && event.toolCall.status === 'failed'
    );
    expect(failedTool?.type).toBe('chat.tool');
  });
});
