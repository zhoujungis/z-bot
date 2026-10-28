import type { ModelConfigStore, StoredModelConfig } from '@zbot/database';
import type {
  ConnectionTestResult,
  ModelConfig,
  ModelConfigInput,
  ModelPurpose,
  WebSearchStatus
} from '@zbot/shared';
import {
  createModelProvider,
  ModelRequestError,
  type ModelProvider,
  type ResolvedModelConfig
} from '@zbot/model';
import type { SecretService } from './secrets';
import { redactErrorMessage } from './logger';

const WEB_SEARCH_SECRET = 'web-search-api-key';

export class ProviderService {
  constructor(
    private readonly modelConfigs: ModelConfigStore,
    private readonly secrets: SecretService
  ) {}

  list(): ModelConfig[] {
    return this.modelConfigs.list();
  }

  upsert(input: ModelConfigInput): ModelConfig {
    let encrypted: string | null | undefined;
    if (input.clearApiKey) {
      encrypted = null;
    } else if (input.apiKey?.trim()) {
      encrypted = this.secrets.encrypt(input.apiKey.trim());
    }
    return this.modelConfigs.upsert(input, encrypted);
  }

  remove(id: string): void {
    this.modelConfigs.delete(id);
  }

  primary(purpose: ModelPurpose): ModelProvider {
    const config = this.modelConfigs.getByPurpose(purpose);
    if (!config) {
      throw new ModelRequestError('还没有配置可用的模型。请先到 Settings → AI 添加模型。', {
        code: 'MODEL_NOT_CONFIGURED',
        retryable: false
      });
    }
    return createModelProvider(this.resolveConfig(config));
  }

  fallback(purpose: ModelPurpose, primary: ModelProvider): ModelProvider | null {
    const configs = this.modelConfigs.list().filter((config) => config.id !== primary.config.id);
    const preferred = configs.find((config) => config.purpose === purpose);
    const general = configs.find((config) => config.purpose === 'general');
    const candidate = preferred ?? general;
    if (!candidate) return null;
    const stored = this.modelConfigs.get(candidate.id);
    if (!stored) return null;
    try {
      return createModelProvider(this.resolveConfig(stored));
    } catch {
      return null;
    }
  }

  async test(input: ModelConfigInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    if (input.purpose === 'embedding') {
      return {
        ok: false,
        latencyMs: 0,
        message: 'Embedding 连接测试暂未启用；v0.1 使用 FTS5 检索。'
      };
    }
    try {
      let apiKey = input.apiKey?.trim() || null;
      if (!apiKey && input.id) {
        const existing = this.modelConfigs.get(input.id);
        if (existing?.encryptedApiKey) {
          apiKey = this.secrets.decrypt(existing.encryptedApiKey);
        }
      }
      const config: ResolvedModelConfig = {
        id: input.id ?? 'connection-test',
        name: input.name,
        kind: input.kind,
        purpose: input.purpose,
        model: input.model,
        baseUrl: input.baseUrl ?? null,
        apiKey,
        temperature: 0,
        maxTokens: 24
      };
      const provider = createModelProvider(config);
      const response = await provider.chat(
        [
          {
            role: 'system',
            content: 'You are a connection test. Reply with exactly OK.'
          },
          { role: 'user', content: 'Reply with OK.' }
        ],
        {
          maxTokens: 24,
          temperature: 0,
          abortSignal: AbortSignal.timeout(25_000)
        }
      );
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        message: response.text.trim() ? '连接成功' : '已连接，但模型没有返回文本'
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: redactErrorMessage(error)
      };
    }
  }

  webSearchStatus(provider: WebSearchStatus['provider']): WebSearchStatus {
    return {
      configured: Boolean(this.secrets.getEncrypted(WEB_SEARCH_SECRET)),
      provider
    };
  }

  setWebSearchKey(value: string): void {
    this.secrets.setPlaintext(WEB_SEARCH_SECRET, value.trim());
  }

  getWebSearchKey(): string | null {
    return this.secrets.getPlaintext(WEB_SEARCH_SECRET);
  }

  private resolveConfig(config: StoredModelConfig): ResolvedModelConfig {
    let apiKey: string | null = null;
    if (config.encryptedApiKey) {
      apiKey = this.secrets.decrypt(config.encryptedApiKey);
    }
    return {
      id: config.id,
      name: config.name,
      kind: config.kind,
      purpose: config.purpose,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    };
  }
}

export { WEB_SEARCH_SECRET };
