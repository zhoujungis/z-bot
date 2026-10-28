import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppSettings, AuthorizedRoot } from '@zbot/shared';
import { DEFAULT_SETTINGS } from '@zbot/shared';
import type { ToolDependencies } from '../types';
import { listDirectoryTool, moveFilesTool, readFileTool, trashFileTool, writeFileTool } from './files';

describe('filesystem tools', () => {
  let dir: string;
  let rootPath: string;
  let roots: AuthorizedRoot[];
  let deps: ToolDependencies;
  let trashed: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zbot-files-'));
    rootPath = join(dir, 'root');
    mkdirSync(join(rootPath, 'docs'), { recursive: true });
    writeFileSync(join(rootPath, 'docs', 'a.txt'), 'alpha');
    writeFileSync(join(rootPath, 'docs', 'b.txt'), 'beta');
    roots = [
      {
        id: 'root',
        path: rootPath,
        label: 'Root',
        allowWrite: true,
        createdAt: Date.now()
      }
    ];
    trashed = [];
    deps = {
      getRoots: () => roots,
      getSettings: () => DEFAULT_SETTINGS as AppSettings,
      getWebSearchKey: () => null,
      system: {
        readClipboardText: () => '',
        captureScreen: async () => {
          throw new Error('not implemented in test');
        },
        saveAttachment: async () => {
          throw new Error('not implemented in test');
        },
        trashItem: async (path: string) => {
          trashed.push(path);
          rmSync(path);
        }
      }
    } as unknown as ToolDependencies;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists directory entries', async () => {
    const result = await listDirectoryTool.execute(
      { path: rootPath, depth: 2 },
      deps,
      { abortSignal: new AbortController().signal }
    );
    expect(result.ok).toBe(true);
    expect(result.content).toContain('a.txt');
    expect(result.untrusted).toBe(true);
  });

  it('reads text files', async () => {
    const result = await readFileTool.execute(
      { path: join(rootPath, 'docs', 'a.txt') },
      deps,
      { abortSignal: new AbortController().signal }
    );
    expect(result.content).toContain('alpha');
    expect(result.content).toContain('UNTRUSTED_DATA');
  });

  it('writes atomically and verifies content', async () => {
    const target = join(rootPath, 'docs', 'new.txt');
    const permission = await writeFileTool.getPermission(
      { path: target, content: 'hello', overwrite: false },
      deps
    );
    expect(permission.requiresConfirmation).toBe(true);
    expect(permission.operations[0]?.action).toBe('write');
    const result = await writeFileTool.execute(
      { path: target, content: 'hello', overwrite: false },
      deps,
      { abortSignal: new AbortController().signal }
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('hello');
  });

  it('refuses to overwrite without explicit permission flag', async () => {
    await expect(
      writeFileTool.execute(
        { path: join(rootPath, 'docs', 'a.txt'), content: 'changed', overwrite: false },
        deps,
        { abortSignal: new AbortController().signal }
      )
    ).rejects.toThrow('已存在');
  });

  it('plans and executes a batch move', async () => {
    const operations = [
      {
        source: join(rootPath, 'docs', 'a.txt'),
        destination: join(rootPath, 'docs', 'moved-a.txt')
      },
      {
        source: join(rootPath, 'docs', 'b.txt'),
        destination: join(rootPath, 'docs', 'moved-b.txt')
      }
    ];
    const permission = await moveFilesTool.getPermission({ operations }, deps);
    expect(permission.operations).toHaveLength(2);
    expect(permission.risk).toBe('high');

    const result = await moveFilesTool.execute(
      { operations, overwrite: false },
      deps,
      { abortSignal: new AbortController().signal }
    );
    expect(result.ok).toBe(true);
    expect(existsSync(operations[0]!.source)).toBe(false);
    expect(readFileSync(operations[0]!.destination, 'utf8')).toBe('alpha');
  });

  it('trashes only files and verifies removal', async () => {
    const file = join(rootPath, 'docs', 'a.txt');
    await trashFileTool.execute({ path: file }, deps, {
      abortSignal: new AbortController().signal
    });
    expect(trashed).toContain(file);
    expect(existsSync(file)).toBe(false);
  });
});
