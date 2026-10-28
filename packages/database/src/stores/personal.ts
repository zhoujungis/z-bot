import { createId } from '@zbot/shared';
import type {
  AuthorizedRoot,
  AuthorizedRootInput,
  Project,
  ProjectInput,
  Reminder,
  ReminderInput,
  RepeatRule,
  Todo,
  TodoInput
} from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';
import { asBoolean, parseJson } from '../helpers';

interface ProjectRow {
  id: string;
  name: string;
  path: string | null;
  description: string;
  watch_enabled: number;
  created_at: number;
  updated_at: number;
}

interface RootRow {
  id: string;
  path: string;
  label: string;
  allow_write: number;
  created_at: number;
}

interface TodoRow {
  id: string;
  title: string;
  notes: string | null;
  priority: 'low' | 'medium' | 'high';
  due_at: number | null;
  completed: number;
  project_id: string | null;
  created_at: number;
  updated_at: number;
}

interface ReminderRow {
  id: string;
  title: string;
  content: string | null;
  trigger_at: number;
  repeat_rule: string | null;
  enabled: number;
  last_triggered_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description,
    watchEnabled: asBoolean(row.watch_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRoot(row: RootRow): AuthorizedRoot {
  return {
    id: row.id,
    path: row.path,
    label: row.label,
    allowWrite: asBoolean(row.allow_write),
    createdAt: row.created_at
  };
}

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    dueAt: row.due_at,
    completed: asBoolean(row.completed),
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    triggerAt: row.trigger_at,
    repeat: parseJson<RepeatRule | null>(row.repeat_rule, null),
    enabled: asBoolean(row.enabled),
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ProjectStore {
  constructor(private readonly database: ZBotDatabase) {}

  list(): Project[] {
    const rows = this.database.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all() as ProjectRow[];
    return rows.map(mapProject);
  }

  get(id: string): Project | null {
    const row = this.database.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined;
    return row ? mapProject(row) : null;
  }

  upsert(input: ProjectInput): Project {
    const now = nowMs();
    const id = input.id ?? createId();
    const existing = input.id ? this.get(input.id) : null;
    if (existing) {
      this.database.db
        .prepare(
          `UPDATE projects
           SET name = ?, path = ?, description = ?, watch_enabled = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.name,
          input.path ?? null,
          input.description,
          input.watchEnabled ? 1 : 0,
          now,
          id
        );
    } else {
      this.database.db
        .prepare(
          `INSERT INTO projects
            (id, name, path, description, watch_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.name,
          input.path ?? null,
          input.description,
          input.watchEnabled ? 1 : 0,
          now,
          now
        );
    }
    return this.get(id)!;
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  latestActivity(projectId: string): number {
    const project = this.get(projectId);
    if (!project) return 0;
    const row = this.database.db
      .prepare(
        `SELECT MAX(ts) AS ts FROM (
           SELECT updated_at AS ts FROM conversations
             WHERE project_id = ? AND archived_at IS NULL
           UNION ALL
           SELECT updated_at AS ts FROM memories
             WHERE project_id = ? AND archived_at IS NULL
           UNION ALL
           SELECT t.updated_at AS ts FROM tasks t
             JOIN conversations c ON c.id = t.conversation_id
             WHERE c.project_id = ? AND c.archived_at IS NULL
         )`
      )
      .get(projectId, projectId, projectId) as { ts: number | null } | undefined;
    return Math.max(project.updatedAt, Number(row?.ts ?? 0));
  }
}

export class AuthorizedRootStore {
  constructor(private readonly database: ZBotDatabase) {}

  list(): AuthorizedRoot[] {
    const rows = this.database.db
      .prepare('SELECT * FROM authorized_roots ORDER BY created_at ASC')
      .all() as RootRow[];
    return rows.map(mapRoot);
  }

  add(input: AuthorizedRootInput): AuthorizedRoot {
    const existing = this.database.db
      .prepare('SELECT * FROM authorized_roots WHERE path = ?')
      .get(input.path) as RootRow | undefined;
    if (existing) {
      this.database.db
        .prepare('UPDATE authorized_roots SET label = ?, allow_write = ? WHERE id = ?')
        .run(input.label, input.allowWrite ? 1 : 0, existing.id);
      return this.list().find((root) => root.id === existing.id)!;
    }

    const root: AuthorizedRoot = {
      id: createId(),
      path: input.path,
      label: input.label,
      allowWrite: input.allowWrite,
      createdAt: nowMs()
    };
    this.database.db
      .prepare(
        `INSERT INTO authorized_roots (id, path, label, allow_write, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(root.id, root.path, root.label, root.allowWrite ? 1 : 0, root.createdAt);
    return root;
  }

  remove(id: string): void {
    this.database.db.prepare('DELETE FROM authorized_roots WHERE id = ?').run(id);
  }
}

export class TodoStore {
  constructor(private readonly database: ZBotDatabase) {}

  list(): Todo[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM todos
         ORDER BY completed ASC,
           CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
           due_at IS NULL ASC, due_at ASC, created_at DESC`
      )
      .all() as TodoRow[];
    return rows.map(mapTodo);
  }

  get(id: string): Todo | null {
    const row = this.database.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as
      | TodoRow
      | undefined;
    return row ? mapTodo(row) : null;
  }

  upsert(input: TodoInput): Todo {
    const now = nowMs();
    const id = input.id ?? createId();
    const existing = input.id ? this.get(input.id) : null;
    if (existing) {
      this.database.db
        .prepare(
          `UPDATE todos
           SET title = ?, notes = ?, priority = ?, due_at = ?, project_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.title,
          input.notes ?? null,
          input.priority,
          input.dueAt ?? null,
          input.projectId ?? null,
          now,
          id
        );
    } else {
      this.database.db
        .prepare(
          `INSERT INTO todos
            (id, title, notes, priority, due_at, completed, project_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
        )
        .run(
          id,
          input.title,
          input.notes ?? null,
          input.priority,
          input.dueAt ?? null,
          input.projectId ?? null,
          now,
          now
        );
    }
    return this.get(id)!;
  }

  toggle(id: string): Todo {
    const existing = this.get(id);
    if (!existing) throw new Error('Todo not found');
    this.database.db
      .prepare('UPDATE todos SET completed = ?, updated_at = ? WHERE id = ?')
      .run(existing.completed ? 0 : 1, nowMs(), id);
    return this.get(id)!;
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  }
}

export class ReminderStore {
  constructor(private readonly database: ZBotDatabase) {}

  list(): Reminder[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM reminders
         ORDER BY enabled DESC, trigger_at ASC, created_at DESC`
      )
      .all() as ReminderRow[];
    return rows.map(mapReminder);
  }

  get(id: string): Reminder | null {
    const row = this.database.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as
      | ReminderRow
      | undefined;
    return row ? mapReminder(row) : null;
  }

  due(now = nowMs()): Reminder[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM reminders
         WHERE enabled = 1 AND trigger_at <= ?
         ORDER BY trigger_at ASC`
      )
      .all(now) as ReminderRow[];
    return rows.map(mapReminder);
  }

  upsert(input: ReminderInput): Reminder {
    const now = nowMs();
    const id = input.id ?? createId();
    const existing = input.id ? this.get(input.id) : null;
    const repeat = input.repeat ? JSON.stringify(input.repeat) : null;
    if (existing) {
      this.database.db
        .prepare(
          `UPDATE reminders
           SET title = ?, content = ?, trigger_at = ?, repeat_rule = ?, enabled = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.title,
          input.content ?? null,
          input.triggerAt,
          repeat,
          input.enabled ? 1 : 0,
          now,
          id
        );
    } else {
      this.database.db
        .prepare(
          `INSERT INTO reminders
            (id, title, content, trigger_at, repeat_rule, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.title,
          input.content ?? null,
          input.triggerAt,
          repeat,
          input.enabled ? 1 : 0,
          now,
          now
        );
    }
    return this.get(id)!;
  }

  toggle(id: string): Reminder {
    const existing = this.get(id);
    if (!existing) throw new Error('Reminder not found');
    this.database.db
      .prepare('UPDATE reminders SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(existing.enabled ? 0 : 1, nowMs(), id);
    return this.get(id)!;
  }

  markTriggered(id: string, nextTriggerAt: number | null): void {
    const now = nowMs();
    if (nextTriggerAt === null) {
      this.database.db
        .prepare(
          `UPDATE reminders
           SET enabled = 0, last_triggered_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(now, now, id);
    } else {
      this.database.db
        .prepare(
          `UPDATE reminders
           SET trigger_at = ?, last_triggered_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(nextTriggerAt, now, now, id);
    }
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  }
}
