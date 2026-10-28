import { z } from 'zod';
import type { BrowserRuntime } from '../browser-runtime';
import { assertPublicHttpUrl } from '../web-security';
import {
  permissionSpec,
  type BotTool,
  type ToolDependencies
} from '../types';

function ensureEnabled(deps: ToolDependencies): void {
  if (!deps.getSettings().tools.browserEnabled) {
    throw new Error('浏览器工具已在 Settings → Tools 中关闭');
  }
}

async function pageSummary(page: Awaited<ReturnType<BrowserRuntime['getPage']>>, maxChars = 5000): Promise<{
  title: string;
  url: string;
  text: string;
}> {
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: document.body?.innerText ?? ''
  }));
  const finalUrl = await assertPublicHttpUrl(info.url);
  return {
    title: info.title,
    url: finalUrl.toString(),
    text: info.text.replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars)
  };
}

export function createBrowserTools(runtime: BrowserRuntime): BotTool[] {
  const navigate: BotTool = {
    name: 'browser_navigate',
    label: '打开网页',
    description:
      'Open a public web page in a headless browser and return its title and visible text. Does not log in or download files.',
    inputSchema: z.object({
      url: z.string().trim().url().max(4096)
    }),
    async getPermission(input) {
      const args = this.inputSchema.parse(input) as { url: string };
      return permissionSpec({
        level: 'network',
        risk: 'low',
        requiresConfirmation: false,
        scope: new URL(args.url).hostname,
        title: '打开网页',
        description: args.url
      });
    },
    async execute(input, deps, context) {
      ensureEnabled(deps);
      const args = this.inputSchema.parse(input) as { url: string };
      const url = await assertPublicHttpUrl(args.url);
      const page = await runtime.getPage();
      context.abortSignal?.throwIfAborted();
      const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
      const summary = await pageSummary(page);
      return {
        ok: true,
        summary: `已打开 ${summary.title || summary.url}`,
        content: `URL: ${summary.url}\nTitle: ${summary.title}\nHTTP: ${response?.status() ?? 'unknown'}\nTrust: UNTRUSTED_DATA\n\n${summary.text}`,
        data: { ...summary, status: response?.status() ?? null },
        untrusted: true
      };
    }
  };

  const extract: BotTool = {
    name: 'browser_extract_text',
    label: '读取当前网页',
    description: 'Extract visible text from the currently open browser page.',
    inputSchema: z.object({
      maxChars: z.number().int().min(500).max(100_000).optional().default(20_000)
    }),
    async getPermission() {
      return permissionSpec({
        level: 'network',
        risk: 'low',
        requiresConfirmation: false,
        scope: 'current-page',
        title: '读取当前网页',
        description: '读取浏览器当前页面的可见文本'
      });
    },
    async execute(input, deps) {
      ensureEnabled(deps);
      const args = this.inputSchema.parse(input) as { maxChars: number };
      const page = await runtime.getPage();
      if (page.url() === 'about:blank') throw new Error('浏览器还没有打开网页');
      const summary = await pageSummary(page, args.maxChars);
      return {
        ok: true,
        summary: `已读取 ${summary.title || summary.url}`,
        content: `URL: ${summary.url}\nTitle: ${summary.title}\nTrust: UNTRUSTED_DATA\n\n${summary.text}`,
        data: summary,
        untrusted: true
      };
    }
  };

  const click: BotTool = {
    name: 'browser_click',
    label: '点击网页元素',
    description:
      'Click an element on the current browser page by CSS selector. Requires confirmation because it may submit data.',
    inputSchema: z.object({
      selector: z.string().trim().min(1).max(1000)
    }),
    async getPermission(input) {
      const args = this.inputSchema.parse(input) as { selector: string };
      return permissionSpec({
        level: 'network',
        risk: 'medium',
        requiresConfirmation: true,
        scope: 'browser-interaction',
        title: '点击网页元素',
        description: `选择器：${args.selector}`
      });
    },
    async execute(input, deps) {
      ensureEnabled(deps);
      const args = this.inputSchema.parse(input) as { selector: string };
      const page = await runtime.getPage();
      if (page.url() === 'about:blank') throw new Error('浏览器还没有打开网页');
      await page.locator(args.selector).first().click();
      await page.waitForTimeout(500);
      const summary = await pageSummary(page, 3000);
      return {
        ok: true,
        summary: `已点击元素，当前页面：${summary.title || summary.url}`,
        content: `URL: ${summary.url}\nTitle: ${summary.title}\nTrust: UNTRUSTED_DATA\n\n${summary.text}`,
        data: summary,
        untrusted: true
      };
    }
  };

  const type: BotTool = {
    name: 'browser_type',
    label: '填写网页输入',
    description:
      'Fill an input on the current browser page. Requires confirmation. Set submit=true to press Enter after filling.',
    inputSchema: z.object({
      selector: z.string().trim().min(1).max(1000),
      text: z.string().max(10_000),
      submit: z.boolean().optional().default(false)
    }),
    async getPermission(input) {
      const args = this.inputSchema.parse(input) as {
        selector: string;
        text: string;
        submit: boolean;
      };
      return permissionSpec({
        level: 'network',
        risk: 'high',
        requiresConfirmation: true,
        scope: 'browser-interaction',
        title: args.submit ? '填写并提交网页表单' : '填写网页输入',
        description: `选择器：${args.selector}；文本长度：${args.text.length}${args.submit ? '；将按 Enter 提交' : ''}`
      });
    },
    async execute(input, deps) {
      ensureEnabled(deps);
      const args = this.inputSchema.parse(input) as {
        selector: string;
        text: string;
        submit: boolean;
      };
      const page = await runtime.getPage();
      if (page.url() === 'about:blank') throw new Error('浏览器还没有打开网页');
      await page.locator(args.selector).first().fill(args.text);
      if (args.submit) {
        await page.locator(args.selector).first().press('Enter');
        await page.waitForTimeout(700);
      }
      const summary = await pageSummary(page, 3000);
      return {
        ok: true,
        summary: `已填写输入${args.submit ? '并提交' : ''}`,
        content: `URL: ${summary.url}\nTitle: ${summary.title}\nTrust: UNTRUSTED_DATA\n\n${summary.text}`,
        data: summary,
        untrusted: true
      };
    }
  };

  const screenshot: BotTool = {
    name: 'browser_screenshot',
    label: '网页截图',
    description:
      'Capture a screenshot of the current browser page. Requires explicit confirmation.',
    inputSchema: z.object({
      fullPage: z.boolean().optional().default(false)
    }),
    async getPermission() {
      return permissionSpec({
        level: 'system',
        risk: 'medium',
        requiresConfirmation: true,
        scope: 'browser-screenshot',
        title: '截取网页',
        description: '截图可能包含页面中的个人信息'
      });
    },
    async execute(input, deps) {
      ensureEnabled(deps);
      const args = this.inputSchema.parse(input) as { fullPage: boolean };
      const page = await runtime.getPage();
      if (page.url() === 'about:blank') throw new Error('浏览器还没有打开网页');
      const buffer = await page.screenshot({ type: 'png', fullPage: args.fullPage });
      const attachment = await deps.system.saveAttachment({
        name: `web-${Date.now()}.png`,
        mimeType: 'image/png',
        dataBase64: Buffer.from(buffer).toString('base64'),
        kind: 'image'
      });
      return {
        ok: true,
        summary: '网页截图已保存',
        content: `Screenshot saved: ${attachment.name}`,
        attachment,
        untrusted: true
      };
    }
  };

  return [navigate, extract, click, type, screenshot];
}
