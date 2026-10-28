import { createId } from '@zbot/shared';
import type { EventView, ToolCallStatus, ToolCallView } from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';
import { parseJson } from '../helpers';

interface EventRow {
  id: string;
  type: string;
  content: string;
  metadata: string | null;
  created_at: number;
}

interface ToolCallRow {
  id: string;
  task_id: string | null;
  message_id: string | null;
  name: string;
  label: string;
  status: ToolCallStatus;
  summary: string;
  args_preview: string | null;
  result_preview: string | null;
  error: string | null;
  started_at: number;
  finished_at: number | null;
}

export class EventStore {
  constructor(private readonly database: ZBotDatabase) {}

  add(type: string, content: string, metadata?: Record<string, unknown> | null): EventView {
    const event: EventView = {
      id: createId(),
      type,
      content,
      metadata: metadata ?? null,
      createdAt: nowMs()
    };
    this.database.db
      .prepare(
        `INSERT INTO events (id, type, content, metadata, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.type,
        event.content,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.createdAt
      );
    return event;
  }

  list(limit = 30): EventView[] {
    const rows = this.database.db
      .prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(Math.max(limit, 1), 200)) as EventRow[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      metadata: parseJson<Record<string, unknown> | null>(row.metadata, null),
      createdAt: row.created_at
    }));
  }
}

export class ToolCallStore {
  constructor(private readonly database: ZBotDatabase) {}

  create(input: {
    id: string;
    taskId?: string | null;
    messageId?: string | null;
    name: string;
    label: string;
    summary: string;
    argsPreview?: string | null;
  }): ToolCallView {
    const startedAt = nowMs();
    this.database.db
      .prepare(
        `INSERT INTO tool_calls
          (id, task_id, message_id, name, label, status, summary, args_preview, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)`
      )
      .run(
        input.id,
        input.taskId ?? null,
        input.messageId ?? null,
        input.name,
        input.label,
        input.summary,
        input.argsPreview ?? null,
        startedAt
      );
    return {
      id: input.id,
      taskId: input.taskId ?? null,
      name: input.name,
      label: input.label,
      status: 'running',
      summary: input.summary,
      argsPreview: input.argsPreview ?? null,
      resultPreview: null,
      error: null,
      startedAt,
      finishedAt: null
    };
  }

  update(
    id: string,
    input: {
      status?: ToolCallStatus;
      summary?: string;
      resultPreview?: string | null;
      error?: string | null;
      finishedAt?: number | null;
    }
  ): ToolCallView | null {
    const existing = this.get(id);
    if (!existing) return null;
    const next = {
      status: input.status ?? existing.status,
      summary: input.summary ?? existing.summary,
      resultPreview: input.resultPreview ?? existing.resultPreview,
      error: input.error ?? existing.error,
      finishedAt: input.finishedAt ?? existing.finishedAt
    };
    this.database.db
      .prepare(
        `UPDATE tool_calls
         SET status = ?, summary = ?, result_preview = ?, error = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(
        next.status,
        next.summary,
        next.resultPreview ?? null,
        next.error ?? null,
        next.finishedAt ?? null,
        id
      );
    return this.get(id);
  }

  get(id: string): ToolCallView | null {
    const row = this.database.db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(id) as
      | ToolCallRow
      | undefined;
    return row ? this.mapRow(row) : null;
  }

  listByTask(taskId: string): ToolCallView[] {
    const rows = this.database.db
      .prepare('SELECT * FROM tool_calls WHERE task_id = ? ORDER BY started_at ASC')
      .all(taskId) as ToolCallRow[];
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: ToolCallRow): ToolCallView {
    return {
      id: row.id,
      taskId: row.task_id,
      name: row.name,
      label: row.label,
      status: row.status,
      summary: row.summary,
      argsPreview: row.args_preview,
      resultPreview: row.result_preview,
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }
}

export class PermissionRuleStore {
  constructor(private readonly database: ZBotDatabase) {}

  find(toolName: string, scope: string): 'allow' | 'deny' | null {
    const row = this.database.db
      .prepare('SELECT decision FROM permission_rules WHERE tool_name = ? AND scope = ?')
      .get(toolName, scope) as { decision: 'allow' | 'deny' } | undefined;
    return row?.decision ?? null;
  }

  upsert(toolName: string, scope: string, decision: 'allow' | 'deny'): void {
    const now = nowMs();
    this.database.db
      .prepare(
        `INSERT INTO permission_rules (id, tool_name, scope, decision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(tool_name, scope) DO UPDATE SET
           decision = excluded.decision,
           updated_at = excluded.updated_at`
      )
      .run(createId(), toolName, scope, decision, now, now);
  }
}
