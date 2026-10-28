import { createId } from '@zbot/shared';
import type { Task, TaskStats, TaskStatus, TaskStep, TaskStepStatus } from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';

interface TaskRow {
  id: string;
  conversation_id: string | null;
  title: string;
  prompt: string;
  status: TaskStatus;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tool_calls: number;
  duration_ms: number;
  retries: number;
  error: string | null;
  created_at: number;
  updated_at: number;
}

interface StepRow {
  id: string;
  task_id: string;
  idx: number;
  title: string;
  detail: string | null;
  status: TaskStepStatus;
  tool_name: string | null;
  started_at: number | null;
  completed_at: number | null;
}

export interface CreateTaskInput {
  conversationId?: string | null;
  title: string;
  prompt: string;
  steps?: Array<{ title: string; detail?: string | null; toolName?: string | null }>;
}

function mapStep(row: StepRow): TaskStep {
  return {
    id: row.id,
    taskId: row.task_id,
    index: row.idx,
    title: row.title,
    detail: row.detail,
    status: row.status,
    toolName: row.tool_name,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function mapTask(row: TaskRow, steps: TaskStep[]): Task {
  const stats: TaskStats = {
    model: row.model,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    toolCalls: row.tool_calls,
    durationMs: row.duration_ms,
    retries: row.retries
  };
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    steps,
    stats,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TaskStore {
  constructor(private readonly database: ZBotDatabase) {}

  create(input: CreateTaskInput): Task {
    const now = nowMs();
    const id = createId();
    const create = this.database.db.transaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO tasks
            (id, conversation_id, title, prompt, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(id, input.conversationId ?? null, input.title, input.prompt, now, now);

      const insertStep = this.database.db.prepare(
        `INSERT INTO task_steps
          (id, task_id, idx, title, detail, status, tool_name)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      );
      input.steps?.forEach((step, index) => {
        insertStep.run(
          createId(),
          id,
          index,
          step.title,
          step.detail ?? null,
          step.toolName ?? null
        );
      });
    });
    create();
    return this.get(id)!;
  }

  get(id: string): Task | null {
    const row = this.database.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | TaskRow
      | undefined;
    if (!row) return null;
    const steps = this.database.db
      .prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY idx ASC')
      .all(id) as StepRow[];
    return mapTask(row, steps.map(mapStep));
  }

  list(limit = 100): Task[] {
    const rows = this.database.db
      .prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?')
      .all(Math.min(Math.max(limit, 1), 500)) as TaskRow[];
    return rows.map((row) => {
      const steps = this.database.db
        .prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY idx ASC')
        .all(row.id) as StepRow[];
      return mapTask(row, steps.map(mapStep));
    });
  }

  setStatus(id: string, status: TaskStatus, error?: string | null): void {
    this.database.db
      .prepare('UPDATE tasks SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(status, error ?? null, nowMs(), id);
  }

  updateDetails(
    id: string,
    patch: Partial<{
      title: string;
      status: TaskStatus;
      model: string | null;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      toolCalls: number;
      durationMs: number;
      retries: number;
      error: string | null;
    }>
  ): void {
    const columns: string[] = [];
    const values: unknown[] = [];
    const mapping: Record<string, string> = {
      title: 'title',
      status: 'status',
      model: 'model',
      promptTokens: 'prompt_tokens',
      completionTokens: 'completion_tokens',
      totalTokens: 'total_tokens',
      toolCalls: 'tool_calls',
      durationMs: 'duration_ms',
      retries: 'retries',
      error: 'error'
    };
    for (const [key, column] of Object.entries(mapping)) {
      if (key in patch) {
        columns.push(`${column} = ?`);
        values.push(patch[key as keyof typeof patch] ?? null);
      }
    }
    if (columns.length === 0) return;
    columns.push('updated_at = ?');
    values.push(nowMs(), id);
    this.database.db.prepare(`UPDATE tasks SET ${columns.join(', ')} WHERE id = ?`).run(...values);
  }

  addStep(
    taskId: string,
    title: string,
    detail?: string | null,
    toolName?: string | null
  ): TaskStep {
    const row = this.database.db
      .prepare('SELECT COALESCE(MAX(idx), -1) + 1 AS next FROM task_steps WHERE task_id = ?')
      .get(taskId) as { next: number };
    const step: TaskStep = {
      id: createId(),
      taskId,
      index: Number(row.next),
      title,
      detail: detail ?? null,
      status: 'pending',
      toolName: toolName ?? null,
      startedAt: null,
      completedAt: null
    };
    this.database.db
      .prepare(
        `INSERT INTO task_steps
          (id, task_id, idx, title, detail, status, tool_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        step.id,
        taskId,
        step.index,
        step.title,
        step.detail,
        step.status,
        step.toolName
      );
    this.touch(taskId);
    return step;
  }

  updateStep(
    stepId: string,
    patch: Partial<{
      title: string;
      detail: string | null;
      status: TaskStepStatus;
      toolName: string | null;
      startedAt: number | null;
      completedAt: number | null;
    }>
  ): void {
    const columns: string[] = [];
    const values: unknown[] = [];
    const mapping: Record<string, string> = {
      title: 'title',
      detail: 'detail',
      status: 'status',
      toolName: 'tool_name',
      startedAt: 'started_at',
      completedAt: 'completed_at'
    };
    for (const [key, column] of Object.entries(mapping)) {
      if (key in patch) {
        columns.push(`${column} = ?`);
        values.push(patch[key as keyof typeof patch] ?? null);
      }
    }
    if (columns.length === 0) return;
    values.push(stepId);
    this.database.db
      .prepare(`UPDATE task_steps SET ${columns.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  touch(id: string): void {
    this.database.db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(nowMs(), id);
  }

  markInterrupted(): number {
    const now = nowMs();
    const result = this.database.db
      .prepare(
        `UPDATE tasks
         SET status = 'paused', error = ?, updated_at = ?
         WHERE status IN ('running', 'waiting_permission', 'pending')`
      )
      .run('应用上次退出时中断', now);
    return Number(result.changes);
  }

  cancel(id: string): void {
    this.setStatus(id, 'cancelled');
  }
}
