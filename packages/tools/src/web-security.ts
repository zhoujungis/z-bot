import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.home.arpa',
  '.lan'
];

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => Number(part));
  if (parsed.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parsed;
}

function isPrivateIpv4(address: string): boolean {
  const parts = parseIpv4(address);
  if (!parts) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0] ?? address.toLowerCase();
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('::ffff:')) {
    return isPrivateIpv4(value.slice('::ffff:'.length));
  }
  return false;
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL 格式无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只允许 http/https URL');
  }
  if (url.username || url.password) {
    throw new Error('URL 不允许包含用户名或密码');
  }
  if (url.port === '0') throw new Error('URL 端口无效');

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw new Error('URL 缺少主机名');
  if (
    hostname === 'localhost' ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error('不允许访问本机或内部主机');
  }

  const literalVersion = isIP(hostname);
  if (literalVersion) {
    if (isPrivateAddress(hostname)) throw new Error('不允许访问本机或私有网络地址');
    return url;
  }

  if (!hostname.includes('.')) {
    throw new Error('不允许访问非公网主机名');
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('无法解析目标主机');
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('目标主机解析到私有或保留地址，拒绝访问');
  }
  return url;
}

export async function fetchPublicUrl(
  rawUrl: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {}
): Promise<{ response: Response; finalUrl: URL }> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let current = await assertPublicHttpUrl(rawUrl);
  const maxRedirects = options.maxRedirects ?? 5;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ZBot/0.1 (local assistant)'
      }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('重定向响应缺少 Location');
      const next = new URL(location, current).toString();
      current = await assertPublicHttpUrl(next);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new Error('重定向次数过多');
}

export async function readResponseLimited(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader && Number(lengthHeader) > maxBytes * 2) {
    throw new Error('响应体过大');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}
