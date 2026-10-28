import type { Stores } from '@zbot/database';
import type { MemoryService } from '@zbot/memory';
import {
  createId,
  truncate,
  type ChatEvent,
  type ChatSendInput,
  type ChatSendResult,
  type ModelPurpose,
  type PermissionResponse,
  type Task,
  type TokenUsage
} from '@zbot/shared';
import type {
  LlmImage,
  LlmMessage,
  ModelProvider
} from '@zbot/model';
import { ModelRequestError } from '@zbot/model';
import type { ToolRegistry } from '@zbot/tools';
import type { StoredAttachment } from '@zbot/database';
import { AgentRunner } from './agent';
import { ContextManager } from './context';
import { CancelledError, isAbortError } from './errors';
import { classifyIntent } from './intent';
import { streamModel } from './model-runner';
import { PermissionManager } from './permissions';

export interface PreparedAttachment {
  stored: StoredAttachment;
  image?: LlmImage;
  ocrText?: string;
}

export interface ModelResolver {
  primary(purpose: ModelPurpose): ModelProvider;
  fallback(purpose: ModelPurpose, primary: ModelProvider): ModelProvider | null;
}

export interface BotRuntimeDependencies {
  stores: Stores;
  memory: MemoryService;
  tools: ToolRegistry;
  models: ModelResolver;
  timeoutMs?: number;
}

interface ActiveChat {
  requestId: string;
  conversationId: string;
  assistantMessageId: string;
  controller: AbortController;
  emit(event: ChatEvent): void;
  cancelReason: 'user' | 'timeout' | null;
  taskId: string | null;
}

interface RunResult {
  text: string;
  usage: TokenUsage;
  taskId: string | null;
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof ModelRequestError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'CHAT_FAILED',
    message: error instanceof Error ? error.message : String(error)
  };
}

export class BotRuntime {
  readonly permissions: PermissionManager;
  private readonly active = new Map<string, ActiveChat>();
  private readonly context: ContextManager;
  private readonly agent: AgentRunner;
  private readonly timeoutMs: number;

  constructor(private readonly deps: BotRuntimeDependencies) {
    this.timeoutMs = deps.timeoutMs ?? 5 * 60 * 1000;
    this.context = new ContextManager({
      conversations: deps.stores.conversations,
      memories: deps.stores.memories,
      projects: deps.stores.projects,
      roots: deps.stores.roots,
      memoryService: deps.memory
    });
    this.permissions = new PermissionManager(deps.stores.permissions, (requestId, request) => {
      const active = this.active.get(requestId);
      active?.emit({ type: 'chat.permission', requestId, request });
    });
    this.agent = new AgentRunner({
      conversations: deps.stores.conversations,
      tasks: deps.stores.tasks,
      toolCalls: deps.stores.toolCalls,
      events: deps.stores.events,
      tools: deps.tools,
      permissions: this.permissions
    });
  }

  async startChat(
    input: ChatSendInput,
    attachments: PreparedAttachment[],
    emit: (event: ChatEvent) => void
  ): Promise<ChatSendResult> {
    let conversation = input.conversationId
      ? this.deps.stores.conversations.get(input.conversationId)
      : null;
    if (input.conversationId && !conversation) {
      throw new Error('会话不存在');
    }
    if (!conversation) {
      conversation = this.deps.stores.conversations.create({
        projectId: input.projectId ?? null,
        title: truncate(input.content.replace(/\s+/g, ' ').trim() || '新对话', 60)
      });
    }

    const userMessage = this.deps.stores.conversations.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: input.content,
      attachments: attachments.map((attachment) => attachment.stored)
    });
    this.deps.stores.conversations.maybeSetTitleFromMessage(conversation.id, input.content);
    const assistantMessage = this.deps.stores.conversations.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: ''
    });

    const requestId = createId();
    const controller = new AbortController();
    const active: ActiveChat = {
      requestId,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id,
      controller,
      emit,
      cancelReason: null,
      taskId: null
    };
    this.active.set(requestId, active);
    emit({
      type: 'chat.started',
      requestId,
      conversationId: conversation.id,
      assistantMessageId: assistantMessage.id
    });

    void this.executeChat(input, active, attachments, conversation.projectId).catch((error) => {
      const payload = errorPayload(error);
      active.emit({
        type: 'chat.error',
        requestId,
        error: payload
      });
      this.active.delete(requestId);
    });

    return {
      requestId,
      conversationId: conversation.id,
      userMessage,
      assistantMessageId: assistantMessage.id
    };
  }

  cancel(requestId: string): void {
    const active = this.active.get(requestId);
    if (!active) return;
    active.cancelReason = 'user';
    active.controller.abort(new CancelledError());
    this.permissions.cancelForChat(requestId);
  }

  cancelTask(taskId: string): boolean {
    for (const active of this.active.values()) {
      if (active.taskId !== taskId) continue;
      this.cancel(active.requestId);
      return true;
    }
    return false;
  }

  respondPermission(response: PermissionResponse): void {
    this.permissions.respond(response);
  }

  activeRequests(): string[] {
    return [...this.active.keys()];
  }

  private async executeChat(
    input: ChatSendInput,
    active: ActiveChat,
    attachments: PreparedAttachment[],
    projectId: string | null
  ): Promise<void> {
    const timeout = setTimeout(() => {
      if (!this.active.has(active.requestId)) return;
      active.cancelReason = 'timeout';
      active.controller.abort(new CancelledError('任务超时'));
    }, this.timeoutMs);

    let partialText = '';
    const onText = (delta: string): void => {
      partialText += delta;
      active.emit({
        type: 'chat.delta',
        requestId: active.requestId,
        messageId: active.assistantMessageId,
        delta
      });
    };

    try {
      const explicit = input.quickAction === 'remember'
        ? input.content.trim()
        : this.deps.memory.extractExplicitMemory(input.content);
      if (explicit) {
        const result = await this.runExplicitMemory(
          input,
          active,
          projectId,
          explicit,
          onText
        );
        this.finishDirect(active, result.text, result.usage, null);
        active.emit({
          type: 'chat.done',
          requestId: active.requestId,
          messageId: active.assistantMessageId,
          usage: result.usage,
          task: null
        });
        return;
      }

      const decision = classifyIntent(input.content, input.quickAction);
      const images = attachments.flatMap((attachment) =>
        attachment.image ? [attachment.image] : []
      );
      const purpose: ModelPurpose = images.length > 0 ? 'vision' : 'general';
      const primary = this.deps.models.primary(purpose);
      const fallback = this.deps.models.fallback(purpose, primary);
      const attachmentText = attachments
        .filter((attachment) => attachment.ocrText)
        .map(
          (attachment) =>
            `[${attachment.stored.name}]\n${attachment.ocrText}`
        )
        .join('\n\n')
        .slice(0, 24_000);
      const built = this.context.build({
        conversationId: active.conversationId,
        currentMessageId: this.findCurrentUserMessageId(
          active.conversationId,
          active.assistantMessageId
        ),
        assistantMessageId: active.assistantMessageId,
        content: input.content,
        images,
        attachmentText,
        projectId,
        mode: decision.mode
      });

      const result =
        decision.mode === 'agent'
          ? await this.runAgent(input, active, built.messages, primary, fallback, onText)
          : await this.runDirect(active, built.messages, primary, fallback, onText);

      const text = result.text.trim();
      const finalText = text || '模型没有返回可显示内容。';
      this.finishDirect(
        active,
        finalText,
        result.usage,
        result.taskId ? this.deps.stores.tasks.get(result.taskId) : null
      );
      active.emit({
        type: 'chat.done',
        requestId: active.requestId,
        messageId: active.assistantMessageId,
        usage: result.usage,
        task: result.taskId ? this.deps.stores.tasks.get(result.taskId) : null
      });
    } catch (error) {
      if (isAbortError(error) || active.controller.signal.aborted) {
        if (partialText.trim()) {
          this.deps.stores.conversations.updateAssistantContent(
            active.assistantMessageId,
            partialText.trim()
          );
        }
        if (active.cancelReason === 'timeout') {
          active.emit({
            type: 'chat.error',
            requestId: active.requestId,
            error: { code: 'CHAT_TIMEOUT', message: '任务超过 5 分钟限制，已停止' }
          });
        } else {
          active.emit({ type: 'chat.cancelled', requestId: active.requestId });
        }
        return;
      }

      const payload = errorPayload(error);
      if (partialText.trim()) {
        this.deps.stores.conversations.updateAssistantContent(
          active.assistantMessageId,
          partialText.trim()
        );
      }
      active.emit({
        type: 'chat.error',
        requestId: active.requestId,
        error: payload
      });
    } finally {
      clearTimeout(timeout);
      this.active.delete(active.requestId);
    }
  }

  private async runExplicitMemory(
    input: ChatSendInput,
    active: ActiveChat,
    projectId: string | null,
    content: string,
    onText: (delta: string) => void
  ): Promise<RunResult> {
    const type = projectId ? 'project' : 'user';
    const expiryDays = this.deps.stores.settings.get().memory.defaultExpiryDays;
    const { memory, created } = this.deps.memory.remember({
      type,
      content,
      projectId,
      importance: 0.8,
      confidence: 0.95,
      source: 'explicit',
      expiresAt: expiryDays ? Date.now() + expiryDays * 24 * 60 * 60 * 1000 : null
    });
    this.deps.stores.events.add('memory.created', `记住：${truncate(content, 120)}`, {
      memoryId: memory.id,
      updated: !created
    });
    active.emit({ type: 'chat.memory', requestId: active.requestId, memory });
    const text = created
      ? `好的，我记住了。\n\n> ${content}`
      : `我把这条信息更新到了已有记忆中。\n\n> ${content}`;
    onText(text);
    return { text, usage: emptyUsage(), taskId: null };
  }

  private async runDirect(
    active: ActiveChat,
    messages: LlmMessage[],
    primary: ModelProvider,
    fallback: ModelProvider | null,
    onText: (delta: string) => void
  ): Promise<RunResult> {
    const result = await streamModel({
      primary,
      fallback,
      messages,
      signal: active.controller.signal,
      onDelta: onText
    });
    if (!result.text.trim()) {
      throw new Error('模型没有返回文本');
    }
    return { text: result.text, usage: result.usage, taskId: null };
  }

  private async runAgent(
    input: ChatSendInput,
    active: ActiveChat,
    messages: LlmMessage[],
    primary: ModelProvider,
    fallback: ModelProvider | null,
    onText: (delta: string) => void
  ): Promise<RunResult> {
    const result = await this.agent.run({
      chatRequestId: active.requestId,
      conversationId: active.conversationId,
      assistantMessageId: active.assistantMessageId,
      prompt: input.content,
      messages,
      primary,
      fallback,
      signal: active.controller.signal,
      emit: (event) => {
        if (event.type === 'chat.task') active.taskId = event.task.id;
        active.emit(event);
      },
      onText
    });
    return {
      text: result.text,
      usage: result.usage,
      taskId: result.task.id
    };
  }

  private finishDirect(
    active: ActiveChat,
    text: string,
    _usage: TokenUsage,
    _task: Task | null
  ): void {
    this.deps.stores.conversations.updateAssistantContent(active.assistantMessageId, text);
    this.deps.stores.events.add('conversation.replied', 'Z Bot 完成回复', {
      conversationId: active.conversationId
    });
  }

  private findCurrentUserMessageId(conversationId: string, assistantMessageId: string): string {
    const messages = this.deps.stores.conversations.getMessages(conversationId);
    const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId);
    if (assistantIndex <= 0) return '';
    for (let index = assistantIndex - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') return messages[index]!.id;
    }
    return '';
  }
}

