import {
  jsonSchema,
  streamText,
  tool,
  type ImagePart,
  type LanguageModel,
  type ModelMessage,
  type Tool,
  type ToolCallPart,
  type ToolResultPart,
  type ToolSet
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { TokenUsage } from '@zbot/shared';
import {
  emptyUsage,
  ModelRequestError,
  type LlmMessage,
  type ModelProvider,
  type ModelResponse,
  type ModelStreamEvent,
  type ResolvedModelConfig,
  type StreamOptions
} from './types';

function requireApiKey(config: ResolvedModelConfig): string {
  if (!config.apiKey) {
    throw new ModelRequestError(
      `${config.name} 还没有配置 API Key。请在 Settings → AI 中完成配置。`,
      { code: 'MODEL_KEY_MISSING', retryable: false }
    );
  }
  return config.apiKey;
}

function resolveModel(config: ResolvedModelConfig): LanguageModel {
  switch (config.kind) {
    case 'openai': {
      const provider = createOpenAI({
        apiKey: requireApiKey(config),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
      });
      return provider(config.model);
    }
    case 'openai-compatible': {
      if (!config.baseUrl) {
        throw new ModelRequestError('OpenAI-compatible Provider 需要 Base URL。', {
          code: 'MODEL_BASE_URL_MISSING',
          retryable: false
        });
      }
      const provider = createOpenAICompatible({
        name: config.name,
        baseURL: config.baseUrl,
        apiKey: config.apiKey ?? undefined,
        includeUsage: true
      });
      return provider(config.model);
    }
    case 'ollama': {
      const provider = createOpenAICompatible({
        name: 'Ollama',
        baseURL: config.baseUrl ?? 'http://127.0.0.1:11434/v1',
        apiKey: 'ollama',
        includeUsage: true
      });
      return provider(config.model);
    }
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: requireApiKey(config),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
      });
      return provider(config.model);
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({
        apiKey: requireApiKey(config),
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {})
      });
      return provider(config.model);
    }
    default: {
      throw new ModelRequestError(`不支持的模型 Provider: ${String(config.kind)}`, {
        code: 'MODEL_PROVIDER_UNSUPPORTED',
        retryable: false
      });
    }
  }
}

function toAiMessages(messages: LlmMessage[]): {
  system: string | undefined;
  messages: ModelMessage[];
} {
  const systems: string[] = [];
  const converted: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systems.push(message.content);
      continue;
    }
    if (message.role === 'user') {
      if (message.images && message.images.length > 0) {
        const images: ImagePart[] = message.images.map((image) => ({
          type: 'image',
          image: image.dataBase64,
          mediaType: image.mimeType
        }));
        converted.push({
          role: 'user',
          content: [{ type: 'text', text: message.content }, ...images]
        });
      } else {
        converted.push({ role: 'user', content: message.content });
      }
      continue;
    }
    if (message.role === 'assistant') {
      if (message.toolCalls && message.toolCalls.length > 0) {
        const toolCalls: ToolCallPart[] = message.toolCalls.map((call) => ({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: call.name,
          input: call.input
        }));
        converted.push({
          role: 'assistant',
          content: [
            ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
            ...toolCalls
          ]
        });
      } else {
        converted.push({ role: 'assistant', content: message.content });
      }
      continue;
    }

    if (message.role !== 'tool') continue;
    const result: ToolResultPart = {
      type: 'tool-result',
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      output: { type: 'text', value: message.content }
    };
    converted.push({ role: 'tool', content: [result] });
  }

  return {
    system: systems.length > 0 ? systems.join('\n\n') : undefined,
    messages: converted
  };
}

function toTools(definitions: StreamOptions['tools']): ToolSet | undefined {
  if (!definitions || definitions.length === 0) return undefined;
  const set: Record<string, Tool> = {};
  for (const definition of definitions) {
    set[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema)
    });
  }
  return set;
}

function toUsage(
  usage:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined
): TokenUsage {
  if (!usage) return emptyUsage();
  const prompt = usage.inputTokens ?? 0;
  const completion = usage.outputTokens ?? 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: usage.totalTokens ?? prompt + completion
  };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Unknown model error');
}

export class AiSdkModelProvider implements ModelProvider {
  private readonly languageModel: LanguageModel;

  constructor(readonly config: ResolvedModelConfig) {
    this.languageModel = resolveModel(config);
  }

  async *stream(
    messages: LlmMessage[],
    options: StreamOptions = {}
  ): AsyncIterable<ModelStreamEvent> {
    const converted = toAiMessages(messages);
    let result;
    try {
      result = streamText({
        model: this.languageModel,
        system: converted.system,
        messages: converted.messages,
        tools: toTools(options.tools),
        temperature: options.temperature ?? this.config.temperature,
        maxOutputTokens: options.maxTokens ?? this.config.maxTokens ?? undefined,
        abortSignal: options.abortSignal,
        maxRetries: 0
      });
    } catch (error) {
      yield {
        type: 'error',
        error: new ModelRequestError(normalizeError(error).message, {
          code: 'MODEL_REQUEST_FAILED',
          retryable: true,
          cause: error
        })
      };
      return;
    }

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            yield { type: 'text-delta', delta: part.text };
            break;
          case 'reasoning-delta':
            yield { type: 'reasoning-delta', delta: part.text };
            break;
          case 'tool-call':
            yield {
              type: 'tool-call',
              toolCall: {
                id: part.toolCallId,
                name: part.toolName,
                input: part.input
              }
            };
            break;
          case 'finish':
            yield {
              type: 'finish',
              finishReason: part.finishReason,
              usage: toUsage(part.totalUsage)
            };
            break;
          case 'abort':
            yield { type: 'aborted' };
            break;
          case 'error': {
            const error = normalizeError(part.error);
            yield {
              type: 'error',
              error: new ModelRequestError(error.message, {
                code: 'MODEL_STREAM_FAILED',
                retryable: true,
                cause: error
              })
            };
            break;
          }
          default:
            break;
        }
      }
    } catch (error) {
      if (options.abortSignal?.aborted) {
        yield { type: 'aborted' };
        return;
      }
      yield {
        type: 'error',
        error: new ModelRequestError(normalizeError(error).message, {
          code: 'MODEL_STREAM_FAILED',
          retryable: true,
          cause: error
        })
      };
    }
  }

  async chat(messages: LlmMessage[], options: StreamOptions = {}): Promise<ModelResponse> {
    let text = '';
    const toolCalls: ModelResponse['toolCalls'] = [];
    let usage = emptyUsage();
    let finishReason = 'stop';
    let aborted = false;

    for await (const event of this.stream(messages, options)) {
      switch (event.type) {
        case 'text-delta':
          text += event.delta;
          break;
        case 'tool-call':
          toolCalls.push(event.toolCall);
          break;
        case 'usage':
          usage = event.usage;
          break;
        case 'finish':
          usage = event.usage;
          finishReason = event.finishReason;
          break;
        case 'aborted':
          aborted = true;
          break;
        case 'error':
          throw event.error;
        default:
          break;
      }
    }

    return { text, toolCalls, usage, finishReason, aborted };
  }
}

export function createModelProvider(config: ResolvedModelConfig): ModelProvider {
  return new AiSdkModelProvider(config);
}
