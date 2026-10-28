import { describe, expect, it } from 'vitest';
import { nextReminderTrigger } from './repeat';

describe('nextReminderTrigger', () => {
  it('returns null for one-time reminders', () => {
    expect(nextReminderTrigger(Date.now(), null)).toBeNull();
  });

  it('advances daily reminders into the future', () => {
    const now = new Date(2026, 0, 10, 12, 0, 0).getTime();
    const trigger = new Date(2026, 0, 10, 10, 0, 0).getTime();
    const next = nextReminderTrigger(trigger, { kind: 'daily', interval: 1, daysOfWeek: [] }, now);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(now);
    const date = new Date(next!);
    expect(date.getDate()).toBe(11);
    expect(date.getHours()).toBe(10);
  });

  it('finds the next weekly weekday', () => {
    const now = new Date(2026, 0, 5, 12, 0, 0).getTime();
    const trigger = new Date(2026, 0, 5, 9, 0, 0).getTime();
    const next = nextReminderTrigger(
      trigger,
      { kind: 'weekly', interval: 1, daysOfWeek: [1, 3] },
      now
    );
    expect(next).not.toBeNull();
    const date = new Date(next!);
    expect([1, 3]).toContain(date.getDay());
    expect(next!).toBeGreaterThan(now);
  });
});
