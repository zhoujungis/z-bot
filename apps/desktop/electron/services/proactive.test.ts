import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStores, ZBotDatabase, type Stores } from '@zbot/database';
import { DEFAULT_SETTINGS } from '@zbot/shared';
import type { AppLogger } from './logger';
import { ProactiveService } from './proactive';

describe('ProactiveService project inactivity', () => {
  let dir: string;
  let database: ZBotDatabase;
  let stores: Stores;
  let notifications: Array<{ title: string; body: string }>;
  let service: ProactiveService;
  let settings: typeof DEFAULT_SETTINGS;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zbot-proactive-'));
    database = new ZBotDatabase(join(dir, 'test.db'));
    stores = createStores(database);
    notifications = [];
    settings = {
      ...DEFAULT_SETTINGS,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        projectInactivity: true,
        projectInactivityDays: 7
      }
    };
    const logger = {
      info: () => undefined,
      warn: () => undefined
    } as unknown as AppLogger;
    service = new ProactiveService(
      stores.projects,
      stores.roots,
      stores.events,
      {
        show: (title: string, body: string) => {
          notifications.push({ title, body });
          return true;
        }
      },
      () => settings,
      logger
    );
  });

  afterEach(() => {
    service.stop();
    database.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('notifies once for a watched inactive project', async () => {
    const project = stores.projects.upsert({
      name: 'NanoBrowser',
      path: null,
      description: '',
      watchEnabled: true
    });
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    database.db
      .prepare('UPDATE projects SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(old, old, project.id);

    expect(await service.check()).toBe(1);
    expect(notifications[0]?.body).toContain('NanoBrowser');
    expect(notifications[0]?.body).toContain('10 天');
    expect(stores.events.list().some((event) => event.type === 'project.inactivity')).toBe(
      true
    );

    expect(await service.check()).toBe(0);
    expect(notifications).toHaveLength(1);
  });

  it('ignores projects that are not watched or recent activity', async () => {
    const project = stores.projects.upsert({
      name: 'Recent project',
      path: null,
      description: '',
      watchEnabled: true
    });
    expect(await service.check()).toBe(0);

    stores.projects.upsert({
      ...project,
      watchEnabled: false
    });
    database.db
      .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(Date.now() - 30 * 24 * 60 * 60 * 1000, project.id);
    expect(await service.check()).toBe(0);
    expect(notifications).toHaveLength(0);
  });
});
