import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import fg from 'fast-glob';
import { z } from 'zod';
import type { FileOperationPreview } from '@zbot/shared';
import { resolveAuthorizedPath, rootsInScope, type AuthorizedPath } from '../path-guard';
import {
  permissionSpec,
  type BotTool
} from '../types';

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_WRITE_BYTES = 5 * 1024 * 1024;
const MAX_SEARCH_FILES = 1000;

const pathSchema = z.string().trim().min(1).max(4096);

function normalizeForCompare(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertSourceFile(path: string): Promise<void> {
  const stats = await fs.stat(path);
  if (!stats.isFile()) throw new Error('源路径不是文件');
}

async function ensureParentDirectory(path: string): Promise<void> {
  const parent = dirname(path);
  const stats = await fs.stat(parent);
  if (!stats.isDirectory()) throw new Error('目标父路径不是目录');
}

async function hashFile(path: string): Promise<string> {
  const buffer = await fs.readFile(path);
  return createHash('sha256').update(buffer).digest('hex');
}

async function readTextLimited(path: string, maxBytes: number): Promise<{
  text: string;
  size: number;
  truncated: boolean;
  binary: boolean;
}> {
  const handle = await fs.open(path, 'r');
  try {
    const stats = await handle.stat();
    if (stats.isDirectory()) throw new Error('目标是目录，不是文件');
    const length = Math.min(stats.size, maxBytes + 1);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const slice = buffer.subarray(0, bytesRead);
    const binary = slice.subarray(0, 8192).includes(0);
    return {
      text: binary ? '' : slice.subarray(0, maxBytes).toString('utf8'),
      size: stats.size,
      truncated: bytesRead > maxBytes || stats.size > maxBytes,
      binary
    };
  } finally {
    await handle.close();
  }
}

async function atomicWrite(
  target: string,
  content: Buffer,
  overwrite: boolean
): Promise<void> {
  if (!overwrite && (await fileExists(target))) {
    throw new Error('目标文件已存在；如需覆盖请明确设置 overwrite=true');
  }
  await ensureParentDirectory(target);
  const temporary = join(dirname(target), `.${basename(target)}.zbot-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { flag: 'wx' });
    if (await fileExists(target)) {
      await fs.rm(target, { force: false });
    }
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function moveOne(
  source: AuthorizedPath,
  destination: AuthorizedPath,
  overwrite: boolean
): Promise<string[]> {
  if (normalizeForCompare(source.path) === normalizeForCompare(destination.path)) {
    throw new Error('源路径和目标路径相同');
  }
  await assertSourceFile(source.path);
  if (!overwrite && (await fileExists(destination.path))) {
    throw new Error(`目标已存在：${destination.path}`);
  }
  await ensureParentDirectory(destination.path);
  const sourceHash = await hashFile(source.path);
  try {
    await fs.rename(source.path, destination.path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV') throw error;
    await fs.copyFile(source.path, destination.path, overwrite ? 0 : fsConstants.COPYFILE_EXCL);
    const destinationHash = await hashFile(destination.path);
    if (destinationHash !== sourceHash) {
      await fs.rm(destination.path, { force: true });
      throw new Error('跨卷移动校验失败，源文件已保留');
    }
    await fs.unlink(source.path);
  }

  const verification: string[] = [];
  if (await fileExists(source.path)) throw new Error('移动后源文件仍然存在');
  verification.push('源文件已移除');
  const stats = await fs.stat(destination.path);
  if (!stats.isFile()) throw new Error('移动后目标文件不可用');
  verification.push('目标文件存在且可读');
  const destinationHash = await hashFile(destination.path);
  if (destinationHash !== sourceHash) throw new Error('移动后文件哈希不一致');
  verification.push('文件哈希一致');
  return verification;
}

export const listDirectoryTool: BotTool = {
  name: 'list_directory',
  label: '查看目录',
  description:
    'List files and folders inside an authorized directory. Use absolute paths only. Does not follow symbolic links.',
  inputSchema: z.object({
    path: pathSchema,
    depth: z.number().int().min(1).max(3).optional().default(1),
    maxEntries: z.number().int().min(1).max(500).optional().default(200)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      mustExist: true,
      expected: 'directory'
    });
    return permissionSpec({
      level: 'read',
      risk: 'low',
      requiresConfirmation: false,
      scope: resolved.root.path,
      title: '查看目录',
      description: `读取目录 ${resolved.path}`
    });
  },
  async execute(input, deps, context) {
    const args = this.inputSchema.parse(input) as {
      path: string;
      depth: number;
      maxEntries: number;
    };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      mustExist: true,
      expected: 'directory'
    });
    const entries: Array<{
      path: string;
      name: string;
      type: string;
      size: number;
      modifiedAt: number;
    }> = [];

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (context.abortSignal?.aborted) throw new Error('操作已取消');
      if (entries.length >= args.maxEntries) return;
      const dirents = await fs.readdir(directory, { withFileTypes: true });
      dirents.sort((a, b) => a.name.localeCompare(b.name));
      for (const dirent of dirents) {
        if (entries.length >= args.maxEntries) return;
        const fullPath = join(directory, dirent.name);
        const stats = await fs.lstat(fullPath).catch(() => null);
        if (!stats) continue;
        const size = stats.size;
        const modifiedAt = stats.mtimeMs;
        const type = dirent.isDirectory()
          ? 'directory'
          : dirent.isSymbolicLink()
            ? 'symlink'
            : dirent.isFile()
              ? 'file'
              : 'other';
        entries.push({
          path: relative(resolved.path, fullPath).split(sep).join('/'),
          name: dirent.name,
          type,
          size,
          modifiedAt
        });
        if (dirent.isDirectory() && !dirent.isSymbolicLink() && depth < args.depth) {
          await walk(fullPath, depth + 1);
        }
      }
    };

    await walk(resolved.path, 1);
    const truncated = entries.length >= args.maxEntries;
    const content = JSON.stringify({ path: resolved.path, entries, truncated }, null, 2);
    return {
      ok: true,
      summary: `已列出 ${entries.length} 个条目${truncated ? '（已截断）' : ''}`,
      content,
      data: { path: resolved.path, entries, truncated },
      untrusted: true
    };
  }
};

export const readFileTool: BotTool = {
  name: 'read_file',
  label: '读取文件',
  description:
    'Read a UTF-8 text file from an authorized directory. Absolute path required. Binary files are rejected and large files truncated.',
  inputSchema: z.object({
    path: pathSchema,
    maxBytes: z.number().int().min(1).max(MAX_READ_BYTES).optional().default(MAX_READ_BYTES)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      mustExist: true,
      expected: 'file'
    });
    return permissionSpec({
      level: 'read',
      risk: 'low',
      requiresConfirmation: false,
      scope: resolved.root.path,
      title: '读取文件',
      description: `读取 ${resolved.path}`
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string; maxBytes: number };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      mustExist: true,
      expected: 'file'
    });
    const file = await readTextLimited(resolved.path, args.maxBytes);
    if (file.binary) {
      throw new Error('该文件看起来是二进制文件，v0.1 只能读取文本文件');
    }
    const header = [
      `Path: ${resolved.path}`,
      `Size: ${file.size} bytes`,
      file.truncated ? 'Truncated: yes' : 'Truncated: no',
      'Trust: UNTRUSTED_DATA',
      '',
      ''
    ].join('\n');
    return {
      ok: true,
      summary: `已读取 ${basename(resolved.path)}（${file.size} bytes）`,
      content: `${header}${file.text}`,
      data: { path: resolved.path, size: file.size, truncated: file.truncated },
      untrusted: true
    };
  }
};

export const searchFilesTool: BotTool = {
  name: 'search_files',
  label: '搜索文件',
  description:
    'Search file names or text content inside an authorized directory. Supports glob patterns and absolute directory roots.',
  inputSchema: z.object({
    path: pathSchema,
    pattern: z.string().trim().min(1).max(300).optional().default('**/*'),
    contentQuery: z.string().max(500).optional(),
    maxResults: z.number().int().min(1).max(200).optional().default(50)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      mustExist: true,
      expected: 'directory'
    });
    return permissionSpec({
      level: 'read',
      risk: 'low',
      requiresConfirmation: false,
      scope: resolved.root.path,
      title: '搜索文件',
      description: `搜索 ${resolved.path} 内的文件`
    });
  },
  async execute(input, deps, context) {
    const args = this.inputSchema.parse(input) as {
      path: string;
      pattern: string;
      contentQuery?: string;
      maxResults: number;
    };
    if (isAbsolute(args.pattern) || args.pattern.split(/[\\/]/).includes('..')) {
      throw new Error('搜索模式必须是目录内的相对 glob');
    }
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      mustExist: true,
      expected: 'directory'
    });
    const matches = await fg(args.pattern, {
      cwd: resolved.path,
      absolute: true,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      ignore: ['**/node_modules/**', '**/.git/**', '**/out/**', '**/dist/**'],
      suppressErrors: true
    });
    const limited = matches
      .sort((a, b) => a.localeCompare(b))
      .slice(0, Math.min(matches.length, MAX_SEARCH_FILES));

    const results: Array<{
      path: string;
      size: number;
      matchedLines?: string[];
    }> = [];
    const query = args.contentQuery?.toLowerCase();

    for (const candidate of limited) {
      if (context.abortSignal?.aborted) throw new Error('操作已取消');
      if (results.length >= args.maxResults) break;
      let authorized: AuthorizedPath;
      try {
        authorized = await resolveAuthorizedPath(candidate, deps.getRoots(), {
          mustExist: true,
          expected: 'file'
        });
      } catch {
        continue;
      }
      const stats = await fs.stat(authorized.path);
      if (!query) {
        results.push({ path: relative(resolved.root.path, authorized.path), size: stats.size });
        continue;
      }
      if (stats.size > 1024 * 1024) continue;
      const file = await readTextLimited(authorized.path, 1024 * 1024);
      if (file.binary) continue;
      const matchedLines = file.text
        .split(/\r?\n/)
        .filter((line) => line.toLowerCase().includes(query))
        .slice(0, 3)
        .map((line) => line.slice(0, 300));
      if (matchedLines.length > 0) {
        results.push({
          path: relative(resolved.root.path, authorized.path),
          size: stats.size,
          matchedLines
        });
      }
    }

    return {
      ok: true,
      summary: `找到 ${results.length} 个匹配项`,
      content: JSON.stringify({ root: resolved.path, pattern: args.pattern, results }, null, 2),
      data: { root: resolved.path, results },
      untrusted: true
    };
  }
};

export const createDirectoryTool: BotTool = {
  name: 'create_directory',
  label: '创建目录',
  description: 'Create a directory inside an authorized writable root. Absolute path required.',
  inputSchema: z.object({ path: pathSchema }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), { write: true });
    return permissionSpec({
      level: 'write',
      risk: 'medium',
      requiresConfirmation: true,
      scope: resolved.root.path,
      title: '创建目录',
      description: resolved.path,
      operations: [{ action: 'create', from: null, to: resolved.path }]
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), { write: true });
    await fs.mkdir(resolved.path, { recursive: true });
    const stats = await fs.stat(resolved.path);
    if (!stats.isDirectory()) throw new Error('创建后路径不是目录');
    return {
      ok: true,
      summary: `已创建目录 ${resolved.path}`,
      content: `Created directory: ${resolved.path}`,
      verification: [{ ok: true, detail: '目录已存在' }]
    };
  }
};

export const writeFileTool: BotTool = {
  name: 'write_file',
  label: '写入文件',
  description:
    'Write UTF-8 text to a file in an authorized writable directory. Requires overwrite=true to replace an existing file.',
  inputSchema: z.object({
    path: pathSchema,
    content: z.string().max(MAX_WRITE_BYTES),
    overwrite: z.boolean().optional().default(false)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string; overwrite: boolean };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), { write: true });
    return permissionSpec({
      level: 'write',
      risk: 'medium',
      requiresConfirmation: true,
      scope: resolved.root.path,
      title: args.overwrite ? '覆盖文件' : '写入文件',
      description: resolved.path,
      operations: [
        {
          action: 'write',
          from: null,
          to: resolved.path,
          detail: args.overwrite ? '将替换现有文件' : undefined
        }
      ]
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      path: string;
      content: string;
      overwrite: boolean;
    };
    const buffer = Buffer.from(args.content, 'utf8');
    if (buffer.length > MAX_WRITE_BYTES) throw new Error('写入内容超过 5 MB 限制');
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), { write: true });
    await atomicWrite(resolved.path, buffer, args.overwrite);
    const actual = await fs.readFile(resolved.path);
    if (!actual.equals(buffer)) throw new Error('写入后校验失败');
    return {
      ok: true,
      summary: `已写入 ${resolved.path}`,
      content: `Wrote ${buffer.length} bytes to ${resolved.path}`,
      data: { path: resolved.path, bytes: buffer.length },
      verification: [{ ok: true, detail: '文件内容校验一致' }]
    };
  }
};

export const copyFileTool: BotTool = {
  name: 'copy_file',
  label: '复制文件',
  description: 'Copy a file to another path inside authorized roots.',
  inputSchema: z.object({
    source: pathSchema,
    destination: pathSchema,
    overwrite: z.boolean().optional().default(false)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as {
      source: string;
      destination: string;
    };
    const source = await resolveAuthorizedPath(args.source, deps.getRoots(), {
      mustExist: true,
      expected: 'file'
    });
    const destination = await resolveAuthorizedPath(args.destination, deps.getRoots(), {
      write: true
    });
    const operations: FileOperationPreview[] = [
      { action: 'copy', from: source.path, to: destination.path }
    ];
    return permissionSpec({
      level: 'write',
      risk: 'medium',
      requiresConfirmation: true,
      scope: rootsInScope([source, destination]),
      title: '复制文件',
      description: `${source.path} → ${destination.path}`,
      operations
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      source: string;
      destination: string;
      overwrite: boolean;
    };
    if (normalizeForCompare(args.source) === normalizeForCompare(args.destination)) {
      throw new Error('源路径和目标路径相同');
    }
    const source = await resolveAuthorizedPath(args.source, deps.getRoots(), {
      mustExist: true,
      expected: 'file'
    });
    const destination = await resolveAuthorizedPath(args.destination, deps.getRoots(), {
      write: true
    });
    if (!args.overwrite && (await fileExists(destination.path))) {
      throw new Error('目标文件已存在');
    }
    await ensureParentDirectory(destination.path);
    await fs.copyFile(
      source.path,
      destination.path,
      args.overwrite ? 0 : fsConstants.COPYFILE_EXCL
    );
    const sourceHash = await hashFile(source.path);
    const destinationHash = await hashFile(destination.path);
    if (sourceHash !== destinationHash) throw new Error('复制后哈希校验失败');
    return {
      ok: true,
      summary: `已复制到 ${destination.path}`,
      content: `Copied ${source.path} to ${destination.path}`,
      verification: [{ ok: true, detail: '目标文件哈希一致' }]
    };
  }
};

export const moveFileTool: BotTool = {
  name: 'move_file',
  label: '移动文件',
  description:
    'Move a file to another path inside authorized writable roots. Source and destination must differ.',
  inputSchema: z.object({
    source: pathSchema,
    destination: pathSchema,
    overwrite: z.boolean().optional().default(false)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as {
      source: string;
      destination: string;
    };
    const source = await resolveAuthorizedPath(args.source, deps.getRoots(), {
      write: true,
      mustExist: true,
      expected: 'file'
    });
    const destination = await resolveAuthorizedPath(args.destination, deps.getRoots(), {
      write: true
    });
    return permissionSpec({
      level: 'write',
      risk: 'medium',
      requiresConfirmation: true,
      scope: rootsInScope([source, destination]),
      title: '移动文件',
      description: `${source.path} → ${destination.path}`,
      operations: [{ action: 'move', from: source.path, to: destination.path }]
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as {
      source: string;
      destination: string;
      overwrite: boolean;
    };
    const source = await resolveAuthorizedPath(args.source, deps.getRoots(), {
      write: true,
      mustExist: true,
      expected: 'file'
    });
    const destination = await resolveAuthorizedPath(args.destination, deps.getRoots(), {
      write: true
    });
    const verification = await moveOne(source, destination, args.overwrite);
    return {
      ok: true,
      summary: `已移动 ${basename(source.path)}`,
      content: `Moved ${source.path} to ${destination.path}`,
      verification: verification.map((detail) => ({ ok: true, detail }))
    };
  }
};

export const moveFilesTool: BotTool = {
  name: 'move_files',
  label: '批量移动文件',
  description:
    'Move multiple files after showing a single preview. Use for file organization. Maximum 200 operations per call.',
  inputSchema: z.object({
    operations: z
      .array(
        z.object({
          source: pathSchema,
          destination: pathSchema
        })
      )
      .min(1)
      .max(200),
    overwrite: z.boolean().optional().default(false)
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as {
      operations: Array<{ source: string; destination: string }>;
    };
    const resolvedPairs = [];
    for (const operation of args.operations) {
      const source = await resolveAuthorizedPath(operation.source, deps.getRoots(), {
        write: true,
        mustExist: true,
        expected: 'file'
      });
      const destination = await resolveAuthorizedPath(operation.destination, deps.getRoots(), {
        write: true
      });
      resolvedPairs.push({ source, destination });
    }
    const seenDestinations = new Set<string>();
    for (const pair of resolvedPairs) {
      const key = normalizeForCompare(pair.destination.path);
      if (seenDestinations.has(key)) {
        throw new Error(`批量操作中存在重复目标：${pair.destination.path}`);
      }
      seenDestinations.add(key);
    }
    return permissionSpec({
      level: 'write',
      risk: 'high',
      requiresConfirmation: true,
      scope: rootsInScope(resolvedPairs.flatMap((pair) => [pair.source, pair.destination])),
      title: `批量移动 ${resolvedPairs.length} 个文件`,
      description: '请检查来源和目标路径后再执行',
      operations: resolvedPairs.map((pair) => ({
        action: 'move',
        from: pair.source.path,
        to: pair.destination.path
      }))
    });
  },
  async execute(input, deps, context) {
    const args = this.inputSchema.parse(input) as {
      operations: Array<{ source: string; destination: string }>;
      overwrite: boolean;
    };
    const results: Array<{ source: string; destination: string; ok: boolean; error?: string }> = [];
    for (const operation of args.operations) {
      if (context.abortSignal?.aborted) {
        results.push({
          source: operation.source,
          destination: operation.destination,
          ok: false,
          error: '操作已取消'
        });
        break;
      }
      try {
        const source = await resolveAuthorizedPath(operation.source, deps.getRoots(), {
          write: true,
          mustExist: true,
          expected: 'file'
        });
        const destination = await resolveAuthorizedPath(operation.destination, deps.getRoots(), {
          write: true
        });
        await moveOne(source, destination, args.overwrite);
        results.push({
          source: source.path,
          destination: destination.path,
          ok: true
        });
      } catch (error) {
        results.push({
          source: operation.source,
          destination: operation.destination,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.length - succeeded;
    return {
      ok: failed === 0,
      summary: `批量移动完成：成功 ${succeeded}，失败 ${failed}`,
      content: JSON.stringify({ succeeded, failed, results }, null, 2),
      data: { succeeded, failed, results },
      verification: results
        .filter((result) => result.ok)
        .map((result) => ({ ok: true, detail: `已移动 ${result.destination}` }))
    };
  }
};

export const trashFileTool: BotTool = {
  name: 'trash_file',
  label: '移入回收站',
  description:
    'Move one file to the Windows Recycle Bin. Always requires explicit confirmation. Directories are rejected.',
  inputSchema: z.object({ path: pathSchema }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      write: true,
      mustExist: true,
      expected: 'file'
    });
    return permissionSpec({
      level: 'system',
      risk: 'high',
      requiresConfirmation: true,
      scope: resolved.root.path,
      title: '将文件移入回收站',
      description: resolved.path,
      operations: [{ action: 'trash', from: resolved.path, to: null }]
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as { path: string };
    const resolved = await resolveAuthorizedPath(args.path, deps.getRoots(), {
      write: true,
      mustExist: true,
      expected: 'file'
    });
    const stats = await fs.lstat(resolved.path);
    if (stats.isDirectory()) throw new Error('trash_file 只接受文件，不接受目录');
    await deps.system.trashItem(resolved.path);
    if (await fileExists(resolved.path)) throw new Error('移入回收站后源文件仍然存在');
    return {
      ok: true,
      summary: `已将 ${basename(resolved.path)} 移入回收站`,
      content: `Moved to Recycle Bin: ${resolved.path}`,
      verification: [{ ok: true, detail: '源路径已不存在' }]
    };
  }
};
