import { constants } from 'node:fs';
import { access, lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import type { AuthorizedRoot } from '@zbot/shared';

export interface AuthorizedPath {
  path: string;
  root: AuthorizedRoot;
}

export interface ResolvePathOptions {
  write?: boolean;
  mustExist?: boolean;
  expected?: 'file' | 'directory' | 'any';
}

const BLOCKED_SYSTEM_DIRS = [
  process.env.SystemRoot,
  process.env.ProgramFiles,
  process.env['ProgramFiles(x86)'],
  process.env.ProgramW6432
].filter((value): value is string => Boolean(value));

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function normalizedForCompare(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

async function canonicalizePotentialPath(input: string): Promise<string> {
  let current = resolve(input);
  const missing: string[] = [];

  for (let index = 0; index < 64; index += 1) {
    try {
      const canonical = await realpath(current);
      return resolve(canonical, ...missing.reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = dirname(current);
      if (parent === current) throw new Error(`无法解析路径：${input}`);
      missing.push(basename(current));
      current = parent;
    }
  }
  throw new Error('路径层级过深，拒绝访问');
}

function isBlockedSystemPath(canonical: string): boolean {
  const target = normalizedForCompare(canonical);
  return BLOCKED_SYSTEM_DIRS.some((blocked) => {
    const root = normalizedForCompare(resolve(blocked));
    return target === root || target.startsWith(`${root}${sep}`);
  });
}

export async function resolveAuthorizedPath(
  rawPath: string,
  roots: AuthorizedRoot[],
  options: ResolvePathOptions = {}
): Promise<AuthorizedPath> {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('路径不能为空');
  }
  if (rawPath.includes('\0') || rawPath.length > 4096) {
    throw new Error('路径无效');
  }
  if (/^[\\/]{2}(?:[?.]|$)/.test(rawPath)) {
    throw new Error('不允许使用设备路径或网络共享路径');
  }
  if (!isAbsolute(rawPath)) {
    throw new Error('必须使用绝对路径，且位于已授权目录内');
  }
  if (parse(rawPath).root === rawPath) {
    throw new Error('不允许直接访问磁盘根目录');
  }

  const canonicalTarget = await canonicalizePotentialPath(rawPath);
  if (isBlockedSystemPath(canonicalTarget)) {
    throw new Error('该路径属于受保护的系统目录');
  }

  let matched: AuthorizedRoot | null = null;
  let matchedRootPath = '';
  for (const root of roots) {
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(root.path);
    } catch {
      continue;
    }
    if (
      isWithin(normalizedForCompare(canonicalRoot), normalizedForCompare(canonicalTarget)) &&
      (!options.write || root.allowWrite)
    ) {
      matched = root;
      matchedRootPath = canonicalRoot;
      break;
    }
  }

  if (!matched) {
    throw new Error(
      options.write
        ? '目标路径不在可写授权目录内。请先在 Settings → Permissions 中添加并允许写入。'
        : '路径不在已授权目录内。请先在 Settings → Permissions 中添加目录。'
    );
  }

  if (options.mustExist) {
    try {
      await access(canonicalTarget, options.write ? constants.R_OK | constants.W_OK : constants.R_OK);
    } catch {
      throw new Error('文件或目录不存在或没有访问权限');
    }
  }

  if (options.expected && options.expected !== 'any' && options.mustExist) {
    const stats = await lstat(canonicalTarget);
    if (options.expected === 'file' && !stats.isFile()) {
      throw new Error('目标不是文件');
    }
    if (options.expected === 'directory' && !stats.isDirectory()) {
      throw new Error('目标不是目录');
    }
    if (stats.isSymbolicLink()) {
      throw new Error('不允许通过符号链接访问目标');
    }
  }

  return { path: canonicalTarget, root: { ...matched, path: matchedRootPath } };
}

export function rootsInScope(paths: AuthorizedPath[]): string {
  return [...new Set(paths.map((item) => item.root.path))].sort().join('|');
}

export async function validateAuthorizedRootPath(rawPath: string): Promise<string> {
  if (!isAbsolute(rawPath) || rawPath.includes('\0') || rawPath.length > 4096) {
    throw new Error('请选择有效的绝对目录路径');
  }
  if (/^[\\/]{2}(?:[?.]|$)/.test(rawPath)) {
    throw new Error('不允许授权设备路径或网络共享路径');
  }
  if (parse(rawPath).root === rawPath) {
    throw new Error('不允许授权整个磁盘根目录，请选择具体文件夹');
  }
  const canonical = await realpath(rawPath);
  const stats = await lstat(canonical);
  if (!stats.isDirectory()) throw new Error('授权路径必须是目录');
  if (isBlockedSystemPath(canonical)) {
    throw new Error('不允许授权 Windows 或 Program Files 等系统目录');
  }
  return canonical;
}
