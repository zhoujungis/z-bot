import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';

export type AppLogger = Logger;

export function cleanupOldLogs(directory: string, retentionDays: number): void {
  try {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.log')) continue;
      const fullPath = join(directory, name);
      try {
        if (statSync(fullPath).mtimeMs < cutoff) unlinkSync(fullPath);
      } catch {
        // A log being written by another process can be skipped.
      }
    }
  } catch {
    // Log cleanup is best-effort and must never prevent startup.
  }
}

export function createLogger(dataDir: string, retentionDays = 30): AppLogger {
  const logDir = join(dataDir, 'logs');
  mkdirSync(logDir, { recursive: true });
  cleanupOldLogs(logDir, retentionDays);
  const date = new Date().toISOString().slice(0, 10);
  const destination = pino.destination({
    dest: join(logDir, `zbot-${date}.log`),
    sync: false,
    mkdir: true
  });
  return pino(
    {
      level: 'info',
      base: { app: 'z-bot' },
      redact: {
        paths: [
          'apiKey',
          '*.apiKey',
          'api_key',
          '*.api_key',
          'authorization',
          '*.authorization',
          'token',
          '*.token',
          'password',
          '*.password',
          'cookie',
          '*.cookie',
          'encryptedApiKey',
          '*.encryptedApiKey'
        ],
        censor: '[REDACTED]'
      }
    },
    destination
  );
}

export function redactErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?key|token|password|cookie)\s*[=:]\s*\S+/gi, '$1=[REDACTED]');
}
