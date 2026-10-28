import { stat } from 'node:fs/promises';
import type { EventStore, ProjectStore, AuthorizedRootStore } from '@zbot/database';
import type { AppSettings, EventView, NavigationTarget, Project } from '@zbot/shared';
import { resolveAuthorizedPath } from '@zbot/tools';
import type { NotificationService } from './notifications';
import type { AppLogger } from './logger';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const START_DELAY_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProjectInactivityNotifier {
  show(title: string, body: string, target?: NavigationTarget, iconPath?: string): boolean;
}

export class ProactiveService {
  private timer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly projects: ProjectStore,
    private readonly roots: AuthorizedRootStore,
    private readonly events: EventStore,
    private readonly notifications: NotificationService | ProjectInactivityNotifier,
    private readonly getSettings: () => AppSettings,
    private readonly logger: AppLogger
  ) {}

  start(): void {
    this.stop();
    this.startTimer = setTimeout(() => {
      void this.check();
      this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
      this.timer.unref?.();
    }, START_DELAY_MS);
    this.startTimer.unref?.();
  }

  stop(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
    this.startTimer = null;
    this.timer = null;
  }

  async check(now = Date.now()): Promise<number> {
    const settings = this.getSettings();
    if (
      this.running ||
      !settings.notifications.enabled ||
      !settings.notifications.projectInactivity
    ) {
      return 0;
    }
    this.running = true;
    let notified = 0;
    try {
      const threshold = Math.max(1, settings.notifications.projectInactivityDays) * DAY_MS;
      const watched = this.projects.list().filter((project) => project.watchEnabled);
      if (watched.length === 0) return 0;
      const events = this.events.list(400);
      const roots = this.roots.list();

      for (const project of watched) {
        let latest = this.projects.latestActivity(project.id);
        const pathActivity = await this.pathActivity(project, roots);
        if (pathActivity !== null) latest = Math.max(latest, pathActivity);
        if (latest === 0 || now - latest < threshold) continue;

        const lastNotice = this.latestNotice(events, project.id);
        if (lastNotice && lastNotice.createdAt >= latest) continue;

        const idleDays = Math.floor((now - latest) / DAY_MS);
        const body = `${project.name} 已经 ${idleDays} 天没有更新。要继续处理吗？`;
        this.notifications.show('Z Bot 项目停滞提醒', body, { page: 'memory' });
        this.events.add('project.inactivity', `项目停滞：${project.name}`, {
          projectId: project.id,
          lastActivity: latest,
          idleDays
        });
        notified += 1;
      }
      if (notified > 0) {
        this.logger.info({ notified }, 'project inactivity notifications sent');
      }
      return notified;
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'project inactivity check failed'
      );
      return notified;
    } finally {
      this.running = false;
    }
  }

  private latestNotice(events: EventView[], projectId: string): EventView | null {
    for (const event of events) {
      if (event.type !== 'project.inactivity') continue;
      if (event.metadata?.projectId === projectId) return event;
    }
    return null;
  }

  private async pathActivity(
    project: Project,
    roots: ReturnType<AuthorizedRootStore['list']>
  ): Promise<number | null> {
    if (!project.path) return null;
    try {
      const resolved = await resolveAuthorizedPath(project.path, roots, {
        mustExist: true,
        expected: 'directory'
      });
      const stats = await stat(resolved.path);
      return stats.mtimeMs;
    } catch {
      return null;
    }
  }
}
