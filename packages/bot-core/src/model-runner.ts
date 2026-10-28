import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
  ModelProvider
} from '@zbot/model';
import { ModelRequestError } from '@zbot/model';
import type { TokenUsage } from '@zbot/shared';
import { CancelledError } from './errors';

export interface ModelAttemptResult {
  text: string;
  toolCalls: LlmToolCall[];
  usage: TokenUsage;
  finishReason: string;
  usedFallback: boolean;
  retries: number;
}

export interface StreamModelOptions {
  primary: ModelProvider;
  fallback: ModelProvider | null;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  signal: AbortSignal;
  maxAttempts?: number;
  onDelta?(delta: string): void;
  onRetry?(attempt: number, error: Error): void;
  onProvider?(provider: ModelProvider): void;
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new CancelledError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new CancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function attempt(
  provider: ModelProvider,
  options: StreamModelOptions,
  textEmittedRef: { value: boolean }
): Promise<{ text: string; toolCalls: LlmToolCall[]; usage: TokenUsage; finishReason: string }> {
  let text = '';
  let usage = emptyUsage();
  let finishReason = 'stop';
  const toolCalls: LlmToolCall[] = [];
  options.onProvider?.(provider);

  for await (const event of provider.stream(options.messages, {
    tools: options.tools,
    abortSignal: options.signal
  })) {
    if (options.signal.aborted) throw new CancelledError();
    switch (event.type) {
      case 'text-delta':
        text += event.delta;
        textEmittedRef.value = true;
        options.onDelta?.(event.delta);
        break;
      case 'tool-call':
        toolCalls.push(event.toolCall);
        break;
      case 'finish':
        usage = event.usage;
        finishReason = event.finishReason;
        break;
      case 'usage':
        usage = event.usage;
        break;
      case 'aborted':
        throw new CancelledError();
      case 'error':
        throw event.error;
      default:
        break;
    }
  }

  return { text, toolCalls, usage, finishReason };
}

export async function streamModel(options: StreamModelOptions): Promise<ModelAttemptResult> {
  const providers: Array<{ provider: ModelProvider; fallback: boolean }> = [
    { provider: options.primary, fallback: false }
  ];
  if (options.fallback) {
    providers.push({ provider: options.fallback, fallback: true });
  }

  let retries = 0;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  let lastError: Error | null = null;
  const textEmittedRef = { value: false };

  for (const entry of providers) {
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
      if (options.signal.aborted) throw new CancelledError();
      try {
        const result = await attempt(entry.provider, options, textEmittedRef);
        return {
          ...result,
          usedFallback: entry.fallback,
          retries
        };
      } catch (error) {
        if (options.signal.aborted) throw new CancelledError();
        const normalized = error instanceof Error ? error : new Error(String(error));
        lastError = normalized;
        const retryable =
          normalized instanceof ModelRequestError ? normalized.retryable : true;
        if (!retryable || attemptNumber >= maxAttempts || textEmittedRef.value) {
          break;
        }
        retries += 1;
        options.onRetry?.(retries, normalized);
        await delay(500 * 2 ** (retries - 1), options.signal);
      }
    }
    if (textEmittedRef.value) break;
  }

  throw lastError ?? new Error('模型请求失败');
}

export function mergeUsage(target: TokenUsage, addition: TokenUsage): TokenUsage {
  return addUsage(target, addition);
}
