import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resourcePath } from '../window-manager';
import type { AppLogger } from './logger';

const execFileAsync = promisify(execFile);
const MAX_OCR_CHARS = 20_000;

export class WindowsOcrService {
  constructor(
    private readonly tempDirectory: string,
    private readonly logger: AppLogger
  ) {}

  async recognize(imagePath: string): Promise<string | null> {
    if (process.platform !== 'win32') return null;
    const outputPath = join(this.tempDirectory, `ocr-${randomUUID()}.txt`);
    try {
      const script = resourcePath('ocr.ps1');
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          script,
          '-ImagePath',
          imagePath,
          '-OutputPath',
          outputPath
        ],
        {
          windowsHide: true,
          timeout: 30_000,
          maxBuffer: 1024 * 1024
        }
      );
      const text = (await readFile(outputPath, 'utf8')).trim();
      return text ? text.slice(0, MAX_OCR_CHARS) : null;
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'local OCR failed'
      );
      return null;
    } finally {
      await rm(outputPath, { force: true }).catch(() => undefined);
    }
  }
}
