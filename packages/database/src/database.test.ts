import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZBotDatabase, createStores, type Stores } from './index';

describe('ZBotDatabase', () => {
  let dir: string;
  let database: ZBotDatabase;
  let stores: Stores;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zbot-db-'));
    database = new ZBotDatabase(join(dir, 'test.db'), { backupDirectory: join(dir, 'backups') });
    stores = createStores(database);
  });

  afterEach(() => {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('migrates and stores settings', () => {
    const defaults = stores.settings.get();
    expect(defaults.general.language).toBe('zh-CN');
    const updated = stores.settings.update({
      ...defaults,
      appearance: { ...defaults.appearance, theme: 'dark' }
    });
    expect(updated.appearance.theme).toBe('dark');
    expect(stores.settings.get().appearance.theme).toBe('dark');
  });

  it('persists conversations and messages with attachments', () => {
    const conversation = stores.conversations.create({ title: 'Planning' });
    const message = stores.conversations.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: '记住要发布 Z Bot',
      attachments: [
        {
          name: 'shot.png',
          mimeType: 'image/png',
          size: 12,
          kind: 'image',
          filePath: 'C:\\tmp\\shot.png'
        }
      ]
    });
    const detail = stores.conversations.getDetail(conversation.id);
    expect(detail?.messages).toHaveLength(1);
    expect(detail?.messages[0]?.attachments[0]?.name).toBe('shot.png');
    expect(message.attachments[0]?.url).toContain('zbot-media://attachment/');
  });

  it('finds memories by Chinese substring and deletes them', () => {
    const memory = stores.memories.upsert({
      type: 'user',
      content: '用户喜欢简洁直接的界面',
      importance: 0.9,
      confidence: 0.95,
      tags: ['偏好', 'UI']
    });
    expect(stores.memories.search({ query: '简洁' })[0]?.id).toBe(memory.id);
    expect(stores.memories.search({ query: '界面' })[0]?.tags).toEqual(['ui', '偏好']);
    stores.memories.delete(memory.id);
    expect(stores.memories.search({ query: '简洁' })).toHaveLength(0);
  });

  it('tracks tasks and paused interrupted work', () => {
    const task = stores.tasks.create({
      title: 'Organize downloads',
      prompt: '整理 Downloads',
      steps: [{ title: '扫描目录' }, { title: '移动文件' }]
    });
    stores.tasks.setStatus(task.id, 'running');
    expect(stores.tasks.markInterrupted()).toBe(1);
    expect(stores.tasks.get(task.id)?.status).toBe('paused');
    expect(stores.tasks.get(task.id)?.steps).toHaveLength(2);
  });

  it('computes project last activity from conversations and memories', () => {
    const project = stores.projects.upsert({
      name: 'Project',
      path: null,
      description: '',
      watchEnabled: true
    });
    const old = Date.now() - 86_400_000;
    database.db
      .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(old, project.id);
    expect(stores.projects.latestActivity(project.id)).toBe(old);

    const memory = stores.memories.upsert({
      type: 'project',
      content: '项目笔记',
      projectId: project.id,
      importance: 0.5,
      confidence: 0.9
    });
    expect(stores.projects.latestActivity(project.id)).toBeGreaterThanOrEqual(
      memory.updatedAt
    );
    const conversation = stores.conversations.create({ projectId: project.id });
    expect(stores.projects.latestActivity(project.id)).toBeGreaterThanOrEqual(
      conversation.updatedAt
    );
  });

  it('manages reminders and todos', () => {
    const reminder = stores.reminders.upsert({
      title: '发布 Z Bot',
      triggerAt: Date.now() + 60_000,
      enabled: true
    });
    expect(stores.reminders.list()).toHaveLength(1);
    stores.reminders.markTriggered(reminder.id, null);
    expect(stores.reminders.get(reminder.id)?.enabled).toBe(false);

    const todo = stores.todos.upsert({ title: '检查发布状态', priority: 'high' });
    expect(stores.todos.toggle(todo.id).completed).toBe(true);
  });
});
