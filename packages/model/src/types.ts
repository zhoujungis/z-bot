import type { ModelProviderKind, ModelPurpose, TokenUsage } from '@zbot/shared';

export interface ResolvedModelConfig {
  id: string;
  name: string;
  kind: ModelProviderKind;
  purpose: ModelPurpose;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  temperature: number;
  maxTokens: number | null;
}

export interface LlmImage {
  mimeType: string;
  dataBase64: string;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type LlmMessage =
  | {
      role: 'system' | 'user';
      content: string;
      images?: LlmImage[];
    }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: LlmToolCall[];
    }
  | {
      role: 'tool';
      content: string;
      toolCallId: string;
      toolName: string;
    };

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface StreamOptions {
  tools?: LlmToolDefinition[];
  temperature?: number;
  maxTokens?: number | null;
  abortSignal?: AbortSignal;
}

export type ModelStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call'; toolCall: LlmToolCall }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; finishReason: string; usage: TokenUsage }
  | { type: 'aborted' }
  | { type: 'error'; error: Error };

export interface ModelResponse {
  text: string;
  toolCalls: LlmToolCall[];
  usage: TokenUsage;
  finishReason: string;
  aborted: boolean;
}

export interface ModelProvider {
  readonly config: ResolvedModelConfig;
  stream(messages: LlmMessage[], options?: StreamOptions): AsyncIterable<ModelStreamEvent>;
  chat(messages: LlmMessage[], options?: StreamOptions): Promise<ModelResponse>;
}

export interface ModelErrorOptions {
  code: string;
  retryable: boolean;
  cause?: unknown;
}

export class ModelRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, options: ModelErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ModelRequestError';
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}
