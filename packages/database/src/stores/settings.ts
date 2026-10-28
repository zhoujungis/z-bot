import { DEFAULT_SETTINGS, mergeSettings, settingsSchema } from '@zbot/shared';
import type { AppSettings } from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';
import { parseJson } from '../helpers';

const SETTINGS_KEY = 'app';

export class SettingsStore {
  constructor(private readonly database: ZBotDatabase) {}

  get(): AppSettings {
    const row = this.database.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SETTINGS_KEY) as { value: string } | undefined;
    return mergeSettings(parseJson<Record<string, unknown>>(row?.value, {}));
  }

  update(settings: AppSettings): AppSettings {
    const parsed = settingsSchema.parse(settings);
    this.database.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(SETTINGS_KEY, JSON.stringify(parsed), nowMs());
    return parsed;
  }

  ensureInitialized(): AppSettings {
    const existing = this.get();
    return this.update(existing ?? DEFAULT_SETTINGS);
  }
}
