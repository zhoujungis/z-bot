import type { EventStore, ReminderStore } from '@zbot/database';
import type { Reminder } from '@zbot/shared';
import { nextReminderTrigger } from '@zbot/shared';
import type { AppSettings } from '@zbot/shared';
import type { NotificationService } from './notifications';
import type { AppLogger } from './logger';

const MAX_TIMEOUT = 2_147_000_000;

export class SchedulerService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly reminders: ReminderStore,
    private readonly events: EventStore,
    private readonly notifications: NotificationService,
    private readonly getSettings: () => AppSettings,
    private readonly logger: AppLogger
  ) {}

  start(): void {
    this.refresh();
  }

  refresh(): void {
    this.clear();
    for (const reminder of this.reminders.list()) {
      if (!reminder.enabled) continue;
      this.schedule(reminder);
    }
  }

  stop(): void {
    this.clear();
  }

  private clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(reminder: Reminder): void {
    const delay = reminder.triggerAt - Date.now();
    if (delay > MAX_TIMEOUT) {
      const timer = setTimeout(() => {
        this.timers.delete(reminder.id);
        this.schedule(this.reminders.get(reminder.id) ?? reminder);
      }, MAX_TIMEOUT);
      timer.unref?.();
      this.timers.set(reminder.id, timer);
      return;
    }

    const effectiveDelay = Math.max(0, delay);
    const timer = setTimeout(() => {
      this.timers.delete(reminder.id);
      this.fire(reminder.id);
    }, effectiveDelay);
    timer.unref?.();
    this.timers.set(reminder.id, timer);
  }

  private fire(id: string): void {
    const reminder = this.reminders.get(id);
    if (!reminder || !reminder.enabled) return;
    const settings = this.getSettings();
    const canNotify = settings.notifications.enabled && settings.notifications.reminders;

    if (canNotify) {
      this.notifications.show(
        'Z Bot 提醒',
        reminder.content ? `${reminder.title}\n${reminder.content}` : reminder.title,
        { page: 'home' }
      );
    }
    this.events.add('reminder.triggered', `提醒触发：${reminder.title}`, {
      reminderId: reminder.id,
      notified: canNotify
    });

    const next = nextReminderTrigger(reminder.triggerAt, reminder.repeat, Date.now());
    this.reminders.markTriggered(reminder.id, next);
    this.logger.info(
      { reminderId: reminder.id, repeated: Boolean(next), notified: canNotify },
      'reminder fired'
    );

    if (next !== null) {
      const updated = this.reminders.get(reminder.id);
      if (updated?.enabled) this.schedule(updated);
    }
  }
}
