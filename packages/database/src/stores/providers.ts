import { createId } from '@zbot/shared';
import type { ModelConfig, ModelConfigInput, ModelProviderKind, ModelPurpose } from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';
import { asBoolean } from '../helpers';

interface ModelConfigRow {
  id: string;
  name: string;
  kind: ModelProviderKind;
  purpose: ModelPurpose;
  model: string;
  base_url: string | null;
  encrypted_api_key: string | null;
  temperature: number;
  max_tokens: number | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

export interface StoredModelConfig extends ModelConfig {
  encryptedApiKey: string | null;
}

function mapRow(row: ModelConfigRow): StoredModelConfig {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    purpose: row.purpose,
    model: row.model,
    baseUrl: row.base_url,
    apiKeyConfigured: Boolean(row.encrypted_api_key),
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    isDefault: asBoolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    encryptedApiKey: row.encrypted_api_key
  };
}

function toPublic(row: StoredModelConfig): ModelConfig {
  const { encryptedApiKey: _encryptedApiKey, ...config } = row;
  return config;
}

export class ModelConfigStore {
  constructor(private readonly database: ZBotDatabase) {}

  list(): ModelConfig[] {
    const rows = this.database.db
      .prepare('SELECT * FROM model_configs ORDER BY is_default DESC, purpose ASC, name ASC')
      .all() as ModelConfigRow[];
    return rows.map((row) => toPublic(mapRow(row)));
  }

  get(id: string): StoredModelConfig | null {
    const row = this.database.db
      .prepare('SELECT * FROM model_configs WHERE id = ?')
      .get(id) as ModelConfigRow | undefined;
    return row ? mapRow(row) : null;
  }

  getByPurpose(purpose: ModelPurpose): StoredModelConfig | null {
    const exact = this.database.db
      .prepare(
        `SELECT * FROM model_configs
         WHERE purpose = ?
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      )
      .get(purpose) as ModelConfigRow | undefined;
    if (exact) return mapRow(exact);
    if (purpose === 'general') return null;
    const fallback = this.database.db
      .prepare(
        `SELECT * FROM model_configs
         WHERE purpose = 'general'
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      )
      .get() as ModelConfigRow | undefined;
    return fallback ? mapRow(fallback) : null;
  }

  upsert(input: ModelConfigInput, encryptedApiKey?: string | null): ModelConfig {
    const now = nowMs();
    const id = input.id ?? createId();
    const existing = input.id ? this.get(input.id) : null;
    const nextEncryptedKey =
      encryptedApiKey === undefined
        ? (existing?.encryptedApiKey ?? null)
        : encryptedApiKey;

    const execute = this.database.db.transaction(() => {
      if (input.isDefault) {
        this.database.db
          .prepare('UPDATE model_configs SET is_default = 0 WHERE purpose = ?')
          .run(input.purpose);
      }

      if (existing) {
        this.database.db
          .prepare(
            `UPDATE model_configs
             SET name = ?, kind = ?, purpose = ?, model = ?, base_url = ?,
                 encrypted_api_key = ?, temperature = ?, max_tokens = ?, is_default = ?,
                 updated_at = ?
             WHERE id = ?`
          )
          .run(
            input.name,
            input.kind,
            input.purpose,
            input.model,
            input.baseUrl ?? null,
            nextEncryptedKey,
            input.temperature,
            input.maxTokens ?? null,
            input.isDefault ? 1 : 0,
            now,
            id
          );
      } else {
        this.database.db
          .prepare(
            `INSERT INTO model_configs
              (id, name, kind, purpose, model, base_url, encrypted_api_key,
               temperature, max_tokens, is_default, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            input.name,
            input.kind,
            input.purpose,
            input.model,
            input.baseUrl ?? null,
            nextEncryptedKey,
            input.temperature,
            input.maxTokens ?? null,
            input.isDefault ? 1 : 0,
            now,
            now
          );
      }
    });
    execute();
    return this.list().find((config) => config.id === id)!;
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM model_configs WHERE id = ?').run(id);
  }
}
