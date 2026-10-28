import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';

export class SecretsStore {
  constructor(private readonly database: ZBotDatabase) {}

  get(name: string): string | null {
    const row = this.database.db
      .prepare('SELECT encrypted_value FROM secrets WHERE name = ?')
      .get(name) as { encrypted_value: string } | undefined;
    return row?.encrypted_value ?? null;
  }

  set(name: string, encryptedValue: string): void {
    this.database.db
      .prepare(
        `INSERT INTO secrets (name, encrypted_value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           encrypted_value = excluded.encrypted_value,
           updated_at = excluded.updated_at`
      )
      .run(name, encryptedValue, nowMs());
  }

  delete(name: string): void {
    this.database.db.prepare('DELETE FROM secrets WHERE name = ?').run(name);
  }
}
