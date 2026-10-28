export * from './types';
export * from './schemas';
export * from './ipc';
export * from './defaults';
export * from './repeat';

export function createId(): string {
  return globalThis.crypto.randomUUID();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
