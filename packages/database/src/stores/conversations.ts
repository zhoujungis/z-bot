import { createId } from '@zbot/shared';
import type { Attachment, Conversation, ConversationDetail, Message, MessageRole } from '@zbot/shared';
import type { ZBotDatabase } from '../database';
import { nowMs } from '../database';

interface ConversationRow {
  id: string;
  title: string;
  project_id: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_call_id: string | null;
  created_at: number;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'file';
  file_path: string;
  created_at: number;
}

export interface StoredAttachment {
  id?: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
  filePath: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCallId?: string | null;
  attachments?: StoredAttachment[];
}

export interface CreateConversationInput {
  projectId?: string | null;
  title?: string;
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  };
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    kind: row.kind,
    url: `zbot-media://attachment/${row.id}`
  };
}

export class ConversationStore {
  constructor(private readonly database: ZBotDatabase) {}

  list(limit = 100): Conversation[] {
    const rows = this.database.db
      .prepare(
        `SELECT * FROM conversations
         WHERE archived_at IS NULL
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(Math.min(Math.max(limit, 1), 500)) as ConversationRow[];
    return rows.map(mapConversation);
  }

  get(id: string): Conversation | null {
    const row = this.database.db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined;
    return row ? mapConversation(row) : null;
  }

  getDetail(id: string): ConversationDetail | null {
    const conversation = this.get(id);
    if (!conversation) return null;
    return { conversation, messages: this.getMessages(id) };
  }

  getMessages(conversationId: string): Message[] {
    const rows = this.database.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(conversationId) as MessageRow[];
    if (rows.length === 0) return [];

    const placeholders = rows.map(() => '?').join(', ');
    const attachmentRows = this.database.db
      .prepare(
        `SELECT a.* FROM attachments a
         JOIN messages m ON m.id = a.message_id
         WHERE m.conversation_id = ?
         ORDER BY a.created_at ASC`
      )
      .all(conversationId) as AttachmentRow[];
    const byMessage = new Map<string, Attachment[]>();
    for (const row of attachmentRows) {
      const list = byMessage.get(row.message_id) ?? [];
      list.push(mapAttachment(row));
      byMessage.set(row.message_id, list);
    }
    void placeholders;

    return rows.map((row) => this.mapMessage(row, byMessage.get(row.id) ?? []));
  }

  create(input: CreateConversationInput = {}): Conversation {
    const now = nowMs();
    const conversation: Conversation = {
      id: createId(),
      title: input.title?.trim() || '新对话',
      projectId: input.projectId ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    this.database.db
      .prepare(
        `INSERT INTO conversations (id, title, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        conversation.id,
        conversation.title,
        conversation.projectId,
        conversation.createdAt,
        conversation.updatedAt
      );
    return conversation;
  }

  addMessage(input: AddMessageInput): Message {
    const now = nowMs();
    const id = createId();
    const attachments: StoredAttachment[] = input.attachments ?? [];

    const insert = this.database.db.transaction(() => {
      this.database.db
        .prepare(
          `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.conversationId, input.role, input.content, input.toolCallId ?? null, now);

      const statement = this.database.db.prepare(
        `INSERT INTO attachments
          (id, message_id, name, mime_type, size, kind, file_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const attachment of attachments) {
        statement.run(
          attachment.id ?? createId(),
          id,
          attachment.name,
          attachment.mimeType,
          attachment.size,
          attachment.kind,
          attachment.filePath,
          now
        );
      }

      this.database.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(now, input.conversationId);
    });
    insert();

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      createdAt: now,
      attachments: this.getAttachments(id),
      toolCallId: input.toolCallId ?? null
    };
  }

  updateAssistantContent(messageId: string, content: string): void {
    this.database.db
      .prepare('UPDATE messages SET content = ? WHERE id = ? AND role = ?')
      .run(content, messageId, 'assistant');
    const message = this.database.db
      .prepare('SELECT conversation_id FROM messages WHERE id = ?')
      .get(messageId) as { conversation_id: string } | undefined;
    if (message) {
      this.database.db
        .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(nowMs(), message.conversation_id);
    }
  }

  rename(id: string, title: string): void {
    const clean = title.trim().slice(0, 200);
    if (!clean) return;
    this.database.db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(clean, nowMs(), id);
  }

  maybeSetTitleFromMessage(id: string, content: string): void {
    const conversation = this.get(id);
    if (!conversation || conversation.title !== '新对话') return;
    const compact = content.replace(/\s+/g, ' ').trim();
    if (!compact) return;
    this.rename(id, compact.slice(0, 60));
  }

  delete(id: string): void {
    this.database.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  getMessage(id: string): Message | null {
    const row = this.database.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | MessageRow
      | undefined;
    if (!row) return null;
    return this.mapMessage(row, this.getAttachments(id));
  }

  messageAttachments(id: string): Array<Attachment & { filePath: string }> {
    const rows = this.database.db
      .prepare('SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at ASC')
      .all(id) as AttachmentRow[];
    return rows.map((row) => ({
      ...mapAttachment(row),
      filePath: row.file_path
    }));
  }

  findAttachment(id: string): (Attachment & { filePath: string }) | null {
    const row = this.database.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined;
    return row ? { ...mapAttachment(row), filePath: row.file_path } : null;
  }

  private mapMessage(row: MessageRow, attachments: Attachment[]): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      attachments,
      toolCallId: row.tool_call_id
    };
  }

  private getAttachments(messageId: string): Attachment[] {
    const rows = this.database.db
      .prepare('SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at ASC')
      .all(messageId) as AttachmentRow[];
    return rows.map(mapAttachment);
  }
}
