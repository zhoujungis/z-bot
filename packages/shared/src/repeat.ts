import type { RepeatRule } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function atLocalTime(base: Date, reference: Date): Date {
  const next = new Date(base);
  next.setHours(
    reference.getHours(),
    reference.getMinutes(),
    reference.getSeconds(),
    reference.getMilliseconds()
  );
  return next;
}

export function nextReminderTrigger(
  triggerAt: number,
  repeat: RepeatRule | null,
  now: number = Date.now()
): number | null {
  if (!repeat) return null;
  const reference = new Date(triggerAt);
  if (!Number.isFinite(triggerAt) || repeat.interval < 1) return null;

  if (repeat.kind === 'daily') {
    const candidate = new Date(triggerAt);
    for (let index = 0; index < 400; index += 1) {
      candidate.setDate(candidate.getDate() + repeat.interval);
      if (candidate.getTime() > now) return candidate.getTime();
    }
    return null;
  }

  const days = [...new Set(repeat.daysOfWeek)].filter((day) => day >= 0 && day <= 6).sort();
  if (days.length === 0) {
    const candidate = atLocalTime(new Date(triggerAt + repeat.interval * 7 * DAY_MS), reference);
    return candidate.getTime() > now ? candidate.getTime() : null;
  }

  const anchor = new Date(triggerAt);
  anchor.setHours(0, 0, 0, 0);
  anchor.setDate(anchor.getDate() - anchor.getDay());

  const candidate = new Date(anchor);
  for (let offset = 0; offset < 366 * repeat.interval; offset += 1) {
    candidate.setTime(anchor.getTime());
    candidate.setDate(anchor.getDate() + offset);
    if (!days.includes(candidate.getDay())) continue;
    const weekIndex = Math.floor(offset / 7);
    if (weekIndex % repeat.interval !== 0) continue;
    const withTime = atLocalTime(candidate, reference);
    if (withTime.getTime() > triggerAt && withTime.getTime() > now) {
      return withTime.getTime();
    }
  }
  return null;
}
