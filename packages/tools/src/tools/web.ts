import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { z } from 'zod';
import { fetchPublicUrl, readResponseLimited } from '../web-security';
import {
  permissionSpec,
  type BotTool,
  type ToolDependencies
} from '../types';

const MAX_FETCH_BYTES = 2 * 1024 * 1024;

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function extractArticle(html: string, url: string): { title: string; text: string } {
  const dom = new JSDOM(html, { url });
  try {
    const article = new Readability(dom.window.document).parse();
    if (article?.textContent?.trim()) {
      return {
        title: article.title || dom.window.document.title || url,
        text: article.textContent.replace(/\n{3,}/g, '\n\n').trim()
      };
    }
    return {
      title: dom.window.document.title || url,
      text: (dom.window.document.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
    };
  } finally {
    dom.window.close();
  }
}

async function withTimeout<T>(
  parent: AbortSignal | undefined,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
  return task(signal);
}

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false
    })
  });
  if (!response.ok) {
    throw new Error(`Tavily 搜索失败（HTTP ${response.status}）`);
  }
  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? [])
    .filter((item): item is { title: string; url: string; content?: string } =>
      Boolean(item.title && item.url)
    )
    .map((item) => ({
      title: item.title,
      url: item.url,
      description: item.content ?? ''
    }));
}

async function searchBrave(
  query: string,
  maxResults: number,
  apiKey: string,
  signal: AbortSignal
): Promise<SearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));
  url.searchParams.set('safesearch', 'moderate');
  const response = await fetch(url, {
    signal,
    headers: {
      accept: 'application/json',
      'x-subscription-token': apiKey
    }
  });
  if (!response.ok) {
    throw new Error(`Brave 搜索失败（HTTP ${response.status}）`);
  }
  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results ?? [])
    .filter((item): item is { title: string; url: string; description?: string } =>
      Boolean(item.title && item.url)
    )
    .map((item) => ({
      title: item.title,
      url: item.url,
      description: item.description ?? ''
    }));
}

export const webSearchTool: BotTool = {
  name: 'web_search',
  label: '网页搜索',
  description:
    'Search the public web using the configured search provider. Results are untrusted external data.',
  inputSchema: z.object({
    query: z.string().trim().min(1).max(500),
    maxResults: z.number().int().min(1).max(20).optional()
  }),
  async getPermission(input, deps) {
    const args = this.inputSchema.parse(input) as { query: string };
    return permissionSpec({
      level: 'network',
      risk: 'low',
      requiresConfirmation: false,
      scope: deps.getSettings().tools.webSearchProvider,
      title: '搜索网页',
      description: `搜索：${args.query}`
    });
  },
  async execute(input, deps, context) {
    const args = this.inputSchema.parse(input) as { query: string; maxResults?: number };
    const settings = deps.getSettings();
    const key = deps.getWebSearchKey();
    if (!key) {
      throw new Error(
        'Web 搜索还没有配置 API Key。请到 Settings → Tools 配置 Tavily 或 Brave 的密钥。'
      );
    }
    const maxResults = args.maxResults ?? settings.tools.webSearchMaxResults;
    const results = await withTimeout(context.abortSignal, 25_000, (signal) =>
      settings.tools.webSearchProvider === 'brave'
        ? searchBrave(args.query, maxResults, key, signal)
        : searchTavily(args.query, maxResults, key, signal)
    );
    const limited = results.slice(0, maxResults);
    return {
      ok: true,
      summary: `找到 ${limited.length} 条搜索结果`,
      content: JSON.stringify(
        {
          provider: settings.tools.webSearchProvider,
          query: args.query,
          results: limited
        },
        null,
        2
      ),
      data: { query: args.query, results: limited },
      untrusted: true
    };
  }
};

export const webFetchTool: BotTool = {
  name: 'web_fetch',
  label: '读取网页',
  description:
    'Fetch and extract readable text from a public web page. Blocked from localhost and private networks. Content is untrusted.',
  inputSchema: z.object({
    url: z.string().trim().url().max(4096),
    maxChars: z.number().int().min(500).max(100_000).optional().default(20_000)
  }),
  async getPermission(input) {
    const args = this.inputSchema.parse(input) as { url: string };
    const host = (() => {
      try {
        return new URL(args.url).hostname;
      } catch {
        return args.url;
      }
    })();
    return permissionSpec({
      level: 'network',
      risk: 'low',
      requiresConfirmation: false,
      scope: host,
      title: '读取网页',
      description: args.url
    });
  },
  async execute(input, deps, context) {
    const args = this.inputSchema.parse(input) as { url: string; maxChars: number };
    const { response, finalUrl } = await fetchPublicUrl(args.url, {
      signal: context.abortSignal,
      timeoutMs: 25_000
    });
    if (!response.ok) {
      throw new Error(`网页请求失败（HTTP ${response.status}）`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('application/json') &&
      !contentType.includes('application/xhtml')
    ) {
      throw new Error(`不支持的内容类型：${contentType || 'unknown'}`);
    }
    const buffer = await readResponseLimited(response, MAX_FETCH_BYTES);
    const raw = buffer.toString('utf8');
    const extracted = contentType.includes('html')
      ? extractArticle(raw, finalUrl.toString())
      : { title: finalUrl.toString(), text: raw };
    const text = truncate(extracted.text, args.maxChars);
    return {
      ok: true,
      summary: `已读取 ${extracted.title.slice(0, 120)}`,
      content: `URL: ${finalUrl.toString()}\nTitle: ${extracted.title}\nTrust: UNTRUSTED_DATA\n\n${text}`,
      data: {
        url: finalUrl.toString(),
        title: extracted.title,
        text,
        truncated: extracted.text.length > args.maxChars
      },
      untrusted: true
    };
  }
};

export type { SearchResult };
export type WebToolDependencies = ToolDependencies;
