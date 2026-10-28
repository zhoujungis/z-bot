import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LATEST_SCHEMA_VERSION, migrations } from './migrations';

export interface DatabaseOptions {
  backupDirectory?: string;
  readonly?: boolean;
}

export interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
}

class DatabaseCompat implements SqliteDatabase {
  constructor(private readonly raw: DatabaseSync) {}

  prepare(sql: string): SqliteStatement {
    return this.raw.prepare(sql) as unknown as SqliteStatement;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        this.raw.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.raw.exec('ROLLBACK');
        } catch {
          // The original error is more useful than a rollback failure.
        }
        throw error;
      }
    };
  }
}

export class ZBotDatabase {
  readonly db: SqliteDatabase;
  private readonly raw: DatabaseSync;

  constructor(
    readonly filePath: string,
    options: DatabaseOptions = {}
  ) {
    if (filePath !== ':memory:') {
      mkdirSync(dirname(filePath), { recursive: true });
      this.backupIfNeeded(options.backupDirectory);
    }

    this.raw = new DatabaseSync(filePath, {
      readOnly: options.readonly ?? false,
      enableForeignKeyConstraints: true,
      timeout: 5000
    });
    this.db = new DatabaseCompat(this.raw);
    this.raw.exec('PRAGMA temp_store = MEMORY;');
    if (filePath !== ':memory:') {
      this.raw.exec('PRAGMA journal_mode = WAL;');
      this.raw.exec('PRAGMA synchronous = NORMAL;');
    }
    this.migrate();
  }

  private backupIfNeeded(backupDirectory: string | undefined): void {
    if (!backupDirectory || !existsSync(this.filePath)) return;
    const currentVersion = this.readVersion();
    if (currentVersion >= LATEST_SCHEMA_VERSION) return;

    mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDirectory, `zbot-before-v${LATEST_SCHEMA_VERSION}-${stamp}.db`);
    copyFileSync(this.filePath, backupPath);
  }

  private readVersion(): number {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.filePath, { readOnly: true });
      const row = db.prepare('PRAGMA user_version').get() as
        | { user_version?: number }
        | undefined;
      return Number(row?.user_version ?? 0);
    } catch {
      return 0;
    } finally {
      db?.close();
    }
  }

  private migrate(): void {
    const row = this.raw.prepare('PRAGMA user_version').get() as
      | { user_version?: number }
      | undefined;
    const current = Number(row?.user_version ?? 0);
    for (const migration of migrations) {
      if (migration.version <= current) continue;
      this.raw.exec('BEGIN IMMEDIATE');
      try {
        this.raw.exec(migration.sql);
        this.raw.exec(`PRAGMA user_version = ${migration.version}`);
        this.raw.exec('COMMIT');
      } catch (error) {
        try {
          this.raw.exec('ROLLBACK');
        } catch {
          // Surface the migration error.
        }
        throw error;
      }
    }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  checkpoint(): void {
    if (this.filePath !== ':memory:') {
      this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    }
  }

  close(): void {
    try {
      this.checkpoint();
    } finally {
      this.raw.close();
    }
  }
}

export function nowMs(): number {
  return Date.now();
}
