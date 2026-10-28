import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthorizedRoot } from '@zbot/shared';
import { resolveAuthorizedPath } from './path-guard';
import { assertPublicHttpUrl, fetchPublicUrl } from './web-security';

describe('resolveAuthorizedPath', () => {
  let dir: string;
  let rootPath: string;
  let outsidePath: string;
  let roots: AuthorizedRoot[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zbot-path-'));
    rootPath = join(dir, 'authorized');
    outsidePath = join(dir, 'outside');
    mkdirSync(rootPath);
    mkdirSync(outsidePath);
    writeFileSync(join(rootPath, 'note.txt'), 'hello');
    writeFileSync(join(outsidePath, 'secret.txt'), 'secret');
    roots = [
      {
        id: 'root-1',
        path: rootPath,
        label: 'Test',
        allowWrite: true,
        createdAt: Date.now()
      }
    ];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves files inside an authorized root', async () => {
    const result = await resolveAuthorizedPath(join(rootPath, 'note.txt'), roots, {
      mustExist: true,
      expected: 'file'
    });
    expect(result.path).toContain('note.txt');
    expect(result.root.id).toBe('root-1');
  });

  it('rejects files outside the authorized root', async () => {
    await expect(
      resolveAuthorizedPath(join(outsidePath, 'secret.txt'), roots, { mustExist: true })
    ).rejects.toThrow('不在已授权目录内');
  });

  it('rejects traversal escapes', async () => {
    await expect(
      resolveAuthorizedPath(join(rootPath, '..', 'outside', 'secret.txt'), roots, {
        mustExist: true
      })
    ).rejects.toThrow('不在已授权目录内');
  });

  it('rejects writes when the root is read-only', async () => {
    await expect(
      resolveAuthorizedPath(join(rootPath, 'new.txt'), [{ ...roots[0]!, allowWrite: false }], {
        write: true
      })
    ).rejects.toThrow('可写授权目录');
  });

  it('rejects a junction that points outside the root', async () => {
    const junction = join(rootPath, 'escape');
    try {
      symlinkSync(outsidePath, junction, 'junction');
    } catch {
      return;
    }
    await expect(
      resolveAuthorizedPath(join(junction, 'secret.txt'), roots, { mustExist: true })
    ).rejects.toThrow('不在已授权目录内');
  });

  it('rejects device paths and relative paths', async () => {
    await expect(resolveAuthorizedPath('relative.txt', roots)).rejects.toThrow('绝对路径');
    await expect(resolveAuthorizedPath('\\\\?\\C:\\secret', roots)).rejects.toThrow('设备路径');
  });
});

describe('web security', () => {
  it('rejects localhost and private IPs', async () => {
    await expect(assertPublicHttpUrl('http://localhost:3000')).rejects.toThrow('本机');
    await expect(assertPublicHttpUrl('http://127.0.0.1')).rejects.toThrow('私有');
    await expect(assertPublicHttpUrl('http://[::1]')).rejects.toThrow('私有');
    await expect(assertPublicHttpUrl('file:///C:/secret.txt')).rejects.toThrow('http');
  });

  it('blocks local network fetches before a request is made', async () => {
    await expect(fetchPublicUrl('http://127.0.0.1:9/')).rejects.toThrow('私有');
  });
});
