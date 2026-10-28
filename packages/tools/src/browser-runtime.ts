import type { Browser, BrowserContext, Page } from 'playwright';

export class BrowserRuntime {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private launching: Promise<Page> | null = null;

  async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.launching) return this.launching;
    this.launching = this.launch();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  private async launch(): Promise<Page> {
    try {
      const { chromium } = await import('playwright');
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--disable-background-networking', '--disable-sync']
        });
      } catch {
        // Windows ships Edge; using it avoids requiring a downloaded Chromium.
        this.browser = await chromium.launch({
          headless: true,
          channel: 'msedge',
          args: ['--disable-background-networking', '--disable-sync']
        });
      }
      this.context = await this.browser.newContext({
        acceptDownloads: false,
        permissions: [],
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      await this.context.route('**/*', async (route) => {
        try {
          const url = new URL(route.request().url());
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            await route.abort();
            return;
          }
        } catch {
          await route.abort();
          return;
        }
        await route.continue();
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(30_000);
      this.page.setDefaultNavigationTimeout(30_000);
      this.page.on('dialog', (dialog) => {
        void dialog.dismiss();
      });
      this.browser.on('disconnected', () => {
        this.browser = null;
        this.context = null;
        this.page = null;
      });
      return this.page;
    } catch (error) {
      await this.close();
      throw new Error(
        `无法启动浏览器：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.context = null;
    this.page = null;
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
