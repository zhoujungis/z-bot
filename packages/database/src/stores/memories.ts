import { createId } from '@zbot/shared';
import type { Memory, MemoryInput, MemorySearchInput, MemoryType } from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';
import { normalizeTags } from '../helpers';

interface MemoryRow {
  id: string;
  type: MemoryType;
  content: string;
  project_id: string | null;
  importance: number;
  confidence: number;
  source: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  archived_at: number | null;
  search_rank?: number;
}

interface TagRow {
  memory_id: string;
  tag: string;
}

function mapMemory(row: MemoryRow, tags: string[]): Memory {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    projectId: row.project_id,
    importance: row.importance,
    confidence: row.confidence,
    tags,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    archivedAt: row.archived_at
  };
}

export class MemoryStore {
  constructor(private readonly database: ZBotDatabase) {}

  get(id: string): Memory | null {
    const row = this.database.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as
      | MemoryRow
      | undefined;
    return row ? mapMemory(row, this.tagsFor([row.id]).get(row.id) ?? []) : null;
  }

  search(input: MemorySearchInput = {}): Memory[] {
    const query = input.query?.trim() ?? '';
    const filters: string[] = [];
    const params: unknown[] = [];
    let from = 'FROM memories m';
    let order = 'ORDER BY m.importance DESC, m.confidence DESC, m.updated_at DESC';

    if (!input.includeArchived) {
      filters.push('m.archived_at IS NULL');
    }
    if (input.types && input.types.length > 0) {
      filters.push(`m.type IN (${input.types.map(() => '?').join(', ')})`);
      params.push(...input.types);
    }
    if (input.projectId !== undefined) {
      if (input.projectId === null) {
        filters.push('m.project_id IS NULL');
      } else {
        filters.push('m.project_id = ?');
        params.push(input.projectId);
      }
    }

    if (query.length >= 3) {
      from += ' JOIN memories_fts f ON f.rowid = m.rowid';
      filters.push('memories_fts MATCH ?');
      params.push(`"${query.replace(/"/g, '""')}"`);
      order = 'ORDER BY bm25(memories_fts) ASC, m.importance DESC, m.updated_at DESC';
    } else if (query.length > 0) {
      filters.push('instr(lower(m.content), lower(?)) > 0');
      params.push(query);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const rows = this.database.db
      .prepare(`SELECT m.* ${from} ${where} ${order} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as MemoryRow[];

    const tags = this.tagsFor(rows.map((row) => row.id));
    return rows.map((row) => mapMemory(row, tags.get(row.id) ?? []));
  }

  list(input: MemorySearchInput = {}): Memory[] {
    return this.search({ ...input, query: undefined });
  }

  upsert(input: MemoryInput): Memory {
    const now = nowMs();
    const id = input.id ?? createId();
    const tags = normalizeTags(input.tags);
    const existing = input.id
      ? (this.database.db.prepare('SELECT id FROM memories WHERE id = ?').get(input.id) as
          | { id: string }
          | undefined)
      : undefined;

    const execute = this.database.db.transaction(() => {
      if (existing) {
        this.database.db
          .prepare(
            `UPDATE memories
             SET type = ?, content = ?, project_id = ?, importance = ?, confidence = ?,
                 source = ?, expires_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(
            input.type,
            input.content,
            input.projectId ?? null,
            input.importance,
            input.confidence,
            input.source ?? null,
            input.expiresAt ?? null,
            now,
            id
          );
      } else {
        this.database.db
          .prepare(
            `INSERT INTO memories
              (id, type, content, project_id, importance, confidence, source,
               created_at, updated_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            input.type,
            input.content,
            input.projectId ?? null,
            input.importance,
            input.confidence,
            input.source ?? null,
            now,
            now,
            input.expiresAt ?? null
          );
      }

      this.database.db.prepare('DELETE FROM memory_tags WHERE memory_id = ?').run(id);
      const insertTag = this.database.db.prepare(
        'INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)'
      );
      for (const tag of tags) insertTag.run(id, tag);
    });
    execute();

    return this.get(id)!;
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  clear(): void {
    this.database.db.prepare('DELETE FROM memories').run();
  }

  findDuplicate(content: string, type: MemoryType, projectId: string | null): Memory | null {
    const row = this.database.db
      .prepare(
        `SELECT * FROM memories
         WHERE lower(trim(content)) = lower(trim(?))
           AND type = ?
           AND COALESCE(project_id, '') = COALESCE(?, '')
           AND archived_at IS NULL
         LIMIT 1`
      )
      .get(content, type, projectId) as MemoryRow | undefined;
    return row ? mapMemory(row, this.tagsFor([row.id]).get(row.id) ?? []) : null;
  }

  archiveExpired(now = nowMs()): number {
    const result = this.database.db
      .prepare(
        `UPDATE memories SET archived_at = ?
         WHERE archived_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?`
      )
      .run(now, now);
    return Number(result.changes);
  }

  count(): number {
    const row = this.database.db
      .prepare('SELECT COUNT(*) AS count FROM memories WHERE archived_at IS NULL')
      .get() as { count: number };
    return Number(row.count);
  }

  private tagsFor(ids: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (ids.length === 0) return result;
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.database.db
      .prepare(
        `SELECT memory_id, tag FROM memory_tags
         WHERE memory_id IN (${placeholders})
         ORDER BY tag ASC`
      )
      .all(...ids) as TagRow[];
    for (const row of rows) {
      const tags = result.get(row.memory_id) ?? [];
      tags.push(row.tag);
      result.set(row.memory_id, tags);
    }
    return result;
  }
}
