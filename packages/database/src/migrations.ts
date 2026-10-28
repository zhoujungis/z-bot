export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial local assistant schema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT,
        description TEXT NOT NULL DEFAULT '',
        watch_enabled INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE authorized_roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        allow_write INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER
      ) STRICT;

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        tool_call_id TEXT,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
        file_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE model_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        purpose TEXT NOT NULL,
        model TEXT NOT NULL,
        base_url TEXT,
        encrypted_api_key TEXT,
        temperature REAL NOT NULL DEFAULT 0.7,
        max_tokens INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('user', 'project', 'event', 'task', 'global')),
        content TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        confidence REAL NOT NULL DEFAULT 0.5,
        source TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        archived_at INTEGER
      ) STRICT;

      CREATE TABLE memory_tags (
        memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (memory_id, tag)
      ) STRICT;

      CREATE VIRTUAL TABLE memories_fts USING fts5(
        content,
        content='memories',
        content_rowid='rowid',
        tokenize='trigram'
      );

      CREATE TRIGGER memories_fts_insert AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER memories_fts_delete AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER memories_fts_update AFTER UPDATE OF content ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        retries INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE task_steps (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        status TEXT NOT NULL,
        tool_name TEXT,
        started_at INTEGER,
        completed_at INTEGER
      ) STRICT;

      CREATE TABLE tool_calls (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        args_preview TEXT,
        result_preview TEXT,
        error TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      ) STRICT;

      CREATE TABLE reminders (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        trigger_at INTEGER NOT NULL,
        repeat_rule TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_triggered_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT,
        priority TEXT NOT NULL,
        due_at INTEGER,
        completed INTEGER NOT NULL DEFAULT 0,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE secrets (
        name TEXT PRIMARY KEY,
        encrypted_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE permission_rules (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        scope TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (tool_name, scope)
      ) STRICT;

      CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
      CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
      CREATE INDEX idx_attachments_message ON attachments(message_id);
      CREATE INDEX idx_memories_type ON memories(type, archived_at, updated_at DESC);
      CREATE INDEX idx_memories_project ON memories(project_id, archived_at);
      CREATE INDEX idx_memory_tags_tag ON memory_tags(tag);
      CREATE INDEX idx_events_created ON events(created_at DESC);
      CREATE INDEX idx_tasks_updated ON tasks(updated_at DESC);
      CREATE INDEX idx_tasks_status ON tasks(status);
      CREATE INDEX idx_task_steps_task ON task_steps(task_id, idx);
      CREATE INDEX idx_tool_calls_task ON tool_calls(task_id, started_at);
      CREATE INDEX idx_reminders_trigger ON reminders(enabled, trigger_at);
      CREATE INDEX idx_todos_status ON todos(completed, due_at);

      INSERT INTO users (id, display_name, created_at)
      VALUES ('local-user', 'You', unixepoch('subsec') * 1000);
    `
  }
];

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0;
