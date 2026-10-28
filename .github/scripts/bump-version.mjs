import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootPackagePath = join(root, 'package.json');
const appPackagePath = join(root, 'apps', 'desktop', 'package.json');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readPackage(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

function latestTagVersion() {
  try {
    const raw = execFileSync('git', ['tag', '--list', 'v*'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const versions = raw
      .split(/\r?\n/)
      .map((tag) => tag.trim().replace(/^v/, ''))
      .filter((version) => parseVersion(version));
    versions.sort(compareVersions);
    return versions.at(-1) ?? null;
  } catch {
    return null;
  }
}

function bumpVersion(version, type) {
  const parsed = parseVersion(version);
  if (!parsed) fail(`Invalid base version: ${version}`);
  if (type === 'major') {
    return `${parsed.major + 1}.0.0`;
  }
  if (type === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (type === 'patch') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  fail(`Invalid bump type: ${type}`);
}

function writeOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, 'utf8');
}

const explicitTag = argument('--tag');
const explicitVersion = argument('--version');
const bumpType = argument('--bump') ?? 'patch';
const dryRun = process.argv.includes('--dry-run');

let version;
if (explicitTag || explicitVersion) {
  version = (explicitTag ?? explicitVersion).replace(/^v/, '');
  if (!parseVersion(version)) fail(`Invalid semantic version: ${version}`);
} else {
  const rootPackage = readPackage(rootPackagePath);
  const appPackage = readPackage(appPackagePath);
  const base =
    latestTagVersion() ??
    (parseVersion(appPackage.version) ? appPackage.version : rootPackage.version);
  version = bumpVersion(base, bumpType);
}

const tag = `v${version}`;
const prerelease = version.includes('-');

if (!dryRun) {
  for (const filePath of [rootPackagePath, appPackagePath]) {
    const pkg = readPackage(filePath);
    pkg.version = version;
    writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }
}

writeOutput('version', version);
writeOutput('tag', tag);
writeOutput('prerelease', String(prerelease));
console.log(`release version: ${version}${dryRun ? ' (dry run)' : ''}`);
